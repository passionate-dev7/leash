/**
 * Delivery Cut: when a vendor settles a payment and then does not deliver, cut it with one signature.
 *
 * MPP settles the charge before the service validates the request (tempoxyz/mpp#1034: vet402 paid 89
 * calls, 42 settled and then answered 400/422, e.g. fal.mpp.tempo.xyz FLUX 422 `missing` at body.prompt).
 * This module is pure: it judges one paid call's outcome and decides whether to cut the recipient.
 * The cut itself is planned by the SDK (planCutoff) and is a single root/admin-signed transaction.
 */

export type PaidCallOutcome = {
  vendor: string
  recipient: string
  /** Amount settled on chain, smallest unit. */
  amount: string | bigint
  /** The settlement tx hash. Without a settled payment there is nothing to cut for. */
  settlementTx: string | null
  /** HTTP status the vendor answered after payment. null = no answer (timeout / connection drop). */
  status: number | null
  /** Optional response body, kept as evidence. */
  body?: string | null
}

export type DeliveryVerdict =
  | { delivered: true; reason: 'ok' }
  | { delivered: false; reason: 'not_settled' }
  | { delivered: false; reason: 'paid_then_client_error' | 'paid_then_server_error' | 'paid_then_no_response' | 'paid_then_payment_required'; status: number | null }

/** Judge one paid call. A 2xx after settlement is delivery; anything else after settlement is not. */
export function judgeDelivery(o: PaidCallOutcome): DeliveryVerdict {
  if (!o.settlementTx) return { delivered: false, reason: 'not_settled' }
  if (o.status === null) return { delivered: false, reason: 'paid_then_no_response', status: null }
  if (o.status >= 200 && o.status < 300) return { delivered: true, reason: 'ok' }
  if (o.status === 402) return { delivered: false, reason: 'paid_then_payment_required', status: 402 }
  if (o.status >= 500) return { delivered: false, reason: 'paid_then_server_error', status: o.status }
  return { delivered: false, reason: 'paid_then_client_error', status: o.status }
}

export type DeliveryCutPolicy = {
  /** Settled-but-undelivered calls tolerated before the cut. 1 = cut on the first failure. */
  strikes: number
  /** Look-back window in calls per vendor. */
  window: number
}

export const DEFAULT_DELIVERY_CUT: DeliveryCutPolicy = { strikes: 1, window: 20 }

export type CutDecision = {
  recipient: string
  vendor: string
  cut: boolean
  failures: number
  /** Value settled to the recipient without delivery, smallest unit. */
  lost: bigint
  evidence: { settlementTx: string; status: number | null; reason: string }[]
}

/** Per recipient: cut once the failures in the last `window` paid calls reach `strikes`. */
export function decideCuts(outcomes: readonly PaidCallOutcome[], policy: DeliveryCutPolicy = DEFAULT_DELIVERY_CUT): CutDecision[] {
  if (!(policy.strikes >= 1)) throw new Error('DeliveryCut: strikes must be >= 1')
  const by = new Map<string, PaidCallOutcome[]>()
  for (const o of outcomes) {
    if (!o.settlementTx) continue
    const k = o.recipient.toLowerCase()
    by.set(k, [...(by.get(k) ?? []), o])
  }
  const out: CutDecision[] = []
  for (const [recipient, list] of by) {
    const recent = list.slice(-policy.window)
    const evidence: CutDecision['evidence'] = []
    let lost = 0n
    for (const o of recent) {
      const v = judgeDelivery(o)
      if (v.delivered) continue
      evidence.push({ settlementTx: o.settlementTx!, status: o.status, reason: v.reason })
      lost += BigInt(o.amount)
    }
    out.push({ recipient, vendor: recent[recent.length - 1]!.vendor, cut: evidence.length >= policy.strikes, failures: evidence.length, lost, evidence })
  }
  return out
}
