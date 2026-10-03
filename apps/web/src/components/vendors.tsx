import type { ReactNode } from 'react'
import type { CatalogService, VendorRow } from '@/lib/api'
import { pct, short, units } from '@/lib/format'
import { AddressLink, TxLink } from '@/components/ui/status'
import { Cell, Table, TBody, Th, THead, Tr } from '@/components/page'
import { cn } from '@/components/ui/cn'
import { useNetwork } from '@/lib/network'

/** What a vendor row is called: its service on Moderato, the services behind its payout (or the address) on mainnet. */
export function vendorLabel(row: VendorRow, network: 'moderato' | 'mainnet'): string {
  if (network === 'moderato') return row.serviceId
  if (row.services.length === 0) return short(row.recipient, 10, 6)
  return `${row.services.slice(0, 3).join(', ')}${row.services.length > 3 ? ` +${row.services.length - 3} more` : ''}`
}

export function FailureBar({ rate, paid }: { rate: number; paid: number }) {
  if (paid === 0) return <span className="text-ink-subtle">no payments</span>
  return (
    <span className="flex items-center gap-3 max-md:justify-end" title={`${pct(rate)} of paid calls were not delivered`}>
      <span className="h-2 w-24 shrink-0 bg-surface-2">
        <span className={cn('block h-full', rate > 0 ? 'bg-error' : 'bg-success')} style={{ width: `${Math.max(rate > 0 ? 4 : 0, Math.min(100, rate * 100))}%` }} />
      </span>
      <span className="num">{pct(rate)}</span>
    </span>
  )
}

/** The measured 24h failures behind a service, with the settlement tx of each paid-but-not-delivered call. */
export function Evidence({ row, max = 3 }: { row: VendorRow; max?: number }) {
  const e = row.evidence
  if (e.paid === 0) return <span className="text-ink-subtle">No payments in 24h</span>
  if (e.paidNotDelivered === 0) return <span className="text-ink-muted"><span className="num">{e.paid}</span> paid in 24h, all delivered</span>
  return (
    <span className="block">
      <span className="font-semibold text-error-ink">
        <span className="num">{e.paidNotDelivered}</span> of <span className="num">{e.paid}</span> paid, not delivered
      </span>
      <span className="num text-ink-muted"> ({pct(e.failureRate)}) in 24h</span>
      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-caption max-md:justify-end">
        {e.txs.slice(0, max).map((tx) => (
          <TxLink key={tx} hash={tx} />
        ))}
        {e.txs.length > max && <span className="text-ink-subtle">+{e.txs.length - max} more</span>}
      </span>
    </span>
  )
}

/** Delivery per service. `action` renders the last column; omit it for the read-only public view. */
export function VendorTable({ rows, svcById, action }: { rows: VendorRow[]; svcById: Map<string, CatalogService>; action?: (row: VendorRow) => ReactNode }) {
  const { symbol, name } = useNetwork()
  return (
    <Table>
      <THead>
        <tr>
          <Th>Service</Th>
          <Th className="text-right">Paid</Th>
          <Th className="text-right">Delivered</Th>
          <Th className="text-right">Not delivered</Th>
          <Th className="text-right">Refused</Th>
          <Th className="text-right">Spent ({symbol})</Th>
          <Th>Failure rate</Th>
          <Th>Last 24h</Th>
          {action && <Th>Action</Th>}
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.serviceId}>
            <Cell>
              {name === 'mainnet' ? (
                <>
                  <p className="num font-semibold">{vendorLabel(r, name)}</p>
                  <p className="mt-0.5 text-caption text-ink-muted">
                    <AddressLink address={r.recipient} /> {r.services.length === 0 ? 'no service is known behind this payout' : `pays ${r.services.length} service${r.services.length === 1 ? '' : 's'}`}
                  </p>
                </>
              ) : (
                <>
                  <p className="num font-semibold">{r.serviceId}</p>
                  <p className="text-caption text-ink-muted">{svcById.get(r.serviceId)?.vendorName ?? r.vendorId}</p>
                  <p className="mt-0.5 text-caption text-ink-muted">
                    <AddressLink address={r.recipient} />{' '}
                    {r.virtual ? 'one per service' : r.siblings.length > 0 ? `shared with ${r.siblings.join(', ')}` : 'plain address'}
                  </p>
                </>
              )}
            </Cell>
            <Cell label="Paid" className="num text-right">{r.paid}</Cell>
            <Cell label="Delivered" className="num text-right">{r.delivered}</Cell>
            <Cell label="Not delivered" className={cn('num text-right', r.paidNotDelivered > 0 && 'font-semibold text-error-ink')}>{r.paidNotDelivered}</Cell>
            <Cell label="Refused" className="num text-right">{r.refused}</Cell>
            <Cell label={`Spent (${symbol})`} className="num text-right">{units(r.spent)}</Cell>
            <Cell label="Failure rate"><FailureBar rate={r.failureRate} paid={r.paid} /></Cell>
            <Cell label="Last 24h"><Evidence row={r} /></Cell>
            {action && <Cell className="max-md:border-t max-md:border-hairline max-md:pt-3">{action(r)}</Cell>}
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
