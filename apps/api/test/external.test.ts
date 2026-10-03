import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Abis } from 'viem/tempo'
import { signRecord } from '@leash/sdk'
import type { DeliveryRecord } from '@leash/sdk'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from '../src/app.js'
import { settlementProof, signerOf } from '../src/external.js'
import { createRunner } from '../src/runner.js'
import { ACCOUNT, caller, memoryStore, record, SCRAPE_RECIPIENT } from './helpers.js'
import type { TestStore } from './helpers.js'

const OUSD: Address = '0x20c0000000000000000000006a37DA5C996874BE'
const SPONSOR = '0x4444444444444444444444444444444444444444'

const agentKey = generatePrivateKey()
const KEY_ID = privateKeyToAccount(agentKey).address
const FORGER = generatePrivateKey()

let server: Server
let base: string
let store: TestStore

before(async () => {
  store = memoryStore()
  const handle = createApp({ store, runner: createRunner(store), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: SPONSOR })
  server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  store.upsertTeam(ACCOUNT, 'external team', 'webcrypto')
})
after(() => void server.close())

const call = caller(() => base)

/** A record the way an external agent's leashFetch would report it, for this key. */
function reported(over: Parameters<typeof record>[0], patch: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return { ...record(over), keyId: KEY_ID, account: ACCOUNT, url: 'http://127.0.0.1:4180/v/atlas/scrape', ...patch }
}

const post = async (rec: DeliveryRecord, signer: Hex = agentKey, tamper?: (r: DeliveryRecord) => DeliveryRecord) =>
  call('POST', `/api/agents/${KEY_ID}/records`, { record: tamper ? tamper(rec) : rec, signature: await signRecord(signer, rec) })

const AGENT = { name: 'outside-agent', budget: '1.00', periodSeconds: 86_400, serviceIds: ['atlas-scrape'] }

