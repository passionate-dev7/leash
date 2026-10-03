import { decodeFunctionData } from 'viem'
import type { Address, Hex } from 'viem'
import { Abis, Addresses } from 'viem/tempo'

const lower = (a: string) => a.toLowerCase()

/** The keychain functions a cut is made of: rewrite a key's scopes, drop one scope, or revoke the key outright. */
const CUT_FUNCTIONS = ['setAllowedCalls', 'removeAllowedCalls', 'revokeKey'] as const

export type ChainCall = { to?: Address | null; data?: Hex | null; value?: bigint | null }
export type CutCallsProof = { ok: true } | { ok: false; reason: string }

/**
 * Whether a transaction's calls are the cut the desk planned and nothing else: each call goes to the
 * AccountKeychain precompile, is a keychain scope or revoke function, names a key of this team, and
 * moves no value. Every key the plan rescoped gets a scope call and every key it revoked gets a revoke.
 * A transaction that did something else as well, or that touched a key the team does not hold, is not a cut.
 */
export function cutCallsProof(calls: readonly ChainCall[], plan: { teamKeys: readonly Address[]; rescoped: readonly Address[]; revoked: readonly Address[] }): CutCallsProof {
  if (calls.length === 0) return { ok: false, reason: 'the transaction carries no calls' }
  const team = new Set(plan.teamKeys.map(lower))
  const scoped = new Set<string>()
  const revoked = new Set<string>()
  for (const [i, call] of calls.entries()) {
    if (!call.to || lower(call.to) !== lower(Addresses.accountKeychain)) return { ok: false, reason: `call ${i} goes to ${call.to ?? 'a contract creation'}, not the AccountKeychain ${Addresses.accountKeychain}` }
    if (call.value && call.value > 0n) return { ok: false, reason: `call ${i} moves value` }
    let decoded: { functionName: string; args?: readonly unknown[] }
    try {
      decoded = decodeFunctionData({ abi: Abis.accountKeychain, data: call.data ?? '0x' }) as typeof decoded
    } catch {
      return { ok: false, reason: `call ${i} is not an AccountKeychain function` }
    }
    if (!(CUT_FUNCTIONS as readonly string[]).includes(decoded.functionName)) return { ok: false, reason: `call ${i} is ${decoded.functionName}, which a cut never calls` }
    const key = decoded.args?.[0]
    if (typeof key !== 'string' || !team.has(lower(key))) return { ok: false, reason: `call ${i} (${decoded.functionName}) names ${String(key)}, which is not a key of this team` }
    ;(decoded.functionName === 'revokeKey' ? revoked : scoped).add(lower(key))
  }
  for (const key of plan.rescoped) if (!scoped.has(lower(key))) return { ok: false, reason: `the transaction never rescopes key ${key}` }
  for (const key of plan.revoked) if (!revoked.has(lower(key))) return { ok: false, reason: `the transaction never revokes key ${key}` }
  return { ok: true }
}
