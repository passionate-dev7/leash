/**
 * Mainnet teams against a running desk, read only. Nothing here signs or sends: the desk registers a
 * mainnet team for a funded account, reads its USDC.e balance from chain 4217, and plans an agent
 * authorization the browser would sign. The balance is checked against an independent read of the same chain.
 *
 *   LEASH_MAINNET=1 pnpm --filter @leash/api start        (in another shell)
 *   pnpm --filter @leash/api e2e:mainnet
 *
 * The account is the payer of the real mainnet settlement saved in test/fixtures/mainnet-settlement.json:
 * a funded address whose balance cannot read as zero by accident.
 */
import { readFileSync } from 'node:fs'
import { createPublicClient, erc20Abi, http } from 'viem'
import type { Address } from 'viem'
import { tempo } from 'viem/chains'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { NETWORKS } from '@leash/sdk'

const API = (process.env['LEASH_API_URL'] ?? 'http://127.0.0.1:4180').replace(/\/+$/, '')
const fixture = JSON.parse(readFileSync(new URL('../test/fixtures/mainnet-settlement.json', import.meta.url), 'utf8')) as { settlements: { claim: { account: Address } }[] }
const ACCOUNT = fixture.settlements[0]!.claim.account
const USDCE = NETWORKS.mainnet.settlementToken

type Json = Record<string, any>
function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${message}`)
}
async function api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${API}${path}`, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000) })
  const json = (await res.json()) as Json
  check(res.ok, `${method} ${path} answered ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

const health = await api('GET', '/api/health')
check(health.mainnet === true, 'GET /api/health says mainnet is off: start the API with LEASH_MAINNET=1')

const made = await api('POST', '/api/teams', { account: ACCOUNT, label: 'mainnet read check', signer: 'webcrypto', network: 'mainnet' })
check(made.team.network === 'mainnet', `team network is ${made.team.network}`)

const view = await api('GET', `/api/teams/${ACCOUNT}`)
check(view.team.network === 'mainnet', 'GET team does not say mainnet')
check(view.balance.chainId === 4217, `balance read from chain ${view.balance.chainId}`)
check(view.balance.token.toLowerCase() === USDCE.toLowerCase(), `balance token ${view.balance.token}`)
check(view.balance.error === null && view.balance.units !== null, `balance read failed: ${view.balance.error}`)
const units = BigInt(view.balance.units)
check(units > 0n, 'the funded account reads as empty: a zero balance proves nothing')

const chain = createPublicClient({ chain: tempo, transport: http(NETWORKS.mainnet.rpcUrl, { retryCount: 3 }) })
check((await chain.getChainId()) === 4217, 'independent client is not on 4217')
const block = BigInt(view.balance.block)
const independent: bigint[] = []
for (const back of [0n, 1n, 2n, 3n]) independent.push(await chain.readContract({ address: USDCE, abi: erc20Abi, functionName: 'balanceOf', args: [ACCOUNT], blockNumber: block - back }))
check(independent.includes(units), `desk read ${units}, independent reads at ${block}..${block - 3n} are ${independent.join(', ')}`)
console.log(`mainnet team ${ACCOUNT}: ${units} USDC.e units at block ${block} (chain 4217), independent read agrees`)

const catalog = await api('GET', '/api/catalog?network=mainnet')
check(catalog.services.length > 20, 'the mainnet catalog is empty')
const planned = await api('POST', `/api/teams/${ACCOUNT}/agents`, { name: 'read check', budget: '1.00', periodSeconds: 86_400, serviceIds: [catalog.services[0].serviceId], external: true, keyId: privateKeyToAddress(generatePrivateKey()) })
check(planned.authorize.limits[0].token.toLowerCase() === USDCE.toLowerCase(), 'the authorization is not denominated in USDC.e')
console.log(`agent authorization planned in USDC.e for ${catalog.services[0].serviceId}, scoped to ${planned.authorize.scopes[0].recipients.join(', ')}`)

const run = await fetch(`${API}/api/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: ACCOUNT }) })
check(run.status === 409, `the faucet answered ${run.status} for a mainnet team, wanted 409`)
console.log('faucet refused with 409 for the mainnet team. PASS')
