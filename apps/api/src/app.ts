import type { IncomingMessage, ServerResponse } from 'node:http'
import { encodeFunctionData, parseUnits } from 'viem'
import type { Address } from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { Abis, Addresses } from 'viem/tempo'
import { getAllowedCalls, getRemainingLimit, planCutoff } from '@leash/sdk'
import { SELECTOR } from '@leash/policy'
import type { VendorRouter } from '@leash/vendors'
import { ALLOWED_ORIGINS, BUDGET_TOKEN, KEY_LIFETIME_SECONDS, MODERATO } from './config.js'
import { balances, fund, lower, reader, retryRead, verifyAuthorize, verifyCutoff, verifyRevoke } from './chain.js'
import { HttpError, address, bad, conflict, match, notFound, parseJsonObject, readBody, route, sendJson, str, txHash } from './http.js'
import type { Route } from './http.js'
import { cachedReplay, MAX_REPLAY_BLOCKS } from './mainnet.js'
import { outsideFeed } from './outside.js'
import { sponsorBalance } from './sponsor.js'
import type { Runner } from './runner.js'
import { isServiceId, payoutGroups, publicCatalog, servicesPaying } from './services.js'
import type { AgentRow, Store } from './store.js'

const FAUCET_WINDOW_MS = 10 * 60_000
const FAUCET_GLOBAL_PER_HOUR = 60
const MAX_OPEN_AGENTS = 25
const DECIMALS = 6

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

export type AppDeps = { store: Store; runner: Runner; vendors: VendorRouter; sponsor: Address }

