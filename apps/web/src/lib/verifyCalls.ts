import { decodeFunctionData, encodeFunctionData, formatUnits } from 'viem'
import type { Address, Hex } from 'viem'
import { Abis, Addresses, Selectors } from 'viem/tempo'
import { removeRecipient } from '@leash/policy/cutoff'

/**
 * Nothing the API returns is signed on trust. The team key can move the team's whole balance, so
 * before it signs, the browser decodes what it is about to sign and compares it with what the user
 * entered and what the chain holds. Any difference throws RefusedToSign, and the page shows the reason.
 * Pure: viem only, so a test can run it in Node.
 */

export class RefusedToSign extends Error {
  override name = 'RefusedToSign'
  constructor(reason: string) {
    super(`Refused to sign: ${reason}`)
  }
}

export type Call = { to: Address; data: Hex }
export type Scope = { target: Address; selectorRules: readonly { selector: Hex; recipients: readonly Address[] }[] }
export type AuthorizePayload = {
  accessKey: { accessKeyAddress: Address; keyType: string }
  expiry: number
  limits: readonly { token: Address; limit: string; period: number }[]
  scopes: readonly { address: Address; selector: Hex; recipients: readonly Address[] }[]
}
/** What the user is shown before the signature: a title and label/value lines. */
export type Review = { title: string; lines: [label: string, value: string][] }

const KEYCHAIN: Address = Addresses.accountKeychain as Address
const TRANSFER_WITH_MEMO = Selectors.tip20.transferWithMemo.toLowerCase()
const lower = (a: string) => a.toLowerCase()
const same = (a: string, b: string) => lower(a) === lower(b)
const DECIMALS = 6
const MAX_KEY_LIFETIME_SECONDS = 31 * 86_400

/** The call that revokes one key, built here from the key id and nothing the API sent. */
export const buildRevokeCall = (keyId: Address): Call => ({
  to: KEYCHAIN,
  data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'revokeKey', args: [keyId] }),
})

export function reviewRevoke(keyId: Address, name: string): Review {
  return { title: 'You are signing one call', lines: [['Contract', `AccountKeychain ${KEYCHAIN}`], ['Function', 'revokeKey'], ['Key', `${keyId} (${name})`], ['Effect', 'The key can never pay again.']] }
}

/**
 * The authorization the API planned for a new agent key, against what the user entered. The key id,
 * the limit, the token, the period and the recipients must be the ones asked for, the scope must be
 * one payment function on the budget token, and the key must expire within a month.
 */
export function assertAuthorize(
  payload: AuthorizePayload,
  expected: {
    /** The key id the user pasted from leash-agent init; null when Leash generated the key. */
    keyId: Address | null
    /** The key id the API answered with next to the payload. */
    answeredKeyId: Address
    token: Address
    symbol: string
    budgetUnits: bigint
    periodSeconds: number
    /** The payout addresses of the services the user picked. The key may be scoped to some of them, never to another. */
    recipients: readonly Address[]
    /** Mainnet launch caps: the most one key may spend per period, and the shortest period allowed. */
    cap?: { maxBudgetUnits: bigint; minPeriodSeconds: number }
    nowSeconds?: number
  },
): Review {
  const keyId = payload.accessKey?.accessKeyAddress
  if (!keyId) throw new RefusedToSign('the plan names no key')
  if (payload.accessKey.keyType !== 'secp256k1') throw new RefusedToSign(`the plan authorizes a ${payload.accessKey.keyType} key, not secp256k1`)
  if (!same(keyId, expected.answeredKeyId)) throw new RefusedToSign(`the plan authorizes ${keyId}, but the API said it registered ${expected.answeredKeyId}`)
  if (expected.keyId && !same(keyId, expected.keyId)) throw new RefusedToSign(`the plan authorizes ${keyId}, not the key id ${expected.keyId} you entered`)

  if (payload.limits.length !== 1) throw new RefusedToSign(`the plan sets ${payload.limits.length} spending limits, not one`)
  const limit = payload.limits[0]!
  if (!same(limit.token, expected.token)) throw new RefusedToSign(`the limit is on ${limit.token}, not ${expected.token} (${expected.symbol})`)
  if (BigInt(limit.limit) !== expected.budgetUnits) throw new RefusedToSign(`the limit is ${formatUnits(BigInt(limit.limit), DECIMALS)} ${expected.symbol}, not the ${formatUnits(expected.budgetUnits, DECIMALS)} you entered`)
  if (limit.period !== expected.periodSeconds) throw new RefusedToSign(`the limit period is ${limit.period} seconds, not ${expected.periodSeconds}`)
  if (expected.cap && (BigInt(limit.limit) > expected.cap.maxBudgetUnits || limit.period < expected.cap.minPeriodSeconds))
    throw new RefusedToSign(`the limit is above the mainnet cap of ${formatUnits(expected.cap.maxBudgetUnits, DECIMALS)} ${expected.symbol} per day`)

  if (payload.scopes.length !== 1) throw new RefusedToSign(`the plan has ${payload.scopes.length} call scopes, not one`)
  const scope = payload.scopes[0]!
  if (!same(scope.address, expected.token)) throw new RefusedToSign(`the scope allows calls to ${scope.address}, not the ${expected.symbol} token ${expected.token}`)
  if (lower(scope.selector) !== TRANSFER_WITH_MEMO) throw new RefusedToSign(`the scope allows function ${scope.selector}, not transferWithMemo ${Selectors.tip20.transferWithMemo}`)
  if (scope.recipients.length === 0) throw new RefusedToSign('the scope allows any recipient')
  const allowed = new Set(expected.recipients.map(lower))
  const stray = scope.recipients.filter((r) => !allowed.has(lower(r)))
  if (stray.length > 0) throw new RefusedToSign(`the scope lets the key pay ${stray.join(', ')}, which is no service you picked`)

  const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (!Number.isInteger(payload.expiry) || payload.expiry <= now) throw new RefusedToSign('the key is already expired')
  if (payload.expiry > now + MAX_KEY_LIFETIME_SECONDS) throw new RefusedToSign('the key would live longer than a month')

  return {
    title: 'You are signing authorizeKey',
    lines: [
      ['Contract', `AccountKeychain ${KEYCHAIN}`],
      ['Function', 'authorizeKey'],
      ['Key', keyId],
      ['Token', `${expected.token} (${expected.symbol})`],
      ['Limit', `${formatUnits(expected.budgetUnits, DECIMALS)} ${expected.symbol} per ${expected.periodSeconds / 3600} hours`],
      ['Can call', `transferWithMemo on ${expected.token}`],
      ['Recipients', scope.recipients.join(', ')],
      ['Expires', new Date(payload.expiry * 1000).toISOString()],
    ],
  }
}

