import type { Address, Hex } from 'viem'
import { ACCESS_KEY_SPEND_SIGNATURE, INDEXER_URL, TOPIC } from '@leash/policy'
import type { NetworkName } from './client.js'

/**
 * The Leash telemetry feed.
 *
 * Testnet's direct host is free and open. Mainnet's is 402-gated on the first anonymous
 * request, and the hosted API is 402-gated on both chains, so the data source is explicit
 * configuration rather than a default, and every result says which source answered.
 * INDEXER.md §1.
 */

export type IndexerSource = {
  name: 'moderato-free' | 'mainnet-direct' | 'hosted-mpp'
  url: string
  chainIdParam: string
  requiresPayment: boolean
  note: string
}

export const INDEXER_SOURCES: Record<IndexerSource['name'], IndexerSource> = {
  'moderato-free': {
    name: 'moderato-free',
    url: INDEXER_URL.moderato,
    chainIdParam: '42431',
    requiresPayment: false,
    note: 'Free, no auth. Requires an explicit chainId; omitting it returns 400.',
  },
  'mainnet-direct': {
    name: 'mainnet-direct',
    url: INDEXER_URL.mainnet,
    chainIdParam: '4217',
    /**
     * Open to an anonymous caller when last measured. INDEXER.md §1 recorded
     * `{"error":"Payment Required"}` here on 2026-09-18; on 2026-09-19 the same host answered
     * `SELECT 1` and a decoded `AccessKeySpend` query with HTTP 200. A paywall that moves is a
     * reason to probe rather than to trust a constant, which is why the console measures every
     * source on load instead of rendering this flag.
     */
    requiresPayment: false,
    note: 'Measured open on 2026-09-19: HTTP 200 for anonymous SELECT and for decoded AccessKeySpend queries on chain 4217. It returned Payment Required on 2026-09-18, so probe before relying on it.',
  },
  'hosted-mpp': {
    name: 'hosted-mpp',
    url: INDEXER_URL.hosted,
    chainIdParam: 'mainnet',
    requiresPayment: true,
    note: 'MPP session intent, $0.0001/query through the channel reserve. Needs an MPP client.',
  },
}

export function sourceForNetwork(network: NetworkName): IndexerSource {
  return network === 'moderato'
    ? INDEXER_SOURCES['moderato-free']
    : INDEXER_SOURCES['mainnet-direct']
}

export type QueryResult<Row = unknown[]> = {
  columns: string[]
  rows: Row[]
  row_count: number
  engine: string
  query_time_ms: number
  ok: true
}

export class IndexerPaymentRequiredError extends Error {
  override name = 'IndexerPaymentRequiredError'
  constructor(public readonly source: IndexerSource) {
    super(
      `${source.url} returned 402. ${source.note} Switch the console to the Moderato source, or supply an MPP-paying fetch.`,
    )
  }
}

export class IndexerQueryError extends Error {
  override name = 'IndexerQueryError'
}

