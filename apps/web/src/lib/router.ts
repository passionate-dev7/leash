import { useEffect, useState } from 'react'

export const ROUTES = [
  { path: 'team', label: 'Team', title: 'Leash: team account and funding' },
  { path: 'agents', label: 'Agents', title: 'Leash: agents, budgets and runs' },
  { path: 'vendors', label: 'Vendors', title: 'Leash: vendor delivery and cut-off' },
  { path: 'ledger', label: 'Ledger', title: 'Leash: payment ledger' },
  { path: 'mainnet', label: 'Mainnet', title: 'Leash: mainnet MPP replay' },
] as const
export type RoutePath = (typeof ROUTES)[number]['path']

const read = (): RoutePath => {
  const hash = location.hash.replace(/^#\/?/, '')
  return ROUTES.find((r) => r.path === hash)?.path ?? 'team'
}

export function useRoute(): RoutePath {
  const [route, setRoute] = useState<RoutePath>(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    document.title = ROUTES.find((r) => r.path === route)!.title
  }, [route])
  return route
}

export const go = (path: RoutePath) => {
  location.hash = `/${path}`
}
