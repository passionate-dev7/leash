import type { LedgerRecord, Outcome } from '@/lib/api'
import { Status, TxLink } from '@/components/ui/status'
import { Cell, Th } from '@/components/page'
import { ago, units } from '@/lib/format'

const outcomes: Record<Outcome, { tone: 'ok' | 'bad' | 'warn' | 'idle'; label: string }> = {
  delivered: { tone: 'ok', label: 'Delivered' },
  paid_not_delivered: { tone: 'bad', label: 'Paid, not delivered' },
  refused: { tone: 'warn', label: 'Refused' },
  free: { tone: 'idle', label: 'Free' },
  unsettled: { tone: 'warn', label: 'Unsettled' },
}

export const OutcomeStatus = ({ outcome }: { outcome: Outcome }) => {
  const o = outcomes[outcome] ?? { tone: 'idle' as const, label: outcome }
  return <Status tone={o.tone}>{o.label}</Status>
}

export function RecordTable({ records, showAgent = true }: { records: LedgerRecord[]; showAgent?: boolean }) {
  return (
    <div className="overflow-x-auto border border-hairline">
      <table className="w-full min-w-[860px] text-body-sm">
        <thead>
          <tr>
            <Th>When</Th>
            {showAgent && <Th>Agent</Th>}
            <Th>Service</Th>
            <Th>Outcome</Th>
            <Th className="text-right">Amount (OUSD)</Th>
            <Th>HTTP</Th>
            <Th>Chain refusal</Th>
            <Th>Settlement</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {records.map((r) => (
            <tr key={r.seq} className="odd:bg-canvas even:bg-surface-1/50">
              <Cell className="whitespace-nowrap text-ink-muted">{ago(r.startedAt)}</Cell>
              {showAgent && <Cell>{r.agentName}</Cell>}
              <Cell>
                <span className="num">{r.serviceId}</span>
              </Cell>
              <Cell>
                <OutcomeStatus outcome={r.outcome} />
              </Cell>
              <Cell className="num text-right">{r.outcome === 'refused' ? '0' : units(r.amount)}</Cell>
              <Cell className="num">{r.status ?? ''}</Cell>
              <Cell>{r.refused ? <span className="num text-error-ink">{r.refused}</span> : ''}</Cell>
              <Cell>{r.settlement ? <TxLink hash={r.settlement.tx} /> : <span className="text-ink-subtle">none</span>}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
