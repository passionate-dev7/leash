import type { ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { Empty } from '@/components/ui/status'
import { Button } from '@/components/ui/button'
import { go } from '@/lib/router'
import { cn } from '@/components/ui/cn'

export function PageHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-headline font-light">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-body text-ink-muted">{children}</p>}
      </div>
      {actions}
    </div>
  )
}

/** Renders children only once a team signer is loaded; otherwise tells the user the next step. */
export function NeedsTeam({ children }: { children: (ctx: { account: NonNullable<ReturnType<typeof useSession>['active']>; client: NonNullable<ReturnType<typeof useSession>['client']> }) => ReactNode }) {
  const { active, client, loadError } = useSession()
  if (!active) {
    return (
      <Empty
        title="No team account yet"
        action={<Button onClick={() => go('team')}>Create a team account</Button>}
      >
        Agents, vendors and the ledger belong to a team account. Create one on the Team tab, then fund it from the faucet.
      </Empty>
    )
  }
  if (loadError) return <Empty title="This browser cannot sign for that team">{loadError}</Empty>
  if (!client) return <p className="text-body-sm text-ink-muted">Loading the team key from this browser.</p>
  return <>{children({ account: active, client })}</>
}

/** Under md a table becomes stacked rows: each cell shows its column label beside the value. */
export const Table = ({ children, className, bare }: { children: ReactNode; className?: string; bare?: boolean }) => (
  <div className={cn(!bare && 'border border-hairline')}>
    <table className={cn('w-full text-body-sm max-md:block', className)}>{children}</table>
  </div>
)
export const THead = ({ children }: { children: ReactNode }) => <thead className="max-md:sr-only">{children}</thead>
export const TBody = ({ children }: { children: ReactNode }) => <tbody className="divide-y divide-hairline max-md:block">{children}</tbody>
export const Tr = ({ children, className }: { children: ReactNode; className?: string }) => (
  <tr className={cn('max-md:block max-md:px-4 max-md:py-3', className)}>{children}</tr>
)
export const Cell = ({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) => (
  <td className={cn('px-4 py-3 align-top', (children === '' || children == null || children === false) && 'max-md:hidden', label ? 'max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-1' : 'max-md:block max-md:px-0 max-md:py-1', className)}>
    {label && <span className="shrink-0 text-caption text-ink-muted md:hidden">{label}</span>}
    <div className={cn('min-w-0', label && 'max-md:text-right')}>{children}</div>
  </td>
)
export const Th = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={`h-10 whitespace-nowrap bg-surface-1 px-4 text-left text-caption font-semibold text-ink-muted ${className}`}>
    {children}
  </th>
)
