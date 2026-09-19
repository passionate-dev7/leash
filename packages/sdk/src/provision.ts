import { parseEventLogs } from 'viem'
import type { Address, Hex } from 'viem'
import { Abis, Actions, Addresses } from 'viem/tempo'
import type { Transaction as TempoTransaction } from 'viem/tempo'
import { decodeRevert, SELECTOR } from '@leash/policy'
import type { CompiledPolicy, FlatScope } from '@leash/policy'
import type { LeashClient } from './client.js'
import { explorerTx } from './client.js'
import type { AccessKeyAccount, AgentKey, RootAccount } from './keys.js'
import { getAllowedCalls, getKey, getRemainingLimit } from './reads.js'
import type { AllowedCalls, KeyState, RemainingLimit } from './reads.js'

/**
 * Provision, update, revoke.
 *
 * Every write returns the receipt, the decoded events, the gas it cost and an explorer link,
 * because "it returned a hash" is an accepted request, not a completed operation.
 */

/** Tempo receipts carry a third status, `pending`, that a generic viem receipt type lacks. */
export type TempoReceipt = TempoTransaction.TransactionReceipt

export type WriteResult = {
  hash: Hex
  receipt: TempoReceipt
  gasUsed: bigint
  /** Whoever the receipt says paid. `self` means the budget absorbed the gas. */
  feePayer?: Address
  events: { eventName: string; args: Record<string, unknown> }[]
  explorer: string
  submittedAt: string
  /** Wallclock from submit to receipt, which is the number that matters for a kill switch. */
  elapsedMs: number
}

async function settle(
  client: LeashClient,
  hash: Hex,
  startedAt: number,
): Promise<WriteResult> {
  const receipt = await client.waitForTransactionReceipt({ hash })
  const raw = (await client.request({
    method: 'eth_getTransactionReceipt' as never,
    params: [hash] as never,
  })) as { feePayer?: Address } | null
  const events = parseEventLogs({ abi: Abis.accountKeychain, logs: receipt.logs }).map((e) => ({
    eventName: e.eventName as string,
    args: e.args as Record<string, unknown>,
  }))
  if (receipt.status !== 'success')
    throw new Error(
      `transaction ${hash} did not succeed: status ${receipt.status}, gasUsed ${receipt.gasUsed}. A hash is an accepted request, not a completed operation.`,
    )
  return {
    hash,
    receipt,
    gasUsed: receipt.gasUsed,
    ...(raw?.feePayer ? { feePayer: raw.feePayer } : {}),
    events,
    explorer: explorerTx(client.leash.network, hash),
    submittedAt: new Date(startedAt).toISOString(),
    elapsedMs: Date.now() - startedAt,
  }
}

export type AuthorizeResult = WriteResult & {
  keyId: Address
  /** Read back from the chain after the write, not echoed from the request. */
  verified: { key: KeyState; limit: RemainingLimit; allowed: AllowedCalls }
}

/**
 * Authorizes a scoped, budgeted access key.
 *
 * The authorization rides as a `key_authorization` field inside the type-0x76 envelope
 * rather than as a call to `authorizeKey`. The node installs the key before it verifies the
 * transaction signature. BUILD-SPEC §4.2. The compiled calldata on `policy.calldata` is the
 * same restrictions in the plain-call form, kept for inspection.
 */
export async function authorizeKey(
  client: LeashClient,
  args: {
    /** The operator's root account. Must be the client's account. */
    root: RootAccount
    agentKey: AgentKey
    policy: CompiledPolicy
  },
): Promise<AuthorizeResult> {
  const { root, agentKey, policy } = args
  const accessKey = agentKey.toAccount(root)
  const startedAt = Date.now()
  const hash = await Actions.accessKey.authorize(client, {
    accessKey,
    expiry: Number(policy.restrictions.expiry),
    limits: policy.restrictions.limits.map((l) => ({
      token: l.token,
      limit: l.amount,
      period: Number(l.period),
    })),
    scopes: policy.scopes as FlatScope[],
  } as never)
  const result = await settle(client, hash, startedAt)

  const rootAddress = (root as { address: Address }).address
  const token = policy.restrictions.limits[0]?.token
  if (!token) throw new Error('compiled policy has no token limit')
  const [key, limit, allowed] = await Promise.all([
    getKey(client, rootAddress, agentKey.keyId),
    getRemainingLimit(client, rootAddress, agentKey.keyId, token),
    getAllowedCalls(client, rootAddress, agentKey.keyId),
  ])
  if (!key.exists)
    throw new Error(
      `authorizeKey landed in ${hash} but getKey(${rootAddress}, ${agentKey.keyId}) reports no live key. The key id is almost certainly wrong: an access key account reports its parent's address as .address, and the key id is .accessKeyAddress.`,
    )
  return { ...result, keyId: agentKey.keyId, verified: { key, limit, allowed } }
}

