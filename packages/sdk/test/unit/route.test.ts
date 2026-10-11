import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { DEFAULT_QUOTE_CAP, loadPriceBook } from '@leash/policy'
import { createLeashFetch, NETWORKS } from '../../src/index.js'

/**
 * Route in the payment path: a request for the pricier seller of the same upstream API is sent
 * to the cheapest listed seller, query string kept, and the quote check then holds that seller to
 * its own listing. fetch is stubbed: no network, no chain, no money.
 */
const PRICEY = 'https://stableenrich.dev/api/hunter/email-verifier'
const CHEAP = 'https://hunter.mpp.paywithlocus.com/hunter/email-verifier'
const USDCE = '0x20c000000000000000000000b9537d11c60e8b50'
let quoted = '10000000'
let hits: string[] = []

beforeEach(() => {
  hits = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://')) {
      if (!url.includes('rpc')) {
        hits.push(url)
        const request = Buffer.from(JSON.stringify({ amount: quoted, currency: USDCE, methodDetails: { chainId: 4217 }, recipient: '0x00000000000000000000000000000000000000aa' })).toString('base64url')
        const expires = new Date(Date.now() + 300_000).toISOString()
        return new Response('{}', { status: 402, headers: { 'www-authenticate': `Payment id="r-${quoted}", realm="x", method="tempo", intent="charge", request="${request}", expires="${expires}"` } })
      }
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { id: number; method: string }
    const result = body.method === 'eth_blockNumber' ? '0x10' : body.method === 'eth_chainId' ? '0x1079' : null
    if (result === null) return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'stub: no chain' } })
    return Response.json({ jsonrpc: '2.0', id: body.id, result })
  })
})
afterEach(() => vi.unstubAllGlobals())

const agent = () => { const a = privateKeyToAccount(generatePrivateKey()); return Object.assign(a, { accessKeyAddress: a.address }) as never }
const book = loadPriceBook()
const post = { method: 'POST', body: '{"email":"a@b.co"}', headers: { 'content-type': 'application/json' } }

describe('Route in the payment path', () => {
  it('sends the request to the cheapest listed seller and records the reroute', async () => {
    quoted = '10000000' // the cheap seller over-quotes, so the guard refuses and we get the record back
    const f = createLeashFetch({ network: NETWORKS.mainnet, agent: agent(), route: true, quoteCap: { book, policy: DEFAULT_QUOTE_CAP } })
    const { record } = await f(PRICEY + '?v=1', post)
    expect(hits).toEqual([CHEAP + '?v=1'])
    expect(record.url).toBe(CHEAP + '?v=1')
    expect(record.routed).toMatchObject({ from: PRICEY + '?v=1', to: CHEAP + '?v=1', savingPerCall: '22000' })
    expect(record.quote).toMatchObject({ listed: '8000', ok: false })
    expect(record.cheaper).toBeNull()
  })

  it('the routed seller at its listing passes the guard and goes on to signing', async () => {
    quoted = '8000'
    const f = createLeashFetch({ network: NETWORKS.mainnet, agent: agent(), route: true, quoteCap: { book, policy: DEFAULT_QUOTE_CAP } })
    await expect(f(PRICEY, post)).rejects.not.toThrow(/QuoteCapExceeded/)
    expect(hits).toEqual([CHEAP])
  })

  it('without route, the requested seller is called and the cheaper one is only reported', async () => {
    quoted = '10000000'
    const f = createLeashFetch({ network: NETWORKS.mainnet, agent: agent(), quoteCap: { book, policy: DEFAULT_QUOTE_CAP } })
    const { record } = await f(PRICEY, post)
    expect(hits).toEqual([PRICEY])
    expect(record.routed).toBeNull()
    expect(record.cheaper).toMatchObject({ url: CHEAP, amount: '8000' })
  })

  it('a request already at the cheapest seller is not rerouted', async () => {
    quoted = '10000000'
    const f = createLeashFetch({ network: NETWORKS.mainnet, agent: agent(), route: true, quoteCap: { book, policy: DEFAULT_QUOTE_CAP } })
    const { record } = await f(CHEAP, post)
    expect(hits).toEqual([CHEAP])
    expect(record.routed).toBeNull()
  })
})
