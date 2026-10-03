import type { Address } from 'viem'
import { api } from './api'
import type { LedgerRecord } from './api'
import { usePoll } from './session'

/** The three reads every team view needs: agents with chain-read limits, the ledger, and per-service delivery. */
export function useTeamData(account: Address | null) {
  const team = usePoll(account ? () => api.team(account) : null, 10_000, [account])
  const ledger = usePoll(account ? () => api.ledger(account, LEDGER_WINDOW) : null, 15_000, [account])
  const vendors = usePoll(account ? () => api.vendors(account) : null, 15_000, [account])
  return { team, ledger, vendors }
}

export const LEDGER_WINDOW = 500
const DAY_MS = 86_400_000

/** A paid call is one whose settlement succeeded on chain, delivered or not. */
export const isPaid = (r: LedgerRecord) => r.settlement?.status === 'success' && (r.outcome === 'delivered' || r.outcome === 'paid_not_delivered')

export function agentStats(records: LedgerRecord[], keyId: Address, now = Date.now()) {
  const mine = records.filter((r) => r.keyId.toLowerCase() === keyId.toLowerCase())
  return {
    paid: mine.filter(isPaid).length,
    paidNotDelivered: mine.filter((r) => isPaid(r) && r.outcome === 'paid_not_delivered').length,
    refused24h: mine.filter((r) => r.outcome === 'refused' && now - Date.parse(r.startedAt) < DAY_MS).length,
  }
}
