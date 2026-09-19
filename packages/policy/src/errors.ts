import { toFunctionSelector } from 'viem'
import type { Hex } from 'viem'
import { Abis } from 'viem/tempo'

/**
 * Revert decoding for the enforcement layer.
 *
 * Built from the generated ABI at module load, so a regenerated ABI cannot leave a stale
 * table behind. The one entry not in the ABI is `0xaa4bc69a`, which `getRemainingLimit`
 * returns for a period-based limit; it decodes to nothing and is recorded here because the
 * only way to learn it is to hit it. BUILD-SPEC §3.4.
 */

function buildTable(abi: readonly unknown[]): Map<Hex, { name: string; signature: string }> {
  const table = new Map<Hex, { name: string; signature: string }>()
  for (const item of abi as { type?: string; name?: string; inputs?: { type: string }[] }[]) {
    if (item.type !== 'error' || !item.name) continue
    const signature = `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(',')})`
    table.set(toFunctionSelector(signature) as Hex, { name: item.name, signature })
  }
  return table
}

export const KEYCHAIN_ERRORS = buildTable(Abis.accountKeychain)
export const TIP20_ERRORS = buildTable(Abis.tip20)

/** Errors observed on chain that the published ABI does not carry. */
export const UNDOCUMENTED_ERRORS: Record<string, { name: string; note: string }> = {
  '0xaa4bc69a': {
    name: 'PeriodLimitRequiresWithPeriodRead',
    note: 'getRemainingLimit reverts with this for a key whose limit has a non-zero period. Call getRemainingLimitWithPeriod instead; it succeeds on the same key in the same block.',
  },
}

/** Every enforcement error a Leash surface may need to render. BUILD-SPEC §3.6. */
export const ENFORCEMENT_ERRORS = [
  'SpendingLimitExceeded',
  'CallNotAllowed',
  'KeyExpired',
  'KeyNotFound',
  'KeyAlreadyRevoked',
  'InvalidCallScope',
  'UnauthorizedCaller',
] as const
export type EnforcementError = (typeof ENFORCEMENT_ERRORS)[number]

export type DecodedRevert = {
  /** The custom error name, when one could be determined. */
  name?: string
  signature?: string
  selector?: Hex
  /** True when the failure is the consensus rule doing its job rather than a client bug. */
  enforcement: boolean
  /**
   * True when the node refused the transaction before execution rather than reverting it.
   * A revoked key produces this: rejected, not reverted, and it never reaches a block.
   * BUILD-SPEC §6.1.
   */
  rejectedPreExecution: boolean
  /** What to put on screen. */
  message: string
  /** The untouched error text, so nothing is lost to the classifier. */
  raw: string
}

const SELECTOR_IN_TEXT = /0x[0-9a-fA-F]{8}\b/

/**
 * Classifies a thrown error from viem into something a UI can render honestly.
 *
 * Deliberately does three independent passes, because the same revert arrives differently
 * depending on whether it came back from `eth_estimateGas`, from `eth_sendRawTransaction`,
 * or from a receipt: a decoded `errorName`, the error name spelled in the message text, or
 * a bare 4-byte selector in the revert data.
 */
export function decodeRevert(error: unknown): DecodedRevert {
  const raw = errorText(error)

  // Pass 1: viem already decoded it.
  const decodedName = findDecodedErrorName(error)
  if (decodedName) return finish(decodedName, undefined, raw)

  // Pass 2: the name appears verbatim in the message.
  for (const entry of [...KEYCHAIN_ERRORS.values(), ...TIP20_ERRORS.values()]) {
    if (new RegExp(`\\b${entry.name}\\b`).test(raw))
      return finish(entry.name, entry.signature, raw)
  }

  // Pass 3: a bare selector in the revert data.
  const match = raw.match(SELECTOR_IN_TEXT)
  const selector = match?.[0]?.toLowerCase() as Hex | undefined
  if (selector) {
    const known = KEYCHAIN_ERRORS.get(selector) ?? TIP20_ERRORS.get(selector)
    if (known) return { ...finish(known.name, known.signature, raw), selector }
    const undocumented = UNDOCUMENTED_ERRORS[selector]
    if (undocumented)
      return {
        name: undocumented.name,
        selector,
        enforcement: false,
        rejectedPreExecution: false,
        message: undocumented.note,
        raw,
      }
  }

  const rejected = looksPreExecution(raw)
  return {
    enforcement: false,
    rejectedPreExecution: rejected,
    message: rejected
      ? 'Rejected by the node before execution. The key was resolved and refused, so the transaction never reached a block and cost nothing.'
      : firstLine(raw),
    raw,
  }
}

