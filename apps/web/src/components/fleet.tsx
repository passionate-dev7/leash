import type { ReactNode } from 'react'
import { useTeamData, agentStats, LEDGER_WINDOW } from '@/lib/fleet'
import { money, short } from '@/lib/format'
import { Notice, Status } from '@/components/ui/status'
import { Cell, Table, TBody, Th, THead, Tr } from '@/components/page'
import { cn } from '@/components/ui/cn'

type Data = ReturnType<typeof useTeamData>

function Figure({ label, value, tone, note }: { label: string; value: ReactNode; tone?: 'bad'; note?: string }) {
  return (
    <div className="bg-canvas px-4 py-4">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className={cn('num mt-1 text-card-title font-light', tone === 'bad' && 'text-error-ink')}>{value}</p>
      {note && <p className="mt-1 text-caption text-ink-subtle">{note}</p>}
    </div>
  )
}

function SpendBar({ budget, remaining }: { budget: string; remaining: string | null }) {
  if (remaining === null) return <span className="text-ink-subtle">not read from chain</span>
  const total = BigInt(budget)
  const left = BigInt(remaining) > total ? total : BigInt(remaining)
  const spent = total - left
  const share = total === 0n ? 0 : Number((spent * 10_000n) / total) / 100
  return (
    <div className="md:w-56">
      <div className="h-2 bg-surface-2" role="img" aria-label={`${money(spent)} of ${money(total)} OUSD spent`}>
        <div className="h-full bg-primary" style={{ width: `${spent > 0n ? Math.max(share, 2) : 0}%` }} />
      </div>
      <p className="num mt-1 text-caption text-ink-muted">
        {money(spent)} of {money(total)} OUSD
      </p>
    </div>
  )
}

/** One strip for a team: fleet totals, then each agent's spend against its daily budget. Read from the API and the chain. */
export function FleetStrip({ data, empty }: { data: Data; empty: ReactNode }) {
  const { team, ledger, vendors } = data
  const agents = team.data?.agents ?? []
  const records = ledger.data?.records ?? []
  const stats = new Map(agents.map((a) => [a.keyId, agentStats(records, a.keyId)]))
  const sum = (pick: (s: ReturnType<typeof agentStats>) => number) => [...stats.values()].reduce((n, s) => n + pick(s), 0)
  const cut = vendors.data?.services.filter((s) => s.cut?.status === 'confirmed') ?? []
  const block = Math.max(0, ...agents.map((a) => a.readBlock ?? 0))
  const truncated = records.length >= LEDGER_WINDOW
  const ready = team.data !== null && ledger.data !== null && vendors.data !== null
  const failed = team.error ?? ledger.error ?? vendors.error

  if (failed && !ready) return <Notice tone="error" title="Could not read the fleet">{failed}</Notice>
  if (!ready) return <p className="border border-hairline p-6 text-body-sm text-ink-muted" aria-live="polite">Reading agents from the API and spend limits from chain.</p>
  if (agents.length === 0) return <>{empty}</>

  return (
    <section aria-label="Fleet" className="border border-hairline">
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 border-b border-hairline px-4">
        <h2 className="text-body-sm font-semibold">
          Fleet, {agents.length} agent{agents.length === 1 ? '' : 's'}
        </h2>
        {block > 0 && <span className="text-caption text-ink-subtle">limits read from chain at block <span className="num">{block.toLocaleString()}</span></span>}
      </header>
      <div className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline md:grid-cols-4">
        <Figure label="Paid calls" value={sum((s) => s.paid)} note={truncated ? `latest ${LEDGER_WINDOW} records` : undefined} />
        <Figure label="Paid, not delivered" value={sum((s) => s.paidNotDelivered)} tone={sum((s) => s.paidNotDelivered) > 0 ? 'bad' : undefined} />
        <Figure label="Chain refusals, 24h" value={sum((s) => s.refused24h)} note="blocked before any funds moved" />
        <Figure label="Vendors cut" value={cut.length} note={cut.length > 0 ? cut.map((c) => c.serviceId).join(', ') : undefined} />
      </div>
      <Table bare>
        <THead>
          <tr>
            <Th>Agent</Th>
            <Th>Spent against daily budget</Th>
            <Th className="text-right">Paid calls</Th>
            <Th className="text-right">Not delivered</Th>
            <Th className="text-right">Refusals, 24h</Th>
          </tr>
        </THead>
        <TBody>
          {agents.map((a) => {
            const s = stats.get(a.keyId)!
            return (
              <Tr key={a.keyId}>
                <Cell>
                  <p className="font-semibold">{a.name}</p>
                  <p className="mt-0.5 flex items-center gap-3 text-caption text-ink-muted">
                    <Status tone={a.status === 'active' ? 'ok' : a.status === 'pending' ? 'warn' : 'idle'}>{a.status}</Status>
                    <span className="num" title={a.keyId}>{short(a.keyId, 6, 4)}</span>
                  </p>
                </Cell>
                <Cell label="Daily budget">
                  {a.status === 'revoked' ? <span className="text-ink-subtle">key revoked</span> : <SpendBar budget={a.budgetUnits} remaining={a.remaining} />}
                </Cell>
                <Cell label="Paid calls" className="num text-right">{s.paid}</Cell>
                <Cell label="Not delivered" className={cn('num text-right', s.paidNotDelivered > 0 && 'font-semibold text-error-ink')}>{s.paidNotDelivered}</Cell>
                <Cell label="Refusals, 24h" className="num text-right">{s.refused24h}</Cell>
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </section>
  )
}
