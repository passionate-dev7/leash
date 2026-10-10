import { createClient, decodeFunctionData, http, keccak256, parseEventLogs, publicActions, toHex } from 'viem'
import type { Account, Address, Hash, Hex, PublicClient } from 'viem'
import { Abis, Transaction } from 'viem/tempo'
import { Credential } from 'mppx'
import { Mppx, tempo as tempoMethod } from 'mppx/client'
import type { NetworkConfig } from './client.js'
import { chainFor, gatewayRetryFetch } from './client.js'
import { checkQuote, routeFor } from '@leash/policy'
import type { PriceBook, QuoteCapPolicy, QuoteVerdict } from '@leash/policy'

/**
 * Paying an MPP service with an agent's access key, and recording what came back.
 *
 * A charge settles before the vendor runs the request, so "paid" and "delivered" are separate
 * facts. mppx only emits `payment.response` for 2xx responses, which hides exactly the calls an
 * operator needs to see. This module records every paid call itself and joins it to its
 * settlement through the memo inside our own signed transaction, so the join never depends on
 * the vendor returning a receipt. Measured on Moderato: spikes/vendor-cutoff/FINDINGS.md.
 */

export type Outcome =
  /** Settled on chain and the vendor answered 2xx. */
  | 'delivered'
  /** Settled on chain and the vendor answered anything else. */
  | 'paid_not_delivered'
  /** The chain (or the local block list) refused the payment. Nothing moved. */
  | 'refused'
  /** The vendor never asked for payment. */
  | 'free'
  /** A credential was sent but no settlement appeared within the wait. */
  | 'unsettled'

export type Settlement = {
  tx: Hash
  block: number
  status: 'success' | 'reverted'
  /** Every AccessKeySpend this key emitted in the settlement: gas and payment are separate. */
  keySpend: string[]
}

export type DeliveryRecord = {
  /** MPP challenge id, or a local id when no challenge was issued. */
  id: string
  url: string
  method: string
  /** keccak256 of method, url and body: two records with the same hash are the same request paid twice. */
  requestHash: Hex
  realm: string | null
  keyId: Address
  account: Address
  recipient: Address | null
  amount: string | null
  currency: Address | null
  memo: Hex | null
  status: number | null
  refused: string | null
  /** Quote-Cap: the catalog listing and the ceiling this quote was checked against. */
  quote: { listed: string | null; quoted: string; ceiling: string | null; ok: boolean; reason: string | null; message: string | null } | null
  /** Route: a cheaper seller of the same API, by listed price, if one exists. */
  cheaper: { url: string; service: string; amount: string; savingPerCall: string } | null
  settlement: Settlement | null
  outcome: Outcome
  startedAt: string
  finishedAt: string
}

export type AgentAccount = Account & { accessKeyAddress: Address; address: Address }

export type LeashFetchOptions = {
  network: NetworkConfig
  agent: AgentAccount
  /** Recipients this client refuses before signing. The chain is the enforcer; this is the fast path. */
  blocked?: () => ReadonlySet<string>
  /** Called once per request with the finished record. */
  onRecord?: (record: DeliveryRecord) => void | Promise<void>
  /**
   * Quote-Cap: refuse, before a credential is signed, any 402 quote above the catalog listing
   * (plus tolerance) or the per-call cap. Omit to sign whatever the vendor asks (mppx default).
   */
  quoteCap?: { book: PriceBook; policy: QuoteCapPolicy }
  /** How long to look for the settlement after the response. Default 20 s. */
  settleTimeoutMs?: number
}

const CHAIN_ERRORS = /\b(CallNotAllowed|SpendingLimitExceeded|KeyAlreadyRevoked|KeyExpired|KeyNotFound|InvalidCallScope|LeashBlocked|QuoteCapExceeded)\b/

export class LeashBlocked extends Error {
  override name = 'LeashBlocked'
}

export class QuoteCapExceeded extends Error {
  override name = 'QuoteCapExceeded'
  constructor(readonly verdict: Extract<QuoteVerdict, { ok: false }>) {
    super(verdict.message)
  }
}

