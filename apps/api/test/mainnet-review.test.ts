import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'
import type { Address } from 'viem'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import type { Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Abis, Addresses } from 'viem/tempo'
import { NETWORKS, signRecord } from '@leash/sdk'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from '../src/app.js'
import { assertNotBeforeSettlement, parseRecord, settlementProof } from '../src/external.js'
import { createReplayCache, mainnetServices, replayWindow } from '../src/mainnet.js'
import type { MainnetReplay } from '../src/mainnet.js'
import { createRunner } from '../src/runner.js'
import { createRateLimiter } from '../src/limit.js'
import { evidenceOf } from '../src/vendors.js'
import { ACCOUNT, caller, MAINNET_ROOT, MAINNET_TEAM, memoryStore, record } from './helpers.js'
import type { TestStore } from './helpers.js'

/** The reviewer's scratch tests from docs/SECURITY-REVIEW-MAINNET.md, ported unchanged in what they assert. */

const VICTIM: Address = MAINNET_TEAM
let onServer: Server, onBase: string, onStore: TestStore
let offServer: Server, offBase: string, offStore: TestStore
const SERVICE = mainnetServices()[0]!.serviceId

async function call(method: 'GET' | 'POST', path: string, body?: unknown, at = onBase) {
  const res = await fetch(`${at}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) })
  return { status: res.status, json: (await res.json()) as Record<string, any> }
}

before(async () => {
  onStore = memoryStore()
  const onHandle = createApp({ store: onStore, runner: createRunner(onStore), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: '0x4444444444444444444444444444444444444444', mainnet: true })
  onServer = createServer((req, res) => void onHandle(req, res))
  await new Promise<void>((r) => onServer.listen(0, '127.0.0.1', r))
  onBase = `http://127.0.0.1:${(onServer.address() as { port: number }).port}`
  onStore.upsertTeam(VICTIM, 'victim ops', 'passkey', 'mainnet')
  // LEASH_MAINNET unset: mainnet false. The victim's mainnet team exists from an earlier enable.
  offStore = memoryStore()
  const offHandle = createApp({ store: offStore, runner: createRunner(offStore), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: '0x4444444444444444444444444444444444444444', mainnet: false })
  offServer = createServer((req, res) => void offHandle(req, res))
  await new Promise<void>((r) => offServer.listen(0, '127.0.0.1', r))
  offBase = `http://127.0.0.1:${(offServer.address() as { port: number }).port}`
  offStore.upsertTeam(VICTIM, 'victim ops', 'passkey', 'mainnet')
})
after(() => {
  onServer.close()
  offServer.close()
})

test('H1: a caller who is not the team cannot rename it or fill its agent slots', async () => {
  const rename = await call('POST', '/api/teams', { account: VICTIM, label: 'pwned', signer: 'webcrypto', network: 'mainnet' })
  const renamed = onStore.team(VICTIM)!.label === 'pwned' && onStore.team(VICTIM)!.signer === 'webcrypto'
  for (let i = 0; i < 25; i++)
    await call('POST', `/api/teams/${VICTIM}/agents`, { name: `junk${i}`, budget: '1', periodSeconds: 86400, serviceIds: [SERVICE], external: true, keyId: privateKeyToAccount(generatePrivateKey()).address })
  const owner = await call('POST', `/api/teams/${VICTIM}/agents`, { name: 'real', budget: '1', periodSeconds: 86400, serviceIds: [SERVICE], external: true, keyId: privateKeyToAccount(generatePrivateKey()).address })
  console.log(`H1 observed: rename status ${rename.status}, renamed=${renamed}, owner add after 25 unsigned adds: ${owner.status} ${owner.json['error']}`)
  assert.equal(renamed, false, 'an unsigned upsert renamed the team and flipped its signer kind')
  assert.notEqual(owner.json['error'], 'too_many_agents', "unsigned registrations exhausted the team's 25 agent slots")
  assert.equal(onStore.openAgentCount(VICTIM), 0, 'no unsigned registration holds a slot')
})

test('M1: with LEASH_MAINNET unset, a mainnet team takes no new agents', async () => {
  const r = await call('POST', `/api/teams/${VICTIM}/agents`, { name: 'x', budget: '1', periodSeconds: 86400, serviceIds: [SERVICE], external: true, keyId: privateKeyToAccount(generatePrivateKey()).address }, offBase)
  const team = await call('GET', `/api/teams/${VICTIM}`, undefined, offBase)
  console.log(`M1 observed on a mainnet: false desk: add agent ${r.status}, team read ${team.status} chainId ${team.json['balance']?.chainId}`)
  assert.notEqual(r.status, 200, 'a mainnet team still registers agents on a desk that reports mainnet: false')
})

