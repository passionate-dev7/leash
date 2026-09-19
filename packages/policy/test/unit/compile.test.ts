import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import {
  compilePolicy,
  encodeAuthorizeKey,
  groupScopes,
  PolicyCompileError,
  describePolicy,
} from '../../src/compile.js'
import { SELECTOR, MPP_SETTLEMENT_ASSET_MAINNET, CHANNEL_RESERVE } from '../../src/constants.js'
import { index, GATEWAY, APEX_GROUP, EXA } from './fixtures.js'

const KEYID: Address = '0x64eb6C85AEbb09C57ab46Bd1dE6AE1Ef20063281'

describe('encodeAuthorizeKey', () => {
  /**
   * The worked example from BUILD-SPEC §4.1, byte for byte. If this drifts, either the ABI
   * changed or the encoder did, and both are things a silent test would let through.
   */
  it('reproduces the BUILD-SPEC worked example exactly', () => {
    const calldata = encodeAuthorizeKey(KEYID, 0, {
      expiry: 1_792_000_000n,
      enforceLimits: true,
      limits: [
        { token: MPP_SETTLEMENT_ASSET_MAINNET, amount: 50_000000n, period: 2_592_000n },
      ],
      allowAnyCalls: false,
      allowedCalls: [
        {
          target: MPP_SETTLEMENT_ASSET_MAINNET,
          selectorRules: [
            {
              selector: SELECTOR.transferWithMemo,
              recipients: [
                '0xca4e835F803cB0b7C428222B3A3B98518d4779Fe',
                '0xB98eF29eb2be19Ae646A8FC0248255B90A332dbC',
                '0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8',
              ],
            },
          ],
        },
      ],
    })

    expect(calldata.slice(0, 10)).toBe('0x980a6025')
    expect((calldata.length - 2) / 2).toBe(772)

    const words = calldata.slice(10).match(/.{64}/g) ?? []
    expect(words).toEqual([
      '00000000000000000000000064eb6c85aebb09c57ab46bd1de6ae1ef20063281',
      '0000000000000000000000000000000000000000000000000000000000000000',
      '0000000000000000000000000000000000000000000000000000000000000060',
      '000000000000000000000000000000000000000000000000000000006acfc000',
      '0000000000000000000000000000000000000000000000000000000000000001',
      '00000000000000000000000000000000000000000000000000000000000000a0',
      '0000000000000000000000000000000000000000000000000000000000000000',
      '0000000000000000000000000000000000000000000000000000000000000120',
      '0000000000000000000000000000000000000000000000000000000000000001',
      '00000000000000000000000020c000000000000000000000b9537d11c60e8b50',
      '0000000000000000000000000000000000000000000000000000000002faf080',
      '0000000000000000000000000000000000000000000000000000000000278d00',
      '0000000000000000000000000000000000000000000000000000000000000001',
      '0000000000000000000000000000000000000000000000000000000000000020',
      '00000000000000000000000020c000000000000000000000b9537d11c60e8b50',
      '0000000000000000000000000000000000000000000000000000000000000040',
      '0000000000000000000000000000000000000000000000000000000000000001',
      '0000000000000000000000000000000000000000000000000000000000000020',
      '95777d5900000000000000000000000000000000000000000000000000000000',
      '0000000000000000000000000000000000000000000000000000000000000040',
      '0000000000000000000000000000000000000000000000000000000000000003',
      '000000000000000000000000ca4e835f803cb0b7c428222b3a3b98518d4779fe',
      '000000000000000000000000b98ef29eb2be19ae646a8fc0248255b90a332dbc',
      '0000000000000000000000001ee42717b1c370dace197a8850bf41a932f3b5a8',
    ])
  })

  it('left-aligns the bytes4 selector inside its word', () => {
    const calldata = encodeAuthorizeKey(KEYID, 0, {
      expiry: 1n,
      enforceLimits: true,
      limits: [{ token: MPP_SETTLEMENT_ASSET_MAINNET, amount: 1n, period: 0n }],
      allowAnyCalls: false,
      allowedCalls: [
        {
          target: MPP_SETTLEMENT_ASSET_MAINNET,
          selectorRules: [{ selector: SELECTOR.transferWithMemo, recipients: [] }],
        },
      ],
    })
    expect(calldata).toContain(
      '95777d5900000000000000000000000000000000000000000000000000000000',
    )
    expect(calldata).not.toContain(
      '0000000000000000000000000000000000000000000000000000000095777d59',
    )
  })

  it('picks the 3-argument overload, not the legacy or witness one', () => {
    expect(SELECTOR.authorizeKey).toBe('0x980a6025')
  })
})

