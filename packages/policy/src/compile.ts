import { encodeFunctionData, parseUnits, formatUnits } from 'viem'
import type { Address, Hex } from 'viem'
import { Abis } from 'viem/tempo'
import {
  ACCOUNT_KEYCHAIN,
  AUTHORIZE_KEY_SIGNATURE,
  CHANNEL_RESERVE,
  SELECTOR,
} from './constants.js'
import { norm } from './blast-radius.js'
import type {
  CallScope,
  CompiledPolicy,
  CoverageGap,
  FlatScope,
  KeyRestrictions,
  PolicyInput,
  RecipientIndex,
  ResolvedRecipient,
  SelectorRule,
} from './types.js'

/**
 * The `authorizeKey` overload that takes the nested `KeyRestrictions` tuple. Selected from
 * the generated ABI by matching the argument shape, never by index, so a regenerated ABI
 * that reorders overloads cannot silently change which function we encode.
 */
export const authorizeKeyAbiItem = (() => {
  const item = Abis.accountKeychain.find(
    (x) =>
      x.type === 'function' &&
      x.name === 'authorizeKey' &&
      x.inputs.length === 3 &&
      x.inputs[2]?.type === 'tuple',
  )
  if (!item) throw new Error('viem/tempo Abis.accountKeychain has no 3-arg authorizeKey')
  return item
})()

export class PolicyCompileError extends Error {
  override name = 'PolicyCompileError'
}

/** Parses "50" against 6 decimals into 50_000000n. Thin, but it keeps parsing in one place. */
export const toSmallestUnits = (human: string, decimals: number): bigint =>
  parseUnits(human, decimals)

export const fromSmallestUnits = (units: bigint, decimals: number): string =>
  formatUnits(units, decimals)

/**
 * Groups flat scopes into the nested `CallScope[]` wire format, matching
 * `ox/tempo/KeyAuthorization.toRpc` exactly: group by target address in first-seen order,
 * one `SelectorRule` per selector occurrence, recipients carried through.
 *
 * Leash additionally unions recipients for a repeated (target, selector) pair, because a
 * 40-service allowlist on one token must collapse into one scope with 40 recipients rather
 * than 40 scopes. MPP-CATALOG.md §6.
 */
export function groupScopes(scopes: readonly FlatScope[]): CallScope[] {
  const byTarget = new Map<string, { target: Address; rules: Map<string, SelectorRule> }>()
  for (const scope of scopes) {
    const targetKey = norm(scope.address)
    let group = byTarget.get(targetKey)
    if (!group) {
      group = { target: scope.address, rules: new Map() }
      byTarget.set(targetKey, group)
    }
    const selectorKey = norm(scope.selector)
    const existing = group.rules.get(selectorKey)
    if (existing) {
      const seen = new Set(existing.recipients.map(norm))
      for (const r of scope.recipients ?? []) {
        if (seen.has(norm(r))) continue
        seen.add(norm(r))
        existing.recipients.push(r)
      }
      continue
    }
    const recipients: Address[] = []
    const seen = new Set<string>()
    for (const r of scope.recipients ?? []) {
      if (seen.has(norm(r))) continue
      seen.add(norm(r))
      recipients.push(r)
    }
    group.rules.set(selectorKey, { selector: scope.selector, recipients })
  }
  return [...byTarget.values()].map((g) => ({
    target: g.target,
    selectorRules: [...g.rules.values()],
  }))
}

/** Encodes `authorizeKey(address,uint8,KeyRestrictions)`. */
export function encodeAuthorizeKey(
  keyId: Address,
  signatureType: 0 | 1 | 2,
  restrictions: KeyRestrictions,
): Hex {
  return encodeFunctionData({
    abi: [authorizeKeyAbiItem],
    functionName: 'authorizeKey',
    args: [keyId, signatureType, restrictions],
  })
}

/**
 * Turns a human policy into the exact `KeyRestrictions` tuple, using recipients resolved from
 * the live MPP catalog rather than hand-typed addresses.
 *
 * `keyId` is only needed to produce inspectable calldata; the provisioning path the protocol
 * actually uses carries the authorization in the transaction envelope (BUILD-SPEC §4.2), and
 * takes `restrictions` / `scopes` from this same result.
 */