export function createApp({ store, runner, vendors, sponsor }: AppDeps) {
  const teamOf = (account: Address) => {
    const team = store.team(account)
    if (!team) throw notFound(`no team ${account}. Create it with POST /api/teams`)
    return team
  }
  const agentOf = (keyId: string): AgentRow => {
    const agent = store.agent(address(keyId, 'keyId'))
    if (!agent) throw notFound(`no agent ${keyId}`)
    return agent
  }
  const serviceIdsOf = (agent: AgentRow) => JSON.parse(agent.service_ids) as string[]

  /** Recipients this team has cut on chain. New keys are never granted them. */
  const cutRecipients = (account: Address): Set<string> => {
    const cut = new Set<string>()
    for (const c of store.cutoffs(account)) if (c.status === 'confirmed' && c.tx) cut.add(lower(c.recipient))
    return cut
  }

  const routes: Route[] = [
    route('GET', '/api/health', async () => {
      const block = await retryRead(() => reader.getBlockNumber())
      return { ok: true, chainId: MODERATO.chainId, block: Number(block), sponsor: { address: sponsor, pathusd: String(await sponsorBalance(sponsor)) } }
    }),

    route('GET', '/api/catalog', async () => ({ services: publicCatalog(), payoutGroups: payoutGroups() })),

    route('POST', '/api/faucet', async ({ req }) => {
      const b = await body(req)
      const addr = address(b['address'], 'address')
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

    route('POST', '/api/teams', async ({ req }) => {
      const b = await body(req)
      const account = address(b['account'], 'account')
      const label = str(b, 'label', { max: 60 })
      const signer = b['signer']
      if (signer !== 'passkey' && signer !== 'webcrypto') throw bad("signer must be 'passkey' or 'webcrypto'")
      store.upsertTeam(account, label, signer)
      return { team: store.team(account) }
    }),

    route('GET', '/api/teams/:account', async ({ params }) => {
      const account = address(params['account'], 'account')
      const team = teamOf(account)
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
                retryRead(() => getRemainingLimit(reader, account, keyId, BUDGET_TOKEN)),
                retryRead(() => getAllowedCalls(reader, account, keyId)),
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
        agents,
        totals: {
          activeAgents: active.length,
          budgetUnits: String(active.reduce((s, a) => s + BigInt(a.budgetUnits), 0n)),
          remainingUnits: String(active.reduce((s, a) => s + BigInt(a.remaining ?? '0'), 0n)),
        },
      }
    }),

    route('POST', '/api/teams/:account/agents', async ({ params, req }) => {
      const account = address(params['account'], 'account')
      teamOf(account)
      const b = await body(req)
      const name = str(b, 'name', { max: 40 })
      const budget = str(b, 'budget', { max: 16 })
      if (!/^\d{1,7}(\.\d{1,6})?$/.test(budget) || parseUnits(budget, DECIMALS) <= 0n) throw bad('budget must be a positive decimal OUSD amount such as "1.50"')
      const periodSeconds = integer(b['periodSeconds'], 'periodSeconds', 60, 365 * 86_400)
      const requested = b['serviceIds']
      if (!Array.isArray(requested) || requested.length === 0 || requested.length > 10) throw bad('serviceIds must be a non-empty list of service ids')
      if (!requested.every(isServiceId)) throw bad(`serviceIds may only contain ${publicCatalog().map((s) => s.serviceId).join(', ')}`)
      if (new Set(requested).size !== requested.length) throw bad('serviceIds must not repeat')
      if (store.openAgentCount(account) >= MAX_OPEN_AGENTS) throw conflict('too_many_agents', `a team can hold at most ${MAX_OPEN_AGENTS} agents`)

      const cut = cutRecipients(account)
      const catalog = publicCatalog()
      const granted = catalog.filter((s) => requested.includes(s.serviceId) && !cut.has(lower(s.recipient)))
      const omitted = catalog.filter((s) => requested.includes(s.serviceId) && cut.has(lower(s.recipient))).map((s) => ({ serviceId: s.serviceId, reason: 'cut' }))
      if (granted.length === 0) throw conflict('services_cut', 'every requested service was cut for this team')
      const recipients = [...new Map(granted.map((s) => [lower(s.recipient), s.recipient])).values()]
      // Every service whose payout is among the recipients is reachable, not only the ones asked for.
      const reach = catalog.filter((s) => recipients.some((r) => lower(r) === lower(s.recipient))).map((s) => s.serviceId)

      const privateKey = generatePrivateKey()
      const keyId = privateKeyToAddress(privateKey)
      const expiry = Math.floor(Date.now() / 1000) + KEY_LIFETIME_SECONDS
      store.insertAgent({ keyId, account, name, privateKey, budget, period: periodSeconds, token: BUDGET_TOKEN, serviceIds: granted.map((s) => s.serviceId), expiry })
      return {
        keyId,
        reach,
        omitted,
        authorize: {
          accessKey: { accessKeyAddress: keyId, keyType: 'secp256k1' },
          expiry,
          limits: [{ token: BUDGET_TOKEN, limit: String(parseUnits(budget, DECIMALS)), period: periodSeconds }],
          scopes: [{ address: BUDGET_TOKEN, selector: SELECTOR.transferWithMemo, recipients }],
        },
      }
    }),

    route('POST', '/api/agents/:keyId/confirm', async ({ params, req }) => {
      const agent = agentOf(params['keyId']!)
      const tx = txHash((await body(req))['tx'])
      if (agent.status === 'revoked') throw conflict('agent_revoked', `agent ${agent.key_id} is revoked`)
      if (agent.status === 'active') return { keyId: agent.key_id, status: 'active', authorizeTx: agent.authorize_tx }
      const planned = publicCatalog().filter((s) => serviceIdsOf(agent).includes(s.serviceId)).map((s) => s.recipient)
      const check = await verifyAuthorize({ tx, account: agent.account, keyId: agent.key_id, plannedRecipients: planned })
      if (!check.ok) throw new HttpError(422, 'authorize_not_confirmed', check.reason)
      store.setAgentStatus(agent.key_id, 'active', tx)
      return { keyId: agent.key_id, status: 'active', authorizeTx: tx, block: check.block }
    }),

    route('POST', '/api/agents/:keyId/run', async ({ params, req }) => {
      const agent = agentOf(params['keyId']!)
      const topic = str(await body(req), 'topic', { max: 120 })
      return runner.research(agent, topic)
    }),

    route('POST', '/api/agents/:keyId/call', async ({ params, req }) => {
      const agent = agentOf(params['keyId']!)
      const b = await body(req)
      const serviceId = b['serviceId']
      if (!isServiceId(serviceId)) throw bad('serviceId is not a known service')
      const { record, body: text } = await runner.paidCall(agent, serviceId, b['input'])
      return { record, body: text }
    }),

    route('GET', '/api/teams/:account/ledger', async ({ params, query }) => {
      const account = address(params['account'], 'account')
      teamOf(account)
      return { records: store.ledger(account, intParam(query, 'limit', 100, 1, 500)) }
    }),

    route('GET', '/api/teams/:account/vendors', async ({ params }) => {
      const account = address(params['account'], 'account')
      teamOf(account)
      const records = store.allRecords(account)
      const cutoffs = store.cutoffs(account)
      const blocked = store.blocked(account)
      const catalog = publicCatalog()
      const services = catalog.map((s) => {
        const mine = records.filter((r) => r.serviceId === s.serviceId)
        const settled = mine.filter((r) => r.settlement?.status === 'success' && (r.outcome === 'delivered' || r.outcome === 'paid_not_delivered'))
        const delivered = settled.filter((r) => r.outcome === 'delivered').length
        const paidNotDelivered = settled.length - delivered
        const cut = cutoffs.find((c) => lower(c.recipient) === lower(s.recipient) && (c.status === 'prepared' || (c.status === 'confirmed' && c.tx)))
        return {
          serviceId: s.serviceId,
          vendorId: s.vendorId,
          recipient: s.recipient,
          virtual: s.virtual,
          paid: settled.length,
          delivered,
          paidNotDelivered,
          refused: mine.filter((r) => r.outcome === 'refused').length,
          spent: String(settled.reduce((sum, r) => sum + BigInt(r.amount ?? '0'), 0n)),
          failureRate: settled.length === 0 ? 0 : paidNotDelivered / settled.length,
          siblings: catalog.filter((o) => o.serviceId !== s.serviceId && lower(o.recipient) === lower(s.recipient)).map((o) => o.serviceId),
          cut: cut ? { status: cut.status, tx: cut.tx } : null,
          blocked: blocked.has(lower(s.recipient)),
        }
      })
      return { services }
    }),

    route('POST', '/api/teams/:account/cutoffs', async ({ params, req }) => {
      const account = address(params['account'], 'account')
      teamOf(account)
      const recipient = address((await body(req))['recipient'], 'recipient')
      const servicesCut = servicesPaying(recipient)
      const active = store.agents(account).filter((a) => a.status === 'active')
      const keys = await Promise.all(
        active.map(async (a) => {
          const allowed = await retryRead(() => getAllowedCalls(reader, account, a.key_id))
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
      })
      if (plan.calls.length > 0) store.addBlock(account, recipient)
      return { id, calls: plan.calls, rescoped: plan.rescoped, revoked: plan.revoked, unchanged: plan.unchanged, unbounded: plan.unbounded, servicesCut }
    }),

    route('POST', '/api/cutoffs/:id/confirm', async ({ params, req }) => {
      const id = Number(params['id'])
      const cutoff = Number.isInteger(id) ? store.cutoff(id) : undefined
      if (!cutoff) throw notFound(`no cutoff ${params['id']}`)
      const tx = txHash((await body(req))['tx'])
      const rescoped = JSON.parse(cutoff.rescoped) as Address[]
      const revoked = JSON.parse(cutoff.revoked) as Address[]
      if (cutoff.status === 'confirmed' && cutoff.tx) return cutoffView(cutoff.id)
      const check = await verifyCutoff({ tx, account: cutoff.account, recipient: cutoff.recipient, rescoped, revoked })
      if (!check.ok) {
        store.finishCutoff(cutoff.id, 'failed', tx, check.gasUsed, check.reason)
        store.removeBlock(cutoff.account, cutoff.recipient)
        throw new HttpError(422, 'cutoff_not_confirmed', check.reason)
      }
      store.finishCutoff(cutoff.id, 'confirmed', tx, check.gasUsed, null)
      store.removeBlock(cutoff.account, cutoff.recipient)
      for (const keyId of revoked) store.setAgentStatus(keyId, 'revoked')
      return { ...cutoffView(cutoff.id), block: check.block }
    }),

    route('POST', '/api/agents/:keyId/revoke-plan', async ({ params }) => {
      const agent = agentOf(params['keyId']!)
      if (agent.status !== 'active') throw conflict('agent_not_active', `agent ${agent.key_id} is ${agent.status}`)
      return { calls: [{ to: Addresses.accountKeychain, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'revokeKey', args: [agent.key_id] }) }] }
    }),

    route('POST', '/api/agents/:keyId/revoke-confirm', async ({ params, req }) => {
      const agent = agentOf(params['keyId']!)
      const tx = txHash((await body(req))['tx'])
      if (agent.status === 'revoked') return { keyId: agent.key_id, status: 'revoked' }
      const check = await verifyRevoke({ tx, account: agent.account, keyId: agent.key_id })
      if (!check.ok) throw new HttpError(422, 'revoke_not_confirmed', check.reason)
      store.setAgentStatus(agent.key_id, 'revoked')
      return { keyId: agent.key_id, status: 'revoked', tx }
    }),

    route('GET', '/api/mainnet/mpp', async ({ query }) => cachedReplay(intParam(query, 'blocks', 20_000, 1, MAX_REPLAY_BLOCKS))),

    route('GET', '/api/outside/vet402', async () => outsideFeed()),

    route('GET', '/api/stats', async () => store.stats()),

    route('GET', '/api/teams/:account/balances', async ({ params }) => {
      const account = address(params['account'], 'account')
      const b = await balances(account)
      return { account, ousd: String(b.ousd), pathusd: String(b.pathusd), block: Number(b.block) }
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
    }
  }

  const corsHeaders = (origin: string | undefined): Record<string, string> =>
    origin && ALLOWED_ORIGINS.has(origin)
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
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
      const result = await found.route.handler({ params: found.params, query: url.searchParams, req })
      sendJson(res, 200, result, cors)
    } catch (e) {
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.code, detail: e.detail ?? null }, cors)
      const message = ((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? String(e)).split('\n')[0]!
      console.error(`[leash-api] ${req.method} ${req.url}: ${message}`)
      sendJson(res, 500, { error: 'internal_error', detail: message }, cors)
    }
  }
}

