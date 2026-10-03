import { getAddress, isAddress, parseEventLogs, recoverMessageAddress } from 'viem'
import type { Address, Hex } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { recordDigest } from '@leash/sdk'
import type { DeliveryRecord, Outcome } from '@leash/sdk'
import { bad } from './http.js'

/**
 * Records reported by an agent that runs outside the desk. The desk holds no key for that agent,
 * so a record counts only when (1) the agent's own key signed it and (2) for a payment, the
 * chain shows the payment the record describes.
 */

const OUTCOMES: readonly Outcome[] = ['delivered', 'paid_not_delivered', 'refused', 'free', 'unsettled']
const PAID: readonly Outcome[] = ['delivered', 'paid_not_delivered']

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const lower = (a: string) => a.toLowerCase()

function text(o: Record<string, unknown>, key: string, max: number, nullable = false): string | null {
  const v = o[key]
  if (v === null && nullable) return null
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw bad(`record.${key} must be a string of 1 to ${max} characters${nullable ? ' or null' : ''}`)
  return v
}
function addr(o: Record<string, unknown>, key: string, nullable = false): Address | null {
  const v = o[key]
  if (v === null && nullable) return null
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) throw bad(`record.${key} must be an address${nullable ? ' or null' : ''}`)
  return getAddress(v)
}
function hex(o: Record<string, unknown>, key: string, bytes: number | null, nullable = false): Hex | null {
  const v = o[key]
  if (v === null && nullable) return null
  const ok = typeof v === 'string' && (bytes === null ? /^0x([0-9a-fA-F]{2})+$/.test(v) : new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(v))
  if (!ok) throw bad(`record.${key} must be ${bytes === null ? 'hex' : `${bytes} bytes of hex`}${nullable ? ' or null' : ''}`)
  return v as Hex
}
/** A record may not claim a moment later than this past the desk's clock. */
export const MAX_FUTURE_MS = 2 * 60_000
/** A paid record's finishedAt may not precede its settlement block by more than this. */
export const MAX_BEFORE_SETTLEMENT_MS = 60 * 60_000

/** A paid record cannot have finished long before the payment it reports settled. */
export function assertNotBeforeSettlement(finishedAt: string, settlementTimeMs: number): void {
  if (Date.parse(finishedAt) < settlementTimeMs - MAX_BEFORE_SETTLEMENT_MS) throw bad(`record.finishedAt is more than ${MAX_BEFORE_SETTLEMENT_MS / 60_000} minutes before its settlement block`)
}

function time(o: Record<string, unknown>, key: string, now: number): string {
  const v = text(o, key, 40)!
  const at = Date.parse(v)
  if (Number.isNaN(at)) throw bad(`record.${key} must be an ISO time`)
  if (at > now + MAX_FUTURE_MS) throw bad(`record.${key} is more than ${MAX_FUTURE_MS / 60_000} minutes in the future`)
  return v
}

