import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeFunctionData, erc20Abi } from 'viem'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { Abis, Addresses, Selectors } from 'viem/tempo'
import { assertAuthorize, assertCutCalls, buildRevokeCall, RefusedToSign } from '../src/lib/verifyCalls'
import type { AuthorizePayload, Call, Scope } from '../src/lib/verifyCalls'

const USDCE: Address = '0x20c000000000000000000000b9537d11c60e8b50'
const KEYCHAIN = Addresses.accountKeychain as Address
const newAddress = () => privateKeyToAddress(generatePrivateKey())
const [K1, K2, OUTSIDER, VENDOR, KEEP, ATTACKER] = [newAddress(), newAddress(), newAddress(), newAddress(), newAddress(), newAddress()]
const MEMO = Selectors.tip20.transferWithMemo as Hex

const set = (key: Address, scopes: readonly Scope[]): Call => ({ to: KEYCHAIN, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'setAllowedCalls', args: [key, scopes as never] }) })
const revoke = (key: Address): Call => ({ to: KEYCHAIN, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'revokeKey', args: [key] }) })
const scopeOf = (...recipients: Address[]): Scope => ({ target: USDCE, selectorRules: [{ selector: MEMO, recipients }] })

// K1 can pay the vendor and another service, K2 can pay only the vendor.
const held = { [K1.toLowerCase()]: [scopeOf(VENDOR, KEEP)], [K2.toLowerCase()]: [scopeOf(VENDOR)] }
const cutArgs = { keyIds: [K1, K2], recipient: VENDOR, scopesByKey: held }
const honestCut = (): Call[] => [set(K1, [scopeOf(KEEP)]), revoke(K2)]

const refused = (calls: Call[], args = cutArgs) => assert.throws(() => assertCutCalls(calls, args), RefusedToSign)

test('an honest cut plan passes and says what it signs', () => {
  const review = assertCutCalls(honestCut(), cutArgs)
  assert.match(review.lines.map((l) => l.join(' ')).join('\n'), new RegExp(`setAllowedCalls ${K1}.*drops ${VENDOR}`))
  assert.match(review.lines.map((l) => l.join(' ')).join('\n'), new RegExp(`revokeKey ${K2}`))
})

test('a cut plan carrying a USDC.e transfer is refused before signing', () => {
  const steal: Call = { to: USDCE, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ATTACKER, 10n ** 12n] }) }
  refused([steal])
  refused([...honestCut(), steal])
})

test('a cut plan is refused for a wrong target, a wrong function, a key outside the team, or scopes that differ', () => {
  refused([{ ...revoke(K2), to: OUTSIDER }])
  refused([{ to: KEYCHAIN, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'updateSpendingLimit', args: [K1, USDCE, 10n ** 12n] }) }, revoke(K2)])
  refused([{ to: KEYCHAIN, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'removeAllowedCalls', args: [K1, USDCE] }) }, revoke(K2)])
  refused([set(K1, [scopeOf(KEEP)]), revoke(OUTSIDER)])
  // a rewrite that grants the attacker, or keeps the cut recipient, or widens a rule to any recipient
  refused([set(K1, [scopeOf(KEEP, ATTACKER)]), revoke(K2)])
  refused([set(K1, [scopeOf(KEEP, VENDOR)]), revoke(K2)])
  refused([set(K1, [{ target: USDCE, selectorRules: [{ selector: MEMO, recipients: [] }] }]), revoke(K2)])
  // a revoke of a key the cut leaves with other recipients, a rewrite of a key left with none
  refused([revoke(K1), revoke(K2)])
  refused([set(K1, [scopeOf(KEEP)]), set(K2, [])])
  // a key named twice, no calls, scopes never read from chain
  refused([set(K1, [scopeOf(KEEP)]), set(K1, [scopeOf(KEEP)]), revoke(K2)])
  refused([])
  refused(honestCut(), { ...cutArgs, scopesByKey: { [K1.toLowerCase()]: held[K1.toLowerCase()]! } })
  // a plan that cuts a different recipient than the user chose
  refused(honestCut(), { ...cutArgs, recipient: KEEP })
})

