import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'
import { encodeFunctionData } from 'viem'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Abis, Account, Addresses, WebCryptoP256 } from 'viem/tempo'
import { DESK_AUTH_WINDOW_MS, DESK_HEADER_ISSUED_AT, DESK_HEADER_SIGNATURE, signDeskRequest } from '@leash/policy'
import type { DeskSigner } from '@leash/policy'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from '../src/app.js'
import { cutCallsProof } from '../src/cutcalls.js'
import { createRunner } from '../src/runner.js'
import { openDatabase } from '../src/db.js'
import { createCipher } from '../src/keystore.js'
import { createStore, PENDING_TTL_MS } from '../src/store.js'
import { ACCOUNT, caller, KEY, MODERATO_ROOT, SCRAPE_RECIPIENT } from './helpers.js'
import type { TestRoot } from './helpers.js'

let server: Server
let base: string
const db = openDatabase(':memory:')
const store = createStore(db, createCipher(KEY))
const call = caller(() => base)

before(async () => {
  const handle = createApp({ store, runner: createRunner(store), vendors: createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' }), sponsor: '0x4444444444444444444444444444444444444444' })
  server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  store.upsertTeam(ACCOUNT, 'victim ops', 'passkey')
})
after(() => void server.close())

const newKey = () => privateKeyToAccount(generatePrivateKey()).address
const AGENT = (keyId: Address = newKey()) => ({ name: 'a', budget: '1', periodSeconds: 86_400, serviceIds: ['atlas-search'], external: true, keyId })
const stranger: TestRoot = { account: Account.fromSecp256k1(generatePrivateKey()) as DeskSigner, chainId: 42431 }

test('H1: a caller who is not the team cannot rename it, fill its agent slots or block its vendors', async () => {
  const rename = await call('POST', '/api/teams', { account: ACCOUNT, label: 'pwned', signer: 'webcrypto' }, { unsigned: true })
  assert.equal(rename.status, 401)
  const wrongKey = await call('POST', '/api/teams', { account: ACCOUNT, label: 'pwned', signer: 'webcrypto' }, { as: stranger })
  assert.equal(wrongKey.status, 401, 'a valid signature by another key is not the team')
  assert.equal(store.team(ACCOUNT)!.label, 'victim ops')
  assert.equal(store.team(ACCOUNT)!.signer, 'passkey')

  for (let i = 0; i < 30; i++) assert.equal((await call('POST', `/api/teams/${ACCOUNT}/agents`, AGENT(), { unsigned: true })).status, 401)
  assert.equal(store.agents(ACCOUNT).length, 0, 'unsigned registrations write nothing')
  const owner = await call('POST', `/api/teams/${ACCOUNT}/agents`, AGENT())
  assert.equal(owner.status, 200, `the owner still adds an agent: ${JSON.stringify(owner.json)}`)

  const cut = await call('POST', `/api/teams/${ACCOUNT}/cutoffs`, { recipient: SCRAPE_RECIPIENT, reason: 'manual' }, { unsigned: true })
  assert.equal(cut.status, 401)
  assert.equal(store.cutoffs(ACCOUNT).length, 0, 'an unsigned cut writes nothing')
  assert.deepEqual((await call('GET', `/api/teams/${ACCOUNT}/blocked`)).json['recipients'], [])
})

test('H1: every write route that changes a team refuses an unsigned or foreign request', async () => {
  const keyId = newKey()
  store.insertAgent({ keyId, account: ACCOUNT, name: 'x', privateKey: null, budget: '1', period: 60, token: ACCOUNT, serviceIds: ['atlas-search'], expiry: 1 })
  const cutId = store.insertCutoff({ account: ACCOUNT, recipient: SCRAPE_RECIPIENT, serviceIds: [], status: 'prepared', rescoped: [], revoked: [], unbounded: [], unchanged: [], reason: 'manual', evidence: null })
  const HASH = `0x${'ab'.repeat(32)}`
  const writes: [string, unknown][] = [
    ['/api/teams', { account: ACCOUNT, label: 'x', signer: 'webcrypto' }],
    [`/api/teams/${ACCOUNT}/agents`, AGENT()],
    [`/api/agents/${keyId}/confirm`, { tx: HASH }],
    [`/api/teams/${ACCOUNT}/cutoffs`, { recipient: SCRAPE_RECIPIENT }],
    [`/api/cutoffs/${cutId}/confirm`, { tx: HASH }],
    [`/api/agents/${keyId}/revoke-confirm`, { tx: HASH }],
    [`/api/agents/${keyId}/run`, { topic: 'x' }],
    [`/api/agents/${keyId}/call`, { serviceId: 'atlas-search', input: {} }],
  ]
  assert.ok(writes.length >= 8)
  for (const [path, body] of writes) {
    const bare = await call('POST', path, body, { unsigned: true })
    assert.equal(bare.status, 401, `${path} unsigned answered ${bare.status}`)
    assert.equal(bare.json['error'], 'unauthorized')
    const foreign = await call('POST', path, body, { as: stranger })
    assert.equal(foreign.status, 401, `${path} signed by another key answered ${foreign.status}`)
  }
  assert.equal(store.cutoff(cutId)!.status, 'prepared')
  assert.equal(store.agent(keyId)!.status, 'pending')
})

test('H1: a signature is bound to its method, path, body, team and chain, expires in five minutes and is accepted once', async () => {
  const path = `/api/teams/${ACCOUNT}/agents`
  const body = AGENT()
  const send = (headers: Record<string, string>, sent: unknown = body, to = path) =>
    fetch(`${base}${to}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(sent) }).then(async (r) => ({ status: r.status, json: (await r.json()) as Record<string, any> }))
  const sign = (over: Partial<Parameters<typeof signDeskRequest>[1]> = {}) => signDeskRequest(MODERATO_ROOT.account, { method: 'POST', path, chainId: 42431, body, ...over })

  const good = await sign()
  assert.equal((await send(good)).status, 200)
  const replay = await send(good)
  assert.equal(replay.status, 401)
  assert.match(replay.json['detail'], /already used/, 'the same signed request is accepted once')

  assert.equal((await send(await sign({ body: { ...body, budget: '2' } }), body)).status, 401, 'a signature over another body')
  assert.equal((await send(await sign({ chainId: 4217 }), AGENT())).status, 401, 'a signature for another chain')
  assert.equal((await send(await sign({ path: `/api/teams/${ACCOUNT}/cutoffs` }), AGENT())).status, 401, 'a signature for another route')
  assert.equal((await send(await sign({ method: 'PUT' }), AGENT())).status, 401, 'a signature for another method')
  const fresh = AGENT()
  assert.equal((await send(await sign({ body: fresh }), fresh)).status, 200, 'the control: the same shape, signed for what is sent')

  const now = Date.now()
  const stale = AGENT()
  const old = await send(await sign({ body: stale, issuedAt: now - DESK_AUTH_WINDOW_MS - 30_000 }), stale)
  assert.equal(old.status, 401)
  assert.match(old.json['detail'], /minutes/)
  const future = AGENT()
  assert.equal((await send(await sign({ body: future, issuedAt: now + DESK_AUTH_WINDOW_MS + 30_000 }), future)).status, 401)
  const inside = AGENT()
  assert.equal((await send(await sign({ body: inside, issuedAt: now - DESK_AUTH_WINDOW_MS + 30_000 }), inside)).status, 200, 'a request issued four and a half minutes ago is inside the window')

  const missing = await send({ [DESK_HEADER_ISSUED_AT]: String(now) })
  assert.equal(missing.status, 401)
  const garbage = await send({ [DESK_HEADER_ISSUED_AT]: String(now), [DESK_HEADER_SIGNATURE]: `0x${'12'.repeat(65)}` })
  assert.equal(garbage.status, 401)
})

test('H1: a WebCrypto P256 team key, the browser signer, signs team writes, and another P256 key does not', async () => {
  const keyPair = await WebCryptoP256.createKeyPair({ extractable: false })
  const browser = Account.fromWebCryptoP256(keyPair)
  const team = browser.address
  const root: TestRoot = { account: browser as DeskSigner, chainId: 42431 }
  const made = await call('POST', '/api/teams', { account: team, label: 'browser team', signer: 'webcrypto' }, { as: root })
  assert.equal(made.status, 200, JSON.stringify(made.json))
  assert.equal(store.team(team)!.label, 'browser team')
  const added = await call('POST', `/api/teams/${team}/agents`, AGENT(), { as: root })
  assert.equal(added.status, 200, JSON.stringify(added.json))

  const other = Account.fromWebCryptoP256(await WebCryptoP256.createKeyPair({ extractable: false }))
  const impostor = await call('POST', `/api/teams/${team}/agents`, AGENT(), { as: { account: other as DeskSigner, chainId: 42431 } })
  assert.equal(impostor.status, 401, 'a P256 key whose address is not the team')
  const secp = await call('POST', `/api/teams/${team}/agents`, AGENT(), { as: stranger })
  assert.equal(secp.status, 401)
  assert.equal(store.agents(team).length, 1)
})

test('H1: a passkey (WebAuthn assertion) team key signs team writes, and a tampered assertion does not', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const hex = (b64u: string) => Buffer.from(b64u, 'base64url').toString('hex')
  const credential = { id: 'test-credential', publicKey: `0x${hex(jwk.x!)}${hex(jwk.y!)}` as Hex }
  const authenticator = (tamper: boolean) => async (options?: { publicKey?: { challenge?: BufferSource } }) => {
    const challenge = Buffer.from(options!.publicKey!.challenge as ArrayBuffer)
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: challenge.toString('base64url'), origin: 'https://leash.test', crossOrigin: false }))
    const authData = Buffer.concat([createHash('sha256').update('leash.test').digest(), Buffer.from([0x05]), Buffer.alloc(4)])
    const signed = Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()])
    const signature = nodeSign('sha256', tamper ? Buffer.concat([signed, Buffer.from([1])]) : signed, { key: privateKey, dsaEncoding: 'der' })
    return { id: credential.id, type: 'public-key', response: { authenticatorData: authData, clientDataJSON, signature } }
  }
  const passkey = Account.fromWebAuthnP256(credential, { getFn: authenticator(false) as never, rpId: 'leash.test' })
  const team = passkey.address
  const made = await call('POST', '/api/teams', { account: team, label: 'passkey team', signer: 'passkey' }, { as: { account: passkey as DeskSigner, chainId: 42431 } })
  assert.equal(made.status, 200, JSON.stringify(made.json))
  const bad = Account.fromWebAuthnP256(credential, { getFn: authenticator(true) as never, rpId: 'leash.test' })
  const forged = await call('POST', `/api/teams/${team}/agents`, AGENT(), { as: { account: bad as DeskSigner, chainId: 42431 } })
  assert.equal(forged.status, 401, 'an assertion whose signature does not cover the challenge')
  assert.equal(store.agents(team).length, 0)
})

test('H1: only the owner renames; the signer kind and the network stay as created', async () => {
  const r = await call('POST', '/api/teams', { account: ACCOUNT, label: 'renamed by owner', signer: 'webcrypto' })
  assert.equal(r.status, 200)
  assert.equal(store.team(ACCOUNT)!.label, 'renamed by owner')
  assert.equal(store.team(ACCOUNT)!.signer, 'passkey', 'the signer kind is fixed at creation')
})

test('H1: pending agents hold a slot for an hour, then stop counting and are dropped', async () => {
  const team = Account.fromSecp256k1(generatePrivateKey()) as DeskSigner
  const root: TestRoot = { account: team, chainId: 42431 }
  assert.equal((await call('POST', '/api/teams', { account: team.address, label: 'cap', signer: 'webcrypto' }, { as: root })).status, 200)
  for (let i = 0; i < 25; i++) assert.equal((await call('POST', `/api/teams/${team.address}/agents`, AGENT(), { as: root })).status, 200)
  const full = await call('POST', `/api/teams/${team.address}/agents`, AGENT(), { as: root })
  assert.equal(full.status, 409)
  assert.equal(full.json['error'], 'too_many_agents')

  const aged = new Date(Date.now() - PENDING_TTL_MS - 60_000).toISOString()
  const oldest = store.agents(team.address).slice(0, 24).map((a) => a.key_id)
  for (const keyId of oldest) ageAgent(keyId, aged)
  const freed = await call('POST', `/api/teams/${team.address}/agents`, AGENT(), { as: root })
  assert.equal(freed.status, 200, `expired pending agents free their slots: ${JSON.stringify(freed.json)}`)
  assert.equal(store.agents(team.address).length, 2, 'the 24 expired pending rows were dropped, one fresh pending and the new one remain')
  const expired = await call('POST', `/api/agents/${oldest[0]}/confirm`, { tx: `0x${'ab'.repeat(32)}` }, { as: root })
  assert.equal(expired.status, 404, 'a dropped pending agent no longer exists')
})

/** Moves an agent's creation time back, the way an hour passing would. */
const ageAgent = (keyId: Address, at: string) => void db.prepare('update agent set created_at = ? where key_id = ?').run(at, keyId)

test('H1: a cut is the planned keychain calls on this team\'s keys and nothing else', () => {
  const [k1, k2, outsider] = [newKey(), newKey(), newKey()]
  const set = (key: Address) => ({ to: Addresses.accountKeychain as Address, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'setAllowedCalls', args: [key, []] }) })
  const revoke = (key: Address) => ({ to: Addresses.accountKeychain as Address, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'revokeKey', args: [key] }) })
  const plan = { teamKeys: [k1, k2], rescoped: [k1], revoked: [k2] }
  assert.deepEqual(cutCallsProof([set(k1), revoke(k2)], plan), { ok: true })

  const transfer = { to: '0x20c0000000000000000000006a37DA5C996874BE' as Address, data: '0xa9059cbb' as Hex }
  const cases: [string, Parameters<typeof cutCallsProof>[0], RegExp][] = [
    ['an extra transfer', [set(k1), revoke(k2), transfer], /not the AccountKeychain/],
    ['a key of another team', [set(outsider), revoke(k2)], /not a key of this team/],
    ['a planned key left out', [set(k1)], /never revokes/],
    ['a rescope that never happened', [revoke(k2)], /never rescopes/],
    ['value', [{ ...set(k1), value: 1n }, revoke(k2)], /moves value/],
    ['a function a cut never calls', [{ to: Addresses.accountKeychain as Address, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'updateSpendingLimit', args: [k1, transfer.to, 10n ** 12n] }) }, revoke(k2)], /never calls/],
    ['no calls', [], /no calls/],
  ]
  for (const [name, calls, why] of cases) {
    const r = cutCallsProof(calls, plan)
    assert.equal(r.ok, false, name)
    assert.match((r as { reason: string }).reason, why, name)
  }
})
