import { useState } from 'react'
import type { Address } from 'viem'
import { api } from '@/lib/api'
import type { Outcome } from '@/lib/api'
import { usePoll } from '@/lib/session'
import { asRecords } from '@/lib/records'
import { Empty, Notice } from '@/components/ui/status'
import { NeedsTeam, PageHead } from '@/components/page'
import { RecordTable } from '@/components/records'
import { cn } from '@/components/ui/cn'

const FILTERS: { key: 'all' | Outcome; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'paid_not_delivered', label: 'Paid, not delivered' },
  { key: 'refused', label: 'Refused' },
]

function LedgerBody({ account }: { account: Address }) {
  const ledger = usePoll(() => api.ledger(account, 100), 5000, [account])
  const [filter, setFilter] = useState<'all' | Outcome>('all')
  const all = ledger.data ? asRecords(ledger.data) : []
  const rows = filter === 'all' ? all : all.filter((r) => r.outcome === filter)

  return (
    <>
      <PageHead title="Ledger">
        Every payment an agent attempted, newest first. Settlement links open the transaction on the team's chain explorer. Refused calls never reach the vendor and move nothing.
      </PageHead>
      {ledger.error && <Notice tone="error" title="Could not load the ledger">{ledger.error}</Notice>}
      {ledger.data && all.length === 0 && (
        <Empty title="No payments recorded">Run research from the Agents tab. Each call an agent makes lands here with its settlement transaction and the vendor's HTTP answer.</Empty>
      )}
      {all.length > 0 && (
        <>
          <div role="tablist" aria-label="Filter by outcome" className="mb-4 flex overflow-x-auto border-b border-hairline">
            {FILTERS.map((f) => {
              const n = f.key === 'all' ? all.length : all.filter((r) => r.outcome === f.key).length
              return (
                <button
                  key={f.key}
                  role="tab"
                  type="button"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-5 py-3 text-body-sm',
                    filter === f.key ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-muted hover:bg-surface-1',
                  )}
                >
                  {f.label} <span className="num text-ink-subtle">{n}</span>
                </button>
              )
            })}
          </div>
          {rows.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Nothing in this filter yet.</p>
          ) : (
            <RecordTable records={rows} />
          )}
        </>
      )}
    </>
  )
}

export const LedgerPage = () => <NeedsTeam>{({ account }) => <LedgerBody account={account.address} />}</NeedsTeam>
