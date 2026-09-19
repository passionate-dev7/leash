import type { Address, Hex } from 'viem'
import {
  AUTHORIZE_KEY_TARGET,
  CHAIN_ID,
  MODERATO_TOKENS,
  PERIOD,
  SELECTOR,
  blastRadiusHeadline,
  decodeRevert,
  computeBlastRadius,
  describePolicy,
  compilePolicy,
  fromSmallestUnits,
  isolationAdvice,
  loadRecipientIndex,
  sharedRecipients,
  sizeFromPolicy,
  toSmallestUnits,
} from '@leash/policy'
import type { BlastRadius, CompiledPolicy, RecipientIndex } from '@leash/policy'
import {
  INDEXER_SOURCES,
  createLeashClient,
  authorizeKey,
  driftAgainst,
  explorerAddress,
  explorerTx,
  fleetKeys,
  fleetSpend,
  getAllowedCalls,
  getKey,
  getRemainingLimit,
  getTokenMeta,
  getTokenBalance,
  mergeIndex,
  mintAgentKey,
  probeShortRemainingLimit,
  query,
  resolveLive,
  resolveOperator,
  revokeKey,
  updateSpendingLimit,
} from '@leash/sdk'
import type {
  IndexerSource,
  LeashClient,
  NetworkName,
  Operator,
  SpendRow,
} from '@leash/sdk'
import { listRecords, markRevoked, recordFor, saveRecord, REGISTRY_PATH } from './registry.js'
import type { KeyRecord } from './registry.js'

/**
 * The fleet view.
 *
 * Two rules hold everywhere in this file:
 *  1. A displayed budget comes from `getRemainingLimitWithPeriod` and carries the block it was
 *     read at. The `AccessKeySpend` event stream is telemetry, never a balance: gas is
 *     pre-charged at the gas limit and partly refunded *after* the events fire, so the last
 *     event's `remainingLimit` is stale. The console shows both and names the gap.
 *  2. Anything the policy cannot govern is stated, not implied. MPP `session`-intent services
 *     pay through `tip20ChannelReserve.open`, where the recipient allowlist has no effect.
 */

export const NETWORK: NetworkName =
  (process.env['LEASH_NETWORK'] as NetworkName | undefined) ?? 'moderato'

/** MPP itself only exists on mainnet, so every 402 challenge is resolved against 4217. */
export const MPP_CHAIN_ID = CHAIN_ID.mainnet

type State = {
  operator: Operator
  /** Root-key client. Key management requires the root account; an access key gets UnauthorizedCaller. */
  root: LeashClient
  snapshot: RecipientIndex
  tokenMeta: Map<string, { symbol: string; decimals: number; name: string }>
}

let state: State | undefined

export async function getState(): Promise<State> {
  if (state) return state
  const operator = resolveOperator()
  // Root writes are unsponsored, matching the path the gas figures in the docs were measured
  // on. Agent payments are sponsored; that asymmetry is deliberate and shown in the UI.
  const root = createLeashClient({ network: NETWORK, account: operator.account, sponsor: false })
  const snapshot = await loadRecipientIndex()
  state = { operator, root, snapshot, tokenMeta: new Map() }
  return state
}

async function tokenMeta(client: LeashClient, token: Address) {
  const s = await getState()
  const hit = s.tokenMeta.get(token.toLowerCase())
  if (hit) return hit
  const meta = await getTokenMeta(client, token)
  s.tokenMeta.set(token.toLowerCase(), meta)
  return meta
}

export function sourceByName(name?: string): IndexerSource {
  if (name && name in INDEXER_SOURCES) return INDEXER_SOURCES[name as IndexerSource['name']]
  return NETWORK === 'moderato' ? INDEXER_SOURCES['moderato-free'] : INDEXER_SOURCES['mainnet-direct']
}

// ---------------------------------------------------------------------------
// Configuration and provenance
// ---------------------------------------------------------------------------

/**
 * Probes every indexer source with a trivial query and reports what each one actually
 * answered. The docs say mainnet returns 402; this measures it on each page load rather than
 * repeating it.
 */
export async function probeIndexerSources(): Promise<
  {
    name: string
    url: string
    chainIdParam: string
    requiresPayment: boolean
    note: string
    live: boolean
    status: string
    probedAt: string
    latencyMs: number
  }[]
