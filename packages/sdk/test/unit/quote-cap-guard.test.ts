import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { DEFAULT_QUOTE_CAP, loadPriceBook } from '@leash/policy'
import { createLeashFetch, NETWORKS, quoteCapOnChallenge, QuoteCapExceeded } from '../../src/index.js'

/**
 * Replays stablestudio's real Tempo-mainnet 402 challenges (captured unpaid 2026-10-10,
 * round2/evidence/challenge-vs-catalog.json) through the payment path. fetch is stubbed:
 * no network, no chain, no money. A refusal must happen before any credential is signed,
 * which we observe as: no retry carrying an Authorization header, and no signing RPC calls.
 */
const NB = 'https://stablestudio.dev/api/generate/nano-banana/generate'
const RECIPIENT = '0x07F067959297767c887dbfA3C72379c66E82a045'
const USDCE = '0x20c000000000000000000000b9537d11c60e8b50'

function challengeHeader(amount: string): string {
  const request = Buffer.from(
    JSON.stringify({ amount, currency: USDCE, methodDetails: { chainId: 4217 }, recipient: RECIPIENT }),
  ).toString('base64url')
  const expires = new Date(Date.now() + 5 * 60_000).toISOString()
  return `Payment id="replay-${amount}", realm="stablestudio.dev", method="tempo", intent="charge", request="${request}", expires="${expires}"`
}

let quoted = '10000000'
let paidRetries = 0
let rpcMethods: string[] = []

beforeEach(() => {
  paidRetries = 0
  rpcMethods = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (url.startsWith('https://stablestudio.dev')) {
      if (headers.get('authorization')) {
        paidRetries++
        return new Response('{"ok":true}', { status: 200 })
      }
      return new Response('{"error":"payment required"}', { status: 402, headers: { 'www-authenticate': challengeHeader(quoted) } })
    }
    // JSON-RPC stub: answers reads, fails anything that would sign or send.
    const body = JSON.parse(String(init?.body ?? '{}')) as { id: number; method: string }
    rpcMethods.push(body.method)
    const result = body.method === 'eth_blockNumber' ? '0x10' : body.method === 'eth_chainId' ? '0x1079' : null
    if (result === null) return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'stub: no chain in unit tests' } })
    return Response.json({ jsonrpc: '2.0', id: body.id, result })
  })
})
afterEach(() => vi.unstubAllGlobals())

function agent() {
  const a = privateKeyToAccount(generatePrivateKey())
  return Object.assign(a, { accessKeyAddress: a.address }) as never
}

const book = loadPriceBook()
const post = { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }

describe('quote-cap guard in the mppx payment path', () => {
  it('refuses the real $10.00 stablestudio quote for a $0.039 listing, before signing', async () => {
    quoted = '10000000'
    const leashFetch = createLeashFetch({ network: NETWORKS.mainnet, agent: agent(), quoteCap: { book, policy: DEFAULT_QUOTE_CAP } })
    const { response, record } = await leashFetch(NB, post)
    expect(response).toBeNull()
    expect(record.outcome).toBe('refused')
    expect(record.refused).toBe('QuoteCapExceeded')
    expect(record.quote).toMatchObject({ listed: '39000', quoted: '10000000', ok: false, reason: 'above_listing' })
    expect(record.amount).toBe('10000000')
    expect(paidRetries).toBe(0)
    expect(rpcMethods.filter((m) => m !== 'eth_blockNumber')).toEqual([])
  })

  it('lets the listed $0.039 quote through to signing', async () => {
    quoted = '39000'
    const leashFetch = createLeashFetch({ network: NETWORKS.mainnet, agent: agent(), quoteCap: { book, policy: DEFAULT_QUOTE_CAP } })
    // The stub chain cannot sign, so the payment errors downstream of the guard: proof the guard passed it.
    await expect(leashFetch(NB, post)).rejects.not.toThrow(/QuoteCapExceeded/)
    expect(rpcMethods.some((m) => m !== 'eth_blockNumber')).toBe(true)
  })

  it('without quoteCap, the default client would go on to sign the $10.00 quote', async () => {
    quoted = '10000000'
    const leashFetch = createLeashFetch({ network: NETWORKS.mainnet, agent: agent() })
    await expect(leashFetch(NB, post)).rejects.toThrow()
    expect(rpcMethods.some((m) => m !== 'eth_blockNumber')).toBe(true)
  })

  it('$0.07 passes with a 2x tolerance and records the listing it was checked against', async () => {
    quoted = '70000'
    const leashFetch = createLeashFetch({
      network: NETWORKS.mainnet,
      agent: agent(),
      quoteCap: { book, policy: { ...DEFAULT_QUOTE_CAP, toleranceBps: 10_000 } },
    })
    await expect(leashFetch(NB, post)).rejects.not.toThrow(/QuoteCapExceeded/)
  })
})

describe('quoteCapOnChallenge: the hook for a plain mppx client', () => {
  const challenge = (amount: string) => ({ realm: 'stablestudio.dev', request: { amount, currency: USDCE, recipient: RECIPIENT } })
  const target = { method: 'POST', url: NB }

  it('throws on the $10.00 quote for a $0.039 listing, with a target or by realm', async () => {
    await expect(quoteCapOnChallenge(book, DEFAULT_QUOTE_CAP, target)(challenge('10000000'))).rejects.toThrow(/QuoteCapExceeded/)
    await expect(quoteCapOnChallenge(book, DEFAULT_QUOTE_CAP)(challenge('10000000'))).rejects.toBeInstanceOf(QuoteCapExceeded)
  })

  it('returns undefined (mppx signs normally) for the listed $0.039 quote', async () => {
    await expect(quoteCapOnChallenge(book, DEFAULT_QUOTE_CAP, target)(challenge('39000'))).resolves.toBeUndefined()
    await expect(quoteCapOnChallenge(book, DEFAULT_QUOTE_CAP)(challenge('39000'))).resolves.toBeUndefined()
  })
})
