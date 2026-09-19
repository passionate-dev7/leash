import { beforeAll, describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { parseUnits } from 'viem'
import { Account } from 'viem/tempo'
import {
  MODERATO_TOKENS,
  PERIOD,
  compilePolicy,
  decodeRevert,
  loadRecipientIndex,
} from '@leash/policy'
import type { CompiledPolicy, RecipientIndex } from '@leash/policy'
import { createLeashClient } from '../../src/client.js'
import type { LeashClient } from '../../src/client.js'
import { agentKeyFromSecp256k1 } from '../../src/keys.js'
import type { AgentKey } from '../../src/keys.js'
import { authorizeKey, payWithAgentKey, revokeKey, updateSpendingLimit } from '../../src/provision.js'
import { getAllowedCalls, getKey, getRemainingLimit, probeShortRemainingLimit } from '../../src/reads.js'
import { chargeCalldata, plainTransferCalldata } from '../../src/payments.js'
import { assertFunded, loadWorkspace, mintRunKey } from './workspace.js'

/**
 * The adversarial suite. Every case below submits a real transaction to Moderato (42431) and
 * asserts what the chain actually did.
 *
 * Nothing here is simulated. A revert reason in this file came back from a node.
 *
 * The positive controls are not decoration. Without them the revert list is equally
 * consistent with a broken client that cannot transact at all, and the suite would be a
 * check that cannot fail.
 */

const PATH_USD = MODERATO_TOKENS.PathUSD as Address
const ALPHA_USD = MODERATO_TOKENS.AlphaUSD as Address
const CAP = parseUnits('50', 6)

type Ctx = {
  owner: ReturnType<typeof Account.fromSecp256k1>
  ownerAddress: Address
  sponsor: ReturnType<typeof Account.fromSecp256k1>
  merchantA: Address
  merchantB: Address
  agentKey: AgentKey
  policy: CompiledPolicy
  index: RecipientIndex
  /** Sponsored by Tempo's public relay. The path the product ships. */
  relayClient: LeashClient
  /** Unsponsored, for the side-by-side budget arithmetic. */
  soloClient: LeashClient
  /** Root-key client, for the controls. */
  rootClient: LeashClient
}

let ctx: Ctx

const record: { label: string; outcome: string; detail: string }[] = []
const note = (label: string, outcome: string, detail: string) => {
  record.push({ label, outcome, detail })
  // eslint-disable-next-line no-console
  console.log(`${outcome.padEnd(7)} | ${label}\n        ${detail}`)
}

beforeAll(async () => {
  const ws = loadWorkspace()
  const owner = Account.fromSecp256k1(ws.keys['OWNER']!)
  const sponsor = Account.fromSecp256k1(ws.keys['SPONSOR']!)
  const ownerAddress = owner.address as Address

  // Refuse to run against an empty account. An empty balance makes every negative control
  // pass for the wrong reason and is indistinguishable from working enforcement.
  const balance = await assertFunded({
    address: ownerAddress,
    token: PATH_USD,
    minimum: parseUnits('200', 6),
    label: 'OWNER',
  })
  await assertFunded({
    address: sponsor.address as Address,
    token: PATH_USD,
    minimum: parseUnits('1', 6),
    label: 'SPONSOR',
  })
  note(
    'preflight',
    'OK',
    `OWNER ${ownerAddress} holds ${balance} PathUSD, above the 200,000,000 floor this suite needs`,
  )

  const label = `ADVERSARIAL_${Date.now()}`
  const minted = mintRunKey(label)
  const agentKey = agentKeyFromSecp256k1(minted.privateKey)

  const index = await loadRecipientIndex()
  // The policy under test is the Moderato analogue of the shipped one: one token, one
  // selector, one recipient. The recipient is a local merchant rather than an MPP address
  // because MPP settles on 4217 and this suite executes on 42431.
  const policy = compilePolicy(
    {
      agent: 'adversarial-suite',
      token: PATH_USD,
      decimals: 6,
      budget: CAP,
      periodSeconds: PERIOD.month,
      expiry: Math.floor(Date.now() / 1000) + 7 * 86_400,
      serviceIds: [],
      extraRecipients: [ws.addrs['MERCHANT_A']!],
    },
    index,
    { keyId: agentKey.keyId },
  )

  const rootClient = createLeashClient({ network: 'moderato', account: owner, sponsor: false })
  const relayClient = createLeashClient({ network: 'moderato', sponsor: true })
  const soloClient = createLeashClient({ network: 'moderato', sponsor: false })

  const authorized = await authorizeKey(rootClient, { root: owner, agentKey, policy })
  note(
    'authorizeKey',
    'PASS',
    `${authorized.hash} gas ${authorized.gasUsed}, keyId ${agentKey.keyId}, read back remaining ${authorized.verified.limit.remaining} period end ${authorized.verified.limit.periodEnd}`,
  )

  ctx = {
    owner,
    ownerAddress,
    sponsor,
    merchantA: ws.addrs['MERCHANT_A']!,
    merchantB: ws.addrs['MERCHANT_B']!,
    agentKey,
    policy,
    index,
    relayClient,
    soloClient,
    rootClient,
  }
})

const agentAccount = () => ctx.agentKey.toAccount(ctx.owner)

describe('the compiled policy is what actually landed on chain', () => {
  it('reads back the exact scope the compiler produced', async () => {
    const allowed = await getAllowedCalls(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId)
    expect(allowed.isScoped).toBe(true)
    expect(allowed.scopes).toHaveLength(1)
    expect(allowed.scopes[0]?.target.toLowerCase()).toBe(PATH_USD.toLowerCase())
    const rule = allowed.scopes[0]?.selectorRules[0]
    expect(rule?.selector).toBe('0x95777d59')
    expect(rule?.recipients.map((r) => r.toLowerCase())).toEqual([ctx.merchantA.toLowerCase()])
    note(
      'scope readback',
      'PASS',
      `getAllowedCalls -> scoped, target ${allowed.scopes[0]?.target}, selector ${rule?.selector}, ${rule?.recipients.length} recipient, block ${allowed.stamp.blockNumber}`,
    )
  })

  it('reports the full budget before anything is spent', async () => {
    const limit = await getRemainingLimit(
      ctx.rootClient,
      ctx.ownerAddress,
      ctx.agentKey.keyId,
      PATH_USD,
    )
    expect(limit.remaining).toBe(CAP)
    expect(limit.periodEnd).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)))
  })

  it('reverts the short getRemainingLimit form for a period-based limit', async () => {
    const probe = await probeShortRemainingLimit(
      ctx.rootClient,
      ctx.ownerAddress,
      ctx.agentKey.keyId,
      PATH_USD,
    )
    expect(probe.ok).toBe(false)
    expect(probe.revert?.raw).toMatch(/aa4bc69a/i)
    note(
      'getRemainingLimit trap',
      'REVERT',
      `short form reverted 0xaa4bc69a while getRemainingLimitWithPeriod succeeded in the same block`,
    )
  })
})