/** Checks the record's shape and that it speaks for this key and team. Returns the record as typed fields, settlement left to the chain. */
export function parseRecord(raw: unknown, agent: { keyId: Address; account: Address }, now = Date.now()): DeliveryRecord {
  if (!isObject(raw)) throw bad('record must be an object')
  const outcome = raw['outcome']
  if (typeof outcome !== 'string' || !(OUTCOMES as readonly string[]).includes(outcome)) throw bad(`record.outcome must be one of ${OUTCOMES.join(', ')}`)
  const keyId = addr(raw, 'keyId')!
  const account = addr(raw, 'account')!
  if (lower(keyId) !== lower(agent.keyId)) throw bad(`record.keyId ${keyId} is not the agent ${agent.keyId}`)
  if (lower(account) !== lower(agent.account)) throw bad(`record.account ${account} is not the team account ${agent.account}`)
  const url = text(raw, 'url', 2_000)!
  if (!/^https?:\/\//.test(url)) throw bad('record.url must be an http or https url')
  const status = raw['status']
  if (status !== null && (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599)) throw bad('record.status must be an HTTP status or null')
  const amount = text(raw, 'amount', 40, true)
  if (amount !== null && !/^\d{1,30}$/.test(amount)) throw bad('record.amount must be base units as a decimal string or null')
  const refused = text(raw, 'refused', 80, true)
  const settlement = raw['settlement']
  if (settlement !== null && !isObject(settlement)) throw bad('record.settlement must be an object or null')
  const record: DeliveryRecord = {
    id: text(raw, 'id', 200)!,
    url,
    method: text(raw, 'method', 12)!,
    requestHash: hex(raw, 'requestHash', 32)!,
    realm: text(raw, 'realm', 200, true),
    keyId,
    account,
    recipient: addr(raw, 'recipient', true),
    amount,
    currency: addr(raw, 'currency', true),
    memo: hex(raw, 'memo', null, true),
    status,
    refused,
    settlement: settlement as DeliveryRecord['settlement'],
    outcome: outcome as Outcome,
    startedAt: time(raw, 'startedAt', now),
    finishedAt: time(raw, 'finishedAt', now),
  }
  if ((PAID as readonly string[]).includes(record.outcome)) {
    if (!record.recipient || !record.amount || !record.currency || !record.memo) throw bad('a paid record must carry recipient, amount, currency and memo')
    if (!isObject(settlement) || typeof settlement['tx'] !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(settlement['tx'])) throw bad('a paid record must carry settlement.tx')
    const ok = record.status !== null && record.status >= 200 && record.status < 300
    if (record.outcome === 'delivered' && !ok) throw bad(`a delivered record needs a 2xx status, got ${record.status}`)
    if (record.outcome === 'paid_not_delivered' && ok) throw bad('a paid_not_delivered record cannot carry a 2xx status')
  }
  if (record.outcome === 'refused' && !record.refused) throw bad('a refused record must name the refusal')
  return record
}

/** The key id that signed `record`, or null when the signature is malformed. */
export async function signerOf(record: DeliveryRecord, signature: unknown): Promise<Address | null> {
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null
  try {
    return await recoverMessageAddress({ message: { raw: recordDigest(record) }, signature: signature as Hex })
  } catch {
    return null
  }
}

type Log = { address: Address; topics: readonly Hex[]; data: Hex }

export type Proof = { ok: true; keySpend: string[] } | { ok: false; reason: string }

/**
 * Whether a settlement receipt's logs show the payment `claim` describes: a TransferWithMemo on the
 * payment token from the team account to the recipient, with the recorded memo and amount, and an
 * AccessKeySpend by this key for that amount. Sponsored settlements carry one AccessKeySpend (the
 * price); unsponsored ones carry the price and the gas as separate events, so the price must be
 * among them.
 */
export function settlementProof(logs: readonly Log[], claim: { account: Address; keyId: Address; recipient: Address; amount: string; memo: Hex; currency: Address }): Proof {
  const onToken = logs.filter((l) => lower(l.address) === lower(claim.currency))
  const transfers = parseEventLogs({ abi: Abis.tip20, logs: onToken as never, eventName: 'TransferWithMemo' }) as unknown as { args: { from: Address; to: Address; amount: bigint; memo: Hex } }[]
  const withMemo = transfers.filter((t) => lower(t.args.memo) === lower(claim.memo))
  if (withMemo.length === 0) return { ok: false, reason: `the settlement holds no transferWithMemo with memo ${claim.memo}` }
  const paid = withMemo.find((t) => lower(t.args.to) === lower(claim.recipient))
  if (!paid) return { ok: false, reason: `the settlement with that memo did not pay ${claim.recipient}` }
  if (lower(paid.args.from) !== lower(claim.account)) return { ok: false, reason: `the settlement paid from ${paid.args.from}, not the team account ${claim.account}` }
  if (String(paid.args.amount) !== claim.amount) return { ok: false, reason: `the settlement moved ${paid.args.amount} units, the record says ${claim.amount}` }
  // Any contract can emit an event with this signature: only the keychain precompile's own spend log is proof.
  const keychainLogs = logs.filter((l) => lower(l.address) === lower(Addresses.accountKeychain))
  const spends = (parseEventLogs({ abi: Abis.accountKeychain, logs: keychainLogs as never, eventName: 'AccessKeySpend' }) as unknown as { args: { account: Address; publicKey: Address; token: Address; amount: bigint } }[])
    .filter((e) => lower(e.args.publicKey) === lower(claim.keyId) && lower(e.args.account) === lower(claim.account) && lower(e.args.token) === lower(claim.currency))
    .map((e) => String(e.args.amount))
  if (!spends.includes(claim.amount)) return { ok: false, reason: `key ${claim.keyId} has no AccessKeySpend of ${claim.amount} in the settlement (it spent ${spends.join(', ') || 'nothing'})` }
  return { ok: true, keySpend: spends }
}
