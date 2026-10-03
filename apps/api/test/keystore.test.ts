import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { createStore } from '../src/store.js'
import { openDatabase } from '../src/db.js'
import { createCipher, isSealed, loadMasterKey } from '../src/keystore.js'
import { ACCOUNT, KEY, memoryStore } from './helpers.js'

const cipher = createCipher(KEY)

test('seal and open round trip; the stored form hides the key and differs every time', () => {
  const key = generatePrivateKey()
  const a = cipher.seal(key, '0xAbC')
  const b = cipher.seal(key, '0xAbC')
  assert.ok(isSealed(a))
  assert.ok(!a.includes(key.slice(2, 20)))
  assert.notEqual(a, b)
  assert.equal(cipher.open(a, '0xabc'), key, 'the binding is case insensitive, as addresses are')
})

test('tamper detection: flipped ciphertext, flipped tag, another row, another master key', () => {
  const key = generatePrivateKey()
  const sealed = cipher.seal(key, '0xaaa')
  const [prefix, iv, tag, ct] = sealed.split(':') as [string, string, string, string]
  const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1)
  assert.throws(() => cipher.open([prefix, iv, tag, flip(ct)].join(':'), '0xaaa'), /authentication/)
  assert.throws(() => cipher.open([prefix, iv, flip(tag), ct].join(':'), '0xaaa'), /authentication/)
  assert.throws(() => cipher.open(sealed, '0xbbb'), /authentication/, 'a ciphertext moved onto another agent must not open')
  assert.throws(() => createCipher(Buffer.alloc(32, 9)).open(sealed, '0xaaa'), /authentication/)
  assert.throws(() => cipher.open(key, '0xaaa'), /sealed format/)
})

test('master key: created with mode 600 on first use, reused after, rejected when malformed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'leash-master-'))
  const path = join(dir, 'nested', 'master.key')
  const first = loadMasterKey(path)
  assert.equal(first.length, 32)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.deepEqual(loadMasterKey(path), first)
  const bad = join(dir, 'bad.key')
  writeFileSync(bad, 'c2hvcnQ=', { mode: 0o600 })
  assert.throws(() => loadMasterKey(bad), /32 byte/)
})


test('store seals new agent keys and opens them for the runner', () => {
  const store = memoryStore()
  store.upsertTeam(ACCOUNT, 't', 'webcrypto')
  const key = generatePrivateKey()
  const keyId = privateKeyToAddress(key)
  store.insertAgent({ keyId, account: ACCOUNT, name: 'a', privateKey: key, budget: '1', period: 60, token: ACCOUNT, serviceIds: ['atlas-search'], expiry: 1 })
  const row = store.agent(keyId)!
  assert.ok(isSealed(row.private_key) && !row.private_key.includes(key.slice(2, 20)))
  assert.equal(store.agentKey(row), key)
  assert.throws(() => store.agentKey({ ...row, key_id: privateKeyToAddress(generatePrivateKey()) }), /authentication/)
})

test('boot migration: plaintext rows are sealed and the clear text is gone from the database file', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'leash-db-')), 'leash.db')
  const db = openDatabase(file)
  const store = createStore(db, cipher)
  store.upsertTeam(ACCOUNT, 't', 'webcrypto')
  const plain = generatePrivateKey()
  const keyId = privateKeyToAddress(plain)
  db.prepare(
    "insert into agent(key_id, account, name, private_key, budget, period, token, service_ids, expiry, status, created_at) values (?, ?, 'old', ?, '1', 60, ?, '[]', 1, 'pending', 'then')",
  ).run(keyId, ACCOUNT, plain, ACCOUNT)
  assert.ok(readFileSync(file).includes(plain) || readFileSync(`${file}-wal`).includes(plain), 'the fixture must start with the key in the clear')
  assert.equal(store.sealPlaintextKeys(), 1)
  assert.equal(store.sealPlaintextKeys(), 0, 'a second boot has nothing to do')
  assert.equal(store.agentKey(store.agent(keyId)!), plain)
  assert.ok(!readFileSync(file).includes(plain), 'clear text left in the database file')
  assert.ok(!readFileSync(`${file}-wal`).includes(plain), 'clear text left in the write-ahead log')
  db.close()
})
