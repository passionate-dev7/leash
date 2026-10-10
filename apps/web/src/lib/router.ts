import { useEffect, useState } from 'react'

export const ROUTES = [
  { path: 'quote-cap', label: 'Quote-Cap', title: 'Leash Quote-Cap: agents never pay above the listed price' },
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
  // Everyone lands on the Quote-Cap demo: the 15-second story.
  return { page: 'quote-cap' }
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
