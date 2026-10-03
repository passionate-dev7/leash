import type { Hex } from 'viem'
import type { CatalogEntry } from '@leash/vendors'
import type { CutoffRow, LedgerRecord } from './store.js'

export const EVIDENCE_WINDOW_MS = 24 * 3_600_000
const MAX_EVIDENCE_TXS = 10
/**
 * A vendor is worth cutting when it kept at least this many payments without delivering, and at least
 * this share of what it was paid. Set from measured rates, not picked: on 2026-10-03 the healthy
 * services sat at 0 percent, the failing scrape route at 21 percent (6 of 29 over five real topics),
 * and vet402's public mainnet ledger at 36 percent (26 of 72). Three failures keeps one bad url from
 * tripping it.
 */
export const CUT_MIN_FAILURES = 3
export const CUT_MIN_RATE = 0.15

export type Evidence = {
  window: '24h'
  paid: number
  paidNotDelivered: number
  failureRate: number
  /** Settlement tx of each paid-but-not-delivered record, newest first. */
  txs: Hex[]
}

const lower = (a: string) => a.toLowerCase()

/** A record counts as a payment only when it settled on chain. A refusal moved nothing. */
const isPaid = (r: LedgerRecord) => r.settlement?.status === 'success' && (r.outcome === 'delivered' || r.outcome === 'paid_not_delivered')

/** What the records inside the trailing 24 hours say about one vendor. */
export function evidenceOf(records: readonly LedgerRecord[], now = Date.now()): Evidence {
  const since = now - EVIDENCE_WINDOW_MS
  const paid = records.filter((r) => isPaid(r) && Date.parse(r.startedAt) >= since)
  const failed = paid.filter((r) => r.outcome === 'paid_not_delivered').sort((a, b) => b.seq - a.seq)
  return {
    window: '24h',
    paid: paid.length,
    paidNotDelivered: failed.length,
    failureRate: paid.length === 0 ? 0 : failed.length / paid.length,
    txs: failed.slice(0, MAX_EVIDENCE_TXS).map((r) => r.settlement!.tx),
  }
}

export const recommendCut = (e: Evidence): boolean => e.paidNotDelivered >= CUT_MIN_FAILURES && e.failureRate >= CUT_MIN_RATE

export function vendorRows(args: {
  catalog: readonly CatalogEntry[]
  records: readonly LedgerRecord[]
  cutoffs: readonly CutoffRow[]
  blocked: ReadonlySet<string>
  now?: number
}) {
  const { catalog, records, cutoffs, blocked, now } = args
  return catalog.map((s) => {
    const mine = records.filter((r) => r.serviceId === s.serviceId)
    const settled = mine.filter(isPaid)
    const delivered = settled.filter((r) => r.outcome === 'delivered').length
    const paidNotDelivered = settled.length - delivered
    const cut = cutoffs.find((c) => lower(c.recipient) === lower(s.recipient) && (c.status === 'prepared' || (c.status === 'confirmed' && c.tx)))
    const evidence = evidenceOf(mine, now)
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
      cut: cut ? { status: cut.status, tx: cut.tx, reason: cut.reason } : null,
      blocked: blocked.has(lower(s.recipient)),
      evidence,
      // A service already cut, or being cut, has nothing left to recommend.
      recommendCut: !cut && recommendCut(evidence),
    }
  })
}
