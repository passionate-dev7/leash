// Outside-user replay: README snippet with a local fake stablestudio 402. No network, no chain, no money.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { loadPriceBook, DEFAULT_QUOTE_CAP } from '@leash/policy'
import { createLeashFetch, NETWORKS } from '../src/index.js'
const NB = 'https://stablestudio.dev/api/generate/nano-banana/generate'
const hdr = (amount: string) => `Payment id="r-${amount}", realm="stablestudio.dev", method="tempo", intent="charge", request="${Buffer.from(JSON.stringify({ amount, currency: '0x20c000000000000000000000b9537d11c60e8b50', methodDetails: { chainId: 4217 }, recipient: '0x07F067959297767c887dbfA3C72379c66E82a045' })).toString('base64url')}", expires="${new Date(Date.now() + 3e5).toISOString()}"`
let quoted = '10000000', signedRetries = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.url ?? input.href
  if (url.startsWith('https://stablestudio.dev')) {
    if (new Headers(init?.headers).get('authorization')) { signedRetries++; return new Response('{}', { status: 200 }) }
    return new Response('{}', { status: 402, headers: { 'www-authenticate': hdr(quoted) } })
  }
  const b = JSON.parse(String(init?.body ?? '{}'))
  const r = b.method === 'eth_chainId' ? '0x1079' : b.method === 'eth_blockNumber' ? '0x10' : null
  return Response.json(r ? { jsonrpc: '2.0', id: b.id, result: r } : { jsonrpc: '2.0', id: b.id, error: { code: -32000, message: 'no chain' } })
}) as typeof fetch
const a = privateKeyToAccount(generatePrivateKey())
const agent = Object.assign(a, { accessKeyAddress: a.address }) as any
const pay = createLeashFetch({ network: NETWORKS.mainnet, agent, settleTimeoutMs: 100, quoteCap: { book: loadPriceBook(), policy: { ...DEFAULT_QUOTE_CAP, toleranceBps: 10_000 } } })
const { record } = await pay(NB, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
console.log('refused:', record.refused, 'quote:', JSON.stringify(record.quote, (_k, v) => typeof v === 'bigint' ? v.toString() : v), 'signed retries:', signedRetries)
globalThis.fetch = realFetch
