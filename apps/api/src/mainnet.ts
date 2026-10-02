import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createPublicClient, http, keccak256, toHex } from 'viem'
import type { Address, Hex } from 'viem'
import { tempo } from 'viem/chains'
import { Abis } from 'viem/tempo'
import { loadRecipientIndex, MPP_SETTLEMENT_ASSET_MAINNET, RECIPIENT_INDEX_PATH, RPC_URL } from '@leash/policy'

/**
 * Read-only replay of MPP settlements on Tempo mainnet: every TransferWithMemo that paid a
 * catalogued payout address in the last N blocks, grouped by payout and by the mppx server
 * fingerprint carried in the memo. Nothing here signs or sends.
 */

const OUSD_MAINNET: Address = '0x20c0000000000000000000006a37DA5C996874BE'
const TOKENS: { name: 'usdce' | 'ousd'; address: Address }[] = [
  { name: 'usdce', address: MPP_SETTLEMENT_ASSET_MAINNET },
  { name: 'ousd', address: OUSD_MAINNET },
]
const PAGE_BLOCKS = 5_000
const MAX_BLOCKS = 50_000
const MAX_PAGES = 40
const CACHE_MS = 10 * 60_000
const ZERO = '0x0000000000000000000000000000000000000000'

const client = createPublicClient({ chain: tempo, transport: http(RPC_URL.mainnet, { retryCount: 3, timeout: 30_000 }) })
const transferWithMemo = Abis.tip20.find((x) => x.type === 'event' && x.name === 'TransferWithMemo')
if (!transferWithMemo) throw new Error('TransferWithMemo missing from the TIP-20 ABI')

type Payout = { payout: Address; services: { serviceId: string; name: string }[] }

async function loadPayouts(): Promise<Payout[]> {
  const index = await loadRecipientIndex()
  const byAddress = new Map<string, Payout>()
  for (const r of index.resolved) {
    const key = r.recipient.toLowerCase()
    const p = byAddress.get(key) ?? { payout: r.recipient, services: [] }
    p.services.push({ serviceId: r.serviceId, name: r.name })
    byAddress.set(key, p)
  }
  const later = JSON.parse(readFileSync(new URL('recipients-1003.4217.json', pathToFileURL(RECIPIENT_INDEX_PATH)), 'utf8')) as string[]
  for (const a of later) {
    const key = a.toLowerCase()
    if (key === ZERO || byAddress.has(key)) continue
    byAddress.set(key, { payout: a as Address, services: [] })
  }
  return [...byAddress.values()]
}

type Hit = { token: 'usdce' | 'ousd'; from: Address; to: Address; amount: bigint; memo: Hex; block: bigint }

/** MPP attribution memos start with keccak256("mpp")[0..3] and version 0x01; bytes 5..14 are the server fingerprint (mppx dist/tempo/Attribution.js). */
const MPP_TAG = keccak256(toHex('mpp')).slice(0, 10)
function serverFingerprint(memo: Hex): Hex | null {
  if (memo.length !== 66 || memo.slice(0, 10).toLowerCase() !== MPP_TAG || memo.slice(10, 12) !== '01') return null
  return `0x${memo.slice(12, 32)}`
}

export type MainnetReplay = {
  chainId: 4217
  rpc: string
  generatedAt: string
  head: number
  fromBlock: number
  toBlock: number
  blocks: number
  fromTime: string
  toTime: string
  pages: number
  payoutsCatalogued: number
  charges: number
  payers: number
  volume: { usdce: string; ousd: string }
  /** TransferWithMemo to a catalogued payout whose memo is not an MPP attribution memo. */
  untaggedCharges: number
  payouts: {
    payout: Address
    services: { serviceId: string; name: string }[]
    charges: number
    payers: number
    volume: { usdce: string; ousd: string }
    servers: { fingerprint: Hex; charges: number }[]
  }[]
  silentPayouts: number
}