type Decoded = { functionName: string; args: readonly unknown[] }

function decodeKeychainCall(call: Call, index: number): Decoded {
  if (!same(call.to, KEYCHAIN)) throw new RefusedToSign(`call ${index + 1} goes to ${call.to}, not the AccountKeychain ${KEYCHAIN}`)
  try {
    return decodeFunctionData({ abi: Abis.accountKeychain, data: call.data }) as unknown as Decoded
  } catch {
    throw new RefusedToSign(`call ${index + 1} is not an AccountKeychain function`)
  }
}

/** A scope list in one order, addresses and selectors lowercased, so two readings of one set compare equal. */
function canonical(scopes: readonly Scope[]): string {
  return JSON.stringify(
    scopes
      .map((s) => ({
        target: lower(s.target),
        rules: s.selectorRules.map((r) => ({ selector: lower(r.selector), recipients: r.recipients.map(lower).sort() })).sort((a, b) => (a.selector < b.selector ? -1 : 1)),
      }))
      .sort((a, b) => (a.target < b.target ? -1 : 1)),
  )
}

/**
 * The cut plan the API returned for a recipient, against what the chain holds. Every call goes to the
 * AccountKeychain, rewrites or revokes a key of this team, and nothing more: a rewritten key keeps
 * exactly the scopes the chain shows for it today minus the cut recipient, and a revoked key is one
 * the cut leaves with nothing to call. `scopesByKey` are the scopes read from the chain just now.
 */
export function assertCutCalls(
  calls: readonly Call[],
  expected: { keyIds: readonly Address[]; recipient: Address; scopesByKey: Readonly<Record<string, readonly Scope[]>> },
): Review {
  if (calls.length === 0) throw new RefusedToSign('the plan has no calls')
  const team = new Set(expected.keyIds.map(lower))
  const touched = new Set<string>()
  const lines: Review['lines'] = [['Contract', `AccountKeychain ${KEYCHAIN}`], ['Cuts recipient', expected.recipient]]
  for (const [i, call] of calls.entries()) {
    const decoded = decodeKeychainCall(call, i)
    if (decoded.functionName !== 'setAllowedCalls' && decoded.functionName !== 'revokeKey') throw new RefusedToSign(`call ${i + 1} is ${decoded.functionName}, which a cut never calls`)
    const key = decoded.args[0] as Address
    if (!team.has(lower(key))) throw new RefusedToSign(`call ${i + 1} (${decoded.functionName}) names ${key}, which is not a key of this team`)
    if (touched.has(lower(key))) throw new RefusedToSign(`call ${i + 1} names ${key} a second time`)
    touched.add(lower(key))
    const held = expected.scopesByKey[lower(key)]
    if (!held) throw new RefusedToSign(`the scopes of ${key} were not read from the chain`)
    const cut = removeRecipient(held as never, expected.recipient)
    if (!cut.changed) throw new RefusedToSign(`${key} cannot pay ${expected.recipient} on chain, so a call for it has nothing to cut`)
    if (decoded.functionName === 'revokeKey') {
      if (!cut.empty) throw new RefusedToSign(`call ${i + 1} revokes ${key}, which still has other recipients after the cut`)
      lines.push([`Call ${i + 1}`, `revokeKey ${key}: nothing is left for it to pay`])
    } else {
      const next = decoded.args[1] as readonly Scope[]
      if (cut.empty) throw new RefusedToSign(`call ${i + 1} rewrites ${key}, which the cut leaves with nothing to call: it must be revoked`)
      if (canonical(next) !== canonical(cut.scopes)) throw new RefusedToSign(`call ${i + 1} gives ${key} scopes other than "what it has on chain minus ${expected.recipient}"`)
      lines.push([`Call ${i + 1}`, `setAllowedCalls ${key}: keeps ${next.flatMap((s) => s.selectorRules.flatMap((r) => r.recipients)).length} recipient(s), drops ${expected.recipient}`])
    }
  }
  return { title: 'You are signing one transaction', lines }
}