export type QueryOptions = {
  source?: IndexerSource
  /** `postgres` for joins; the default router sends them to ClickHouse and they time out. */
  engine?: 'postgres' | 'clickhouse'
  /** Default is 5,000 ms, which is not enough for the fleet join. INDEXER.md §6. */
  timeoutMs?: number
  /** ABI event signatures exposed as named SQL CTEs. Repeatable. */
  signatures?: string[]
  limit?: number
  /** Swap in an MPP-paying fetch for the 402-gated sources. */
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export async function query<Row = unknown[]>(
  sql: string,
  options: QueryOptions = {},
): Promise<QueryResult<Row> & { source: IndexerSource; queriedAt: string }> {
  const source = options.source ?? INDEXER_SOURCES['moderato-free']
  const url = new URL(source.url)
  url.searchParams.set('chainId', source.chainIdParam)
  url.searchParams.set('sql', sql)
  if (options.engine) url.searchParams.set('engine', options.engine)
  if (options.timeoutMs) url.searchParams.set('timeout_ms', String(options.timeoutMs))
  if (options.limit) url.searchParams.set('limit', String(options.limit))
  for (const sig of options.signatures ?? []) url.searchParams.append('signature', sig)

  const doFetch = options.fetchImpl ?? fetch
  const res = await doFetch(url.toString(), {
    signal: options.signal ?? AbortSignal.timeout((options.timeoutMs ?? 25_000) + 10_000),
    headers: { accept: 'application/json' },
  })
  if (res.status === 402) throw new IndexerPaymentRequiredError(source)
  const body = (await res.json()) as QueryResult<Row> | { ok: false; error: string }
  if (!res.ok || !('ok' in body) || body.ok !== true)
    throw new IndexerQueryError(
      `${source.url} HTTP ${res.status}: ${'error' in body ? body.error : JSON.stringify(body).slice(0, 300)}`,
    )
  return { ...body, source, queriedAt: new Date().toISOString() }
}

// ---------------------------------------------------------------------------
// The fleet view
// ---------------------------------------------------------------------------

export type SpendRow = {
  blockNum: number
  blockTimestamp?: number
  txHash: Hex
  agentKey: Address
  token: Address
  amount: bigint
  /** As emitted. Stale by the gas refund; never display it as a balance. */
  eventRemainingLimit: bigint
  feePayer?: Address
  gasUsed?: bigint
  /** Classified, see `classifySpend`. */
  kind: 'payment' | 'gas'
}

/**
 * The classifier from INDEXER.md §4.
 *
 * A row is a gas charge if and only if the fee payer is the account itself and the same
 * transaction carries a second `AccessKeySpend`. Sponsored rows are always clean payments,
 * which is one more reason to sponsor by default.
 *
 * Without this, summing `amount` conflates a 3,803-unit gas pre-charge with a 3,000,000
 * payment and the fleet total is wrong in a direction nobody notices.
 */
export function classifySpend(
  rows: Omit<SpendRow, 'kind'>[],
  account: Address,
): SpendRow[] {
  const byTx = new Map<string, Omit<SpendRow, 'kind'>[]>()
  for (const row of rows) {
    const bucket = byTx.get(row.txHash)
    if (bucket) bucket.push(row)
    else byTx.set(row.txHash, [row])
  }
  const out: SpendRow[] = []
  for (const row of rows) {
    const siblings = byTx.get(row.txHash) ?? [row]
    const selfPaid =
      row.feePayer === undefined ||
      row.feePayer.toLowerCase() === account.toLowerCase()
    if (!selfPaid || siblings.length < 2) {
      out.push({ ...row, kind: 'payment' })
      continue
    }
    // Self-paid, two events in one transaction: the smaller is the gas pre-charge.
    const smallest = siblings.reduce((a, b) => (b.amount < a.amount ? b : a))
    out.push({ ...row, kind: row === smallest ? 'gas' : 'payment' })
  }
  return out
}

const toBigInt = (v: unknown): bigint =>
  typeof v === 'bigint' ? v : BigInt(String(v ?? 0))

/**
 * `block_timestamp` comes back as a timestamptz string (`2026-09-18T20:20:00+00:00`) on the
 * postgres path and as epoch seconds elsewhere. `Number()` on the string yields NaN, which
 * JSON-serialises to null and silently blanks the time column, so both shapes are handled.
 */
const toEpochSeconds = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'number') return v
  const asNumber = Number(v)
  if (Number.isFinite(asNumber)) return asNumber
  const parsed = Date.parse(String(v))
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined
}

/**
 * Spend history for one account, joined to who paid the gas.
 *
 * Needs `engine=postgres` and a raised timeout; the default router sends the join to
 * ClickHouse where it exceeds the 5,000 ms cap. INDEXER.md §6.
 */
export async function fleetSpend(args: {
  account: Address
  limit?: number
  keyId?: Address
  options?: QueryOptions
}): Promise<{ rows: SpendRow[]; queriedAt: string; source: IndexerSource; queryTimeMs: number }> {
  const account = args.account.toLowerCase()
  const keyFilter = args.keyId ? ` AND s."publicKey" = '${args.keyId.toLowerCase()}'` : ''
  const sql = `SELECT s.block_num, s.block_timestamp, s.tx_hash, s."publicKey", s."token", s."amount", s."remainingLimit", r.fee_payer, r.gas_used
FROM "AccessKeySpend" s
JOIN receipts r ON r.tx_hash = s.tx_hash
WHERE s."account" = '${account}'${keyFilter}
ORDER BY s.block_num DESC, s.log_idx DESC
LIMIT ${args.limit ?? 50}`

  const result = await query<unknown[]>(sql, {
    engine: 'postgres',
    timeoutMs: 25_000,
    signatures: [ACCESS_KEY_SPEND_SIGNATURE],
    ...args.options,
  })
  const idx = (name: string) => result.columns.indexOf(name)
  const raw = result.rows.map((r) => ({
    blockNum: Number(r[idx('block_num')]),
    blockTimestamp: toEpochSeconds(r[idx('block_timestamp')]),
    txHash: String(r[idx('tx_hash')]) as Hex,
    agentKey: String(r[idx('publicKey')]) as Address,
    token: String(r[idx('token')]) as Address,
    amount: toBigInt(r[idx('amount')]),
    eventRemainingLimit: toBigInt(r[idx('remainingLimit')]),
    feePayer: r[idx('fee_payer')] === null ? undefined : (String(r[idx('fee_payer')]) as Address),
    gasUsed: r[idx('gas_used')] === null ? undefined : toBigInt(r[idx('gas_used')]),
  }))
  return {
    rows: classifySpend(raw, args.account),
    queriedAt: result.queriedAt,
    source: result.source,
    queryTimeMs: result.query_time_ms,
  }
}