async function fetchLogs(payouts: Address[], from: bigint, to: bigint, budget: { pages: number }): Promise<Hit[]> {
  if (++budget.pages > MAX_PAGES) throw new Error(`page cap of ${MAX_PAGES} reached before the window was read`)
  try {
    const logs = await client.getLogs({
      address: TOKENS.map((t) => t.address),
      event: transferWithMemo as never,
      args: { to: payouts } as never,
      fromBlock: from,
      toBlock: to,
    })
    return (logs as unknown as { address: Address; args: { from: Address; to: Address; amount: bigint; memo: Hex }; blockNumber: bigint }[]).map((l) => ({
      token: TOKENS.find((t) => t.address.toLowerCase() === l.address.toLowerCase())!.name,
      from: l.args.from,
      to: l.args.to,
      amount: l.args.amount,
      memo: l.args.memo,
      block: l.blockNumber,
    }))
  } catch (e) {
    if (to - from < 2n) throw e
    const mid = (from + to) / 2n
    return [...(await fetchLogs(payouts, from, mid, budget)), ...(await fetchLogs(payouts, mid + 1n, to, budget))]
  }
}

export async function replay(blocks: number): Promise<MainnetReplay> {
  const [payouts, head] = await Promise.all([loadPayouts(), client.getBlockNumber()])
  const addresses = payouts.map((p) => p.payout)
  const toBlock = head
  const fromBlock = head - BigInt(blocks) + 1n
  const budget = { pages: 0 }
  const hits: Hit[] = []
  for (let start = fromBlock; start <= toBlock; start += BigInt(PAGE_BLOCKS)) {
    const end = start + BigInt(PAGE_BLOCKS) - 1n > toBlock ? toBlock : start + BigInt(PAGE_BLOCKS) - 1n
    hits.push(...(await fetchLogs(addresses, start, end, budget)))
  }
  const [first, last] = await Promise.all([client.getBlock({ blockNumber: fromBlock }), client.getBlock({ blockNumber: toBlock })])

  type Agg = { charges: number; payers: Set<string>; usdce: bigint; ousd: bigint; servers: Map<string, number> }
  const agg = new Map<string, Agg>()
  const allPayers = new Set<string>()
  let untagged = 0
  const total = { usdce: 0n, ousd: 0n }
  for (const h of hits) {
    const key = h.to.toLowerCase()
    const a = agg.get(key) ?? { charges: 0, payers: new Set<string>(), usdce: 0n, ousd: 0n, servers: new Map<string, number>() }
    a.charges++
    a.payers.add(h.from.toLowerCase())
    a[h.token] += h.amount
    total[h.token] += h.amount
    allPayers.add(h.from.toLowerCase())
    const fp = serverFingerprint(h.memo)
    if (fp) a.servers.set(fp, (a.servers.get(fp) ?? 0) + 1)
    else untagged++
    agg.set(key, a)
  }
  const rows = payouts
    .filter((p) => agg.has(p.payout.toLowerCase()))
    .map((p) => {
      const a = agg.get(p.payout.toLowerCase())!
      return {
        payout: p.payout,
        services: p.services,
        charges: a.charges,
        payers: a.payers.size,
        volume: { usdce: String(a.usdce), ousd: String(a.ousd) },
        servers: [...a.servers].map(([fingerprint, charges]) => ({ fingerprint: fingerprint as Hex, charges })).sort((x, y) => y.charges - x.charges),
      }
    })
    .sort((x, y) => y.charges - x.charges)
  return {
    chainId: 4217,
    rpc: RPC_URL.mainnet,
    generatedAt: new Date().toISOString(),
    head: Number(head),
    fromBlock: Number(fromBlock),
    toBlock: Number(toBlock),
    blocks,
    fromTime: new Date(Number(first.timestamp) * 1000).toISOString(),
    toTime: new Date(Number(last.timestamp) * 1000).toISOString(),
    pages: budget.pages,
    payoutsCatalogued: payouts.length,
    charges: hits.length,
    payers: allPayers.size,
    volume: { usdce: String(total.usdce), ousd: String(total.ousd) },
    untaggedCharges: untagged,
    payouts: rows,
    silentPayouts: payouts.length - rows.length,
  }
}

const cache = new Map<number, { at: number; value: Promise<MainnetReplay> }>()

/** Cached for ten minutes per window size. A failed read is not cached. */
export function cachedReplay(blocks: number): Promise<MainnetReplay> {
  const hit = cache.get(blocks)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const value = replay(blocks)
  cache.set(blocks, { at: Date.now(), value })
  value.catch(() => {
    if (cache.get(blocks)?.value === value) cache.delete(blocks)
  })
  return value
}

export const MAX_REPLAY_BLOCKS = MAX_BLOCKS