export function requestHash(method: string, url: string, body: string | null): Hex {
  return keccak256(toHex(`${method.toUpperCase()} ${url}\n${body ?? ''}`))
}

/** The transferWithMemo memo inside a signed Tempo transaction, if it pays `currency`. */
export function memoFromSignedTransaction(serialized: Hex, currency: Address): Hex | null {
  const tx = Transaction.deserialize(serialized as Transaction.TransactionSerializedTempo) as {
    calls?: readonly { to?: Address | null; data?: Hex }[]
  }
  for (const call of tx.calls ?? []) {
    if (!call.to || call.to.toLowerCase() !== currency.toLowerCase() || !call.data) continue
    const decoded = decodeFunctionData({ abi: Abis.tip20, data: call.data })
    if (decoded.functionName === 'transferWithMemo') return decoded.args[2] as Hex
  }
  return null
}

/**
 * Finds the settlement of one charge by its memo. Bounded: starts at the block read before the
 * request was sent and stops at `timeoutMs`.
 */
export async function findSettlement(
  client: PublicClient,
  args: { currency: Address; memo: Hex; keyId: Address; fromBlock: bigint; timeoutMs: number },
): Promise<Settlement | null> {
  const event = Abis.tip20.find((x) => x.type === 'event' && x.name === 'TransferWithMemo')
  if (!event) throw new Error('TransferWithMemo missing from the TIP-20 ABI')
  const deadline = Date.now() + args.timeoutMs
  while (Date.now() < deadline) {
    const logs = (await client.getLogs({
      address: args.currency,
      event: event as never,
      args: { memo: args.memo } as never,
      fromBlock: args.fromBlock,
      toBlock: 'latest',
    })) as unknown as { transactionHash: Hash | null }[]
    const hit = logs[0]
    if (hit?.transactionHash) return settlementOf(client, hit.transactionHash, args.keyId)
    await new Promise((r) => setTimeout(r, 600))
  }
  return null
}

export async function settlementOf(client: PublicClient, tx: Hash, keyId: Address): Promise<Settlement> {
  const rx = await client.waitForTransactionReceipt({ hash: tx })
  const spends = parseEventLogs({ abi: Abis.accountKeychain, logs: rx.logs, eventName: 'AccessKeySpend' })
    .filter((e) => (e.args as { publicKey: Address }).publicKey.toLowerCase() === keyId.toLowerCase())
    .map((e) => String((e.args as { amount: bigint }).amount))
  return { tx, block: Number(rx.blockNumber), status: rx.status, keySpend: spends }
}

/**
 * A fetch that pays MPP charges with the agent's access key and reports a DeliveryRecord for
 * every request. The returned response is the vendor's response, untouched.
 */