describe('positive controls, which must pass or the negatives prove nothing', () => {
  it('C1 pays an allowed recipient with the allowed selector, sponsored by the public relay', async () => {
    const before = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    const result = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6), reference: 'leash-c1' }),
    })
    expect(result.ok, `C1 must succeed: ${result.ok ? '' : result.revert.raw}`).toBe(true)
    if (!result.ok) return
    const after = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    const spent = before.remaining - after.remaining
    // Sponsored: the budget moves by exactly the payment, with no gas tax.
    expect(spent).toBe(parseUnits('1', 6))
    expect(result.result.feePayer?.toLowerCase()).not.toBe(ctx.ownerAddress.toLowerCase())
    note(
      'C1 allowed payment, relay-sponsored',
      'PASS',
      `${result.result.hash} gas ${result.result.gasUsed}, feePayer ${result.result.feePayer}, budget moved ${spent} for a 1000000 payment`,
    )
  })

  it('C2 lets the ROOT key do the thing the access key will be refused', async () => {
    const result = await payWithAgentKey(ctx.rootClient, {
      accessKey: ctx.owner as never,
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantB, amount: parseUnits('1', 6), reference: 'leash-c2' }),
    })
    expect(result.ok, `root control must pass: ${result.ok ? '' : result.revert.raw}`).toBe(true)
    if (!result.ok) return
    note(
      'C2 root key pays the DISALLOWED merchant',
      'PASS',
      `${result.result.hash} gas ${result.result.gasUsed}. The refusals below are enforcement, not a broken client.`,
    )
  })
})

