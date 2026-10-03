import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { after, before, test } from 'node:test'
import type { Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { agentNetwork, NETWORKS, signRecord } from '@leash/sdk'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from '../src/app.js'
import { openDatabase } from '../src/db.js'
import { mainnetServices } from '../src/mainnet.js'
import { createRunner } from '../src/runner.js'
import { mainnetServicesPaying } from '../src/services.js'
import { ACCOUNT, caller, MAINNET_ROOT, MAINNET_TEAM, memoryStore, record } from './helpers.js'
import type { TestStore } from './helpers.js'

const USDCE = NETWORKS.mainnet.settlementToken
const OUSD: Address = '0x20c0000000000000000000006a37DA5C996874BE'
const SPONSOR = '0x4444444444444444444444444444444444444444'
const KEY_ID = privateKeyToAccount(generatePrivateKey()).address
// 0xca4e pays 12 services in the live 402 probe of 2026-10-03: the shared-payout case on mainnet.
const OPENAI_PAYOUT: Address = '0xca4e835f803cb0b7c428222b3a3b98518d4779fe'
const UNKNOWN_PAYOUT: Address = '0x7777777777777777777777777777777777777777'

type Desk = { server: Server; base: string; store: TestStore }
async function desk(mainnet: boolean): Promise<Desk> {
  const store = memoryStore()
  const handle = createApp({ store, runner: createRunner(store), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: SPONSOR, mainnet })
  const server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, store }
}
const call = (d: Desk) => caller(() => d.base)
/** The same caller signing as the mainnet team's root. */
const mcall = (d: Desk) => {
  const c = call(d)
  return (method: 'GET' | 'POST', path: string, body?: unknown) => c(method, path, body, { as: MAINNET_ROOT })
}

let off: Desk
let on: Desk
before(async () => {
  off = await desk(false)
  on = await desk(true)
})
after(() => {
  off.server.close()
  on.server.close()
})

test('agentNetwork: mainnet pays budget, payments and gas in USDC.e with no sponsor; moderato in OUSD', () => {
  const m = agentNetwork('mainnet')
  assert.equal(m.chainId, 4217)
  assert.equal(m.feeToken, USDCE)
  assert.equal(m.settlementToken, USDCE)
  assert.equal(m.sponsorUrl, undefined)
  const t = agentNetwork('moderato')
  assert.equal(t.chainId, 42431)
  assert.equal(t.feeToken, OUSD)
  assert.equal(t.settlementToken, OUSD)
})

test('health reports whether this desk runs mainnet teams', async () => {
  // health reads the chain; both desks answer from the same Moderato RPC
  assert.equal((await call(off)('GET', '/api/health')).json['mainnet'], false)
  assert.equal((await call(on)('GET', '/api/health')).json['mainnet'], true)
})

test('a mainnet team is refused with 400 unless the desk runs with mainnet on; a bad network is a 422', async () => {
  const r = await call(off)('POST', '/api/teams', { account: MAINNET_TEAM, label: 'm', signer: 'webcrypto', network: 'mainnet' })
  assert.equal(r.status, 400)
  assert.equal(r.json['error'], 'mainnet_disabled')
  assert.equal(off.store.team(MAINNET_TEAM), undefined, 'a refused team writes nothing')
  assert.equal((await call(off)('GET', '/api/catalog?network=mainnet')).status, 400)
  assert.equal((await call(on)('POST', '/api/teams', { account: MAINNET_TEAM, label: 'm', signer: 'webcrypto', network: 'ropsten' })).status, 422)

  const moderato = await call(off)('POST', '/api/teams', { account: ACCOUNT, label: 't', signer: 'webcrypto' })
  assert.equal(moderato.status, 200)
  assert.equal(moderato.json['team'].network, 'moderato', 'moderato is the default')
})

