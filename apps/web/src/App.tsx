import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { SessionProvider, useSession, usePoll } from '@/lib/session'
import { ROUTES, VIEW, useRoute } from '@/lib/router'
import { api } from '@/lib/api'
import { short } from '@/lib/format'
import { cn } from '@/components/ui/cn'
import { Status } from '@/components/ui/status'
import { TeamPage } from '@/pages/team'
import { AgentsPage } from '@/pages/agents'
import { VendorsPage } from '@/pages/vendors'
import { LedgerPage } from '@/pages/ledger'
import { MainnetPage } from '@/pages/mainnet'
import { LivePage } from '@/pages/live'

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

const NAV = [{ path: 't', label: VIEW.label }, ...ROUTES]

function Shell() {
  const route = useRoute()
  const { active } = useSession()
  const [menu, setMenu] = useState(false)
  useEffect(() => setMenu(false), [route])
  const hereOf = (path: string) => (path === 't' ? 'view' : path) === route.page
  const item = 'flex items-center whitespace-nowrap text-body-sm'
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <UtilityBar />
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-12 max-w-[1584px] items-stretch px-4 sm:px-8">
          <a href="#/" className="flex items-center gap-3 pr-8 text-body-sm font-semibold">
            <span aria-hidden className="grid size-6 place-items-center bg-ink">
              <svg viewBox="0 0 24 24" className="size-4"><path d="M5 4h4v11h10v4H5z" className="fill-primary" /></svg>
            </span>
            Leash
          </a>
          <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-stretch md:flex">
            {NAV.map((r) => (
              <a
                key={r.path}
                href={`#/${r.path}`}
                aria-current={hereOf(r.path) ? 'page' : undefined}
                className={cn(item, 'border-b-2 px-4', hereOf(r.path) ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-muted hover:bg-surface-1 hover:text-ink')}
              >
                {r.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center pl-4 text-caption text-ink-muted md:flex">
            {active ? (
              <span>
                {active.label} <span className="num ml-1 text-ink">{short(active.address, 6, 4)}</span>
              </span>
            ) : route.page === 'view' ? null : (
              <a href="#/team" className="flex h-full items-center bg-primary px-4 text-body-sm text-on-primary hover:bg-primary-hover">Create your own team</a>
            )}
          </div>
          <button
            type="button"
            aria-expanded={menu}
            aria-controls="mobile-menu"
            aria-label={menu ? 'Close menu' : 'Open menu'}
            onClick={() => setMenu((v) => !v)}
            className="-mr-4 ml-auto grid w-12 place-items-center hover:bg-surface-1 sm:-mr-8 md:hidden"
          >
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {menu && (
          <nav id="mobile-menu" aria-label="Primary" className="border-t border-hairline bg-canvas md:hidden">
            {NAV.map((r) => (
              <a
                key={r.path}
                href={`#/${r.path}`}
                aria-current={hereOf(r.path) ? 'page' : undefined}
                className={cn(item, 'h-12 border-b border-l-4 border-b-hairline px-4', hereOf(r.path) ? 'border-l-primary font-semibold text-ink' : 'border-l-transparent text-ink-muted')}
              >
                {r.label}
              </a>
            ))}
            {!active && route.page !== 'view' && <a href="#/team" className={cn(item, 'h-12 bg-primary px-5 text-on-primary')}>Create your own team</a>}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-[1584px] flex-1 px-4 py-8 sm:px-8 sm:py-12">
        {route.page === 'view' && <LivePage account={route.account} />}
        {route.page === 'team' && <TeamPage />}
        {route.page === 'agents' && <AgentsPage />}
        {route.page === 'vendors' && <VendorsPage />}
        {route.page === 'ledger' && <LedgerPage />}
        {route.page === 'mainnet' && <MainnetPage />}
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
