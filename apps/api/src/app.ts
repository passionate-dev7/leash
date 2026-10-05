import type { IncomingMessage, ServerResponse } from 'node:http'
import { encodeFunctionData, formatUnits, parseUnits } from 'viem'
import type { Address } from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { Abis, Addresses } from 'viem/tempo'
import { getAllowedCalls, getRemainingLimit, planCutoff } from '@leash/sdk'
import { MAINNET_CAPS, SELECTOR } from '@leash/policy'
import type { ServiceId, VendorRouter } from '@leash/vendors'
import type { NetworkName } from '@leash/sdk'
import { requireTeamSignature } from './auth.js'
import { ALLOWED_ORIGINS, FEATURED_TEAM, KEY_LIFETIME_SECONDS, MODERATO, TRUST_PROXY } from './config.js'
import { balances, budgetBalance, chains, fund, lower, reader, retryRead, verifyAuthorize, verifyLiveKey, verifyCutoff, verifyRevoke, verifySettlement } from './chain.js'
import { assertNotBeforeSettlement, parseRecord, signerOf } from './external.js'
import { createRateLimiter } from './limit.js'
import { HttpError, address, bad, conflict, match, notFound, parseJsonObject, readBody, route, sendJson, str, txHash } from './http.js'
import type { HandlerContext, Route } from './http.js'
import { cachedReplay, MAX_REPLAY_BLOCKS, mainnetServices, probedServices } from './mainnet.js'
import { outsideFeed } from './outside.js'
import { sponsorBalance } from './sponsor.js'
import { evidenceOf, mainnetVendorRows, vendorRows } from './vendors.js'
import type { Runner } from './runner.js'
import { isServiceId, mainnetServicesPaying, payoutGroups, publicCatalog, servicesOn, servicesPaying, serviceOfUrl } from './services.js'
import type { AgentRow, Store, TeamRow } from './store.js'

const FAUCET_WINDOW_MS = 10 * 60_000
const FAUCET_GLOBAL_PER_HOUR = 60
const MAX_OPEN_AGENTS = 25
/** How often one team's stale pending rows are checked against the chain. */
const SWEEP_INTERVAL_MS = 30_000
const DECIMALS = 6
/** Record intake: a burst of 60 per agent key then one a second, and twice that per client address. */
const RECORDS_PER_KEY = { capacity: 60, perSecond: 1 }
const RECORDS_PER_IP = { capacity: 120, perSecond: 2 }

/** The client address a request is limited by. */
function clientOf(req: IncomingMessage): string {
  const fly = req.headers['fly-client-ip']
  if (TRUST_PROXY && typeof fly === 'string') return fly
  const forwarded = req.headers['x-forwarded-for']
  if (TRUST_PROXY && typeof forwarded === 'string') return forwarded.split(',').at(-1)!.trim()
  return req.socket.remoteAddress ?? 'unknown'
}

/** A service outside the catalog is named by where it was called: host and path. */
function externalServiceId(url: string): string {
  const u = new URL(url)
  return `${u.host}${u.pathname}`.slice(0, 120)
}

const body = async (req: IncomingMessage) => parseJsonObject(await readBody(req))

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw bad(`${field} must be an integer from ${min} to ${max}`)
  return value
}

function intParam(query: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = query.get(key)
  if (raw === null) return fallback
  if (!/^\d+$/.test(raw)) throw bad(`${key} must be an integer`)
  const n = Number(raw)
  if (n < min || n > max) throw bad(`${key} must be from ${min} to ${max}`)
  return n
}

export type AppDeps = { store: Store; runner: Runner; vendors: VendorRouter; sponsor: Address; mainnet?: boolean }