> {
  const probes = Object.values(INDEXER_SOURCES).map(async (source) => {
    const startedAt = Date.now()
    try {
      const res = await query<unknown[]>('SELECT 1 AS ok', { source, timeoutMs: 5_000 })
      return {
        ...source,
        live: true,
        status: `HTTP 200, ${res.row_count} row via ${res.engine} in ${Math.round(res.query_time_ms)} ms`,
        probedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        ...source,
        live: false,
        status: (error as Error).message.slice(0, 200),
        probedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      }
    }
  })
  return Promise.all(probes)
}

export async function config(): Promise<Record<string, unknown>> {
  const s = await getState()
  const net = s.root.leash.network
  const [blockNumber, balance] = await Promise.all([
    s.root.getBlockNumber(),
    getTokenBalance(s.root, net.settlementToken, s.operator.address),
  ])
  const meta = await tokenMeta(s.root, net.settlementToken)
  const ageHours = (Date.now() - Date.parse(s.snapshot.capturedAt)) / 3_600_000
  return {
    operator: {
      role: s.operator.role,
      address: s.operator.address,
      explorer: explorerAddress(net, s.operator.address),
      balance: balance.balance,
      balanceHuman: fromSmallestUnits(balance.balance, meta.decimals),
      balanceStamp: balance.stamp,
    },
    network: {
      ...net,
      blockNumber,
      readAt: new Date().toISOString(),
    },
    token: { address: net.settlementToken, ...meta },
    sponsorship: {
      rootWritesSponsored: s.root.leash.sponsored,
      note: `Key management (authorizeKey, revokeKey, updateSpendingLimit) is signed by the root account and pays its own gas from the root balance. No access-key budget is involved, so the gas-debits-budget trap does not apply to these writes. Measured on Moderato: revokeKey 28,192 gas, authorizeKey 3,302,100 gas on a warm account.`,
      agentPaymentsSponsored: Boolean(net.sponsorUrl),
      agentNote: net.sponsorUrl
        ? `Agent payments go through ${net.sponsorUrl}, so gas never debits the agent budget. Measured: a 3,000,000 payment moved the budget by exactly 3,000,000 (tx 0x2c2b9fc2), against 3,003,597 unsponsored (tx 0x9428efd9).`
        : `No sponsor endpoint is configured for ${net.name}. Gas is pre-charged against the agent budget at the gas limit, so a budget means payments minus a variable gas tax.`,
    },
    mpp: {
      resolutionChainId: MPP_CHAIN_ID,
      executionChainId: net.chainId,
      note:
        net.chainId === MPP_CHAIN_ID
          ? 'Recipients are resolved and paid on the same chain.'
          : `MPP 402 challenges are only issued for chain ${MPP_CHAIN_ID}. Payout addresses below were resolved from live challenges on ${MPP_CHAIN_ID} and are enforced here on ${net.chainId}. The enforcement path is byte-identical; a vendor does not credit a payment made on ${net.chainId}.`,
    },
    snapshot: {
      capturedAt: s.snapshot.capturedAt,
      ageHours: Number(ageHours.toFixed(1)),
      chainId: s.snapshot.chainId,
      catalogServiceCount: s.snapshot.catalogServiceCount,
      resolved: s.snapshot.resolved.length,
      unresolved: s.snapshot.unresolved.length,
      note: 'Blast radius is evaluated against this capture. Payout addresses for the services a policy names are re-resolved live before every signature; the capture supplies the collateral set.',
    },
    registryPath: REGISTRY_PATH,
    periods: PERIOD,
    moderatoTokens: MODERATO_TOKENS,
  }
}

