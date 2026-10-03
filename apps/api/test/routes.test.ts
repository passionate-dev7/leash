import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from '../src/app.js'
import { createRunner } from '../src/runner.js'
import { ACCOUNT, memoryStore, seed, SCRAPE_RECIPIENT } from './helpers.js'
import type { TestStore } from './helpers.js'

let server: Server
let base: string
let store: TestStore
const SPONSOR = '0x4444444444444444444444444444444444444444'
const OTHER = '0x5555555555555555555555555555555555555555'
const HASH = `0x${'ab'.repeat(32)}`

before(async () => {
  store = memoryStore()
  const handle = createApp({ store, runner: createRunner(store), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: SPONSOR })
  server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  store.upsertTeam(ACCOUNT, 'validation team', 'webcrypto')
})
after(() => void server.close())

async function call(method: 'GET' | 'POST', path: string, body?: unknown, raw?: string) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: raw ?? JSON.stringify(body ?? {}) } : {}) })
  return { status: res.status, json: (await res.json()) as Record<string, any> }
}

const AGENT = { name: 'a', budget: '1.50', periodSeconds: 86_400, serviceIds: ['atlas-search'] }

test('every write route rejects bad input with a 4xx and an error body, before any chain read', async () => {
  const pendingAgent = (await call('POST', `/api/teams/${ACCOUNT}/agents`, AGENT)).json['keyId'] as string
  const cases: [string, string, unknown, number, string?][] = [
    ['POST', '/api/faucet', {}, 422],
    ['POST', '/api/faucet', { address: 'nope' }, 422],
    ['POST', '/api/teams', { account: ACCOUNT, label: '', signer: 'webcrypto' }, 422],
    ['POST', '/api/teams', { account: 'x', label: 'l', signer: 'webcrypto' }, 422],
    ['POST', '/api/teams', { account: ACCOUNT, label: 'l', signer: 'ledger' }, 422],
    ['POST', '/api/teams', { account: ACCOUNT, label: 'x'.repeat(61), signer: 'webcrypto' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, name: '' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, budget: '0' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, budget: '-1' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, budget: '1.1234567' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, periodSeconds: 5 }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, periodSeconds: '86400' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, serviceIds: [] }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, serviceIds: ['nope'] }, 422],
    ['POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, serviceIds: ['atlas-search', 'atlas-search'] }, 422],
    ['POST', `/api/teams/${OTHER}/agents`, AGENT, 404],
    ['POST', `/api/agents/${pendingAgent}/confirm`, { tx: 'nope' }, 422],
    ['POST', `/api/agents/${OTHER}/confirm`, { tx: HASH }, 404],
    ['POST', `/api/agents/${pendingAgent}/run`, {}, 422],
    ['POST', `/api/agents/${pendingAgent}/run`, { topic: 'x'.repeat(121) }, 422],
    ['POST', `/api/agents/${pendingAgent}/call`, { serviceId: 'nope', input: {} }, 422],
    ['POST', `/api/agents/${pendingAgent}/call`, { serviceId: 'atlas-search', input: {} }, 409],
    ['POST', `/api/agents/${pendingAgent}/revoke-plan`, {}, 409],
    ['POST', `/api/agents/${pendingAgent}/revoke-confirm`, { tx: '0x12' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/cutoffs`, {}, 422],
    ['POST', `/api/teams/${ACCOUNT}/cutoffs`, { recipient: 'nope' }, 422],
    ['POST', `/api/teams/${ACCOUNT}/cutoffs`, { recipient: SCRAPE_RECIPIENT, reason: 'because' }, 422],
    ['POST', `/api/teams/${OTHER}/cutoffs`, { recipient: SCRAPE_RECIPIENT }, 404],
    ['POST', '/api/cutoffs/9999/confirm', { tx: HASH }, 404],
    ['POST', '/api/cutoffs/abc/confirm', { tx: HASH }, 404],
  ]
  assert.ok(cases.length > 20)
  for (const [method, path, body, status] of cases) {
    const r = await call(method as 'POST', path, body)
    assert.equal(r.status, status, `${method} ${path} ${JSON.stringify(body)} answered ${r.status} ${JSON.stringify(r.json)}`)
    assert.equal(typeof r.json['error'], 'string')
  }
  const notJson = await call('POST', '/api/teams', undefined, '{broken')
  assert.equal(notJson.status, 422)
  const array = await call('POST', '/api/teams', undefined, '[]')
  assert.equal(array.status, 422)
})

test('a valid agent request answers with the key id and authorize plan, never the private key', async () => {
  const r = await call('POST', `/api/teams/${ACCOUNT}/agents`, { ...AGENT, name: 'planner' })
  assert.equal(r.status, 200)
  assert.equal(r.json['authorize'].scopes[0].recipients.length, 1)
  assert.ok(!JSON.stringify(r.json).toLowerCase().includes('private'))
  assert.ok(store.agent(r.json['keyId'])!.private_key.startsWith('enc1:'))
})

test('409 gating: a cut for failures needs a measured failure in the last 24 hours', async () => {
  const none = await call('POST', `/api/teams/${ACCOUNT}/cutoffs`, { recipient: SCRAPE_RECIPIENT, reason: 'failures' })
  assert.equal(none.status, 409)
  assert.equal(none.json['error'], 'no measured failures')
  assert.match(none.json['detail'], /0 paid/)
  assert.equal(store.cutoffs(ACCOUNT).length, 0, 'a refused cut writes nothing')

  seed(store, [{ serviceId: 'atlas-scrape', outcome: 'paid_not_delivered', minutesAgo: 26 * 60 }, { serviceId: 'atlas-scrape', outcome: 'delivered' }])
  const stale = await call('POST', `/api/teams/${ACCOUNT}/cutoffs`, { recipient: SCRAPE_RECIPIENT, reason: 'failures' })
  assert.equal(stale.status, 409, 'a failure older than 24 hours is not evidence')

  const manual = await call('POST', `/api/teams/${ACCOUNT}/cutoffs`, { recipient: SCRAPE_RECIPIENT, reason: 'manual' })
  assert.equal(manual.status, 200, 'a manual cut needs no failures')
  assert.equal(manual.json['reason'], 'manual')

  seed(store, [{ serviceId: 'atlas-scrape', outcome: 'paid_not_delivered' }])
  const measured = await call('POST', `/api/teams/${ACCOUNT}/cutoffs`, { recipient: SCRAPE_RECIPIENT, reason: 'failures' })
  assert.equal(measured.status, 200)
  assert.equal(measured.json['reason'], 'failures')
  assert.equal(measured.json['evidence'].paidNotDelivered, 1)
  assert.equal(measured.json['evidence'].txs.length, 1)
  const row = store.cutoff(measured.json['id'])!
  assert.equal(row.reason, 'failures')
  assert.equal(JSON.parse(row.evidence!).paidNotDelivered, 1, 'the snapshot is stored on the cutoff row')
})

test('featured: the env team or the team with the most records', async () => {
  const r = await call('GET', '/api/featured')
  assert.equal(r.status, 200)
  assert.equal(r.json['account'], ACCOUNT)
})
