import { parseEventLogs } from 'viem'
import type { Address, Hash, Hex } from 'viem'
import { Abis } from 'viem/tempo'
import { createLeashClient, getAllowedCalls, getKey, getRemainingLimit, getTokenBalance } from '@leash/sdk'
import type { AllowedCalls, LeashClient } from '@leash/sdk'
import { SELECTOR } from '@leash/policy'
import { BUDGET_TOKEN, PATH_USD } from './config.js'
import { settlementProof } from './external.js'
import { HttpError } from './http.js'

/** Read client for Moderato. Never signs, never retries a write. */
export const reader: LeashClient = createLeashClient({ network: 'moderato', sponsor: false })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A public RPC drops requests now and then. Reads retry; nothing that writes goes through here. */
export async function retryRead<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await sleep(400 * (i + 1))
    }
  }
  throw last
}

/** Polls `read` until `done` accepts it or the timeout passes. Returns the last read either way. */
export async function until<T>(read: () => Promise<T>, done: (v: T) => boolean, timeoutMs: number): Promise<{ ok: boolean; value: T }> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await retryRead(read)
    if (done(value)) return { ok: true, value }
    if (Date.now() >= deadline) return { ok: false, value }
    await sleep(700)
  }
}

export async function receiptOf(hash: Hash, timeoutMs = 30_000) {
  try {
    return await reader.waitForTransactionReceipt({ hash, timeout: timeoutMs })
  } catch (e) {
    throw new HttpError(409, 'receipt_unavailable', `no receipt for ${hash} within ${timeoutMs / 1000}s: ${(e as Error).message.split('\n')[0]}`)
  }
}

export const lower = (a: string) => a.toLowerCase()

/** The recipients a key can pay on the budget token, from its on-chain scopes. `any` when a rule leaves them open. */
export function payableRecipients(allowed: AllowedCalls): { recipients: Address[]; any: boolean } {
  const out = new Set<Address>()
  let any = false
  if (!allowed.isScoped) return { recipients: [], any: true }
  for (const scope of allowed.scopes) {
    if (lower(scope.target) !== lower(BUDGET_TOKEN)) continue
    if (scope.selectorRules.length === 0) any = true
    for (const rule of scope.selectorRules) {
      if (rule.selector.toLowerCase() !== SELECTOR.transferWithMemo) continue
      if (rule.recipients.length === 0) any = true
      for (const r of rule.recipients) out.add(r)
    }
  }
  return { recipients: [...out], any }
}

export async function balances(address: Address): Promise<{ ousd: bigint; pathusd: bigint; block: bigint }> {
  const [ousd, pathusd] = await Promise.all([
    retryRead(() => getTokenBalance(reader, BUDGET_TOKEN, address)),
    retryRead(() => getTokenBalance(reader, PATH_USD, address)),
  ])
  return { ousd: ousd.balance, pathusd: pathusd.balance, block: ousd.stamp.blockNumber }
}

/** `tempo_fundAddress` on Moderato, then polls until the OUSD lands. */
export async function fund(address: Address, timeoutMs = 30_000): Promise<{ txs: Hash[]; ousd: bigint; pathusd: bigint }> {
  const txs = (await reader.request({ method: 'tempo_fundAddress' as never, params: [address] as never })) as Hash[]
  const landed = await until(() => balances(address), (b) => b.ousd > 0n, timeoutMs)
  if (!landed.ok) throw new HttpError(504, 'faucet_pending', `the faucet accepted ${txs.length} transactions but no OUSD arrived within ${timeoutMs / 1000}s`)
  return { txs, ousd: landed.value.ousd, pathusd: landed.value.pathusd }
}

export type AuthorizeCheck = { ok: true; block: number } | { ok: false; reason: string }

/**
 * An authorize transaction counts only when the chain agrees: it succeeded, it was sent by the
 * team account, it emitted KeyAuthorized for this exact key, the key reads back as live, and the
 * scopes that read back are the ones Leash planned (the browser could have signed anything).
 */
