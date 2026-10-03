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
import { memoryStore } from './helpers.js'
import type { TestStore } from './helpers.js'

/** The reviewer's scratch tests from docs/SECURITY-REVIEW-MAINNET.md, ported unchanged in what they assert. */

const VICTIM: Address = '0x8888888888888888888888888888888888888888'
let onServer: Server, onBase: string, onStore: TestStore
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
})
after(() => void onServer.close())

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
