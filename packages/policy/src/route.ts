import type { PriceBook, PriceBookEntry } from './quote-cap.js'
import { findListing } from './quote-cap.js'

/**
 * Route: the same API sold by more than one MPP seller, cheapest listing first.
 *
 * Groups are curated: two endpoints belong together only when they wrap the same upstream call.
 * Listed prices come from the mpp.dev catalog; live 402s on 2026-10-10 matched the listing where
 * the seller answered. Output equivalence across sellers is not verified by paid calls (no
 * mainnet spend), so Route reports savings on listed price and leaves the choice to the team.
 */
export type RouteGroup = { id: string; label: string; sellers: { method: string; url: string }[] }

export const ROUTE_GROUPS: RouteGroup[] = [
  {
    id: 'hunter/email-verifier',
    label: 'Hunter email verifier',
    sellers: [
      { method: 'POST', url: 'https://hunter.mpp.paywithlocus.com/hunter/email-verifier' },
      { method: 'POST', url: 'https://stableenrich.dev/api/hunter/email-verifier' },
    ],
  },
  {
    id: 'apollo/people-search',
    label: 'Apollo people search',
    sellers: [
      { method: 'POST', url: 'https://apollo.mpp.paywithlocus.com/apollo/people-search' },
      { method: 'POST', url: 'https://stableenrich.dev/api/apollo/people-search' },
    ],
  },
  {
    id: 'firecrawl/scrape',
    label: 'Firecrawl scrape',
    sellers: [
      { method: 'POST', url: 'https://firecrawl.mpp.tempo.xyz/v1/scrape' },
      { method: 'POST', url: 'https://stableenrich.dev/api/firecrawl/scrape' },
    ],
  },
]

export type RouteOption = { method: string; url: string; service: string; amount: bigint; entry: PriceBookEntry }
export type RoutePlan = {
  group: RouteGroup
  options: RouteOption[]
  cheapest: RouteOption
  priciest: RouteOption
  /** Saving per call of the cheapest over the priciest listing, smallest units. */
  savingPerCall: bigint
  /** Saving in basis points of the priciest listing. */
  savingBps: number
}

/** Matches loosely on method: catalogs disagree on GET/POST for the same wrapper. */
function listing(book: PriceBook, method: string, url: string): PriceBookEntry | null {
  return findListing(book, method, url) ?? findListing(book, method === 'GET' ? 'POST' : 'GET', url)
}

export function planRoute(book: PriceBook, group: RouteGroup): RoutePlan | null {
  const options: RouteOption[] = []
  for (const s of group.sellers) {
    const entry = listing(book, s.method, s.url)
    if (entry) options.push({ ...s, service: entry.service, amount: BigInt(entry.amount), entry })
  }
  if (options.length < 2) return null
  options.sort((a, b) => (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0))
  const cheapest = options[0]!
  const priciest = options[options.length - 1]!
  const savingPerCall = priciest.amount - cheapest.amount
  const savingBps = priciest.amount === 0n ? 0 : Number((savingPerCall * 10_000n) / priciest.amount)
  return { group, options, cheapest, priciest, savingPerCall, savingBps }
}

/** The group a request belongs to, so a client can be told a cheaper seller exists. */
export function routeFor(book: PriceBook, method: string, url: string, groups: RouteGroup[] = ROUTE_GROUPS): RoutePlan | null {
  const u = url.split('?')[0]!
  const g = groups.find((x) => x.sellers.some((s) => s.url === u))
  return g ? planRoute(book, g) : null
}

export function allRoutes(book: PriceBook, groups: RouteGroup[] = ROUTE_GROUPS): RoutePlan[] {
  return groups.map((g) => planRoute(book, g)).filter((x): x is RoutePlan => x !== null)
}
