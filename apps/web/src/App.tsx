import { SessionProvider, useSession, usePoll } from '@/lib/session'
import { ROUTES, useRoute } from '@/lib/router'
import { api } from '@/lib/api'
import { short } from '@/lib/format'
import { cn } from '@/components/ui/cn'
import { Status } from '@/components/ui/status'
import { TeamPage } from '@/pages/team'
import { AgentsPage } from '@/pages/agents'
import { VendorsPage } from '@/pages/vendors'
import { LedgerPage } from '@/pages/ledger'
import { MainnetPage } from '@/pages/mainnet'

function UtilityBar() {
  const health = usePoll(() => api.health(), 15_000, [])
  return (
    <div className="hidden h-8 items-center bg-surface-1 sm:flex">
      <div className="mx-auto flex w-full max-w-[1584px] items-center justify-between gap-6 px-8 text-caption text-ink-muted">
        <span>Moderato testnet, chain 42431. Agent payments settle in OUSD.</span>
        {health.data?.ok ? (
          <Status tone="ok">
            API up, block <span className="num">{String(health.data.block)}</span>
          </Status>
        ) : health.error ? (
          <Status tone="bad">API unreachable</Status>
        ) : (
          <Status tone="idle">Checking API</Status>
        )}
      </div>
    </div>
  )
}

function Shell() {
  const route = useRoute()
  const { active } = useSession()
  return (
    <div className="min-h-dvh bg-canvas">
      <UtilityBar />
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-12 max-w-[1584px] items-stretch px-4 sm:px-8">
          <a href="#/team" className="flex items-center gap-3 pr-8 text-body-sm font-semibold">
            <span aria-hidden className="grid size-6 place-items-center bg-ink">
              <svg viewBox="0 0 24 24" className="size-4"><path d="M5 4h4v11h10v4H5z" className="fill-primary" /></svg>
            </span>
            Leash
          </a>
          <nav aria-label="Primary" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {ROUTES.map((r) => (
              <a
                key={r.path}
                href={`#/${r.path}`}
                aria-current={route === r.path ? 'page' : undefined}
                className={cn(
                  'flex items-center border-b-2 px-4 text-body-sm',
                  route === r.path ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-muted hover:bg-surface-1 hover:text-ink',
                )}
              >
                {r.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center pl-4 text-caption text-ink-muted md:flex">
            {active ? (
              <span>
                {active.label} <span className="num ml-1 text-ink">{short(active.address, 6, 4)}</span>
              </span>
            ) : (
              'No team account'
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1584px] px-4 py-8 sm:px-8 sm:py-12">
        {route === 'team' && <TeamPage />}
        {route === 'agents' && <AgentsPage />}
        {route === 'vendors' && <VendorsPage />}
        {route === 'ledger' && <LedgerPage />}
        {route === 'mainnet' && <MainnetPage />}
      </main>
      <footer className="bg-inverse-canvas px-4 py-12 sm:px-8">
        <div className="mx-auto grid max-w-[1584px] gap-8 text-body-sm text-inverse-ink-muted sm:grid-cols-3">
          <p>Every write on this site runs on Moderato testnet. The team key signs in this browser. The server holds agent keys only, never the team key.</p>
          <p>Mainnet (chain 4217) is read-only here: the replay on the Mainnet tab never sends a transaction.</p>
          <p>
            <a className="text-inverse-ink underline hover:text-inverse-ink-muted" href="https://explore.testnet.tempo.xyz" target="_blank" rel="noreferrer">
              Moderato explorer
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

export const App = () => (
  <SessionProvider>
    <Shell />
  </SessionProvider>
)