export async function verifyAuthorize(args: { tx: Hash; account: Address; keyId: Address; plannedRecipients: readonly Address[] }): Promise<AuthorizeCheck> {
  const rx = await receiptOf(args.tx)
  if (rx.status !== 'success') return { ok: false, reason: `transaction ${args.tx} did not succeed (status ${rx.status})` }
  if (lower(rx.from) !== lower(args.account)) return { ok: false, reason: `transaction was sent by ${rx.from}, not the team account ${args.account}` }
  const authorized = parseEventLogs({ abi: Abis.accountKeychain, logs: rx.logs, eventName: 'KeyAuthorized' }).some(
    (e) => lower(e.args.account) === lower(args.account) && lower(e.args.publicKey) === lower(args.keyId),
  )
  if (!authorized) return { ok: false, reason: `no KeyAuthorized event for key ${args.keyId} on ${args.account} in ${args.tx}` }

  const live = await until(() => getKey(reader, args.account, args.keyId), (k) => k.exists, 10_000)
  if (!live.ok) return { ok: false, reason: `getKey does not return ${args.keyId} for ${args.account}` }
  if (!live.value.info.enforceLimits) return { ok: false, reason: 'the key was authorized without spending limits' }

  const allowed = await retryRead(() => getAllowedCalls(reader, args.account, args.keyId))
  const payable = payableRecipients(allowed)
  const planned = new Set(args.plannedRecipients.map(lower))
  if (payable.any) return { ok: false, reason: 'the key was authorized with a rule that allows any recipient' }
  if (payable.recipients.length === 0 || payable.recipients.some((r) => !planned.has(lower(r))))
    return { ok: false, reason: 'the key scopes read back from chain differ from the planned recipients' }
  const extra = allowed.scopes.filter((s) => lower(s.target) !== lower(BUDGET_TOKEN))
  if (extra.length > 0) return { ok: false, reason: `the key can also call ${extra.map((s) => s.target).join(', ')}` }
  const limit = await retryRead(() => getRemainingLimit(reader, args.account, args.keyId, BUDGET_TOKEN))
  if (limit.remaining <= 0n) return { ok: false, reason: 'the key has no spending limit on the budget token' }
  return { ok: true, block: Number(rx.blockNumber) }
}

export type CutCheck = { ok: true; gasUsed: bigint; block: number } | { ok: false; reason: string; gasUsed: bigint | null }

/** A cut counts only when every rescoped key reads back without the recipient and every revoked key reads revoked. */
export async function verifyCutoff(args: { tx: Hash; account: Address; recipient: Address; rescoped: readonly Address[]; revoked: readonly Address[] }): Promise<CutCheck> {
  const rx = await receiptOf(args.tx)
  if (rx.status !== 'success') return { ok: false, reason: `transaction ${args.tx} did not succeed (status ${rx.status})`, gasUsed: rx.gasUsed }
  if (lower(rx.from) !== lower(args.account)) return { ok: false, reason: `transaction was sent by ${rx.from}, not the team account ${args.account}`, gasUsed: rx.gasUsed }
  const r = lower(args.recipient)
  for (const keyId of args.rescoped) {
    const read = await until(
      () => getAllowedCalls(reader, args.account, keyId),
      (a) => !a.scopes.some((s) => s.selectorRules.some((rule) => rule.recipients.some((x) => lower(x) === r))),
      10_000,
    )
    if (!read.ok) return { ok: false, reason: `key ${keyId} can still pay ${args.recipient} on chain`, gasUsed: rx.gasUsed }
  }
  for (const keyId of args.revoked) {
    const read = await until(() => getKey(reader, args.account, keyId), (k) => !k.exists, 10_000)
    if (!read.ok) return { ok: false, reason: `key ${keyId} is not revoked on chain`, gasUsed: rx.gasUsed }
  }
  return { ok: true, gasUsed: rx.gasUsed, block: Number(rx.blockNumber) }
}

export async function verifyRevoke(args: { tx: Hash; account: Address; keyId: Address }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rx = await receiptOf(args.tx)
  if (rx.status !== 'success') return { ok: false, reason: `transaction ${args.tx} did not succeed (status ${rx.status})` }
  if (lower(rx.from) !== lower(args.account)) return { ok: false, reason: `transaction was sent by ${rx.from}, not the team account ${args.account}` }
  const revoked = parseEventLogs({ abi: Abis.accountKeychain, logs: rx.logs, eventName: 'KeyRevoked' }).some(
    (e) => lower(e.args.account) === lower(args.account) && lower(e.args.publicKey) === lower(args.keyId),
  )
  if (!revoked) return { ok: false, reason: `no KeyRevoked event for key ${args.keyId} in ${args.tx}` }
  const read = await until(() => getKey(reader, args.account, args.keyId), (k) => !k.exists, 10_000)
  return read.ok ? { ok: true } : { ok: false, reason: `getKey does not read ${args.keyId} as revoked` }
}

export type SettlementCheck = { ok: true; block: number; keySpend: string[] } | { ok: false; reason: string }

/** A reported payment counts only when its settlement reads back from Moderato as the payment the record describes. */
export async function verifySettlement(args: { tx: Hash; account: Address; keyId: Address; recipient: Address; amount: string; memo: Hex; currency: Address }): Promise<SettlementCheck> {
  let rx
  try {
    rx = await receiptOf(args.tx, 8_000)
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, reason: `${args.tx} has no receipt on Moderato` }
    throw e
  }
  if (rx.status !== 'success') return { ok: false, reason: `transaction ${args.tx} did not succeed (status ${rx.status})` }
  if (lower(rx.from) !== lower(args.account)) return { ok: false, reason: `transaction was sent by ${rx.from}, not the team account ${args.account}` }
  const proof = settlementProof(rx.logs, args)
  return proof.ok ? { ok: true, block: Number(rx.blockNumber), keySpend: proof.keySpend } : proof
}

export type { Hex }
