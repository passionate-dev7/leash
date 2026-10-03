/**
 * Mainnet teams against a running desk on this machine, read only. No transaction is sent on any chain.
 * A throwaway root key signs the team's desk writes the way the browser does: it registers a mainnet
 * team, plans an agent authorization, and a stranger's write is refused. The desk reads its USDC.e
 * balance from chain 4217, and a second, funded account has its balance read and checked against an
 * independent read of the same chain.
 *
 *   LEASH_MAINNET=1 pnpm --filter @leash/api start        (in another shell)
 *   pnpm --filter @leash/api e2e:mainnet
 *
 * The funded account is the payer of the real mainnet settlement saved in test/fixtures/mainnet-settlement.json:
 * an address whose balance cannot read as zero by accident. Its key is not ours, so the script writes its
 * team row into this machine's desk database, the way an operator seeds a team, and the desk does the reading.
 */
import { readFileSync } from 'node:fs'
import { createPublicClient, erc20Abi, http } from 'viem'
import type { Address } from 'viem'
import { tempo } from 'viem/chains'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { Account } from 'viem/tempo'
import { signDeskRequest } from '@leash/policy'
import type { DeskSigner } from '@leash/policy'
import { NETWORKS } from '@leash/sdk'
import { openDatabase } from '../src/db.js'

const API = (process.env['LEASH_API_URL'] ?? 'http://127.0.0.1:4180').replace(/\/+$/, '')
const fixture = JSON.parse(readFileSync(new URL('../test/fixtures/mainnet-settlement.json', import.meta.url), 'utf8')) as { settlements: { claim: { account: Address } }[] }
const ACCOUNT = fixture.settlements[0]!.claim.account
const USDCE = NETWORKS.mainnet.settlementToken

type Json = Record<string, any>
function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${message}`)
}
const root = Account.fromSecp256k1(generatePrivateKey()) as unknown as DeskSigner
const MAINNET_CHAIN_ID = 4217

async function send(method: 'GET' | 'POST', path: string, body?: unknown, signer: DeskSigner | null = null): Promise<{ status: number; json: Json }> {
  const auth = signer ? await signDeskRequest(signer, { method, path, chainId: MAINNET_CHAIN_ID, body: body ?? {} }) : {}
  const res = await fetch(`${API}${path}`, { method, headers: body === undefined ? auth : { 'content-type': 'application/json', ...auth }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000) })
  return { status: res.status, json: (await res.json()) as Json }
}
async function api(method: 'GET' | 'POST', path: string, body?: unknown, signer: DeskSigner | null = null): Promise<Json> {
  const r = await send(method, path, body, signer)
  check(r.status >= 200 && r.status < 300, `${method} ${path} answered ${r.status}: ${JSON.stringify(r.json).slice(0, 300)}`)
  return r.json
}

const health = await api('GET', '/api/health')
check(health.mainnet === true, 'GET /api/health says mainnet is off: start the API with LEASH_MAINNET=1')

// A team is created by its own key. Anyone else, signed or not, is refused.
const registration = { account: root.address, label: 'mainnet signed check', signer: 'webcrypto', network: 'mainnet' }
check((await send('POST', '/api/teams', registration)).status === 401, 'an unsigned mainnet team registration must be refused')
check((await send('POST', '/api/teams', registration, Account.fromSecp256k1(generatePrivateKey()) as unknown as DeskSigner)).status === 401, 'a registration signed by another key must be refused')
const made = await api('POST', '/api/teams', registration, root)
check(made.team.network === 'mainnet', `team network is ${made.team.network}`)
const fresh = await api('GET', `/api/teams/${root.address}`)
check(fresh.balance.chainId === 4217 && fresh.balance.error === null && fresh.balance.units === '0', `the new team's balance read: ${JSON.stringify(fresh.balance)}`)
console.log(`signed mainnet team ${root.address} registered; stranger registrations refused (401); balance read from chain 4217: ${fresh.balance.units}`)

// The funded account: seed its row on this machine, then the desk reads its balance from chain.
const seeded = openDatabase()
seeded.prepare("insert or ignore into team(account, label, signer, created_at, network) values (?, 'mainnet read check', 'webcrypto', ?, 'mainnet')").run(ACCOUNT, new Date().toISOString())
seeded.close()
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
const plan = { name: 'read check', budget: '1.00', periodSeconds: 86_400, serviceIds: [catalog.services[0].serviceId], external: true, keyId: privateKeyToAddress(generatePrivateKey()) }
check((await send('POST', `/api/teams/${ACCOUNT}/agents`, plan)).status === 401, 'an unsigned agent registration on the funded team must be refused')
check((await send('POST', `/api/teams/${ACCOUNT}/agents`, plan, root)).status === 401, "a signature by another key must not register an agent on the funded team")
const planned = await api('POST', `/api/teams/${root.address}/agents`, plan, root)
check(planned.authorize.limits[0].token.toLowerCase() === USDCE.toLowerCase(), 'the authorization is not denominated in USDC.e')
console.log(`agent authorization planned in USDC.e for ${catalog.services[0].serviceId}, scoped to ${planned.authorize.scopes[0].recipients.join(', ')}`)

const run = await fetch(`${API}/api/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: root.address }) })
check(run.status === 409, `the faucet answered ${run.status} for a mainnet team, wanted 409`)
console.log('faucet refused with 409 for the mainnet team. PASS')