describe('groupScopes', () => {
  it('collapses many services on one token into one CallScope with a union of recipients', () => {
    const grouped = groupScopes([
      { address: MPP_SETTLEMENT_ASSET_MAINNET, selector: SELECTOR.transferWithMemo, recipients: ['0x1111111111111111111111111111111111111111'] },
      { address: MPP_SETTLEMENT_ASSET_MAINNET, selector: SELECTOR.transferWithMemo, recipients: ['0x2222222222222222222222222222222222222222'] },
    ])
    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.selectorRules).toHaveLength(1)
    expect(grouped[0]?.selectorRules[0]?.recipients).toEqual([
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ])
  })

  it('deduplicates recipients that differ only in checksum case', () => {
    const grouped = groupScopes([
      { address: MPP_SETTLEMENT_ASSET_MAINNET, selector: SELECTOR.transferWithMemo, recipients: ['0xca4e835F803cB0b7C428222B3A3B98518d4779Fe'] },
      { address: MPP_SETTLEMENT_ASSET_MAINNET, selector: SELECTOR.transferWithMemo, recipients: ['0xca4e835f803cb0b7c428222b3a3b98518d4779fe'] },
    ])
    expect(grouped[0]?.selectorRules[0]?.recipients).toHaveLength(1)
  })

  it('keeps distinct targets as distinct scopes', () => {
    const grouped = groupScopes([
      { address: MPP_SETTLEMENT_ASSET_MAINNET, selector: SELECTOR.transferWithMemo, recipients: [] },
      { address: CHANNEL_RESERVE, selector: SELECTOR.channelOpen },
      { address: CHANNEL_RESERVE, selector: SELECTOR.channelTopUp },
    ])
    expect(grouped).toHaveLength(2)
    expect(grouped[1]?.selectorRules.map((r) => r.selector)).toEqual([
      SELECTOR.channelOpen,
      SELECTOR.channelTopUp,
    ])
  })
})