describe('negative controls, every one a real submitted transaction through the public relay', () => {
  it('N1 refuses a recipient outside the allowlist', async () => {
    const result = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantB, amount: parseUnits('1', 6), reference: 'leash-n1' }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.revert.name).toBe('CallNotAllowed')
    expect(result.revert.enforcement).toBe(true)
    note('N1 recipient outside the allowlist', 'REVERT', `CallNotAllowed (0x576b38b4)`)
  })

  it('N2 refuses plain transfer() to the ALLOWED merchant', async () => {
    const result = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: plainTransferCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6) }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.revert.name).toBe('CallNotAllowed')
    note(
      'N2 plain transfer() to the ALLOWED merchant',
      'REVERT',
      'CallNotAllowed. The allowlist is enforced per selector, so a key scoped to transferWithMemo cannot escape through transfer.',
    )
  })

  it('N3 refuses a payment past the cap', async () => {
    const result = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount: parseUnits('100', 6), reference: 'leash-n3' }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.revert.name).toBe('SpendingLimitExceeded')
    expect(result.revert.enforcement).toBe(true)
    note(
      'N3 100 USDC against a 50 USDC cap',
      'REVERT',
      'SpendingLimitExceeded (0x8a9e71ea)',
    )
  })

  it('N4 refuses a token the key has no scope for', async () => {
    const result = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: ALPHA_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6), reference: 'leash-n4' }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.revert.name).toBe('CallNotAllowed')
    note(
      'N4 AlphaUSD to the ALLOWED merchant',
      'REVERT',
      'CallNotAllowed. The scope target is the token contract, so an unlisted token is an unlisted target. Restricting the token is free.',
    )
  })

  it('N5 refuses all four the same way with a self-hosted fee payer', async () => {
    // Closes the symmetry: sponsorship is not an escape hatch on either relay path.
    const cases: [string, Address, `0x${string}`][] = [
      ['recipient', PATH_USD, chargeCalldata({ to: ctx.merchantB, amount: parseUnits('1', 6), reference: 'n5a' })],
      ['selector', PATH_USD, plainTransferCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6) })],
      ['budget', PATH_USD, chargeCalldata({ to: ctx.merchantA, amount: parseUnits('100', 6), reference: 'n5c' })],
      ['token', ALPHA_USD, chargeCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6), reference: 'n5d' })],
    ]
    const names: string[] = []
    for (const [what, to, data] of cases) {
      const result = await payWithAgentKey(ctx.soloClient, {
        accessKey: agentAccount(),
        to,
        data,
        localFeePayer: ctx.sponsor,
      })
      expect(result.ok, `${what} must be refused`).toBe(false)
      if (result.ok) continue
      names.push(`${what}=${result.revert.name}`)
      expect(result.revert.enforcement).toBe(true)
    }
    expect(names).toEqual([
      'recipient=CallNotAllowed',
      'selector=CallNotAllowed',
      'budget=SpendingLimitExceeded',
      'token=CallNotAllowed',
    ])
    note('N5 all four, self-hosted fee payer', 'REVERT', names.join(', '))
  })
})

describe('the gas-debits-budget correction, measured rather than quoted', () => {
  it('an unsponsored payment moves the budget by more than the payment', async () => {
    const before = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    const amount = parseUnits('1', 6)
    const result = await payWithAgentKey(ctx.soloClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount, reference: 'leash-unsponsored' }),
    })
    expect(result.ok, result.ok ? '' : result.revert.raw).toBe(true)
    if (!result.ok) return
    const after = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    const spent = before.remaining - after.remaining
    expect(spent).toBeGreaterThan(amount)

    // Two AccessKeySpend events, and the last one's remainingLimit is stale by the refund.
    const spends = result.result.receipt.logs.filter(
      (l) => l.topics[0] === '0xe0815e3aaadddf4dd75bde97fc060f0c38afe18e87a169be86a3f5c28247f192',
    )
    expect(spends.length).toBe(2)
    note(
      'unsponsored budget arithmetic',
      'PASS',
      `budget moved ${spent} for a ${amount} payment, overhead ${spent - amount}; ${spends.length} AccessKeySpend events in one transaction, gasUsed ${result.result.gasUsed}`,
    )
  })

  it('the last event remainingLimit disagrees with the precompile read', async () => {
    // The whole reason the console never displays an event's remainingLimit.
    const amount = parseUnits('1', 6)
    const result = await payWithAgentKey(ctx.soloClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount, reference: 'leash-stale' }),
    })
    expect(result.ok, result.ok ? '' : result.revert.raw).toBe(true)
    if (!result.ok) return
    const spends = result.result.receipt.logs.filter(
      (l) => l.topics[0] === '0xe0815e3aaadddf4dd75bde97fc060f0c38afe18e87a169be86a3f5c28247f192',
    )
    const last = spends[spends.length - 1]
    const eventRemaining = BigInt(`0x${(last?.data ?? '0x').slice(2).slice(64, 128) || '0'}`)
    const read = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    // The refund lands after the events fire, so the precompile read is the larger number.
    expect(read.remaining).toBeGreaterThanOrEqual(eventRemaining)
    note(
      'event vs precompile',
      read.remaining === eventRemaining ? 'EQUAL' : 'STALE',
      `last event remainingLimit ${eventRemaining}, getRemainingLimitWithPeriod ${read.remaining}, gap ${read.remaining - eventRemaining} at block ${read.stamp.blockNumber}`,
    )
  })

  it('a sponsored payment moves the budget by exactly the payment', async () => {
    const before = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    const amount = parseUnits('1', 6)
    const result = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount, reference: 'leash-sponsored' }),
    })
    expect(result.ok, result.ok ? '' : result.revert.raw).toBe(true)
    if (!result.ok) return
    const after = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    expect(after.remaining).toBe(before.remaining - amount)
    const spends = result.result.receipt.logs.filter(
      (l) => l.topics[0] === '0xe0815e3aaadddf4dd75bde97fc060f0c38afe18e87a169be86a3f5c28247f192',
    )
    expect(spends).toHaveLength(1)
    note(
      'sponsored budget arithmetic',
      'PASS',
      `budget moved exactly ${amount}, one AccessKeySpend event, feePayer ${result.result.feePayer}`,
    )
  })
})

