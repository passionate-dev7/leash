import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { signRecord } from '@leash/sdk'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from '../src/app.js'
import { createRunner } from '../src/runner.js'
import { openDatabase } from '../src/db.js'
import { createCipher } from '../src/keystore.js'
import { createStore } from '../src/store.js'
import { ACCOUNT, KEY, MODERATO_ROOT, caller } from './helpers.js'

async function desk(mainnet: boolean) {
  const db = openDatabase(':memory:')
  const store = createStore(db, createCipher(KEY))
  const handle = createApp({ store, runner: createRunner(store), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: '0x4444444444444444444444444444444444444444', mainnet })
  const srv = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`
  return { db, store, srv, base, call: caller(() => base) }
}

const refused = (keyId: Address, account: Address) => ({
  id: `r-${Math.random().toString(36).slice(2)}`, url: 'https://v.example/x', method: 'GET', requestHash: `0x${'00'.repeat(32)}`, realm: null, keyId, account, recipient: null, amount: null, currency: null, memo: null,
  status: null, refused: 'CallNotAllowed', settlement: null, outcome: 'refused', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
})

test('N1: posts to key ids that are not live agents do not drain the address bucket a real agent reports from', async () => {
  const d = await desk(false)
  try {
    d.store.upsertTeam(ACCOUNT, 'honest', 'webcrypto')
    const key = generatePrivateKey()
    const keyId = privateKeyToAccount(key).address
    d.store.insertAgent({ keyId, account: ACCOUNT, name: 'real', privateKey: null, budget: '1', period: 86400, token: ACCOUNT, serviceIds: ['atlas-search'], expiry: 1 })
    d.store.setAgentStatus(keyId, 'active', `0x${'cd'.repeat(32)}`)
    const realPost = async () => {
      const rec = refused(keyId, ACCOUNT)
      return (await fetch(`${d.base}/api/agents/${keyId}/records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ record: rec, signature: await signRecord(key, rec) }) })).status
    }
    assert.equal(await realPost(), 200, 'control: the real agent reports fine before the flood')
    const junk: number[] = []
    for (let i = 0; i < 130; i++) junk.push((await fetch(`${d.base}/api/agents/0x000000000000000000000000000000000000dEaD/records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status)
    assert.equal(junk.filter((s) => s === 404).length, 130)
    const after = await realPost()
    assert.notEqual(after, 429, 'a stranger with no key and no agent locked the real agent out of record intake')
  } finally {
    d.srv.close()
  }
})

test('N2: a confirm that arrives after the pending hour is checked against the chain, and the row survives a failed check', async () => {
  const d = await desk(false)
  try {
    d.store.upsertTeam(ACCOUNT, 'team', 'webcrypto')
    const keyId = privateKeyToAccount(generatePrivateKey()).address
    d.store.insertAgent({ keyId, account: ACCOUNT, name: 'slow', privateKey: null, budget: '1', period: 86400, token: ACCOUNT, serviceIds: ['atlas-search'], expiry: 1 })
    d.db.prepare('update agent set created_at = ? where key_id = ?').run(new Date(Date.now() - 61 * 60_000).toISOString(), keyId)
    const r = await d.call('POST', `/api/agents/${keyId}/confirm`, { tx: `0x${'ab'.repeat(32)}` }, { as: MODERATO_ROOT })
    // receipt_unavailable when the RPC answers, another chain error when it does not: either way not pending_expired.
    assert.notEqual(r.json['error'], 'pending_expired', 'the desk looked the authorize tx up on chain before deciding')
    assert.ok(r.status >= 400)
    assert.ok(d.store.agent(keyId), 'a failed late confirm keeps the row, so a retry with the right tx can still land')
  } finally {
    d.srv.close()
  }
})