test('the revoke call is built from the key id and decodes to revokeKey of that key only', () => {
  const call = buildRevokeCall(K1)
  assert.equal(call.to.toLowerCase(), KEYCHAIN.toLowerCase())
  assert.deepEqual(call, revoke(K1))
})

const expected = { keyId: K1 as Address | null, answeredKeyId: K1, token: USDCE, symbol: 'USDC.e', budgetUnits: 2_500_000n, periodSeconds: 86_400, recipients: [VENDOR, KEEP], nowSeconds: 1_000_000 }
const honest = (): AuthorizePayload => ({
  accessKey: { accessKeyAddress: K1, keyType: 'secp256k1' },
  expiry: 1_000_000 + 30 * 86_400,
  limits: [{ token: USDCE, limit: '2500000', period: 86_400 }],
  scopes: [{ address: USDCE, selector: MEMO, recipients: [VENDOR] }],
})
const authorizeRefused = (mutate: (p: AuthorizePayload) => void, over: Partial<typeof expected> = {}) => {
  const p = honest()
  mutate(p)
  assert.throws(() => assertAuthorize(p, { ...expected, ...over }), RefusedToSign)
}

test('an honest authorize plan passes, and shows the key, limit, recipients and expiry', () => {
  const review = assertAuthorize(honest(), expected)
  const text = review.lines.map((l) => l.join(': ')).join('\n')
  for (const part of [K1, '2.5 USDC.e per 24 hours', VENDOR, 'transferWithMemo', '1970-02-']) assert.ok(text.includes(part), `${part} in ${text}`)
  assert.equal(assertAuthorize({ ...honest(), accessKey: { accessKeyAddress: K1, keyType: 'secp256k1' } }, { ...expected, keyId: null }).title, 'You are signing authorizeKey', 'a key Leash generated has no pasted id to compare')
})

test('an authorize plan is refused when the key, limit, token, scope, recipients or expiry are not what was asked', () => {
  authorizeRefused((p) => (p.accessKey.accessKeyAddress = ATTACKER), { answeredKeyId: ATTACKER })
  authorizeRefused((p) => (p.accessKey.accessKeyAddress = ATTACKER))
  authorizeRefused(() => undefined, { answeredKeyId: ATTACKER })
  authorizeRefused((p) => (p.accessKey.keyType = 'p256'))
  authorizeRefused((p) => (p.limits[0]!.limit = String(10n ** 15n)))
  authorizeRefused((p) => (p.limits[0]!.limit = '2500001'))
  authorizeRefused((p) => (p.limits[0]!.period = 0))
  authorizeRefused((p) => (p.limits[0]!.token = '0x20c0000000000000000000006a37DA5C996874BE'))
  authorizeRefused((p) => ((p as { limits: unknown }).limits = [...p.limits, ...p.limits]))
  authorizeRefused((p) => ((p as { limits: unknown }).limits = []))
  authorizeRefused((p) => (p.scopes[0]!.address = ATTACKER))
  authorizeRefused((p) => (p.scopes[0]!.selector = Selectors.tip20.transfer as Hex))
  authorizeRefused((p) => (p.scopes[0]!.recipients = [ATTACKER]))
  authorizeRefused((p) => (p.scopes[0]!.recipients = [VENDOR, ATTACKER]))
  authorizeRefused((p) => (p.scopes[0]!.recipients = []))
  authorizeRefused((p) => ((p as { scopes: unknown }).scopes = [...p.scopes, { address: ATTACKER, selector: MEMO, recipients: [ATTACKER] }]))
  authorizeRefused((p) => (p.expiry = 999_999))
  authorizeRefused((p) => (p.expiry = 1_000_000 + 400 * 86_400))
  // the user entered a different budget than the plan carries
  authorizeRefused(() => undefined, { budgetUnits: 1_000_000n })
  // the user picked services whose payouts do not include the plan's recipient
  authorizeRefused(() => undefined, { recipients: [KEEP] })
  // the user pasted a different key id
  authorizeRefused(() => undefined, { keyId: K2 })
})