describe('compilePolicy', () => {
  const base = {
    agent: 'research-bot',
    token: MPP_SETTLEMENT_ASSET_MAINNET,
    decimals: 6,
    budget: 50_000000n,
    periodSeconds: 2_592_000,
    expiry: 1_792_000_000,
  }

  it('pulls recipients from the index rather than accepting hand-typed addresses', () => {
    const policy = compilePolicy({ ...base, serviceIds: ['openai', 'exa'] }, index)
    expect(policy.recipients).toEqual([GATEWAY, EXA])
    expect(policy.selector).toBe('0x980a6025')
    expect(policy.restrictions.allowAnyCalls).toBe(false)
    expect(policy.restrictions.enforceLimits).toBe(true)
  })

  it('emits exactly one CallScope for sixteen gateway services', () => {
    const policy = compilePolicy(
      { ...base, serviceIds: ['openai', 'anthropic', 'fal', 'firecrawl', 'modal', 'openrouter'] },
      index,
    )
    expect(policy.recipients).toEqual([GATEWAY])
    expect(policy.restrictions.allowedCalls).toHaveLength(1)
    expect(policy.restrictions.allowedCalls[0]?.selectorRules[0]?.recipients).toEqual([GATEWAY])
  })

  it('refuses a session-intent service by default and says why', () => {
    const policy = compilePolicy({ ...base, serviceIds: ['openai', 'tempo-indexer'] }, index)
    expect(policy.covered.map((c) => c.serviceId)).toEqual(['openai'])
    const gap = policy.gaps.find((g) => g.serviceId === 'tempo-indexer')
    expect(gap?.kind).toBe('session-intent')
    expect(gap?.detail).toContain('cannot pay it at all')
    expect(policy.restrictions.allowedCalls).toHaveLength(1)
  })

  it('allowlists the channel selectors when session channels are enabled, and still flags the gap', () => {
    const policy = compilePolicy(
      { ...base, serviceIds: ['openai', 'tempo-indexer'], allowSessionChannels: true },
      index,
    )
    const channelScope = policy.restrictions.allowedCalls.find(
      (s) => s.target.toLowerCase() === CHANNEL_RESERVE.toLowerCase(),
    )
    expect(channelScope?.selectorRules.map((r) => r.selector)).toEqual([
      SELECTOR.channelOpen,
      SELECTOR.channelTopUp,
    ])
    // The selector is allowed, but recipient scoping still does not apply, and the product
    // must keep saying so rather than implying coverage.
    const gap = policy.gaps.find((g) => g.serviceId === 'tempo-indexer')
    expect(gap?.kind).toBe('session-intent')
    expect(gap?.detail).toContain('recipient allowlist does not constrain')
    expect(channelScope?.selectorRules[0]?.recipients).toEqual([])
  })

  it('flags a service that settles in a different currency instead of silently allowlisting it', () => {
    const policy = compilePolicy(
      {
        ...base,
        // pathUSD, not the MPP settlement asset the gateway quotes.
        token: '0x20c0000000000000000000000000000000000000',
        serviceIds: ['openai'],
        extraRecipients: ['0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4'],
      },
      index,
    )
    expect(policy.covered).toHaveLength(0)
    expect(policy.gaps[0]?.kind).toBe('currency-mismatch')
    expect(policy.gaps[0]?.detail).toContain('CallNotAllowed')
    // The gateway address must NOT appear in the allowlist: allowlisting it against the
    // wrong token would produce a key that looks permitted and reverts on every call.
    expect(policy.recipients).toEqual(['0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4'])
  })

  it('flags an unknown service id as unresolved rather than dropping it', () => {
    const policy = compilePolicy({ ...base, serviceIds: ['openai', 'not-a-service'] }, index)
    expect(policy.gaps.map((g) => g.kind)).toEqual(['unresolved'])
  })

  it('refuses to compile a scoped deny-all key', () => {
    expect(() => compilePolicy({ ...base, serviceIds: ['tempo-indexer'] }, index)).toThrow(
      PolicyCompileError,
    )
    expect(() => compilePolicy({ ...base, serviceIds: [] }, index)).toThrow(/deny-all/)
  })

  it('rejects a zero or negative budget', () => {
    expect(() => compilePolicy({ ...base, budget: 0n, serviceIds: ['openai'] }, index)).toThrow(
      /greater than zero/,
    )
  })

  it('appends operator extras after catalog recipients without duplicating them', () => {
    const policy = compilePolicy(
      {
        ...base,
        serviceIds: ['openai'],
        extraRecipients: [GATEWAY.toLowerCase() as Address, '0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4'],
      },
      index,
    )
    expect(policy.recipients).toEqual([GATEWAY, '0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4'])
  })

  it('sums one call of each covered service from live-quoted prices', () => {
    const policy = compilePolicy({ ...base, serviceIds: ['openai', 'exa'] }, index)
    expect(policy.oneCallOfEachCost).toBe(5125n + 7000n)
  })

  it('describes the tuple in clauses that map onto its fields', () => {
    const policy = compilePolicy({ ...base, serviceIds: ['openai', 'apex-db'] }, index)
    const lines = describePolicy(policy)
    expect(lines[0]).toContain('50 USDC per 30 days')
    expect(lines.join(' ')).toContain('Plain transfer() reverts CallNotAllowed')
    expect(lines.join(' ')).toContain('2 allowed recipients')
  })
})

describe('APEX group fixture sanity', () => {
  it('has four separate realms behind one address', () => {
    expect(APEX_GROUP).toHaveLength(4)
    expect(new Set(APEX_GROUP.map((s) => s.realm)).size).toBe(4)
  })
})