test('M1: with LEASH_MAINNET unset, every mainnet team route answers 503 mainnet_disabled, signed or not; with it set the same routes answer', async () => {
  const send = caller(() => offBase)
  const keyId = privateKeyToAccount(generatePrivateKey()).address
  offStore.insertAgent({ keyId, account: VICTIM, name: 'x', privateKey: null, budget: '1', period: 60, token: VICTIM, serviceIds: [SERVICE], expiry: 1 })
  offStore.setAgentStatus(keyId, 'active', `0x${'cd'.repeat(32)}`)
  const cutId = offStore.insertCutoff({ account: VICTIM, recipient: MAINNET_TEAM, serviceIds: [], status: 'prepared', rescoped: [], revoked: [], unbounded: [], unchanged: [], reason: 'manual', evidence: null })
  const HASH = `0x${'ab'.repeat(32)}`
  const routes: ['GET' | 'POST', string, unknown][] = [
    ['GET', `/api/teams/${VICTIM}`, undefined],
    ['GET', `/api/teams/${VICTIM}/ledger`, undefined],
    ['GET', `/api/teams/${VICTIM}/vendors`, undefined],
    ['GET', `/api/teams/${VICTIM}/blocked`, undefined],
    ['GET', `/api/teams/${VICTIM}/balances`, undefined],
    ['POST', `/api/teams/${VICTIM}/agents`, { name: 'x', budget: '1', periodSeconds: 86400, serviceIds: [SERVICE], external: true, keyId: newKey() }],
    ['POST', `/api/agents/${keyId}/confirm`, { tx: HASH }],
    ['POST', `/api/agents/${keyId}/records`, { record: {}, signature: '0x' }],
    ['POST', `/api/agents/${keyId}/revoke-plan`, {}],
    ['POST', `/api/agents/${keyId}/revoke-confirm`, { tx: HASH }],
    ['POST', `/api/teams/${VICTIM}/cutoffs`, { recipient: MAINNET_TEAM, reason: 'manual' }],
    ['POST', `/api/cutoffs/${cutId}/confirm`, { tx: HASH }],
  ]
  for (const [method, path, body] of routes) {
    const r = await send(method, path, body, { as: MAINNET_ROOT })
    assert.equal(r.status, 503, `${method} ${path} answered ${r.status} ${JSON.stringify(r.json)}`)
    assert.equal(r.json['error'], 'mainnet_disabled')
  }
  assert.equal(offStore.openAgentCount(VICTIM), 1, 'no refused request wrote anything')
  offStore.upsertTeam(ACCOUNT, 'moderato team', 'webcrypto')
  const ctx = { agentName: 'a', vendorId: 'x', serviceId: 'x' }
  for (let i = 0; i < 3; i++) offStore.insertRecord({ ...record({ serviceId: 'atlas-search', outcome: 'delivered' }), account: VICTIM }, ctx)
  offStore.insertRecord({ ...record({ serviceId: 'atlas-search', outcome: 'delivered' }), account: ACCOUNT }, ctx)
  const featured = await send('GET', '/api/featured')
  assert.equal(featured.json['account'], ACCOUNT, 'the mainnet team has more records, but a desk that does not run mainnet teams never features one')
  // the control: the same read on a desk that runs mainnet teams is served
  const on = await call('GET', `/api/teams/${VICTIM}/ledger`)
  assert.equal(on.status, 200)
})

const newKey = () => privateKeyToAccount(generatePrivateKey()).address

test('L-emitter: an AccessKeySpend not emitted by the keychain precompile proves nothing', () => {
  const ACCT: Address = '0x1111111111111111111111111111111111111111'
  const KEY: Address = '0x2222222222222222222222222222222222222222'
  const RCP: Address = '0x3333333333333333333333333333333333333333'
  const TOKEN = NETWORKS.mainnet.settlementToken
  const MEMO: Hex = `0x${'ab'.repeat(32)}`
  const transfer = { address: TOKEN, topics: encodeEventTopics({ abi: Abis.tip20, eventName: 'TransferWithMemo', args: { from: ACCT, to: RCP, memo: MEMO } } as never) as Hex[], data: encodeAbiParameters([{ type: 'uint256' }], [3000n]) }
  const spendFrom = (address: Address) => ({ address, topics: encodeEventTopics({ abi: Abis.accountKeychain, eventName: 'AccessKeySpend', args: { account: ACCT, publicKey: KEY, token: TOKEN } } as never) as Hex[], data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [3000n, 0n]) })
  const claim = { account: ACCT, keyId: KEY, recipient: RCP, amount: '3000', memo: MEMO, currency: TOKEN }
  const fake = spendFrom('0x9999999999999999999999999999999999999999')
  assert.notEqual(Addresses.accountKeychain.toLowerCase(), fake.address)
  assert.equal(settlementProof([transfer, fake], claim).ok, false, "a spend event from an arbitrary contract was accepted as the key's spend")
  assert.equal(settlementProof([transfer, spendFrom(Addresses.accountKeychain)], claim).ok, true, 'the control: the same spend from the keychain precompile proves the payment')
})

