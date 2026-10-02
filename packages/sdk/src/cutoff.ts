import { encodeFunctionData } from 'viem'
import type { Address, Hex } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { removeRecipient, unboundedRules } from '@leash/policy'
import type { CallScope } from '@leash/policy'

export type CutoffPlan = {
  /** One transaction's calls: sign them together as a single 0x76 envelope with the root or an admin key. */
  calls: { to: Address; data: Hex }[]
  /** Keys whose scope is rewritten without the recipient. */
  rescoped: Address[]
  /** Keys that would be left with nothing callable, so they are revoked instead. */
  revoked: Address[]
  /** Keys that never could pay the recipient. */
  unchanged: Address[]
  /** Keys with a rule that allows any recipient: a cut cannot reach them, and the UI must say so. */
  unbounded: Address[]
}

/**
 * Builds the single transaction that removes one recipient from every key of a team.
 * Measured on Moderato: 3 keys in one envelope, 178,468 gas (spikes/vendor-cutoff).
 */
export function planCutoff(keys: readonly { keyId: Address; scopes: readonly CallScope[] }[], recipient: Address): CutoffPlan {
  const plan: CutoffPlan = { calls: [], rescoped: [], revoked: [], unchanged: [], unbounded: [] }
  for (const key of keys) {
    if (unboundedRules(key.scopes).length > 0) plan.unbounded.push(key.keyId)
    const cut = removeRecipient(key.scopes, recipient)
    if (!cut.changed) {
      plan.unchanged.push(key.keyId)
      continue
    }
    if (cut.empty) {
      plan.revoked.push(key.keyId)
      plan.calls.push({
        to: Addresses.accountKeychain,
        data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'revokeKey', args: [key.keyId] }),
      })
      continue
    }
    plan.rescoped.push(key.keyId)
    plan.calls.push({
      to: Addresses.accountKeychain,
      data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'setAllowedCalls', args: [key.keyId, cut.scopes as never] }),
    })
  }
  return plan
}