export function compilePolicy(
  input: PolicyInput,
  index: RecipientIndex,
  options: { keyId?: Address } = {},
): CompiledPolicy {
  if (input.budget <= 0n)
    throw new PolicyCompileError('budget must be greater than zero')
  if (input.periodSeconds < 0)
    throw new PolicyCompileError('periodSeconds cannot be negative')
  if (!Number.isFinite(input.expiry) || input.expiry <= 0)
    throw new PolicyCompileError('expiry must be a unix timestamp in seconds')

  const byId = new Map(index.resolved.map((r) => [r.serviceId, r]))
  const covered: ResolvedRecipient[] = []
  const gaps: CoverageGap[] = []
  const sessionServices: ResolvedRecipient[] = []

  for (const id of input.serviceIds) {
    const service = byId.get(id)
    if (!service) {
      const unresolved = index.unresolved.find((u) => u.serviceId === id)
      gaps.push({
        serviceId: id,
        name: unresolved?.name ?? id,
        kind: 'unresolved',
        detail:
          unresolved?.reason ??
          `no recipient resolved for "${id}" in the snapshot captured ${index.capturedAt}`,
      })
      continue
    }
    if (service.intent === 'session') {
      sessionServices.push(service)
      gaps.push({
        serviceId: id,
        name: service.name,
        kind: 'session-intent',
        detail: input.allowSessionChannels
          ? `pays through tip20ChannelReserve.open at ${service.escrowContract ?? CHANNEL_RESERVE}. The channel selector is allowlisted, but open() carries the counterparty inside its calldata and the precompile extracts no recipient from it, so the recipient allowlist does not constrain this service. Containment here is budget and expiry only.`
          : `pays through tip20ChannelReserve.open at ${service.escrowContract ?? CHANNEL_RESERVE}, not transferWithMemo on the token. This key cannot pay it at all. Enable session channels to allow it, and understand that recipient scoping will not apply.`,
      })
      continue
    }
    if (norm(service.currency) !== norm(input.token)) {
      gaps.push({
        serviceId: id,
        name: service.name,
        kind: 'currency-mismatch',
        detail: `quotes ${service.currency} but the policy budget is denominated in ${input.token}. The scope target is the token contract, so an unlisted token is an unlisted target and this call would revert CallNotAllowed.`,
      })
      continue
    }
    covered.push(service)
  }

  // charge-intent recipients, deduplicated, catalog first then operator extras.
  const recipients: Address[] = []
  const seen = new Set<string>()
  for (const s of covered) {
    if (seen.has(norm(s.recipient))) continue
    seen.add(norm(s.recipient))
    recipients.push(s.recipient)
  }
  for (const extra of input.extraRecipients ?? []) {
    if (seen.has(norm(extra))) continue
    seen.add(norm(extra))
    recipients.push(extra)
  }

  const scopes: FlatScope[] = []
  if (recipients.length > 0)
    scopes.push({
      address: input.token,
      selector: SELECTOR.transferWithMemo,
      recipients,
    })

  if (input.allowSessionChannels) {
    const escrows = new Set<string>()
    for (const s of sessionServices) escrows.add(norm(s.escrowContract ?? CHANNEL_RESERVE))
    if (escrows.size === 0) escrows.add(norm(CHANNEL_RESERVE))
    for (const escrow of escrows) {
      scopes.push({ address: escrow as Address, selector: SELECTOR.channelOpen })
      scopes.push({ address: escrow as Address, selector: SELECTOR.channelTopUp })
    }
  }

  if (scopes.length === 0)
    throw new PolicyCompileError(
      'policy produced no scopes. allowAnyCalls=false with an empty allowedCalls list is scoped deny-all, not allow-all: the key would be able to call nothing. Name at least one payable service or extra recipient.',
    )

  const allowedCalls = groupScopes(scopes)
  const restrictions: KeyRestrictions = {
    expiry: BigInt(Math.floor(input.expiry)),
    enforceLimits: true,
    limits: [
      { token: input.token, amount: input.budget, period: BigInt(input.periodSeconds) },
    ],
    allowAnyCalls: false,
    allowedCalls,
  }

  const signatureType = input.signatureType ?? 0
  const keyId =
    options.keyId ?? ('0x0000000000000000000000000000000000000000' as Address)
  const calldata = encodeAuthorizeKey(keyId, signatureType, restrictions)
  const selector = calldata.slice(0, 10) as Hex
  if (selector !== SELECTOR.authorizeKey)
    throw new PolicyCompileError(
      `encoded selector ${selector} is not authorizeKey ${SELECTOR.authorizeKey}. The ABI overload changed; ${AUTHORIZE_KEY_SIGNATURE} is the one Leash targets.`,
    )

  const oneCallOfEachCost = covered.reduce((sum, s) => sum + BigInt(s.amount), 0n)

  return {
    input,
    restrictions,
    scopes,
    calldata,
    selector,
    recipients,
    covered,
    gaps,
    oneCallOfEachCost,
  }
}

/** Where the compiled calldata is sent if a caller chooses the plain-transaction path. */
export const AUTHORIZE_KEY_TARGET = ACCOUNT_KEYCHAIN

/**
 * A plain-language rendering of what the compiled tuple permits, for the confirmation screen.
 * Every clause maps to a field, so an operator can check the sentence against the tuple.
 */
export function describePolicy(policy: CompiledPolicy, tokenSymbol = 'USDC'): string[] {
  const { input, restrictions } = policy
  const lines: string[] = []
  const limit = restrictions.limits[0]
  const period = Number(limit?.period ?? 0n)
  const budget = fromSmallestUnits(limit?.amount ?? 0n, input.decimals)
  lines.push(
    period === 0
      ? `Spend at most ${budget} ${tokenSymbol}, ever, with no reset.`
      : `Spend at most ${budget} ${tokenSymbol} per ${period / 86_400} days, enforced in consensus.`,
  )
  for (const scope of restrictions.allowedCalls) {
    for (const rule of scope.selectorRules) {
      if (rule.selector === SELECTOR.transferWithMemo)
        lines.push(
          `Call transferWithMemo (${rule.selector}) on ${scope.target} to ${rule.recipients.length} allowed recipient${rule.recipients.length === 1 ? '' : 's'}, and nothing else on that token. Plain transfer() reverts CallNotAllowed.`,
        )
      else if (rule.selector === SELECTOR.channelOpen)
        lines.push(
          `Open a payment channel (${rule.selector}) on ${scope.target}. The recipient allowlist does not apply here; the only containment is the budget and the expiry.`,
        )
      else if (rule.selector === SELECTOR.channelTopUp)
        lines.push(`Top up a payment channel (${rule.selector}) on ${scope.target}.`)
      else lines.push(`Call ${rule.selector} on ${scope.target}.`)
    }
  }
  lines.push(
    `Stop working at unix ${restrictions.expiry} (${new Date(Number(restrictions.expiry) * 1000).toISOString()}).`,
  )
  lines.push('Do nothing else. Any other call reverts CallNotAllowed at the precompile.')
  return lines
}