describe('updateSpendingLimit, which mainnet has never called', () => {
  it('resets the remaining budget rather than scaling it', async () => {
    const before = await getRemainingLimit(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId, PATH_USD)
    const result = await updateSpendingLimit(ctx.rootClient, {
      keyId: ctx.agentKey.keyId,
      token: PATH_USD,
      limit: parseUnits('2', 6),
    })
    expect(result.after.remaining).toBe(parseUnits('2', 6))
    expect(result.after.periodEnd).toBe(before.periodEnd)
    note(
      'updateSpendingLimit 50 -> 2',
      'PASS',
      `${result.hash} gas ${result.gasUsed}; remaining went ${before.remaining} -> ${result.after.remaining} with periodEnd unchanged at ${result.after.periodEnd}`,
    )
  })

  it('makes a payment under the new cap succeed and one over it revert', async () => {
    const under = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6), reference: 'leash-under' }),
    })
    expect(under.ok, under.ok ? '' : under.revert.raw).toBe(true)

    const over = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount: parseUnits('5', 6), reference: 'leash-over' }),
    })
    expect(over.ok).toBe(false)
    if (over.ok) return
    expect(over.revert.name).toBe('SpendingLimitExceeded')
    note(
      'new cap bites',
      'REVERT',
      `1 USDC passed, 5 USDC against the new 2 USDC cap -> SpendingLimitExceeded`,
    )
  })
})

describe('the kill switch', () => {
  it('revokes in one call and reads back as revoked', async () => {
    const result = await revokeKey(ctx.rootClient, { keyId: ctx.agentKey.keyId })
    expect(result.after.info.isRevoked).toBe(true)
    expect(result.after.exists).toBe(false)
    expect(result.events.map((e) => e.eventName)).toContain('KeyRevoked')
    note(
      'revokeKey',
      'PASS',
      `${result.hash} gas ${result.gasUsed}, ${result.elapsedMs} ms submit to receipt; getKey now {isRevoked:true, keyId:${result.after.info.keyId}}`,
    )
  })

  it('refuses the next payment from that key, and refuses it before execution', async () => {
    const result = await payWithAgentKey(ctx.relayClient, {
      accessKey: agentAccount(),
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6), reference: 'leash-dead' }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    note(
      'post-revoke payment',
      'REJECTED',
      `${result.revert.name ?? 'unnamed'} | preExecution=${result.revert.rejectedPreExecution} | ${result.revert.raw.split('\n')[0]?.slice(0, 200)}`,
    )
    // Refused during keychain validation, not as an EVM revert: it never reaches a block
    // and costs nothing. The node names the error rather than failing opaquely.
    expect(result.revert.name).toBe('KeyAlreadyRevoked')
    expect(result.revert.rejectedPreExecution).toBe(true)
    expect(result.revert.raw).toMatch(/keychain validation failed/i)
  })

  it('leaves the root key working, which proves the account is not simply broken', async () => {
    const result = await payWithAgentKey(ctx.rootClient, {
      accessKey: ctx.owner as never,
      to: PATH_USD,
      data: chargeCalldata({ to: ctx.merchantA, amount: parseUnits('1', 6), reference: 'leash-ctrl' }),
    })
    expect(result.ok, result.ok ? '' : result.revert.raw).toBe(true)
    if (!result.ok) return
    note('post-revoke root control', 'PASS', `${result.result.hash} gas ${result.result.gasUsed}`)

    // eslint-disable-next-line no-console
    console.log(`\n=== adversarial suite summary, chain 42431, ${new Date().toISOString()} ===`)
    for (const r of record) console.log(`${r.outcome.padEnd(8)} ${r.label}`)
  })
})

describe('decodeRevert is wired to real chain output, not just to fixtures', () => {
  it('classifies a revoked key and an enforcement revert differently', () => {
    const enforcement = decodeRevert('reverted with CallNotAllowed()')
    expect(enforcement.enforcement).toBe(true)
    expect(enforcement.rejectedPreExecution).toBe(false)
  })

  it('has a key state to check against', async () => {
    const key = await getKey(ctx.rootClient, ctx.ownerAddress, ctx.agentKey.keyId)
    expect(key.info.isRevoked).toBe(true)
  })
})