/**
 * The node's own words when it refuses a key during validation rather than in the EVM.
 * Observed on Moderato: `Revm error: keychain validation failed:
 * AccountKeychainError(KeyAlreadyRevoked(KeyAlreadyRevoked))`, returned from
 * `eth_estimateGas` for a revoked key while a live key estimates normally in the same block.
 */
const KEYCHAIN_VALIDATION = /keychain validation failed|AccountKeychainError/i

function finish(name: string, signature: string | undefined, raw: string): DecodedRevert {
  const enforcement = (ENFORCEMENT_ERRORS as readonly string[]).includes(name)
  const preExecution = KEYCHAIN_VALIDATION.test(raw)
  return {
    name,
    ...(signature ? { signature } : {}),
    enforcement,
    rejectedPreExecution: preExecution,
    message: preExecution ? `${explain(name)} Refused during keychain validation, so it never reached a block and cost nothing.` : explain(name),
    raw,
  }
}

/** Plain-language meaning for every enforcement error, phrased for an operator. */
export function explain(name: string): string {
  switch (name) {
    case 'SpendingLimitExceeded':
      return 'The protocol refused the payment: it would have taken the key past its budget for this period. Consensus rule, not application code.'
    case 'CallNotAllowed':
      return 'The protocol refused the call: the (token, selector, recipient) triple is outside this key’s allowlist. Paying an unlisted recipient, calling plain transfer() instead of transferWithMemo, and paying in an unscoped token all land here.'
    case 'KeyExpired':
      return 'The key is past its expiry. Budget is irrelevant; the key is dead until reauthorized.'
    case 'KeyNotFound':
      return 'No such key on this account. It was never authorized, or it was revoked and the record zeroed.'
    case 'KeyAlreadyRevoked':
      return 'The key has already been revoked. Revocation is terminal for that key id.'
    case 'InvalidCallScope':
      return 'The scope itself was malformed. A CallScope needs a target and at least one selector rule.'
    case 'UnauthorizedCaller':
      return 'The caller is not permitted to perform this keychain operation. Key management requires the root account.'
    case 'InvalidSpendingLimit':
      return 'The spending limit is not acceptable to the precompile.'
    case 'ExpiryInPast':
      return 'The expiry is already behind the current block timestamp.'
    case 'ZeroPublicKey':
      return 'The key id is the zero address.'
    case 'KeyAlreadyExists':
      return 'A key with this id is already authorized on this account.'
    case 'InsufficientBalance':
      return 'The account does not hold enough of this token. This is a balance failure, not a policy failure: the key was allowed to make the call.'
    default:
      return `Reverted ${name}.`
  }
}

function errorText(error: unknown): string {
  if (error === null || error === undefined) return ''
  if (typeof error === 'string') return error
  const e = error as { shortMessage?: string; message?: string; details?: string }
  const parts = [e.shortMessage, e.message, e.details].filter(
    (p): p is string => typeof p === 'string',
  )
  const walked = walkCauses(error)
  return [...new Set([...parts, ...walked])].join('\n')
}

function walkCauses(error: unknown, depth = 0): string[] {
  if (depth > 8 || error === null || typeof error !== 'object') return []
  const e = error as {
    cause?: unknown
    data?: unknown
    metaMessages?: string[]
    shortMessage?: string
    message?: string
  }
  const out: string[] = []
  if (typeof e.shortMessage === 'string') out.push(e.shortMessage)
  if (typeof e.message === 'string') out.push(e.message)
  if (Array.isArray(e.metaMessages)) out.push(...e.metaMessages)
  if (typeof e.data === 'string') out.push(e.data)
  if (e.data && typeof e.data === 'object') {
    const d = e.data as { errorName?: string; data?: string }
    if (d.errorName) out.push(d.errorName)
    if (typeof d.data === 'string') out.push(d.data)
  }
  if (e.cause) out.push(...walkCauses(e.cause, depth + 1))
  return out
}

function findDecodedErrorName(error: unknown, depth = 0): string | undefined {
  if (depth > 8 || error === null || typeof error !== 'object') return undefined
  const e = error as { data?: { errorName?: string }; cause?: unknown }
  if (e.data?.errorName) return e.data.errorName
  return findDecodedErrorName(e.cause, depth + 1)
}

/**
 * A revoked or unknown key fails at signature resolution, so the node never builds a
 * receipt. These are the strings that path produces.
 */
function looksPreExecution(raw: string): boolean {
  return (
    KEYCHAIN_VALIDATION.test(raw) ||
    /invalid sender|access key|unknown key|nonce too|failed to resolve/i.test(raw)
  )
}

const firstLine = (raw: string): string => raw.split('\n')[0]?.slice(0, 240) ?? 'Unknown error'