export function createApp({ store, runner, vendors, sponsor, mainnet = false }: AppDeps) {
  const teamOf = (account: Address) => {
    const team = store.team(account)
    if (!team) throw notFound(`no team ${account}. Create it with POST /api/teams`)
    // LEASH_MAINNET is the kill switch: a mainnet team answers nothing while it is unset, reads and writes alike.
    if (team.network === 'mainnet' && !mainnet) throw new HttpError(503, 'mainnet_disabled', 'this desk does not run mainnet teams')
    return team
  }
  const agentOf = (keyId: string): AgentRow => {
    const agent = store.agent(address(keyId, 'keyId'))
    if (!agent) throw notFound(`no agent ${keyId}`)
    teamOf(agent.account)
    return agent
  }
  const serviceIdsOf = (agent: AgentRow) => JSON.parse(agent.service_ids) as string[]
  /** The chain a team's reads and verifications go to. */
  const chainOfTeam = (account: Address) => chains[teamOf(account).network]
  const chainOfAgent = (agent: AgentRow) => chainOfTeam(agent.account)
  /** What Leash planned for an agent's key: the chain must hold no more. */
  const planOf = (agent: AgentRow) => ({
    account: agent.account,
    keyId: agent.key_id,
    plannedRecipients: servicesOn(chainOfAgent(agent).name).filter((s) => serviceIdsOf(agent).includes(s.serviceId)).map((s) => s.recipient),
    plannedLimit: parseUnits(agent.budget, DECIMALS),
    plannedExpiry: agent.expiry,
  })
  /**
   * A pending row older than an hour is deleted only when its key is not on chain. A key that is live as
   * planned becomes active (its confirm never arrived); one live with other terms stays pending and holds its slot.
   */
  // ponytail: in-memory, so it assumes the one machine fly.toml runs (replay protection assumes it too).
  const lastSweep = new Map<Address, number>()
  const confirming = new Set<Address>()
  /** `throttled` for the unauthenticated team read; a signed agent add always sweeps, since its slot count depends on it. */
  const sweepPending = async (account: Address, throttled = false) => {
    if (throttled && Date.now() - (lastSweep.get(account) ?? 0) < SWEEP_INTERVAL_MS) return
    lastSweep.set(account, Date.now())
    for (const agent of store.expiredPendingAgents(account)) {
      // A confirm in flight decides this row itself; deleting it under the confirm would orphan a live key.
      if (confirming.has(agent.key_id)) continue
      const live = await verifyLiveKey(chainOfAgent(agent), planOf(agent)).catch((e: Error) => {
        // A read that fails keeps the row: the next sweep tries again, and nothing is deleted on a guess.
        console.warn(`sweep ${agent.key_id}: ${e.message.split('\n')[0]}`)
        return null
      })
      if (live === null || confirming.has(agent.key_id)) continue
      if (live.ok) store.setAgentStatus(agent.key_id, 'active')
      else if (!live.live) store.deletePendingAgent(agent.key_id)
    }
  }
  /** Every write that changes a team carries a signature by that team account's root key. */
  const authorize = (ctx: HandlerContext, account: Address, network: NetworkName, body: unknown) =>
    requireTeamSignature(store, ctx.req, { method: ctx.req.method ?? 'POST', path: ctx.path, account, chainId: chains[network].config.chainId, body })
  /** The desk pays only for agents whose key it holds. An external agent pays with its own process. */
  const assertRunnable = (agent: AgentRow): AgentRow => {
    if (teamOf(agent.account).network === 'mainnet') throw conflict('mainnet_team', `team ${agent.account} runs on mainnet: its agents pay from their own processes, and the desk never signs or funds anything on mainnet`)
    if (agent.external === 1) throw conflict('external_agent', `agent ${agent.key_id} runs outside Leash: it pays from its own process, and the desk cannot run or call for it`)
    return agent
  }

  const keyLimit = createRateLimiter(RECORDS_PER_KEY)
  const ipLimit = createRateLimiter(RECORDS_PER_IP)

  const routes: Route[] = [
    route('GET', '/api/health', async () => {
      const block = await retryRead(() => reader.getBlockNumber())
      return { ok: true, chainId: MODERATO.chainId, block: Number(block), mainnet, sponsor: { address: sponsor, pathusd: String(await sponsorBalance(sponsor)) } }
    }),

    route('GET', '/api/catalog', async ({ query }) => {
      const network = query.get('network') ?? 'moderato'
      if (network === 'moderato') return { services: publicCatalog(), payoutGroups: payoutGroups() }
      if (network !== 'mainnet') throw bad("network must be 'moderato' or 'mainnet'")
      if (!mainnet) throw new HttpError(400, 'mainnet_disabled', 'this desk does not run mainnet teams')
      // The live 402 probe: a service, the payout it names and what it asked per call. Nothing here is invented.
      const services = mainnetServices()
      const groups = new Map<string, { recipient: Address; serviceIds: string[] }>()
      for (const s of services) {
        const g = groups.get(lower(s.recipient)) ?? { recipient: s.recipient, serviceIds: [] }
        g.serviceIds.push(s.serviceId)
        groups.set(lower(s.recipient), g)
      }
      return { network: 'mainnet', services, payoutGroups: [...groups.values()] }
    }),

    route('POST', '/api/faucet', async ({ req }) => {
      const b = await body(req)
      const addr = address(b['address'], 'address')
      if (store.team(addr)?.network === 'mainnet') throw conflict('mainnet_team', `${addr} is a mainnet team: the desk funds nothing on mainnet, deposit USDC.e to it directly`)
      const claim = store.claimFaucet(addr, FAUCET_WINDOW_MS, FAUCET_GLOBAL_PER_HOUR)
      if (claim === 'address') throw new HttpError(429, 'faucet_rate_limited', `${addr} was funded in the last 10 minutes`)
      if (claim === 'global') throw new HttpError(429, 'faucet_rate_limited', 'the faucet is busy, try again in a few minutes')
      try {
        const funded = await fund(addr)
        return { txs: funded.txs, ousd: String(funded.ousd), pathusd: String(funded.pathusd) }
      } catch (e) {
        store.releaseFaucet(addr)
        throw e
      }
    }),

    route('POST', '/api/teams', async (ctx) => {
      const b = await body(ctx.req)
      const account = address(b['account'], 'account')
      const label = str(b, 'label', { max: 60 })
      const signer = b['signer']
      if (signer !== 'passkey' && signer !== 'webcrypto') throw bad("signer must be 'passkey' or 'webcrypto'")
      const network = b['network'] === undefined ? 'moderato' : b['network']
      if (network !== 'moderato' && network !== 'mainnet') throw bad("network must be 'moderato' or 'mainnet'")
      if (network === 'mainnet' && !mainnet) throw new HttpError(400, 'mainnet_disabled', 'this desk does not run mainnet teams')
      authorize(ctx, account, network, b)
      const existing = store.team(account)
      if (existing && existing.network !== network) throw conflict('network_mismatch', `team ${account} runs on ${existing.network}, not ${network}`)
      store.upsertTeam(account, label, signer, network)
      return { team: store.team(account) }
    }),

    route('GET', '/api/teams/:account', async ({ params }) => {
      const account = address(params['account'], 'account')
      const team = teamOf(account)
      await sweepPending(account, true)
      const chain = chains[team.network]
      const deposit = await budgetBalance(chain, account).then(
        (b) => ({ token: chain.token, units: String(b.balance), block: Number(b.block), chainId: chain.config.chainId, error: null }),
        (e: Error) => ({ token: chain.token, units: null, block: null, chainId: chain.config.chainId, error: e.message.split('\n')[0]! }),
      )
      const agents = await Promise.all(
        store.agents(account).map(async (a) => {
          const keyId = a.key_id
          let remaining: string | null = null
          let periodEnd: string | null = null
          let scopes: unknown = null
          let readError: string | null = null
          let block: number | null = null
          if (a.status === 'active') {
            try {
              const [limit, allowed] = await Promise.all([
                retryRead(() => getRemainingLimit(chain.reader, account, keyId, chain.token)),
                retryRead(() => getAllowedCalls(chain.reader, account, keyId)),
              ])
              remaining = String(limit.remaining)
              periodEnd = String(limit.periodEnd)
              scopes = allowed.scopes
              block = Number(limit.stamp.blockNumber)
            } catch (e) {
              readError = (e as Error).message.split('\n')[0]!
            }
          }
          return {
            keyId,
            name: a.name,
            status: a.status,
            external: a.external === 1,
            budget: a.budget,
            budgetUnits: String(parseUnits(a.budget, DECIMALS)),
            period: a.period,
            token: a.token,
            serviceIds: serviceIdsOf(a),
            expiry: a.expiry,
            remaining,
            periodEnd,
            scopes,
            readBlock: block,
            readError,
            authorizeTx: a.authorize_tx,
            createdAt: a.created_at,
          }
        }),
      )
      const active = agents.filter((a) => a.status === 'active')
      return {
        team,
        balance: deposit,
        agents,
        totals: {
          activeAgents: active.length,
          budgetUnits: String(active.reduce((s, a) => s + BigInt(a.budgetUnits), 0n)),
          remainingUnits: String(active.reduce((s, a) => s + BigInt(a.remaining ?? '0'), 0n)),
        },
      }
    }),

    route('POST', '/api/teams/:account/agents', async (ctx) => {
      const account = address(ctx.params['account'], 'account')
      const team = teamOf(account)
      const chain = chains[team.network]
      const b = await body(ctx.req)
      authorize(ctx, account, team.network, b)
      const external = b['external'] === undefined ? false : b['external']
      if (typeof external !== 'boolean') throw bad('external must be true or false')
      if (team.network === 'mainnet' && !external) throw conflict('mainnet_requires_external', 'a mainnet team holds only agents that run outside Leash: pass external: true with the key id from leash-agent init')
      const name = str(b, 'name', { max: 40 })
      const budget = str(b, 'budget', { max: 16 })
      const unit = team.network === 'mainnet' ? 'USDC.e' : 'OUSD'
      if (!/^\d{1,7}(\.\d{1,6})?$/.test(budget) || parseUnits(budget, DECIMALS) <= 0n) throw bad(`budget must be a positive decimal ${unit} amount such as "1.50"`)
      const periodSeconds = integer(b['periodSeconds'], 'periodSeconds', 60, 365 * 86_400)
      if (team.network === 'mainnet' && (parseUnits(budget, DECIMALS) > MAINNET_CAPS.maxBudgetUnits || periodSeconds < MAINNET_CAPS.minPeriodSeconds))
        throw conflict('mainnet_cap', `a mainnet agent spends at most ${formatUnits(MAINNET_CAPS.maxBudgetUnits, DECIMALS)} USDC.e per day`)
      const requested = b['serviceIds']
      if (!Array.isArray(requested) || requested.length === 0 || requested.length > 10) throw bad('serviceIds must be a non-empty list of service ids')
      const offered = servicesOn(team.network)
      if (!requested.every((id) => offered.some((s) => s.serviceId === id))) throw bad(`serviceIds may only contain ${offered.map((s) => s.serviceId).join(', ')}`)
      if (new Set(requested).size !== requested.length) throw bad('serviceIds must not repeat')
      await sweepPending(account)
      const maxAgents = team.network === 'mainnet' ? MAINNET_CAPS.maxOpenAgents : MAX_OPEN_AGENTS
      if (store.openAgentCount(account) >= maxAgents) throw conflict('too_many_agents', `a team can hold at most ${maxAgents} agents`)

      const cut = store.blocked(account)
      const catalog = offered
      const granted = catalog.filter((s) => requested.includes(s.serviceId) && !cut.has(lower(s.recipient)))
      const omitted = catalog.filter((s) => requested.includes(s.serviceId) && cut.has(lower(s.recipient))).map((s) => ({ serviceId: s.serviceId, reason: 'cut' }))
      if (granted.length === 0) throw conflict('services_cut', 'every requested service was cut for this team')
      const recipients = [...new Map(granted.map((s) => [lower(s.recipient), s.recipient])).values()]
      // Every service whose payout is among the recipients is reachable, not only the ones asked for.
      const reach = catalog.filter((s) => recipients.some((r) => lower(r) === lower(s.recipient))).map((s) => s.serviceId)

      // An external agent already holds its key: the desk takes only the key id and never a private key.
      const privateKey = external ? null : generatePrivateKey()
      const keyId = privateKey === null ? address(b['keyId'], 'keyId') : privateKeyToAddress(privateKey)
      if (external && store.agent(keyId)) throw conflict('key_exists', `key ${keyId} is already registered`)
      const expiry = Math.floor(Date.now() / 1000) + KEY_LIFETIME_SECONDS
      store.insertAgent({ keyId, account, name, privateKey, budget, period: periodSeconds, token: chain.token, serviceIds: granted.map((s) => s.serviceId), expiry })
      return {
        keyId,
        reach,
        omitted,
        authorize: {
          accessKey: { accessKeyAddress: keyId, keyType: 'secp256k1' },
          expiry,
          limits: [{ token: chain.token, limit: String(parseUnits(budget, DECIMALS)), period: periodSeconds }],
          scopes: [{ address: chain.token, selector: SELECTOR.transferWithMemo, recipients }],
        },
      }
    }),

    route('POST', '/api/agents/:keyId/confirm', async (ctx) => {
      const agent = agentOf(ctx.params['keyId']!)
      const b = await body(ctx.req)
      authorize(ctx, agent.account, teamOf(agent.account).network, b)
      const tx = txHash(b['tx'])
      if (agent.status === 'revoked') throw conflict('agent_revoked', `agent ${agent.key_id} is revoked`)
      if (agent.status === 'active') return { keyId: agent.key_id, status: 'active', authorizeTx: agent.authorize_tx }
      // The chain is read first: a confirm that arrives late still activates a key that is live as planned.
      confirming.add(agent.key_id)
      try {
        const check = await verifyAuthorize(chainOfAgent(agent), { tx, ...planOf(agent) })
        if (!check.ok) throw new HttpError(422, 'authorize_not_confirmed', check.reason)
        store.setAgentStatus(agent.key_id, 'active', tx)
        return { keyId: agent.key_id, status: 'active', authorizeTx: tx, block: check.block }
      } finally {
        confirming.delete(agent.key_id)
      }
    }),

    route('POST', '/api/agents/:keyId/run', async (ctx) => {
      const agent = agentOf(ctx.params['keyId']!)
      const b = await body(ctx.req)
      authorize(ctx, agent.account, teamOf(agent.account).network, b)
      assertRunnable(agent)
      return runner.research(agent, str(b, 'topic', { max: 120 }))
    }),

    route('POST', '/api/agents/:keyId/call', async (ctx) => {
      const agent = agentOf(ctx.params['keyId']!)
      const b = await body(ctx.req)
      authorize(ctx, agent.account, teamOf(agent.account).network, b)
      assertRunnable(agent)
      const serviceId = b['serviceId']
      if (!isServiceId(serviceId)) throw bad('serviceId is not a known service')
      const { record, body: text } = await runner.paidCall(agent, serviceId, b['input'])
      return { record, body: text }
    }),

    route('POST', '/api/agents/:keyId/records', async ({ params, req }) => {
      const agent = agentOf(params['keyId']!)
      if (agent.external !== 1) throw conflict('not_external', `agent ${agent.key_id} runs inside Leash: the runner writes its records`)
      if (agent.status !== 'active') throw conflict('agent_not_active', `agent ${agent.key_id} is ${agent.status}`)
      // Taken only for a live agent, so posts to keys that do not exist cannot drain anyone's allowance.
      if (!ipLimit.take(clientOf(req))) throw new HttpError(429, 'rate_limited', 'too many records from this address: slow down')
      const b = await body(req)
      const record = parseRecord(b['record'], { keyId: agent.key_id, account: agent.account })
      // The signature covers the record exactly as the agent sent it, so it is checked against the parsed JSON, not a re-shaped copy.
      const signer = await signerOf(b['record'] as typeof record, b['signature'])
      if (signer === null || lower(signer) !== lower(agent.key_id))
        throw new HttpError(401, 'bad_signature', `the signature does not recover to the agent key ${agent.key_id}${signer ? ` (it recovers to ${signer})` : ''}`)
      // Taken after the signature, so a stranger posting to a key's url cannot spend that key's allowance.
      if (!keyLimit.take(agent.key_id)) throw new HttpError(429, 'rate_limited', `too many records from key ${agent.key_id}: at most ${RECORDS_PER_KEY.capacity} at once, then ${RECORDS_PER_KEY.perSecond} a second`)
      const duplicate = () => {
        const tx = record.settlement?.tx
        if (tx && store.hasSettlement(tx)) throw conflict('duplicate_record', `settlement ${tx} is already in the ledger`)
        if (store.hasRecord(agent.key_id, record.id)) throw conflict('duplicate_record', `record ${record.id} is already in the ledger`)
      }
      duplicate()

      const paid = record.outcome === 'delivered' || record.outcome === 'paid_not_delivered'
      let settlement: typeof record.settlement = null
      let settledAt: string | null = null
      if (paid) {
        const tx = txHash(record.settlement!.tx, 'record.settlement.tx')
        const check = await verifySettlement(chainOfAgent(agent), { tx, account: agent.account, keyId: agent.key_id, recipient: record.recipient!, amount: record.amount!, memo: record.memo!, currency: record.currency! })
        if (!check.ok) throw new HttpError(422, 'settlement_not_confirmed', check.reason)
        // What the chain read back, never what the agent said.
        settlement = { tx, block: check.block, status: 'success', keySpend: check.keySpend }
        // A payment counts at its block's time. The agent's own times only have to be plausible next to it.
        assertNotBeforeSettlement(record.finishedAt, check.time)
        settledAt = new Date(check.time).toISOString()
      }
      // The catalog holds the Moderato vendors the desk runs; a mainnet team's records name where they were paid.
      const known = teamOf(agent.account).network === 'moderato' ? serviceOfUrl(record.url) : undefined
      if (known && record.recipient && lower(record.recipient) !== lower(known.recipient))
        throw bad(`record.recipient ${record.recipient} is not the payout of ${known.serviceId} (${known.recipient})`)
      // Nothing awaits between this check and the insert, so two reports of one settlement cannot both land.
      duplicate()
      const seq = store.insertRecord(
        { ...record, settlement },
        { agentName: agent.name, vendorId: known?.vendorId ?? 'external', serviceId: known?.serviceId ?? externalServiceId(record.url) },
        'external',
        { settledAt },
      )
      return { accepted: true, seq, outcome: record.outcome, source: 'external', settlementTx: settlement?.tx ?? null }
    }),

    route('GET', '/api/teams/:account/blocked', async ({ params }) => {
      const account = address(params['account'], 'account')
      teamOf(account)
      return { recipients: [...store.blocked(account)] }
    }),

    route('GET', '/api/teams/:account/ledger', async ({ params, query }) => {
      const account = address(params['account'], 'account')
      teamOf(account)
      return { records: store.ledger(account, intParam(query, 'limit', 100, 1, 500)) }
    }),

    route('GET', '/api/teams/:account/vendors', async ({ params }) => {
      const account = address(params['account'], 'account')
      const team = teamOf(account)
      const records = store.allRecords(account)
      const cutoffs = store.cutoffs(account)
      const blocked = store.blocked(account)
      if (team.network === 'mainnet') return { services: mainnetVendorRows({ records, cutoffs, blocked, servicesPaying: mainnetServicesPaying }) }
      return { services: vendorRows({ catalog: publicCatalog(), records, cutoffs, blocked }) }
    }),

    route('POST', '/api/teams/:account/cutoffs', async (ctx) => {
      const account = address(ctx.params['account'], 'account')
      const chain = chainOfTeam(account)
      const b = await body(ctx.req)
      authorize(ctx, account, chain.name, b)
      const recipient = address(b['recipient'], 'recipient')
      const reason = b['reason'] === undefined ? 'manual' : b['reason']
      if (reason !== 'failures' && reason !== 'manual') throw bad("reason must be 'failures' or 'manual'")
      const onMainnet = chain.name === 'mainnet'
      const servicesCut: string[] = onMainnet ? mainnetServicesPaying(recipient) : servicesPaying(recipient)
      // The evidence is read from the ledger now and stored with the cut: what the operator saw when they decided.
      // A mainnet payout is measured as a whole: the records name a payout, not the service behind it.
      const mine = store.allRecords(account).filter((r) => (onMainnet ? r.recipient !== null && lower(r.recipient) === lower(recipient) : servicesCut.includes(r.serviceId as ServiceId)))
      const evidence = {
        ...evidenceOf(mine),
        recipient,
        services: servicesCut.map((id) => (onMainnet ? { serviceId: id } : { serviceId: id, ...evidenceOf(mine.filter((r) => r.serviceId === id)) })),
      }
      if (reason === 'failures' && evidence.paidNotDelivered === 0)
        throw conflict('no measured failures', `no paid-but-not-delivered record for ${recipient} in the last 24 hours (${evidence.paid} paid). Cut it with reason 'manual' if you still want it out of scope`)
      const active = store.agents(account).filter((a) => a.status === 'active')
      const keys = await Promise.all(
        active.map(async (a) => {
          const allowed = await retryRead(() => getAllowedCalls(chain.reader, account, a.key_id))
          return { keyId: a.key_id, scopes: allowed.scopes, isScoped: allowed.isScoped }
        }),
      )
      const plan = planCutoff(keys, recipient)
      // A key with no scope restriction can pay anyone, and planCutoff only sees rules it can rewrite.
      for (const k of keys.filter((x) => !x.isScoped)) {
        if (!plan.unbounded.includes(k.keyId)) plan.unbounded.push(k.keyId)
      }
      const id = store.insertCutoff({
        account,
        recipient,
        serviceIds: servicesCut,
        status: plan.calls.length > 0 ? 'prepared' : 'confirmed',
        rescoped: plan.rescoped,
        revoked: plan.revoked,
        unbounded: plan.unbounded,
        unchanged: plan.unchanged,
        reason,
        evidence,
      })
      return { id, calls: plan.calls, rescoped: plan.rescoped, revoked: plan.revoked, unchanged: plan.unchanged, unbounded: plan.unbounded, servicesCut, reason, evidence }
    }),

    route('POST', '/api/cutoffs/:id/confirm', async (ctx) => {
      const id = Number(ctx.params['id'])
      const cutoff = Number.isInteger(id) ? store.cutoff(id) : undefined
      if (!cutoff) throw notFound(`no cutoff ${ctx.params['id']}`)
      const b = await body(ctx.req)
      authorize(ctx, cutoff.account, teamOf(cutoff.account).network, b)
      const tx = txHash(b['tx'])
      const rescoped = JSON.parse(cutoff.rescoped) as Address[]
      const revoked = JSON.parse(cutoff.revoked) as Address[]
      if (cutoff.status === 'confirmed' && cutoff.tx) return cutoffView(cutoff.id)
      const teamKeys = store.agents(cutoff.account).map((a) => a.key_id)
      const check = await verifyCutoff(chainOfTeam(cutoff.account), { tx, account: cutoff.account, recipient: cutoff.recipient, teamKeys, rescoped, revoked })
      if (!check.ok) {
        store.finishCutoff(cutoff.id, 'failed', tx, check.gasUsed, check.reason)
        throw new HttpError(422, 'cutoff_not_confirmed', check.reason)
      }
      store.finishCutoff(cutoff.id, 'confirmed', tx, check.gasUsed, null)
      for (const keyId of revoked) store.setAgentStatus(keyId, 'revoked')
      return { ...cutoffView(cutoff.id), block: check.block }
    }),

    route('POST', '/api/agents/:keyId/revoke-plan', async ({ params }) => {
      const agent = agentOf(params['keyId']!)
      if (agent.status !== 'active') throw conflict('agent_not_active', `agent ${agent.key_id} is ${agent.status}`)
      return { calls: [{ to: Addresses.accountKeychain, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'revokeKey', args: [agent.key_id] }) }] }
    }),

    route('POST', '/api/agents/:keyId/revoke-confirm', async (ctx) => {
      const agent = agentOf(ctx.params['keyId']!)
      const b = await body(ctx.req)
      authorize(ctx, agent.account, teamOf(agent.account).network, b)
      const tx = txHash(b['tx'])
      if (agent.status === 'revoked') return { keyId: agent.key_id, status: 'revoked' }
      const check = await verifyRevoke(chainOfAgent(agent), { tx, account: agent.account, keyId: agent.key_id })
      if (!check.ok) throw new HttpError(422, 'revoke_not_confirmed', check.reason)
      store.setAgentStatus(agent.key_id, 'revoked')
      return { keyId: agent.key_id, status: 'revoked', tx }
    }),

    route('GET', '/api/mainnet/mpp', async ({ query }) => cachedReplay(intParam(query, 'blocks', 20_000, 1, MAX_REPLAY_BLOCKS))),

    route('GET', '/api/outside/vet402', async () => outsideFeed()),

    route('GET', '/api/stats', async () => store.stats()),

    route('GET', '/api/featured', async () => {
      const account = FEATURED_TEAM ?? store.busiestTeam(mainnet)
      if (!account) throw notFound('no team has a ledger yet and LEASH_FEATURED_TEAM is not set')
      return { account }
    }),

    route('GET', '/api/mainnet/evidence', async ({ query }) => {
      const [replay, outside] = await Promise.all([cachedReplay(intParam(query, 'blocks', 20_000, 1, MAX_REPLAY_BLOCKS)), outsideFeed()])
      const probed = probedServices()
      const window = { blocks: replay.blocks, fromBlock: replay.fromBlock, toBlock: replay.toBlock, fromTime: replay.fromTime, toTime: replay.toTime }
      const payouts = new Map<string, Address>()
      for (const p of replay.payouts) payouts.set(lower(p.payout), p.payout)
      for (const p of outside.payouts) payouts.set(lower(p.recipient), p.recipient)
      const rows = [...payouts].map(([key, payout]) => {
        const services = probed.get(key) ?? []
        const rep = replay.payouts.find((p) => lower(p.payout) === key)
        const seen = outside.records.filter((r) => lower(r.recipient) === key)
        const failed = seen.filter((r) => !r.delivered).sort((a, b) => b.verified.block - a.verified.block)
        return {
          payout,
          services,
          replay: { charges: rep?.charges ?? 0, payers: rep?.payers ?? 0, window },
          vet402: { paid: seen.length, delivered: seen.length - failed.length, paidNotDelivered: failed.length, txs: failed.slice(0, 5).map((r) => r.tx) },
          cutTakes: services.length,
        }
      })
      rows.sort((a, b) => b.vet402.paidNotDelivered - a.vet402.paidNotDelivered || b.replay.charges - a.replay.charges)
      return { payouts: rows, window, outsideCachedAt: outside.cachedAt, outsideStale: outside.stale }
    }),

    route('GET', '/api/teams/:account/balances', async ({ params }) => {
      const account = address(params['account'], 'account')
      const team = store.team(account) && teamOf(account)
      if (team?.network === 'mainnet') {
        const b = await budgetBalance(chains.mainnet, account)
        return { account, network: 'mainnet', token: chains.mainnet.token, units: String(b.balance), block: Number(b.block) }
      }
      const b = await balances(account)
      return { account, network: 'moderato', ousd: String(b.ousd), pathusd: String(b.pathusd), block: Number(b.block) }
    }),
  ]

  function cutoffView(id: number) {
    const c = store.cutoff(id)!
    return {
      id: c.id,
      status: c.status,
      tx: c.tx,
      gasUsed: c.gas_used,
      recipient: c.recipient,
      servicesCut: JSON.parse(c.service_ids) as string[],
      rescoped: JSON.parse(c.rescoped) as string[],
      revoked: JSON.parse(c.revoked) as string[],
      unbounded: JSON.parse(c.unbounded) as string[],
      unchanged: JSON.parse(c.unchanged) as string[],
      failure: c.failure,
      confirmedAt: c.confirmed_at,
      reason: c.reason,
      evidence: c.evidence === null ? null : (JSON.parse(c.evidence) as unknown),
    }
  }

  const corsHeaders = (origin: string | undefined): Record<string, string> =>
    origin && ALLOWED_ORIGINS.has(origin)
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-leash-issued-at, x-leash-signature',
          'access-control-expose-headers': 'www-authenticate, payment-receipt',
          'access-control-max-age': '600',
          vary: 'Origin',
        }
      : { vary: 'Origin' }

  const HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade'])

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const cors = corsHeaders(req.headers.origin)
    try {
      const url = new URL(req.url ?? '/', 'http://leash.local')
      const path = url.pathname.replace(/^\/leash(?=\/|$)/, '') || '/'
      const method = req.method ?? 'GET'
      if (method === 'OPTIONS') {
        res.writeHead(204, cors)
        return void res.end()
      }
      if (path.startsWith('/v/')) {
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !HOP.has(k)) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
        const payload = method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(await readBody(req))
        const out = await vendors(new Request(`http://127.0.0.1${path}${url.search}`, { method, headers, ...(payload ? { body: payload } : {}) }))
        if (out) {
          res.writeHead(out.status, { ...Object.fromEntries(out.headers), ...cors })
          return void res.end(Buffer.from(await out.arrayBuffer()))
        }
      }
      let found: ReturnType<typeof match>
      try {
        found = match(routes, method, path)
      } catch {
        throw bad('path contains an invalid escape sequence')
      }
      if (found === null) throw notFound(`${method} ${path}`)
      if (found === 'method') throw new HttpError(405, 'method_not_allowed', `${method} is not allowed on ${path}`)
      const result = await found.route.handler({ params: found.params, query: url.searchParams, req, path })
      sendJson(res, 200, result, cors)
    } catch (e) {
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.code, detail: e.detail ?? null }, cors)
      const message = ((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? String(e)).split('\n')[0]!
      console.error(`[leash-api] ${req.method} ${req.url}: ${message}`)
      sendJson(res, 500, { error: 'internal_error', detail: message }, cors)
    }
  }
}

