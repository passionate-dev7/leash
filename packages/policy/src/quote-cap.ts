/**
 * Quote-Cap: an agent never pays more than the price a service advertised.
 *
 * An MPP vendor answers an unpaid request with a 402 challenge that names an amount. Nothing in
 * mppx (0.12 / 0.13.4 Tempo client) compares that amount with the catalog listing, so a default
 * client signs whatever it is asked. Measured on Tempo mainnet 2026-10-10 (unpaid challenges):
 * stablestudio lists POST /api/generate/nano-banana/generate at 39000 (0.039 USDC.e) and
 * challenged 10000000 (10.00) when the prompt was missing, 70000 (0.07) with a valid prompt.
 *
 * The check runs before a credential is signed. It is pure, so the SDK, the API and the UI share it.
 */

export type PriceBookEntry = {
  service: string
  /** scheme://host of the service, no trailing slash. */
  origin: string
  method: string
  /** Catalog path; `:param` segments match any one segment. */
  path: string
  /** Listed price in the currency's smallest unit. */
  amount: string
  currency: string
  decimals: number
}

export type PriceBook = { source: string; chainId: number; entries: PriceBookEntry[] }

export type QuoteCapPolicy = {
  /**
   * Allowed overshoot above the listing, in basis points. 0 = exact listing. Vendors legitimately
   * price some calls by input size, so teams may allow e.g. 10000 (2x).
   */
  toleranceBps: number
  /** Hard ceiling per call in smallest units, applied even to unlisted endpoints. */
  maxPerCall?: bigint
  /** What to do when the endpoint has no listing: refuse, or allow up to maxPerCall. */
  unlisted: 'refuse' | 'cap'
}

export const DEFAULT_QUOTE_CAP: QuoteCapPolicy = { toleranceBps: 0, maxPerCall: 1_000_000n, unlisted: 'cap' }

export type Quote = { method: string; url: string; amount: string | bigint; currency?: string | null; recipient?: string | null }

export type QuoteVerdict =
  | { ok: true; listed: bigint | null; quoted: bigint; ceiling: bigint | null; entry: PriceBookEntry | null }
  | {
      ok: false
      reason: 'above_listing' | 'above_max_per_call' | 'unlisted' | 'currency_mismatch' | 'bad_amount'
      listed: bigint | null
      quoted: bigint
      ceiling: bigint | null
      entry: PriceBookEntry | null
      message: string
    }

function pathMatches(pattern: string, path: string): boolean {
  const a = pattern.replace(/\/+$/, '').split('/')
  const b = path.replace(/\/+$/, '').split('/')
  if (a.length !== b.length) return false
  return a.every((seg, i) => seg.startsWith(':') || (seg.startsWith('{') && seg.endsWith('}')) || seg === b[i])
}

/** The catalog listing for a request, exact paths preferred over parameterised ones. */
export function findListing(book: PriceBook, method: string, url: string): PriceBookEntry | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const origin = `${u.protocol}//${u.host}`.toLowerCase()
  const m = method.toUpperCase()
  const hits = book.entries.filter(
    (e) => e.origin.toLowerCase() === origin && e.method.toUpperCase() === m && pathMatches(e.path, u.pathname),
  )
  hits.sort((x, y) => (x.path.includes(':') ? 1 : 0) - (y.path.includes(':') ? 1 : 0))
  return hits[0] ?? null
}

export function formatUnits(amount: bigint, decimals = 6): string {
  const neg = amount < 0n
  const v = neg ? -amount : amount
  const s = v.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  let frac = s.slice(s.length - decimals).replace(/0+$/, '')
  if (frac.length < 2) frac = frac.padEnd(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

/** Decide whether a 402 quote may be signed. Never throws. */
export function checkQuote(book: PriceBook, policy: QuoteCapPolicy, quote: Quote): QuoteVerdict {
  let quoted: bigint
  try {
    quoted = BigInt(quote.amount)
    if (quoted < 0n) throw new Error('negative')
  } catch {
    return { ok: false, reason: 'bad_amount', listed: null, quoted: -1n, ceiling: null, entry: null, message: `QuoteCapExceeded: unparseable amount ${String(quote.amount)}` }
  }
  const entry = findListing(book, quote.method, quote.url)
  const listed = entry ? BigInt(entry.amount) : null
  const dec = entry?.decimals ?? 6
  const fmt = (x: bigint) => `$${formatUnits(x, dec)}`

  if (entry && quote.currency && entry.currency.toLowerCase() !== quote.currency.toLowerCase())
    return { ok: false, reason: 'currency_mismatch', listed, quoted, ceiling: listed, entry, message: `QuoteCapExceeded: quote is in ${quote.currency}, listing is in ${entry.currency}` }

  const byListing = listed === null ? null : listed + (listed * BigInt(policy.toleranceBps)) / 10_000n
  const ceiling =
    byListing === null ? (policy.maxPerCall ?? null) : policy.maxPerCall !== undefined && policy.maxPerCall < byListing ? policy.maxPerCall : byListing

  if (listed === null && policy.unlisted === 'refuse')
    return { ok: false, reason: 'unlisted', listed, quoted, ceiling: null, entry, message: `QuoteCapExceeded: ${quote.method} ${quote.url} has no listed price` }
  if (byListing !== null && quoted > byListing)
    return { ok: false, reason: 'above_listing', listed, quoted, ceiling, entry, message: `QuoteCapExceeded: asked ${fmt(quoted)}, listed ${fmt(listed!)} (ceiling ${fmt(byListing)})` }
  if (policy.maxPerCall !== undefined && quoted > policy.maxPerCall)
    return { ok: false, reason: 'above_max_per_call', listed, quoted, ceiling, entry, message: `QuoteCapExceeded: asked ${fmt(quoted)}, per-call cap ${fmt(policy.maxPerCall)}` }
  return { ok: true, listed, quoted, ceiling, entry }
}
