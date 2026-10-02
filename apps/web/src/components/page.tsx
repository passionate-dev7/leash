import type { ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { Empty } from '@/components/ui/status'
import { Button } from '@/components/ui/button'
import { go } from '@/lib/router'

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

export const Cell = ({ children, className = '' }: { children: ReactNode; className?: string }) => <td className={`px-4 py-3 align-top ${className}`}>{children}</td>
export const Th = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={`h-10 whitespace-nowrap bg-surface-1 px-4 text-left text-caption font-semibold text-ink-muted ${className}`}>
    {children}
  </th>
)