export function createLeashFetch(options: LeashFetchOptions) {
  const { network, agent } = options
  const chain = chainFor(network)
  // retryCount 0: a refused key surfaces as -32603, which viem would otherwise retry until the
  // transaction expires (49 s measured) and then misreport. See createLeashClient.
  const rpc = () => createClient({ chain, transport: http(network.rpcUrl, { retryCount: 0, fetchFn: gatewayRetryFetch }) })
  const pub = createClient({ chain, transport: http(network.rpcUrl, { fetchFn: gatewayRetryFetch }) }).extend(publicActions) as unknown as PublicClient
  const settleTimeoutMs = options.settleTimeoutMs ?? 20_000

  return async function leashFetch(
    input: string,
    init: RequestInit = {},
  ): Promise<{ response: Response | null; record: DeliveryRecord }> {
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? init.body : null
    const startedAt = new Date().toISOString()
    let credential: string | undefined
    let challenge: { id: string; realm?: string; request: Record<string, unknown> } | undefined
    let verdict: QuoteVerdict | null = null

    const mppx = Mppx.create({
      // mppx swallows anything an onChallengeReceived handler throws, so a block list enforced
      // there never blocks. onChallenge errors propagate and abort before a credential is signed.
      onChallenge: async (c) => {
        challenge ??= c as unknown as typeof challenge
        const req = (c as { request: Record<string, unknown> }).request
        const recipient = String(req['recipient'] ?? '').toLowerCase()
        if (recipient && options.blocked?.().has(recipient)) throw new LeashBlocked(`LeashBlocked: ${recipient} is cut for this team`)
        if (options.quoteCap) {
          verdict = checkQuote(options.quoteCap.book, options.quoteCap.policy, {
            method,
            url: input,
            amount: String(req['amount'] ?? ''),
            currency: (req['currency'] as string | undefined) ?? null,
            recipient,
          })
          if (!verdict.ok) throw new QuoteCapExceeded(verdict)
        }
        return undefined
      },
      methods: [
        tempoMethod.charge({
          account: agent as never,
          expectedChainId: network.chainId,
          getClient: async () => rpc() as never,
        }),
      ],
      polyfill: false,
    })
    mppx.onChallengeReceived((p) => {
      challenge = (p as { challenge: typeof challenge }).challenge
      return undefined
    })
    mppx.onCredentialCreated((p) => {
      credential = (p as { credential: string }).credential
    })

    const fromBlock = await pub.getBlockNumber()
    let response: Response | null = null
    let refused: string | null = null
    try {
      response = await mppx.fetch(input, init)
    } catch (e) {
      const message = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e)
      const named = CHAIN_ERRORS.exec(message)
      if (!named) throw e
      refused = named[1]!
    }

    const request = (challenge?.request ?? {}) as { recipient?: Address; amount?: string; currency?: Address }
    let memo: Hex | null = null
    let settlement: Settlement | null = null
    if (credential && !refused && request.currency) {
      const parsed = Credential.deserialize(credential) as unknown as { payload: { type: string; signature?: Hex; hash?: Hash } }
      if (parsed.payload.type === 'hash' && parsed.payload.hash) {
        settlement = await settlementOf(pub, parsed.payload.hash, agent.accessKeyAddress)
      } else if (parsed.payload.type === 'transaction' && parsed.payload.signature) {
        memo = memoFromSignedTransaction(parsed.payload.signature, request.currency)
        if (memo)
          settlement = await findSettlement(pub, {
            currency: request.currency,
            memo,
            keyId: agent.accessKeyAddress,
            fromBlock,
            timeoutMs: settleTimeoutMs,
          })
      }
    }

    const status = response?.status ?? null
    const v = verdict as QuoteVerdict | null
    const plan = options.quoteCap ? routeFor(options.quoteCap.book, method, input) : null
    const cheaper =
      plan && plan.cheapest.url !== input.split('?')[0]
        ? { url: plan.cheapest.url, service: plan.cheapest.service, amount: String(plan.cheapest.amount), savingPerCall: String((v?.listed ?? plan.priciest.amount) - plan.cheapest.amount) }
        : null
    const outcome: Outcome = refused
      ? 'refused'
      : !credential
        ? 'free'
        : !settlement || settlement.status !== 'success'
          ? 'unsettled'
          : status !== null && status >= 200 && status < 300
            ? 'delivered'
            : 'paid_not_delivered'

    const record: DeliveryRecord = {
      id: challenge?.id ?? `local-${fromBlock}-${Math.random().toString(36).slice(2, 10)}`,
      url: input,
      method,
      requestHash: requestHash(method, input, body),
      realm: challenge?.realm ?? null,
      keyId: agent.accessKeyAddress,
      account: agent.address,
      recipient: request.recipient ?? null,
      amount: request.amount ?? null,
      currency: request.currency ?? null,
      memo,
      status,
      refused,
      quote: v
        ? {
            listed: v.listed === null ? null : String(v.listed),
            quoted: String(v.quoted),
            ceiling: v.ceiling === null ? null : String(v.ceiling),
            ok: v.ok,
            reason: v.ok ? null : v.reason,
            message: v.ok ? null : v.message,
          }
        : null,
      cheaper,
      settlement,
      outcome,
      startedAt,
      finishedAt: new Date().toISOString(),
    }
    await options.onRecord?.(record)
    return { response, record }
  }
}