const refused = (keyId: Address, account: Address, over: Record<string, unknown> = {}) => ({
  id: `r-${Math.random().toString(36).slice(2)}`, url: 'https://v.example/x', method: 'GET', requestHash: `0x${'00'.repeat(32)}`, realm: null, keyId, account, recipient: null, amount: null, currency: null, memo: null,
  status: null, refused: 'CallNotAllowed', settlement: null, outcome: 'refused', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ...over,
})

test('M3: a record dated in the future is refused (it would sit in the 24h window forever)', () => {
  const keyId = privateKeyToAccount(generatePrivateKey()).address
  const agent = { keyId, account: VICTIM }
  const now = Date.parse('2026-10-03T12:00:00.000Z')
  assert.throws(() => parseRecord(refused(keyId, VICTIM, { startedAt: '2099-01-01T00:00:00.000Z', finishedAt: '2099-01-01T00:00:00.000Z' }), agent), /future/, 'a record dated 2099 was accepted')
  assert.throws(() => parseRecord(refused(keyId, VICTIM, { finishedAt: '2026-10-03T12:02:01.000Z', startedAt: '2026-10-03T12:00:00.000Z' }), agent, now), /future/, 'just over two minutes ahead')
  assert.throws(() => parseRecord(refused(keyId, VICTIM, { startedAt: '2026-10-03T12:03:00.000Z', finishedAt: '2026-10-03T12:00:00.000Z' }), agent, now), /future/, 'a start in the future')
  assert.equal(parseRecord(refused(keyId, VICTIM, { startedAt: '2026-10-03T12:00:00.000Z', finishedAt: '2026-10-03T12:01:30.000Z' }), agent, now).outcome, 'refused', 'the control: ninety seconds ahead is clock skew')
})

test('M3: a payment cannot have finished more than an hour before its settlement block', () => {
  const block = Date.parse('2026-10-03T12:00:00.000Z')
  assert.throws(() => assertNotBeforeSettlement('2026-10-03T10:59:00.000Z', block), /before its settlement block/)
  assertNotBeforeSettlement('2026-10-03T11:30:00.000Z', block)
  assertNotBeforeSettlement('2026-10-03T12:00:10.000Z', block)
})

test('M3: the 24 hour window runs on the desk and the chain clock, not on the times the agent wrote', () => {
  const ctx = { agentName: 'a', vendorId: 'x', serviceId: 'x' }
  const store = memoryStore()
  const failed = (id: string, over: Record<string, unknown>, times: { receivedAt?: string; settledAt?: string | null }) => {
    const rec = { ...refused(newKey(), ACCOUNT, { id, outcome: 'paid_not_delivered', status: 502, refused: null, ...over }), settlement: { tx: `0x${id.padEnd(64, '0')}` as Hex, block: 1, status: 'success' as const, keySpend: ['3000'] } }
    store.insertRecord(rec as never, ctx, 'external', times)
  }
  const day = 24 * 3_600_000
  // the agent claims "now" for a payment the chain settled two days ago, and claims two days ago for one settled just now
  failed('aa', { startedAt: new Date().toISOString() }, { settledAt: new Date(Date.now() - 2 * day).toISOString() })
  failed('bb', { startedAt: new Date(Date.now() - 2 * day).toISOString() }, { settledAt: new Date().toISOString() })
  const ev = evidenceOf(store.allRecords(ACCOUNT))
  assert.equal(ev.paid, 1, 'only the payment the chain settled inside the window counts')
  assert.equal(ev.paidNotDelivered, 1)
})

/** An external agent registered on `team` whose key this test holds. */
function activeAgent(st: TestStore, team: Address) {
  const key = generatePrivateKey()
  const keyId = privateKeyToAccount(key).address
  st.insertAgent({ keyId, account: team, name: 'outside', privateKey: null, budget: '1', period: 3600, token: team, serviceIds: ['atlas-search'], expiry: 1 })
  st.setAgentStatus(keyId, 'active', `0x${'cd'.repeat(32)}`)
  return { key, keyId }
}