export async function sharedRecipientTable(): Promise<unknown> {
  const s = await getState()
  return {
    capturedAt: s.snapshot.capturedAt,
    rows: sharedRecipients(s.snapshot).map((r) => ({
      recipient: r.recipient,
      realms: r.realms,
      services: r.services.map((x) => ({
        id: x.serviceId,
        name: x.name,
        realm: x.realm,
        amount: x.amount,
        intent: x.intent,
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// The fleet
// ---------------------------------------------------------------------------

/** The token a key's budget is denominated in, read from its own allowlist rather than assumed. */
function tokenFromScopes(scopes: { target: Address; selectorRules: { selector: Hex }[] }[]):
  | Address
  | undefined {
  const scope = scopes.find((sc) =>
    sc.selectorRules.some((r) => r.selector.toLowerCase() === SELECTOR.transferWithMemo.toLowerCase()),
  )
  return scope?.target
}

export type FleetKey = {
  keyId: Address
  label?: string
  record?: KeyRecord
  authorizedAt?: { blockNum: number; txHash: Hex }
  revokedOnChain: boolean
  key: Awaited<ReturnType<typeof getKey>>
  token: { address: Address; symbol: string; decimals: number }
  limit?: Awaited<ReturnType<typeof getRemainingLimit>>
  limitError?: ReturnType<typeof decodeRevert>
  budgetHuman?: string
  allowed: Awaited<ReturnType<typeof getAllowedCalls>>
  blast?: { radius: BlastRadius; headline: string; advice?: string }
  /** The last event's `remainingLimit` next to the precompile read, and the gap between them. */
  eventVsRead?: {
    eventRemainingLimit: string
    precompileRemaining: string
    gap: string
    txHash: Hex
    note: string
  }
  spend: SpendRow[]
  spendTotals: { payments: string; gas: string; paymentCount: number; gasCount: number }
  ungovernable: { serviceId: string; name: string; reason: string }[]
  explorer: string
}

export async function listFleet(options: { source?: string } = {}): Promise<{
  operator: Address
  network: string
  chainId: number
  indexer: { source: IndexerSource; queriedAt: string; keysQueryOk: boolean; spendQueryOk: boolean; error?: string }
  keys: FleetKey[]
  readAt: string
}> {
  const s = await getState()
  const source = sourceByName(options.source)
  const net = s.root.leash.network

  let keyEvents: Awaited<ReturnType<typeof fleetKeys>>['rows'] = []
  let spendRows: SpendRow[] = []
  let queriedAt = new Date().toISOString()
  let keysQueryOk = false
  let spendQueryOk = false
  let indexerError: string | undefined

  try {
    const res = await fleetKeys({ account: s.operator.address, options: { source } })
    keyEvents = res.rows
    queriedAt = res.queriedAt
    keysQueryOk = true
  } catch (error) {
    indexerError = (error as Error).message
  }
  try {
    const res = await fleetSpend({ account: s.operator.address, limit: 400, options: { source } })
    spendRows = res.rows
    spendQueryOk = true
  } catch (error) {
    indexerError = indexerError ?? (error as Error).message
  }

  // Key ids from three places: the indexer's KeyAuthorized logs, the local registry, and any
  // key that has spent. A key the console did not sign still shows up, which is the point of
  // reading the chain rather than a database.
  const ids = new Map<string, Address>()
  for (const e of keyEvents) ids.set(e.keyId.toLowerCase(), e.keyId)
  for (const r of listRecords())
    if (r.chainId === net.chainId) ids.set(r.keyId.toLowerCase(), r.keyId)
  for (const r of spendRows) ids.set(r.agentKey.toLowerCase(), r.agentKey)

  const authorizedAt = new Map<string, { blockNum: number; txHash: Hex }>()
  const revokedOnChain = new Set<string>()
  for (const e of [...keyEvents].reverse()) {
    if (e.event === 'KeyAuthorized') {
      authorizedAt.set(e.keyId.toLowerCase(), { blockNum: e.blockNum, txHash: e.txHash })
      revokedOnChain.delete(e.keyId.toLowerCase())
    } else revokedOnChain.add(e.keyId.toLowerCase())
  }

  const keys = await Promise.all(
    [...ids.values()].map((keyId) => describeKey(keyId, spendRows, authorizedAt, revokedOnChain)),
  )
  keys.sort((a, b) => {
    const live = Number(b.key.exists) - Number(a.key.exists)
    if (live !== 0) return live
    return (b.authorizedAt?.blockNum ?? 0) - (a.authorizedAt?.blockNum ?? 0)
  })

  return {
    operator: s.operator.address,
    network: net.name,
    chainId: net.chainId,
    indexer: { source, queriedAt, keysQueryOk, spendQueryOk, ...(indexerError ? { error: indexerError } : {}) },
    keys,
    readAt: new Date().toISOString(),
  }
}

async function describeKey(
  keyId: Address,
  allSpend: SpendRow[],
  authorizedAt: Map<string, { blockNum: number; txHash: Hex }>,
  revokedOnChain: Set<string>,
): Promise<FleetKey> {
  const s = await getState()
  const net = s.root.leash.network
  const record = recordFor(keyId)

  const [key, allowed] = await Promise.all([
    getKey(s.root, s.operator.address, keyId),
    getAllowedCalls(s.root, s.operator.address, keyId),
  ])

  const token =
    tokenFromScopes(allowed.scopes as { target: Address; selectorRules: { selector: Hex }[] }[]) ??
    record?.token ??
    net.settlementToken
  const meta = await tokenMeta(s.root, token)

  let limit: Awaited<ReturnType<typeof getRemainingLimit>> | undefined
  let limitError: ReturnType<typeof decodeRevert> | undefined
  try {
    limit = await getRemainingLimit(s.root, s.operator.address, keyId, token)
  } catch (error) {
    limitError = decodeRevert(error)
  }

  const spend = allSpend.filter((r) => r.agentKey.toLowerCase() === keyId.toLowerCase())
  const payments = spend.filter((r) => r.kind === 'payment')
  const gas = spend.filter((r) => r.kind === 'gas')

  const recipients = [
    ...new Set(
      allowed.scopes.flatMap((sc) => sc.selectorRules.flatMap((r) => r.recipients ?? [])),
    ),
  ] as Address[]
  const intended = record?.intendedServiceIds ?? []
  const blast =
    recipients.length > 0
      ? (() => {
          const radius = computeBlastRadius({
            recipients,
            index: s.snapshot,
            intendedServiceIds: intended,
          })
          const advice = isolationAdvice(radius)
          return { radius, headline: blastRadiusHeadline(radius), ...(advice ? { advice } : {}) }
        })()
      : undefined

  const latestPayment = payments[0]
  const eventVsRead =
    latestPayment && limit
      ? {
          eventRemainingLimit: latestPayment.eventRemainingLimit.toString(),
          precompileRemaining: limit.remaining.toString(),
          gap: (limit.remaining - latestPayment.eventRemainingLimit).toString(),
          txHash: latestPayment.txHash,
          note:
            limit.remaining === latestPayment.eventRemainingLimit
              ? 'No gap on this key. Sponsored payments emit one event and no gas pre-charge, so the event happens to agree. The precompile read is still the source of the number on screen.'
              : 'The last event disagrees with the precompile. Gas is pre-charged at the gas limit and partly refunded after the events fire, so the event stream understates the remaining budget. The number on screen is the precompile read.',
        }
      : undefined

  const ungovernable = (record?.intendedServiceIds ?? [])
    .map((id) => s.snapshot.resolved.find((r) => r.serviceId === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.intent === 'session')
    .map((r) => ({
      serviceId: r.serviceId,
      name: r.name,
      reason: `session intent: pays through tip20ChannelReserve.open (${SELECTOR.channelOpen}) at ${r.escrowContract}, not transferWithMemo on the token. open() carries the counterparty inside its calldata and the precompile extracts no recipient from it, so a recipient allowlist has no effect on this service. Containment here is budget and expiry only.`,
    }))

  return {
    keyId,
    ...(record ? { label: record.label, record } : {}),
    ...(authorizedAt.get(keyId.toLowerCase())
      ? { authorizedAt: authorizedAt.get(keyId.toLowerCase())! }
      : {}),
    revokedOnChain: key.info.isRevoked || revokedOnChain.has(keyId.toLowerCase()),
    key,
    token: { address: token, symbol: meta.symbol, decimals: meta.decimals },
    ...(limit ? { limit, budgetHuman: fromSmallestUnits(limit.remaining, meta.decimals) } : {}),
    ...(limitError ? { limitError } : {}),
    allowed,
    ...(blast ? { blast } : {}),
    ...(eventVsRead ? { eventVsRead } : {}),
    spend: spend.slice(0, 25),
    spendTotals: {
      payments: payments.reduce((a, r) => a + r.amount, 0n).toString(),
      gas: gas.reduce((a, r) => a + r.amount, 0n).toString(),
      paymentCount: payments.length,
      gasCount: gas.length,
    },
    ungovernable,
    explorer: explorerAddress(net, keyId),
  }
}

// ---------------------------------------------------------------------------
// Policy preview and provisioning
// ---------------------------------------------------------------------------

export type PolicyRequest = {
  agent: string
  label?: string
  serviceIds: string[]
  extraRecipients?: Address[]
  budgetHuman: string
  periodSeconds: number
  expiryDays: number
  allowSessionChannels?: boolean
  token?: Address
  callsPerService?: number
}

export async function previewPolicy(input: PolicyRequest): Promise<Record<string, unknown>> {
  const s = await getState()
  const net = s.root.leash.network
  const token = input.token ?? net.settlementToken
  const meta = await tokenMeta(s.root, token)

  const live = await resolveLive({
    chainId: MPP_CHAIN_ID,
    serviceIds: input.serviceIds,
    preferCurrency: token,
  })
  const drift = driftAgainst(s.snapshot, live)
  const index = mergeIndex(s.snapshot, live)

  const expiry = Math.floor(Date.now() / 1000) + Math.round(input.expiryDays * 86_400)
  const budget = toSmallestUnits(input.budgetHuman, meta.decimals)

  let policy: CompiledPolicy
  try {
    policy = compilePolicy(
      {
        agent: input.agent,
        token,
        decimals: meta.decimals,
        budget,
        periodSeconds: input.periodSeconds,
        expiry,
        serviceIds: input.serviceIds,
        ...(input.extraRecipients?.length ? { extraRecipients: input.extraRecipients } : {}),
        ...(input.allowSessionChannels ? { allowSessionChannels: true } : {}),
      },
      index,
    )
  } catch (error) {
    return {
      ok: false,
      compileError: (error as Error).message,
      live,
      drift,
      resolvedAt: live.resolvedAt,
    }
  }

  const radius = computeBlastRadius({
    recipients: policy.recipients,
    index,
    intendedServiceIds: input.serviceIds,
  })
  const advice = isolationAdvice(radius)
  const sizing = sizeFromPolicy({
    policy,
    callsPerService: input.callsPerService ?? 1,
    sponsored: Boolean(net.sponsorUrl),
  })

  return {
    ok: true,
    policy: {
      selector: policy.selector,
      calldata: policy.calldata,
      calldataBytes: (policy.calldata.length - 2) / 2,
      restrictions: policy.restrictions,
      scopes: policy.scopes,
      recipients: policy.recipients,
      covered: policy.covered,
      gaps: policy.gaps,
      oneCallOfEachCost: policy.oneCallOfEachCost,
      /** Where the calldata would go if signed as a plain call rather than an envelope field. */
      target: AUTHORIZE_KEY_TARGET,
    },
    describe: describePolicy(policy, meta.symbol),
    blast: { radius, headline: blastRadiusHeadline(radius), advice },
    budget: {
      token,
      symbol: meta.symbol,
      decimals: meta.decimals,
      units: budget,
      human: input.budgetHuman,
      periodSeconds: input.periodSeconds,
      expiry,
      expiryIso: new Date(expiry * 1000).toISOString(),
      sizing,
    },
    resolution: {
      live,
      drift,
      driftDetected: drift.some((d) => d.changed),
      resolvedAt: live.resolvedAt,
      indexCapturedAt: s.snapshot.capturedAt,
      currencyMisses: live.currencyMisses,
      note: `Payout addresses for the named services were re-resolved from live MPP 402 challenges at ${live.resolvedAt}. Collateral is evaluated against the catalog capture of ${s.snapshot.capturedAt}.`,
    },
    settlement: {
      resolutionChainId: MPP_CHAIN_ID,
      executionChainId: net.chainId,
      sameChain: net.chainId === MPP_CHAIN_ID,
      note:
        net.chainId === MPP_CHAIN_ID
          ? 'Signing and paying on the same chain the challenge quoted.'
          : `This key will be authorized on chain ${net.chainId}. The allowlist holds the payout addresses MPP quoted for chain ${MPP_CHAIN_ID}, and the budget is denominated in ${meta.symbol} at ${token}, which is a currency those same challenges quote. Enforcement is identical; the vendor will not credit a payment settled on ${net.chainId}.`,
    },
  }
}

export async function provisionKey(input: PolicyRequest): Promise<Record<string, unknown>> {
  const s = await getState()
  const net = s.root.leash.network
  const token = input.token ?? net.settlementToken
  const meta = await tokenMeta(s.root, token)
  const label = input.label ?? `AGENT_${input.agent.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_${Date.now()}`

  // Re-resolve immediately before signing. A cached payout address surviving an allowlist
  // rotation is the failure this product exists to prevent.
  const live = await resolveLive({
    chainId: MPP_CHAIN_ID,
    serviceIds: input.serviceIds,
    preferCurrency: token,
  })
  const drift = driftAgainst(s.snapshot, live)
  const index = mergeIndex(s.snapshot, live)

  const agentKey = mintAgentKey(label)
  const expiry = Math.floor(Date.now() / 1000) + Math.round(input.expiryDays * 86_400)
  const policy = compilePolicy(
    {
      agent: input.agent,
      token,
      decimals: meta.decimals,
      budget: toSmallestUnits(input.budgetHuman, meta.decimals),
      periodSeconds: input.periodSeconds,
      expiry,
      serviceIds: input.serviceIds,
      ...(input.extraRecipients?.length ? { extraRecipients: input.extraRecipients } : {}),
      ...(input.allowSessionChannels ? { allowSessionChannels: true } : {}),
    },
    index,
    { keyId: agentKey.keyId },
  )

  const result = await authorizeKey(s.root, { root: s.operator.account, agentKey, policy })

  const priceFloor = policy.covered.reduce<bigint | undefined>(
    (min, c) => (min === undefined || BigInt(c.amount) < min ? BigInt(c.amount) : min),
    undefined,
  )
  const record: KeyRecord = {
    keyId: agentKey.keyId,
    label,
    agent: input.agent,
    chainId: net.chainId,
    intendedServiceIds: input.serviceIds,
    recipients: policy.recipients,
    token,
    decimals: meta.decimals,
    budget: policy.restrictions.limits[0]?.amount.toString() ?? '0',
    periodSeconds: input.periodSeconds,
    expiry,
    ...(priceFloor !== undefined ? { priceFloor: priceFloor.toString() } : {}),
    resolvedAt: live.resolvedAt,
    indexCapturedAt: s.snapshot.capturedAt,
    signedAt: new Date().toISOString(),
    authorizeTx: result.hash,
    sponsored: Boolean(net.sponsorUrl),
  }
  saveRecord(record, s.operator.address)

  const radius = computeBlastRadius({
    recipients: policy.recipients,
    index,
    intendedServiceIds: input.serviceIds,
  })

  return {
    ok: true,
    keyId: agentKey.keyId,
    label,
    tx: {
      hash: result.hash,
      gasUsed: result.gasUsed,
      elapsedMs: result.elapsedMs,
      feePayer: result.feePayer,
      explorer: result.explorer,
      events: result.events,
    },
    verified: result.verified,
    blast: { radius, headline: blastRadiusHeadline(radius) },
    drift,
    gaps: policy.gaps,
    record,
  }
}

export async function revoke(keyId: Address): Promise<Record<string, unknown>> {
  const s = await getState()
  const startedAt = Date.now()
  const result = await revokeKey(s.root, { keyId })
  markRevoked(keyId, result.hash)
  return {
    ok: true,
    keyId,
    tx: {
      hash: result.hash,
      gasUsed: result.gasUsed,
      elapsedMs: result.elapsedMs,
      explorer: result.explorer,
      events: result.events,
    },
    after: result.after,
    wallclockMs: Date.now() - startedAt,
    honesty:
      'The key is revoked and reads back isRevoked=true. What happens to the *next* payment from this key is measured, not assumed: on Moderato 2026-09-19 it was refused after 44,596 ms with an unnamed internal error and rejectedPreExecution=false, not the instant named pre-execution rejection the spec claimed. See docs/FINDINGS.md F1. Run the demo to watch it happen live.',
  }
}

export async function resize(
  keyId: Address,
  token: Address,
  budgetHuman: string,
): Promise<Record<string, unknown>> {
  const s = await getState()
  const meta = await tokenMeta(s.root, token)
  const before = await getRemainingLimit(s.root, s.operator.address, keyId, token)
  const result = await updateSpendingLimit(s.root, {
    keyId,
    token,
    limit: toSmallestUnits(budgetHuman, meta.decimals),
  })
  return {
    ok: true,
    keyId,
    before,
    after: result.after,
    tx: { hash: result.hash, gasUsed: result.gasUsed, elapsedMs: result.elapsedMs, explorer: result.explorer },
    note: 'updateSpendingLimit resets the remaining budget for the current period to the new limit. It does not scale it, and the period end does not move, which makes it a mid-period top-up as well as a clamp. On Tempo mainnet this function had been called zero times in a 50,000-block window.',
  }
}

/**
 * Reproduces the `getRemainingLimit` trap in one request, so the claim in the docs is
 * something an operator can rerun rather than take on faith.
 */
export async function diagnostics(keyId: Address, token?: Address): Promise<Record<string, unknown>> {
  const s = await getState()
  const net = s.root.leash.network
  const allowed = await getAllowedCalls(s.root, s.operator.address, keyId)
  const useToken =
    token ??
    tokenFromScopes(allowed.scopes as { target: Address; selectorRules: { selector: Hex }[] }[]) ??
    net.settlementToken
  const short = await probeShortRemainingLimit(s.root, s.operator.address, keyId, useToken)
  let long: Awaited<ReturnType<typeof getRemainingLimit>> | undefined
  let longError: string | undefined
  try {
    long = await getRemainingLimit(s.root, s.operator.address, keyId, useToken)
  } catch (error) {
    longError = (error as Error).message
  }
  return {
    keyId,
    token: useToken,
    getRemainingLimit: short,
    getRemainingLimitWithPeriod: long ?? { error: longError },
    verdict:
      short.ok === false && long
        ? `getRemainingLimit reverted (${short.revert?.name ?? short.revert?.message ?? 'no name'}) while getRemainingLimitWithPeriod returned ${long.remaining} in the same block. Every budget in this console comes from the second call.`
        : short.ok
          ? 'The short form answered on this key. The console still reads the WithPeriod form, because the short form reverts 0xaa4bc69a on any period-based limit and the difference is silent.'
          : 'Both forms failed. Nothing about this key is being displayed as a balance.',
  }
}

export async function keySpend(
  keyId: Address,
  options: { source?: string; limit?: number } = {},
): Promise<Record<string, unknown>> {
  const s = await getState()
  const source = sourceByName(options.source)
  const res = await fleetSpend({
    account: s.operator.address,
    keyId,
    limit: options.limit ?? 50,
    options: { source },
  })
  return {
    keyId,
    rows: res.rows.map((r) => ({ ...r, explorer: explorerTx(s.root.leash.network, r.txHash) })),
    source: res.source,
    queriedAt: res.queriedAt,
    queryTimeMs: res.queryTimeMs,
    note: 'amount and remainingLimit are as emitted. Rows classified "gas" are the pre-charge, which is why summing amount naively overstates spend on an unsponsored key. No number here is used as a balance.',
  }
}

/** The catalog, for the policy builder's service picker. */
export async function catalogForPicker(): Promise<unknown> {
  const s = await getState()
  const byRecipient = new Map<string, number>()
  for (const r of s.snapshot.resolved)
    byRecipient.set(r.recipient.toLowerCase(), (byRecipient.get(r.recipient.toLowerCase()) ?? 0) + 1)
  return {
    capturedAt: s.snapshot.capturedAt,
    services: s.snapshot.resolved
      .map((r) => ({
        id: r.serviceId,
        name: r.name,
        realm: r.realm,
        provider: r.provider,
        categories: r.categories,
        intent: r.intent,
        currency: r.currency,
        amount: r.amount,
        decimals: r.decimals,
        unitType: r.unitType,
        recipient: r.recipient,
        endpoint: r.endpoint,
        sharesRecipientWith: (byRecipient.get(r.recipient.toLowerCase()) ?? 1) - 1,
      }))
      .sort((a, b) => b.sharesRecipientWith - a.sharesRecipientWith || a.id.localeCompare(b.id)),
    unresolved: s.snapshot.unresolved,
  }
}