test('an external agent registers by key id, holds no key in the desk, and cannot be run or called by it', async () => {
  const bad = await call('POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, external: true })
  assert.equal(bad.status, 422, 'external needs a keyId')
  const r = await call('POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, external: true, keyId: KEY_ID })
  assert.equal(r.status, 200)
  assert.equal(r.json['keyId'], KEY_ID)
  assert.equal(r.json['authorize'].accessKey.accessKeyAddress, KEY_ID)
  assert.equal(r.json['authorize'].scopes[0].recipients.length, 1)
  const row = store.agent(KEY_ID)!
  assert.equal(row.external, 1)
  assert.equal(row.private_key, '', 'the desk stores no key for an external agent')
  assert.equal((await call('POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, external: true, keyId: KEY_ID })).status, 409, 'a key id registers once')

  store.setAgentStatus(KEY_ID, 'active', `0x${'cd'.repeat(32)}`)
  const run = await call('POST', `/api/agents/${KEY_ID}/run`, { topic: 'rust' })
  assert.equal(run.status, 409)
  assert.equal(run.json['error'], 'external_agent')
  const one = await call('POST', `/api/agents/${KEY_ID}/call`, { serviceId: 'atlas-scrape', input: { url: 'https://example.com' } })
  assert.equal(one.status, 409)
  assert.equal(one.json['error'], 'external_agent')
  const team = await call('GET', `/api/teams/${ACCOUNT}`)
  assert.equal(team.json['agents'].find((a: any) => a.keyId === KEY_ID).external, true)
})

test('a signed record recovers to the agent key; a signature from another key does not', async () => {
  const rec = reported({ serviceId: 'atlas-scrape', outcome: 'refused' })
  assert.equal(await signerOf(rec, await signRecord(agentKey, rec)), KEY_ID)
  const forged = await signRecord(FORGER, rec)
  assert.equal(await signerOf(rec, forged), privateKeyToAccount(FORGER).address)
  assert.notEqual(await signerOf(rec, forged), KEY_ID)
  assert.equal(await signerOf(rec, 'nope'), null)
  assert.equal(await signerOf(rec, `0x${'00'.repeat(65)}`), null)
})

test('a refused record needs no transaction; a forged or altered one is rejected and writes nothing', async () => {
  const rec = reported({ serviceId: 'atlas-scrape', outcome: 'refused' })
  const before = store.allRecords(ACCOUNT).length

  const forged = await post(rec, FORGER)
  assert.equal(forged.status, 401)
  assert.equal(forged.json['error'], 'bad_signature')

  const altered = await post(rec, agentKey, (r) => ({ ...r, refused: 'KeyExpired' }))
  assert.equal(altered.status, 401, 'a record changed after signing no longer recovers to the key')
  assert.equal(store.allRecords(ACCOUNT).length, before, 'a rejected record writes nothing')

  const ok = await post(rec)
  assert.equal(ok.status, 200)
  assert.equal(ok.json['source'], 'external')
  const rows = store.allRecords(ACCOUNT)
  assert.equal(rows.length, before + 1)
  const stored = rows.find((r) => r.id === rec.id)!
  assert.equal(stored.source, 'external')
  assert.equal(stored.serviceId, 'atlas-scrape', 'the url is joined to the catalog service')
  assert.equal(stored.agentName, 'outside-agent')

  const again = await post(rec)
  assert.equal(again.status, 409)
  assert.equal(again.json['error'], 'duplicate_record')
  assert.equal(store.allRecords(ACCOUNT).length, before + 1)

  const view = await call('GET', `/api/teams/${ACCOUNT}/vendors`)
  assert.equal(view.json['services'].find((s: any) => s.serviceId === 'atlas-scrape').refused, 1, 'vendors roll-ups include external records')
  const ledger = await call('GET', `/api/teams/${ACCOUNT}/ledger`)
  assert.equal(ledger.json['records'].find((r: any) => r.id === rec.id).source, 'external')
})

test('a payment is rejected when it repeats a settlement, names another key or team, or contradicts its own status', async () => {
  const dupTx = `0x${'ee'.repeat(32)}` as Hex
  store.insertRecord({ ...reported({ serviceId: 'atlas-search', outcome: 'delivered' }), settlement: { tx: dupTx, block: 1, status: 'success', keySpend: ['3000'] } }, { agentName: 'x', vendorId: 'atlas', serviceId: 'atlas-search' }, 'external')
  const paid = reported({ serviceId: 'atlas-scrape', outcome: 'delivered' }, { memo: `0x${'12'.repeat(32)}` })
  paid.settlement = { tx: dupTx, block: 1, status: 'success', keySpend: ['3000'] }
  const dup = await post(paid)
  assert.equal(dup.status, 409)
  assert.match(dup.json['detail'], /already in the ledger/)

  const otherKey = await post(reported({ serviceId: 'atlas-scrape', outcome: 'refused' }, { keyId: privateKeyToAccount(FORGER).address }))
  assert.equal(otherKey.status, 422)
  const otherTeam = await post(reported({ serviceId: 'atlas-scrape', outcome: 'refused' }, { account: '0x9999999999999999999999999999999999999999' }))
  assert.equal(otherTeam.status, 422)

  const lies = reported({ serviceId: 'atlas-scrape', outcome: 'delivered' }, { status: 502 })
  lies.memo = `0x${'34'.repeat(32)}`
  const inconsistent = await post(lies)
  assert.equal(inconsistent.status, 422)
  assert.match(inconsistent.json['detail'], /2xx/)

  const wrongPayout = await post(reported({ serviceId: 'atlas-scrape', outcome: 'refused' }, { recipient: '0x5555555555555555555555555555555555555555' }))
  assert.equal(wrongPayout.status, 422, 'a catalog url must carry the catalog payout')
})

test('a record for a runner agent is refused: the desk writes those itself', async () => {
  const created = await call('POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, name: 'inside-agent' })
  const inside = created.json['keyId'] as string
  const r = await call('POST', `/api/agents/${inside}/records`, { record: {}, signature: '0x' })
  assert.equal(r.status, 409)
  assert.equal(r.json['error'], 'not_external')
})

test('blocked lists the recipients whose cut confirmed on chain, and a prepared cut blocks nothing', async () => {
  const blocked = async () => (await call('GET', `/api/teams/${ACCOUNT}/blocked`)).json['recipients']
  assert.deepEqual(await blocked(), [])
  const id = store.insertCutoff({ account: ACCOUNT, recipient: SCRAPE_RECIPIENT, serviceIds: ['atlas-scrape'], status: 'prepared', rescoped: [KEY_ID], revoked: [], unbounded: [], unchanged: [], reason: 'manual', evidence: null })
  assert.deepEqual(await blocked(), [], 'a prepared cut is a plan, not a block')
  store.finishCutoff(id, 'failed', `0x${'ee'.repeat(32)}`, 1n, 'did not confirm')
  assert.deepEqual(await blocked(), [], 'a failed cut blocks nothing')
  store.finishCutoff(id, 'confirmed', `0x${'ef'.repeat(32)}`, 1n, null)
  assert.deepEqual(await blocked(), [SCRAPE_RECIPIENT.toLowerCase()], 'a confirmed cut blocks the recipient')
  assert.equal((await call('GET', '/api/teams/0x5555555555555555555555555555555555555555/blocked')).status, 404)
})

// settlementProof reads logs the way the chain emits them, so the logs here are encoded with the chain's own ABIs.
const KEY: Address = '0x2222222222222222222222222222222222222222'
const OTHER_KEY: Address = '0x6666666666666666666666666666666666666666'
const MEMO: Hex = `0x${'ab'.repeat(32)}`
const claim = { account: ACCOUNT, keyId: KEY, recipient: SCRAPE_RECIPIENT, amount: '3000', memo: MEMO, currency: OUSD }

const transferLog = (o: { from?: Address; to?: Address; amount?: bigint; memo?: Hex; address?: Address } = {}) => {
  const topics = encodeEventTopics({
    abi: Abis.tip20,
    eventName: 'TransferWithMemo',
    args: { from: o.from ?? ACCOUNT, to: o.to ?? SCRAPE_RECIPIENT, memo: o.memo ?? MEMO },
  } as never) as Hex[]
  return { address: o.address ?? OUSD, topics, data: encodeAbiParameters([{ type: 'uint256' }], [o.amount ?? 3000n]) }
}
const spendLog = (o: { key?: Address; amount?: bigint; account?: Address } = {}) => ({
  address: '0xAAAAAAAA00000000000000000000000000000000' as Address,
  topics: encodeEventTopics({ abi: Abis.accountKeychain, eventName: 'AccessKeySpend', args: { account: o.account ?? ACCOUNT, publicKey: o.key ?? KEY, token: OUSD } } as never) as Hex[],
  data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [o.amount ?? 3000n, 1_000_000n]),
})

test('settlementProof accepts a sponsored settlement and an unsponsored one where the price is one of two spends', () => {
  const sponsored = settlementProof([transferLog(), spendLog()], claim)
  assert.deepEqual(sponsored, { ok: true, keySpend: ['3000'] })
  const unsponsored = settlementProof([transferLog(), spendLog({ amount: 3000n }), spendLog({ amount: 205n })], claim)
  assert.deepEqual(unsponsored, { ok: true, keySpend: ['3000', '205'] })
})

test('settlementProof rejects the wrong key, amount, memo, recipient, payer, token and a gas-only spend', () => {
  const reject = (logs: ReturnType<typeof transferLog>[], pattern: RegExp, c = claim) => {
    const r = settlementProof(logs, c)
    assert.equal(r.ok, false, `expected a rejection matching ${pattern}`)
    assert.match((r as { reason: string }).reason, pattern)
  }
  reject([transferLog(), spendLog({ key: OTHER_KEY })], /no AccessKeySpend/)
  reject([transferLog(), spendLog({ account: '0x7777777777777777777777777777777777777777' })], /no AccessKeySpend/)
  reject([transferLog({ amount: 2000n }), spendLog({ amount: 2000n })], /moved 2000 units/)
  reject([transferLog(), spendLog({ amount: 205n })], /no AccessKeySpend of 3000/)
  reject([transferLog({ memo: `0x${'cd'.repeat(32)}` }), spendLog()], /no transferWithMemo with memo/)
  reject([transferLog({ to: '0x5555555555555555555555555555555555555555' }), spendLog()], /did not pay/)
  reject([transferLog({ from: '0x7777777777777777777777777777777777777777' }), spendLog()], /not the team account/)
  reject([transferLog({ address: '0x20c0000000000000000000000000000000000000' }), spendLog()], /no transferWithMemo/)
  reject([spendLog()], /no transferWithMemo/)
  reject([], /no transferWithMemo/)
})