test('a mainnet team keeps its network: another network on the same account is a 409', async () => {
  const d = mcall(on)
  const made = await d('POST', '/api/teams', { account: MAINNET_TEAM, label: 'ops', signer: 'webcrypto', network: 'mainnet' })
  assert.equal(made.status, 200)
  assert.equal(made.json['team'].network, 'mainnet')
  const again = await d('POST', '/api/teams', { account: MAINNET_TEAM, label: 'ops renamed', signer: 'webcrypto', network: 'mainnet' })
  assert.equal(again.status, 200)
  assert.equal(on.store.team(MAINNET_TEAM)!.label, 'ops renamed')
  const flip = await call(on)('POST', '/api/teams', { account: MAINNET_TEAM, label: 'ops', signer: 'webcrypto', network: 'moderato' }, { as: { ...MAINNET_ROOT, chainId: 42431 } })
  assert.equal(flip.status, 409)
  assert.equal(flip.json['error'], 'network_mismatch')
  assert.equal(on.store.team(MAINNET_TEAM)!.network, 'mainnet')
})

test('mainnet agents must be external and scoped to USDC.e payouts from the live probe; the desk never runs or funds them', async () => {
  const d = mcall(on)
  const services = mainnetServices()
  assert.ok(services.length > 20, 'the live probe names mainnet services')
  const openai = services.find((s) => s.serviceId === 'openai')!
  assert.equal(openai.recipient.toLowerCase(), OPENAI_PAYOUT)
  const AGENT = { name: 'outside', budget: '2.50', periodSeconds: 86_400, serviceIds: ['openai'] }

  const inside = await d('POST', `/api/teams/${MAINNET_TEAM}/agents`, AGENT)
  assert.equal(inside.status, 409)
  assert.equal(inside.json['error'], 'mainnet_requires_external')
  const moderatoService = await d('POST', `/api/teams/${MAINNET_TEAM}/agents`, { ...AGENT, serviceIds: ['atlas-scrape'], external: true, keyId: KEY_ID })
  assert.equal(moderatoService.status, 422, 'a Moderato vendor is not a mainnet service')

  const ok = await d('POST', `/api/teams/${MAINNET_TEAM}/agents`, { ...AGENT, external: true, keyId: KEY_ID })
  assert.equal(ok.status, 200)
  const authorize = ok.json['authorize']
  assert.equal(authorize.limits[0].token, USDCE)
  assert.equal(authorize.limits[0].limit, '2500000')
  assert.equal(authorize.scopes[0].address, USDCE)
  assert.deepEqual(authorize.scopes[0].recipients.map((r: string) => r.toLowerCase()), [OPENAI_PAYOUT])
  assert.ok(ok.json['reach'].length > 1 && ok.json['reach'].includes('anthropic'), 'a shared payout reaches its siblings')
  assert.equal(on.store.agent(KEY_ID)!.token.toLowerCase(), USDCE.toLowerCase())
  assert.equal(on.store.agent(KEY_ID)!.private_key, '')

  on.store.setAgentStatus(KEY_ID, 'active', `0x${'cd'.repeat(32)}`)
  for (const [path, body] of [['run', { topic: 'x' }], ['call', { serviceId: 'atlas-search', input: { q: 'x' } }]] as const) {
    const r = await d('POST', `/api/agents/${KEY_ID}/${path}`, body)
    assert.equal(r.status, 409, path)
    assert.equal(r.json['error'], 'mainnet_team')
  }
  const faucet = await d('POST', '/api/faucet', { address: MAINNET_TEAM })
  assert.equal(faucet.status, 409)
  assert.equal(faucet.json['error'], 'mainnet_team')
})

