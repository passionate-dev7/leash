import type { Address } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { decodeRevert } from '@leash/policy'
import type { CallScope } from '@leash/policy'
import type { LeashClient } from './client.js'

/**
 * Every number a Leash surface shows comes from one of these, and every one of them returns
 * the block it was read at. A figure with no origin is a rumour with good posture.
 */

export type ReadStamp = {
  blockNumber: bigint
  readAt: string
  chainId: number
  /** The exact call that produced the value. */
  source: string
}

export type KeyInfo = {
  signatureType: number
  keyId: Address
  expiry: bigint
  enforceLimits: boolean
  isRevoked: boolean
}

export type KeyState = {
  account: Address
  keyId: Address
  info: KeyInfo
  /** True when `getKey` returns a zeroed record, which is what a revoked key looks like. */
  exists: boolean
  stamp: ReadStamp
}

const stamp = async (client: LeashClient, source: string): Promise<ReadStamp> => ({
  blockNumber: await client.getBlockNumber(),
  readAt: new Date().toISOString(),
  chainId: client.leash.network.chainId,
  source,
})

const ZERO = '0x0000000000000000000000000000000000000000'

export async function getKey(
  client: LeashClient,
  account: Address,
  keyId: Address,
): Promise<KeyState> {
  const raw = (await client.readContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'getKey',
    args: [account, keyId],
  })) as KeyInfo
  return {
    account,
    keyId,
    info: raw,
    exists: raw.keyId.toLowerCase() !== ZERO && !raw.isRevoked,
    stamp: await stamp(client, `getKey(${account}, ${keyId}) @ ${Addresses.accountKeychain}`),
  }
}

export type RemainingLimit = {
  account: Address
  keyId: Address
  token: Address
  /** Smallest units still spendable in the current period. */
  remaining: bigint
  /** Unix seconds at which the period rolls and `remaining` resets to the full limit. */
  periodEnd: bigint
  stamp: ReadStamp
}

/**
 * The only acceptable source for a displayed budget.
 *
 * Two reasons it must be this function and not the event stream:
 *  - `getRemainingLimit` without the period suffix reverts `0xaa4bc69a` for any key whose
 *    limit carries a non-zero period, which is every Leash key.
 *  - the last `AccessKeySpend` event's `remainingLimit` is stale, because gas is pre-charged
 *    at the gas limit and refunded after the events fire. Measured gap: 206 units.
 * BUILD-SPEC §3.4 and §5.
 */
export async function getRemainingLimit(
  client: LeashClient,
  account: Address,
  keyId: Address,
  token: Address,
): Promise<RemainingLimit> {
  const [remaining, periodEnd] = (await client.readContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'getRemainingLimitWithPeriod',
    args: [account, keyId, token],
  })) as readonly [bigint, bigint]
  return {
    account,
    keyId,
    token,
    remaining,
    periodEnd,
    stamp: await stamp(
      client,
      `getRemainingLimitWithPeriod(${account}, ${keyId}, ${token}) @ ${Addresses.accountKeychain}`,
    ),
  }
}

export type AllowedCalls = {
  account: Address
  keyId: Address
  /**
   * `true` means the key is scoped. Scoped with an empty `scopes` array is deny-all, not
   * allow-all: the key can call nothing. BUILD-SPEC §7.
   */
  isScoped: boolean
  scopes: CallScope[]
  stamp: ReadStamp
}

export async function getAllowedCalls(
  client: LeashClient,
  account: Address,
  keyId: Address,
): Promise<AllowedCalls> {
  const [isScoped, scopes] = (await client.readContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'getAllowedCalls',
    args: [account, keyId],
  })) as readonly [boolean, CallScope[]]
  return {
    account,
    keyId,
    isScoped,
    scopes: scopes as CallScope[],
    stamp: await stamp(
      client,
      `getAllowedCalls(${account}, ${keyId}) @ ${Addresses.accountKeychain}`,
    ),
  }
}

export async function isAdminKey(
  client: LeashClient,
  account: Address,
  keyId: Address,
): Promise<boolean> {
  return (await client.readContract({
    address: Addresses.accountKeychain,
    abi: Abis.accountKeychain,
    functionName: 'isAdminKey',
    args: [account, keyId],
  })) as boolean
}

/**
 * Demonstrates the `getRemainingLimit` trap rather than describing it: calls the short form
 * and returns what came back. Used by the console's diagnostics panel so the claim in the
 * docs is something an operator can reproduce in one click.
 */
export async function probeShortRemainingLimit(
  client: LeashClient,
  account: Address,
  keyId: Address,
  token: Address,
): Promise<{ ok: boolean; value?: bigint; revert?: ReturnType<typeof decodeRevert> }> {
  try {
    const value = (await client.readContract({
      address: Addresses.accountKeychain,
      abi: Abis.accountKeychain,
      functionName: 'getRemainingLimit',
      args: [account, keyId, token],
    })) as bigint
    return { ok: true, value }
  } catch (error) {
    return { ok: false, revert: decodeRevert(error) }
  }
}

export type TokenBalance = { token: Address; holder: Address; balance: bigint; stamp: ReadStamp }

export async function getTokenBalance(
  client: LeashClient,
  token: Address,
  holder: Address,
): Promise<TokenBalance> {
  const balance = (await client.readContract({
    address: token,
    abi: Abis.tip20,
    functionName: 'balanceOf',
    args: [holder],
  })) as bigint
  return {
    token,
    holder,
    balance,
    stamp: await stamp(client, `balanceOf(${holder}) @ ${token}`),
  }
}

export async function getTokenMeta(
  client: LeashClient,
  token: Address,
): Promise<{ symbol: string; decimals: number; name: string }> {
  const [symbol, decimals, name] = await Promise.all([
    client.readContract({ address: token, abi: Abis.tip20, functionName: 'symbol' }) as Promise<string>,
    client.readContract({ address: token, abi: Abis.tip20, functionName: 'decimals' }) as Promise<number>,
    client.readContract({ address: token, abi: Abis.tip20, functionName: 'name' }) as Promise<string>,
  ])
  return { symbol, decimals, name }
}