/** Keys this account has ever authorized, newest first. */
export async function fleetKeys(args: {
  account: Address
  options?: QueryOptions
}): Promise<{ rows: { blockNum: number; txHash: Hex; keyId: Address; event: 'KeyAuthorized' | 'KeyRevoked' }[]; queriedAt: string; source: IndexerSource }> {
  const topic1 = `0x000000000000000000000000${args.account.slice(2).toLowerCase()}`
  const sql = `SELECT block_num, tx_hash, topic0, topic2
FROM logs
WHERE topic0 IN ('${TOPIC.KeyAuthorized}', '${TOPIC.KeyRevoked}')
  AND topic1 = '${topic1}'
ORDER BY block_num DESC
LIMIT 200`
  const result = await query<unknown[]>(sql, { engine: 'postgres', timeoutMs: 25_000, ...args.options })
  const idx = (name: string) => result.columns.indexOf(name)
  return {
    rows: result.rows.map((r) => ({
      blockNum: Number(r[idx('block_num')]),
      txHash: String(r[idx('tx_hash')]) as Hex,
      keyId: `0x${String(r[idx('topic2')]).slice(-40)}` as Address,
      event: String(r[idx('topic0')]) === TOPIC.KeyAuthorized ? 'KeyAuthorized' : 'KeyRevoked',
    })),
    queriedAt: result.queriedAt,
    source: result.source,
  }
}

// ---------------------------------------------------------------------------
// Live stream
// ---------------------------------------------------------------------------

export type LiveEvent =
  | { type: 'result'; rows: unknown[][]; columns: string[] }
  | { type: 'lagged'; skipped: number; reason: string }
  | { type: 'error'; error: string }

/**
 * Server-sent spend stream.
 *
 * Two traps, both hit for real:
 *  - `live=true` cannot use the `signature` CTE, because the decoded CTE only exists on the
 *    tiered path. Live mode must query the raw `logs` table with topic filters.
 *  - results after the first are **per-block deltas**, not cumulative, so a dashboard has to
 *    accumulate client-side and refill on `lagged`.
 * INDEXER.md §6.
 */
export async function* liveSpend(args: {
  account: Address
  source?: IndexerSource
  signal?: AbortSignal
}): AsyncGenerator<LiveEvent> {
  const source = args.source ?? INDEXER_SOURCES['moderato-free']
  const topic1 = `0x000000000000000000000000${args.account.slice(2).toLowerCase()}`
  const sql = `SELECT block_num, tx_hash, topic2, topic3, data
FROM logs
WHERE topic0 = '${TOPIC.AccessKeySpend}' AND topic1 = '${topic1}'
ORDER BY block_num DESC
LIMIT 20`

  const url = new URL(source.url)
  url.searchParams.set('chainId', source.chainIdParam)
  url.searchParams.set('live', 'true')
  url.searchParams.set('sql', sql)

  const res = await fetch(url.toString(), {
    headers: { accept: 'text/event-stream' },
    ...(args.signal ? { signal: args.signal } : {}),
  })
  if (res.status === 402) throw new IndexerPaymentRequiredError(source)
  if (!res.body) throw new IndexerQueryError('live stream returned no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = 'message'
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trimEnd()
      buffer = buffer.slice(newline + 1)
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>
        if (eventName === 'lagged')
          yield {
            type: 'lagged',
            skipped: Number(parsed['skipped'] ?? 0),
            reason: String(parsed['reason'] ?? ''),
          }
        else if (parsed['ok'] === false)
          yield { type: 'error', error: String(parsed['error']) }
        else
          yield {
            type: 'result',
            rows: (parsed['rows'] as unknown[][]) ?? [],
            columns: (parsed['columns'] as string[]) ?? [],
          }
      } catch {
        // A malformed frame must not kill the stream.
      }
    }
  }
}

/**
 * The `AccessKeySpend` data blob is `amount` then `remainingLimit`, both uint256, both in
 * the non-indexed data. Used when reading raw `logs` rows in live mode.
 */
export function decodeSpendData(data: string): { amount: bigint; remainingLimit: bigint } {
  const hex = data.startsWith('0x') ? data.slice(2) : data
  return {
    amount: BigInt(`0x${hex.slice(0, 64) || '0'}`),
    remainingLimit: BigInt(`0x${hex.slice(64, 128) || '0'}`),
  }
}