/**
 * Resets the remaining budget for the current period to a new limit.
 *
 * It resets, it does not scale: a 50 USDC cap with 43.99 left, moved to 2 USDC, leaves
 * exactly 2 USDC spendable and the period end unchanged. That makes it a mid-period top-up
 * as well as a clamp, which is a feature to expose deliberately. BUILD-SPEC §6.2.
 *
 * On mainnet this function has been called exactly zero times in a 50,000-block window.
 */
export async function updateSpendingLimit(
  client: LeashClient,
  args: { keyId: Address; token: Address; limit: bigint },
): Promise<WriteResult & { after: RemainingLimit }> {
  const startedAt = Date.now()
  const hash = await client.writeContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'updateSpendingLimit',
    args: [args.keyId, args.token, args.limit],
  } as never)
  const result = await settle(client, hash, startedAt)
  const account = client.account?.address
  if (!account) throw new Error('client has no account')
  const after = await getRemainingLimit(client, account, args.keyId, args.token)
  return { ...result, after }
}

/** Replaces the key's entire call scope set. Takes flat scopes; groups them on the way in. */
export async function setAllowedCalls(
  client: LeashClient,
  args: { keyId: Address; scopes: readonly FlatScope[] },
): Promise<WriteResult & { after: AllowedCalls }> {
  const { groupScopes } = await import('@leash/policy')
  const allowedCalls = groupScopes(args.scopes)
  const startedAt = Date.now()
  const hash = await client.writeContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'setAllowedCalls',
    args: [args.keyId, allowedCalls],
  } as never)
  const result = await settle(client, hash, startedAt)
  const account = client.account?.address
  if (!account) throw new Error('client has no account')
  return { ...result, after: await getAllowedCalls(client, account, args.keyId) }
}

/** Drops one target from the key's scope set. */
export async function removeAllowedCalls(
  client: LeashClient,
  args: { keyId: Address; target: Address },
): Promise<WriteResult & { after: AllowedCalls }> {
  const startedAt = Date.now()
  const hash = await client.writeContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'removeAllowedCalls',
    args: [args.keyId, args.target],
  } as never)
  const result = await settle(client, hash, startedAt)
  const account = client.account?.address
  if (!account) throw new Error('client has no account')
  return { ...result, after: await getAllowedCalls(client, account, args.keyId) }
}

export type RevokeResult = WriteResult & {
  keyId: Address
  /** Read back after the write. A revoked key reads as a zeroed record with isRevoked true. */
  after: KeyState
}

/**
 * The kill switch. 28,192 gas and 2.8 seconds submit-to-receipt, measured on Moderato.
 *
 * After this lands, a transaction signed by the key is rejected by the node at signature
 * resolution rather than reverted in the EVM, so it never reaches a block and costs nothing.
 * The console says "rejected, not reverted" for exactly this reason. BUILD-SPEC §6.1.
 */
export async function revokeKey(
  client: LeashClient,
  args: { keyId: Address },
): Promise<RevokeResult> {
  const startedAt = Date.now()
  const hash = await client.writeContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'revokeKey',
    args: [args.keyId],
  } as never)
  const result = await settle(client, hash, startedAt)
  const account = client.account?.address
  if (!account) throw new Error('client has no account')
  const after = await getKey(client, account, args.keyId)
  if (after.info.isRevoked !== true)
    throw new Error(
      `revokeKey landed in ${hash} but getKey still reports isRevoked=false. Do not report this key as killed.`,
    )
  return { ...result, keyId: args.keyId, after }
}

/**
 * Sends a payment as the agent, and returns either the receipt or the decoded refusal.
 *
 * Never throws for an enforcement revert: a refused payment is the product working, and the
 * caller needs the reason, not a stack trace.
 */
export async function payWithAgentKey(
  client: LeashClient,
  args: {
    accessKey: AccessKeyAccount
    to: Address
    data: Hex
    localFeePayer?: RootAccount
  },
): Promise<
  | { ok: true; result: WriteResult }
  | { ok: false; revert: ReturnType<typeof decodeRevert> }
> {
  const startedAt = Date.now()
  try {
    const extra = args.localFeePayer
      ? { feePayer: args.localFeePayer }
      : client.leash.sponsored
        ? { feePayer: true }
        : {}
    const hash = await client.sendTransaction({
      account: args.accessKey,
      calls: [{ to: args.to, data: args.data }],
      ...extra,
    } as never)
    return { ok: true, result: await settle(client, hash, startedAt) }
  } catch (error) {
    return { ok: false, revert: decodeRevert(error) }
  }
}

/** The selectors a Leash key ever writes, exported so a caller can assert against them. */
export const WRITE_SELECTORS = {
  authorizeKey: SELECTOR.authorizeKey,
  revokeKey: SELECTOR.revokeKey,
  updateSpendingLimit: SELECTOR.updateSpendingLimit,
  setAllowedCalls: SELECTOR.setAllowedCalls,
  removeAllowedCalls: SELECTOR.removeAllowedCalls,
} as const
