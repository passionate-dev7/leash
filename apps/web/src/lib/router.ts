import { useEffect, useState } from 'react'
import { getActive } from './signer'

export const ROUTES = [
  { path: 'team', label: 'Team', title: 'Leash: team account and funding' },
  { path: 'agents', label: 'Agents', title: 'Leash: agents, budgets and runs' },
  { path: 'vendors', label: 'Vendors', title: 'Leash: vendor delivery and cut-off' },
  { path: 'ledger', label: 'Ledger', title: 'Leash: payment ledger' },
  { path: 'mainnet', label: 'Mainnet', title: 'Leash: mainnet MPP replay' },
] as const
export type RoutePath = (typeof ROUTES)[number]['path']

/** The public read-only team view lives at #/t/<account>; #/t alone shows the featured team. */
export const VIEW = { label: 'Live team', title: 'Leash: a team and its agents, read-only' }

export type Route = { page: RoutePath } | { page: 'view'; account: string | null }

const read = (): Route => {
  const hash = location.hash.replace(/^#\/?/, '')
  const [head, arg] = hash.split('/')
  if (head === 't') return { page: 'view', account: arg || null }
  const found = ROUTES.find((r) => r.path === head)
  if (found) return { page: found.path }
  // A browser holding a team key lands on its team; a fresh visitor lands on the featured team, read-only.
  return getActive() ? { page: 'team' } : { page: 'view', account: null }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const page = route.page
  useEffect(() => {
    document.title = page === 'view' ? VIEW.title : ROUTES.find((r) => r.path === page)!.title
  }, [page])
  return route
}

export const go = (path: RoutePath) => {
  location.hash = `/${path}`
}
export const goView = (account?: string) => {
  location.hash = account ? `/t/${account}` : '/t'
}