test('M2: unverified record intake is rate limited per key and per address, and cannot pick the featured team', async () => {
  const st = memoryStore()
  const handle = createApp({ store: st, runner: createRunner(st), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: '0x4444444444444444444444444444444444444444', mainnet: true })
  const srv = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  const at = `http://127.0.0.1:${(srv.address() as { port: number }).port}`
  try {
    st.upsertTeam(MAINNET_TEAM, 'attacker', 'webcrypto', 'mainnet')
    st.upsertTeam(ACCOUNT, 'honest', 'webcrypto')
    const post = async (a: { key: Hex; keyId: Address }, team: Address) => {
      const rec = refused(a.keyId, team)
      const res = await fetch(`${at}/api/agents/${a.keyId}/records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ record: rec, signature: await signRecord(a.key, rec) }) })
      return res.status
    }
    const one = activeAgent(st, MAINNET_TEAM)
    const statuses: number[] = []
    const began = Date.now()
    for (let i = 0; i < 200; i++) statuses.push(await post(one, MAINNET_TEAM))
    const accepted = statuses.filter((s) => s === 200).length
    console.log(`M2 observed: 200 signed refused records from one key: ${accepted} accepted, first 429 at request ${statuses.indexOf(429) + 1}`)
    assert.ok(statuses.includes(429), 'the flood was never limited')
    assert.ok(statuses.indexOf(429) < 199, 'the limit must hit before the 200th record')
    const allowance = 60 + Math.ceil((Date.now() - began) / 1000)
    assert.ok(accepted >= 50 && accepted <= allowance, `a burst of 60 plus one a second is accepted: ${accepted} against ${allowance}`)
    assert.equal(st.allRecords(MAINNET_TEAM).length, accepted, 'a limited record writes nothing')

    // many keys from one address: the address bucket stops the spread
    const many: number[] = []
    for (let i = 0; i < 160; i++) many.push(await post(activeAgent(st, MAINNET_TEAM), MAINNET_TEAM))
    assert.ok(many.includes(429), 'one address spreading across keys was never limited')

    // dozens of unverified records do not make the attacker's team the landing page; one settled record for another team does
    assert.ok(st.allRecords(MAINNET_TEAM).length > 60, 'the attacker team holds many more records than the honest one')
    const ctx = { agentName: 'a', vendorId: 'x', serviceId: 'x' }
    st.insertRecord({ ...record({ serviceId: 'atlas-search', outcome: 'delivered' }), account: ACCOUNT }, ctx)
    assert.equal(st.busiestTeam(true), ACCOUNT, 'only chain-verified records rank a team')
    assert.equal(((await (await fetch(`${at}/api/featured`)).json()) as { account: string }).account, ACCOUNT)
  } finally {
    srv.close()
  }
})

test('M2: the token bucket refills with time and forgets its least recent keys', () => {
  let t = 0
  const lim = createRateLimiter({ capacity: 3, perSecond: 1, maxKeys: 2, now: () => t })
  assert.deepEqual([1, 2, 3, 4].map(() => lim.take('a')), [true, true, true, false])
  t += 2000
  assert.deepEqual([1, 2, 3].map(() => lim.take('a')), [true, true, false], 'two seconds refill two tokens')
  lim.take('b')
  lim.take('c')
  assert.equal(lim.take('a'), true, 'a evicted as least recent, so it starts full again')
})

test('M5: the mainnet replay reads once per page-rounded window, however many sizes are asked for', async () => {
  const ran: number[] = []
  let t = 0
  const cached = createReplayCache(async (blocks) => (ran.push(blocks), { blocks } as MainnetReplay), () => t)
  for (const n of [1, 2, 3, 4_999, 5_000]) await cached(n)
  assert.deepEqual(ran, [5_000], 'five sizes inside one page read the chain once')
  await cached(5_001)
  await cached(50_000)
  await cached(49_999)
  assert.deepEqual(ran, [5_000, 10_000, 50_000], 'a larger size reads its own window once')
  assert.equal(replayWindow(1_000_000), 50_000, 'no size reads past the cap')
  const sizes = new Set<number>()
  for (let n = 1; n <= 50_000; n += 7) sizes.add(replayWindow(n))
  assert.equal(sizes.size, 10, 'every size maps to one of ten windows, so the map is bounded')
  t += 11 * 60_000
  await cached(1)
  assert.deepEqual(ran, [5_000, 10_000, 50_000, 5_000], 'a window is read again after the cache expires')
  const failing = createReplayCache(async () => { throw new Error('rpc down') }, () => t)
  await assert.rejects(failing(1))
  await assert.rejects(failing(1), /rpc down/, 'a failed read is not cached as a success')
})
