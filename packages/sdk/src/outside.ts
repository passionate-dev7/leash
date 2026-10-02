import { createPublicClient, http, parseEventLogs } from 'viem'
import type { Address, Hash } from 'viem'
import { tempo } from 'viem/chains'
import { Abis } from 'viem/tempo'

/**
 * Delivery records published by an outside buyer, verified against Tempo mainnet before use.
 *
 * vet402 (github.com/kzmttkc/vet402-delivery, MIT) buys from MPP sellers with its own money and
 * publishes one row per purchase: recipient, amount, tx hash, HTTP status, delivered. A row only
 * counts here if its tx reads back on chain as a success, sent by the publisher's payer, carrying a
 * transfer of exactly that amount to exactly that recipient. Read-only: nothing here signs.
 */

export const VET402_TEMPO_LEDGER =
  'https://raw.githubusercontent.com/kzmttkc/vet402-delivery/main/data/tempo/ledger.json'

type Vet402Entry = {
  key: string
  url: string
  recipient: Address
  amount: string
  httpStatus?: number
  txHash?: Hash
  settled?: boolean
  delivered?: boolean
}

export type OutsideRecord = {
  source: 'vet402'
  service: string
  url: string
  recipient: Address
  amount: string
  httpStatus: number | null
  tx: Hash
  delivered: boolean
  /** The on-chain read that made this row count. */
  verified: { block: number; from: Address }
}

export type PayoutReputation = {
  recipient: Address
  services: string[]
  paid: number
  delivered: number
  paidNotDelivered: number
  statuses: Record<string, number>
}

export type OutsideFeed = {
  source: string
  payer: Address
  fetchedAt: string
  rows: number
  verifiedRows: number
  rejected: { tx: Hash | null; reason: string }[]
  records: OutsideRecord[]
  payouts: PayoutReputation[]
}

export async function loadVet402Feed(options: { url?: string; rpcUrl?: string; concurrency?: number } = {}): Promise<OutsideFeed> {
  const res = await fetch(options.url ?? VET402_TEMPO_LEDGER)
  if (!res.ok) throw new Error(`vet402 ledger: HTTP ${res.status}`)
  const body = (await res.json()) as { payer: Address; entries: Vet402Entry[] }
  if (!body?.payer || !Array.isArray(body.entries)) throw new Error('vet402 ledger: unexpected shape')

  const client = createPublicClient({ chain: tempo, transport: http(options.rpcUrl ?? 'https://rpc.tempo.xyz') })
  const payer = body.payer.toLowerCase()
  const records: OutsideRecord[] = []
  const rejected: OutsideFeed['rejected'] = []
  const settled = body.entries.filter((e) => e.settled && e.txHash)
  const queue = [...settled]
  const workers = Array.from({ length: options.concurrency ?? 6 }, async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      try {
        const rx = await client.getTransactionReceipt({ hash: e.txHash! })
        const transfer = parseEventLogs({ abi: Abis.tip20, logs: rx.logs, eventName: ['TransferWithMemo', 'Transfer'] }).find(
          (x) => {
            const a = x.args as { to?: Address; amount?: bigint }
            return a.to?.toLowerCase() === e.recipient.toLowerCase() && String(a.amount) === e.amount
          },
        )
        if (rx.status !== 'success') rejected.push({ tx: e.txHash!, reason: 'reverted on chain' })
        else if (rx.from.toLowerCase() !== payer) rejected.push({ tx: e.txHash!, reason: `sent by ${rx.from}, not the publisher's payer` })
        else if (!transfer) rejected.push({ tx: e.txHash!, reason: 'no transfer of that amount to that recipient' })
        else
          records.push({
            source: 'vet402',
            service: e.key,
            url: e.url,
            recipient: e.recipient,
            amount: e.amount,
            httpStatus: e.httpStatus ?? null,
            tx: e.txHash!,
            delivered: Boolean(e.delivered),
            verified: { block: Number(rx.blockNumber), from: rx.from },
          })
      } catch (err) {
        rejected.push({ tx: e.txHash ?? null, reason: (err as Error).message.slice(0, 160) })
      }
    }
  })
  await Promise.all(workers)

  return {
    source: VET402_TEMPO_LEDGER,
    payer: body.payer,
    fetchedAt: new Date().toISOString(),
    rows: body.entries.length,
    verifiedRows: records.length,
    rejected,
    records,
    payouts: reputation(records),
  }
}

export function reputation(records: readonly OutsideRecord[]): PayoutReputation[] {
  const by = new Map<string, PayoutReputation & { svc: Set<string> }>()
  for (const r of records) {
    const k = r.recipient.toLowerCase()
    const p = by.get(k) ?? { recipient: r.recipient, services: [], svc: new Set<string>(), paid: 0, delivered: 0, paidNotDelivered: 0, statuses: {} }
    p.paid++
    if (r.delivered) p.delivered++
    else p.paidNotDelivered++
    p.svc.add(r.service)
    const s = String(r.httpStatus ?? 'none')
    p.statuses[s] = (p.statuses[s] ?? 0) + 1
    by.set(k, p)
  }
  return [...by.values()]
    .map(({ svc, ...p }) => ({ ...p, services: [...svc].sort() }))
    .sort((a, b) => b.paidNotDelivered - a.paidNotDelivered || b.paid - a.paid)
}
