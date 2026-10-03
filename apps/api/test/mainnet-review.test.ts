import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'
import type { Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from '../src/app.js'
import { mainnetServices } from '../src/mainnet.js'
import { createRunner } from '../src/runner.js'
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