test('a mainnet record that pays in another token is rejected before any chain read', async () => {
  const d = mcall(on)
  const rec = {
    ...record({ serviceId: 'openai', outcome: 'delivered' }),
    keyId: KEY_ID,
    account: MAINNET_TEAM,
    url: 'https://api.example.com/v1/chat',
    recipient: OPENAI_PAYOUT,
    currency: OUSD,
    memo: `0x${'12'.repeat(32)}` as const,
    status: 200,
  }
  // The settlement check comes after the signature check, so the agent must be one whose key this test holds.
  const held = generatePrivateKey()
  const heldId = privateKeyToAccount(held).address
  await d('POST', `/api/teams/${MAINNET_TEAM}/agents`, { name: 'held', budget: '1', periodSeconds: 3600, serviceIds: ['openai'], external: true, keyId: heldId })
  on.store.setAgentStatus(heldId, 'active', `0x${'ce'.repeat(32)}`)
  const mine = { ...rec, keyId: heldId }
  const r = await d('POST', `/api/agents/${heldId}/records`, { record: mine, signature: await signRecord(held, mine) })
  assert.equal(r.status, 422)
  assert.equal(r.json['error'], 'settlement_not_confirmed')
  assert.match(r.json['detail'], /mainnet teams settle in 0x20c000000000000000000000b9537d11c60e8b50/)
  assert.equal(on.store.allRecords(MAINNET_TEAM).length, 0)
})

test('the vendors roll-up of a mainnet team names services from the live payout map, and shows an unknown payout as its address', async () => {
  const d = mcall(on)
  const seed = (recipient: Address, outcome: 'delivered' | 'paid_not_delivered') =>
    on.store.insertRecord({ ...record({ serviceId: 'x', outcome }), account: MAINNET_TEAM, keyId: KEY_ID, recipient, currency: USDCE, amount: '5000' }, { agentName: 'outside', vendorId: 'external', serviceId: 'api.example.com/v1/x' }, 'external')
  for (let i = 0; i < 3; i++) seed(OPENAI_PAYOUT, 'delivered')
  seed(OPENAI_PAYOUT, 'paid_not_delivered')
  seed(UNKNOWN_PAYOUT, 'delivered')

  const rows = (await d('GET', `/api/teams/${MAINNET_TEAM}/vendors`)).json['services'] as any[]
  assert.equal(rows.length, 2)
  const known = rows.find((r) => r.recipient.toLowerCase() === OPENAI_PAYOUT)
  assert.deepEqual(known.services, mainnetServicesPaying(OPENAI_PAYOUT))
  assert.ok(known.services.length >= 12 && known.services.includes('openai'))
  assert.equal(known.paid, 4)
  assert.equal(known.delivered, 3)
  assert.equal(known.paidNotDelivered, 1)
  assert.equal(known.spent, '20000')
  const unknown = rows.find((r) => r.recipient.toLowerCase() === UNKNOWN_PAYOUT)
  assert.deepEqual(unknown.services, [])
  assert.equal(unknown.paid, 1)

  // A Moderato team's roll-up is still the Moderato catalog.
  await call(off)('POST', '/api/teams', { account: ACCOUNT, label: 't', signer: 'webcrypto' })
  const moderato = (await call(off)('GET', `/api/teams/${ACCOUNT}/vendors`)).json['services'] as any[]
  assert.ok(moderato.some((r) => r.serviceId === 'atlas-scrape' && r.vendorId === 'atlas'))
})

test('teams created before mainnet teams existed read back as moderato teams', () => {
  const dir = mkdtempSync(`${tmpdir()}/leash-db-`)
  const file = `${dir}/old.db`
  try {
    const old = new DatabaseSync(file)
    old.exec("create table team (account text primary key, label text not null, signer text not null check (signer in ('passkey', 'webcrypto')), created_at text not null)")
    old.prepare('insert into team values (?, ?, ?, ?)').run(ACCOUNT, 'legacy', 'passkey', '2026-09-30T00:00:00.000Z')
    old.close()
    const db = openDatabase(file)
    assert.deepEqual(db.prepare('select account, label, network from team').all().map((r) => ({ ...r })), [{ account: ACCOUNT, label: 'legacy', network: 'moderato' }])
    assert.throws(() => db.prepare("insert into team(account, label, signer, created_at, network) values ('0x01', 'x', 'passkey', 'now', 'ropsten')").run(), /constraint/i)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
