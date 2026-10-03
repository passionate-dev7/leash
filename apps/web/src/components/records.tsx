import type { LedgerRecord, Outcome } from '@/lib/api'
import { Status, TxLink } from '@/components/ui/status'
import { Cell, Table, TBody, Th, THead, Tr } from '@/components/page'
import { ago, units } from '@/lib/format'
import { useNetwork } from '@/lib/network'

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
  const { symbol } = useNetwork()
  return (
    <Table>
      <THead>
        <tr>
          <Th>When</Th>
          {showAgent && <Th>Agent</Th>}
          <Th>Service</Th>
          <Th>Outcome</Th>
          <Th className="text-right">Amount ({symbol})</Th>
          <Th>HTTP</Th>
          <Th>Chain refusal</Th>
          <Th>Settlement</Th>
        </tr>
      </THead>
      <TBody>
        {records.map((r) => (
          <Tr key={r.seq} className="odd:bg-canvas even:bg-surface-1/50">
            <Cell label="When" className="whitespace-nowrap text-ink-muted">{ago(r.startedAt)}</Cell>
            {showAgent && (
              <Cell label="Agent">
                {r.agentName}
                {r.source === 'external' && <span className="num ml-2 border border-hairline px-1.5 text-caption text-ink-muted" title="This agent pays from its own process and reported the record">external</span>}
              </Cell>
            )}
            <Cell label="Service">
              <span className="num">{r.serviceId}</span>
            </Cell>
            <Cell label="Outcome">
              <OutcomeStatus outcome={r.outcome} />
            </Cell>
            <Cell label={`Amount (${symbol})`} className="num text-right">{r.outcome === 'refused' ? '0' : units(r.amount)}</Cell>
            <Cell label="HTTP" className="num">{r.status ?? ''}</Cell>
            <Cell label="Chain refusal">{r.refused ? <span className="num text-error-ink">{r.refused}</span> : ''}</Cell>
            <Cell label="Settlement">{r.settlement ? <TxLink hash={r.settlement.tx} /> : <span className="text-ink-subtle">none</span>}</Cell>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
