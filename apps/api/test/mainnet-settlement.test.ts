import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Address, Hex } from 'viem'
import { NETWORKS } from '@leash/sdk'
import { settlementProof } from '../src/external.js'

/**
 * Receipt logs of two real MPP settlements on Tempo mainnet (chain 4217), each paid by an access key,
 * saved by scripts/mainnet-fixture.ts: one bounded getLogs for AccessKeySpend near the tip, then
 * getTransactionReceipt. The file carries the tx hash and block of each.
 */
type Log = { address: Address; topics: readonly Hex[]; data: Hex }
type Fixture = {
  chainId: number
  token: Address
  settlements: { tx: Hex; block: number; claim: { account: Address; keyId: Address; recipient: Address; amount: string; memo: Hex; currency: Address }; logs: Log[] }[]
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/mainnet-settlement.json', import.meta.url), 'utf8')) as Fixture

const OTHER: Address = '0x6666666666666666666666666666666666666666'

test('the fixture is two real mainnet settlements: chain 4217, USDC.e, a tx hash and block each, one sponsored and one not', () => {
  assert.equal(fixture.chainId, 4217)
  assert.equal(fixture.token.toLowerCase(), NETWORKS.mainnet.settlementToken.toLowerCase())
  assert.equal(fixture.settlements.length, 2)
  for (const s of fixture.settlements) {
    assert.match(s.tx, /^0x[0-9a-f]{64}$/)
    assert.ok(s.block > 42_000_000, 'a block from the mainnet era of this capture')
    assert.ok(s.logs.length >= 3, 'the receipt carries the transfer, the key spend and the fee')
    assert.equal(s.claim.currency.toLowerCase(), fixture.token.toLowerCase())
  }
  const spends = fixture.settlements.map((s) => proof(s).keySpend.length)
  assert.deepEqual(spends.sort(), [1, 2])
})

const proof = (s: Fixture['settlements'][number], claim: Partial<Fixture['settlements'][number]['claim']> = {}) => {
  const r = settlementProof(s.logs, { ...s.claim, ...claim })
  return r.ok ? r : assert.fail(`${s.tx} should prove: ${r.reason}`)
}

test('a real mainnet settlement paid by an access key proves the payment it carries', () => {
  for (const s of fixture.settlements) {
    const r = proof(s)
    assert.ok(r.keySpend.includes(s.claim.amount), `${s.tx}: the price is among the key's spends ${r.keySpend}`)
  }
})

test('the same real settlement fails for the wrong key, amount, memo and recipient', () => {
  const reject = (s: Fixture['settlements'][number], patch: Partial<Fixture['settlements'][number]['claim']>, pattern: RegExp) => {
    const r = settlementProof(s.logs, { ...s.claim, ...patch })
    assert.equal(r.ok, false, `${s.tx} must reject ${JSON.stringify(patch)}`)
    assert.match((r as { reason: string }).reason, pattern)
  }
  for (const s of fixture.settlements) {
    reject(s, { keyId: OTHER }, /no AccessKeySpend/)
    reject(s, { amount: String(BigInt(s.claim.amount) + 1n) }, /moved \d+ units/)
    reject(s, { memo: `0x${'ab'.repeat(32)}` }, /no transferWithMemo with memo/)
    reject(s, { recipient: OTHER }, /did not pay/)
  }
})
