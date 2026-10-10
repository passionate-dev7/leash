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
  const [filter, setFilter] = useState<'all' | Outcome>('paid_not_delivered')
  const all = ledger.data ? asRecords(ledger.data) : []
  const rows = filter === 'all' ? all : all.filter((r) => r.outcome === filter)

  return (
    <>
      <PageHead title="Paid, not delivered">
        An agent paid a vendor, the HTTP call failed, one signature removes that payout, and the next payment reverts with CallNotAllowed. This ledger opens on paid-but-not-delivered calls; switch tabs to see every outcome.
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
