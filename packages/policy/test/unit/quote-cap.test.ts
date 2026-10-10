import { describe, expect, it } from 'vitest'
import { allRoutes, checkQuote, DEFAULT_QUOTE_CAP, findListing, formatUnits, loadPriceBook, routeFor } from '../../src/index.js'

const book = loadPriceBook()
const NB = 'https://stablestudio.dev/api/generate/nano-banana/generate'
const USDCE = '0x20c000000000000000000000b9537d11c60e8b50'
// Real 402 amounts captured from stablestudio on Tempo mainnet, 2026-10-10 (unpaid).
const Q = { listed: '39000', validPrompt: '70000', missingPrompt: '10000000' }

describe('quote-cap: stablestudio replay', () => {
  it('finds the catalog listing for nano-banana at $0.039', () => {
    expect(findListing(book, 'POST', NB)?.amount).toBe('39000')
    expect(findListing(book, 'post', NB + '?x=1')?.service).toBe('stablestudio')
  })
  it('refuses the $10.00 quote for a $0.039 listing before signing', () => {
    const v = checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url: NB, amount: Q.missingPrompt, currency: USDCE })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.reason).toBe('above_listing')
      expect(v.listed).toBe(39000n)
      expect(v.quoted).toBe(10_000_000n)
      expect(v.message).toContain('$10.00')
      expect(v.message).toContain('$0.039')
    }
  })
  it('pays the listed amount', () => {
    expect(checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url: NB, amount: Q.listed, currency: USDCE }).ok).toBe(true)
  })
  it('refuses $0.07 at 0 tolerance, allows it at 2x, still refuses $10 at 2x', () => {
    expect(checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url: NB, amount: Q.validPrompt }).ok).toBe(false)
    const twoX = { ...DEFAULT_QUOTE_CAP, toleranceBps: 10_000 }
    expect(checkQuote(book, twoX, { method: 'POST', url: NB, amount: Q.validPrompt }).ok).toBe(true)
    const v = checkQuote(book, twoX, { method: 'POST', url: NB, amount: Q.missingPrompt })
    expect(v.ok).toBe(false)
    expect(v.ceiling).toBe(78000n)
  })
})

describe('quote-cap: edges', () => {
  it('the per-call cap binds below the listing ceiling', () => {
    const v = checkQuote(book, { toleranceBps: 10_000, maxPerCall: 50_000n, unlisted: 'cap' }, { method: 'POST', url: NB, amount: '70000' })
    expect(v.ok).toBe(false)
    expect(v.ceiling).toBe(50_000n)
  })
  it('unlisted endpoints: capped by maxPerCall, or refused outright', () => {
    const url = 'https://unknown.example/api/x'
    expect(checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url, amount: '1000' }).ok).toBe(true)
    const big = checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url, amount: '2000000' })
    expect(!big.ok && big.reason).toBe('above_max_per_call')
    const r = checkQuote(book, { ...DEFAULT_QUOTE_CAP, unlisted: 'refuse' }, { method: 'POST', url, amount: '1' })
    expect(!r.ok && r.reason).toBe('unlisted')
  })
  it('refuses a quote in a different currency than the listing', () => {
    const v = checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url: NB, amount: '39000', currency: '0x20c0000000000000000000000000000000000001' })
    expect(!v.ok && v.reason).toBe('currency_mismatch')
  })
  it('refuses garbage and negative amounts', () => {
    expect(checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url: NB, amount: 'abc' }).ok).toBe(false)
    expect(checkQuote(book, DEFAULT_QUOTE_CAP, { method: 'POST', url: NB, amount: '-1' }).ok).toBe(false)
  })
  it('formats smallest units as dollars', () => {
    expect(formatUnits(39000n)).toBe('0.039')
    expect(formatUnits(10_000_000n)).toBe('10.00')
    expect(formatUnits(0n)).toBe('0.00')
  })
})

describe('route', () => {
  it('ranks sellers of the same API by listed price', () => {
    const plans = allRoutes(book)
    expect(plans.map((p) => p.group.id).sort()).toEqual(['apollo/people-search', 'firecrawl/scrape', 'hunter/email-verifier'])
    const hunter = plans.find((p) => p.group.id === 'hunter/email-verifier')!
    expect(hunter.cheapest.amount).toBe(8000n)
    expect(hunter.priciest.amount).toBe(30000n)
    expect(hunter.savingPerCall).toBe(22000n)
    expect(hunter.savingBps).toBe(7333)
  })
  it('points a request at its cheaper seller', () => {
    const p = routeFor(book, 'POST', 'https://stableenrich.dev/api/firecrawl/scrape')!
    expect(p.cheapest.url).toBe('https://firecrawl.mpp.tempo.xyz/v1/scrape')
    expect(p.savingPerCall).toBe(10600n)
    expect(routeFor(book, 'POST', NB)).toBeNull()
  })
})
