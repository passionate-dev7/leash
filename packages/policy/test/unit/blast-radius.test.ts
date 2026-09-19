import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import {
  blastRadiusHeadline,
  computeBlastRadius,
  isolationAdvice,
  indexByRecipient,
  sharedRecipients,
} from '../../src/blast-radius.js'
import { compilePolicy } from '../../src/compile.js'
import { MPP_SETTLEMENT_ASSET_MAINNET } from '../../src/constants.js'
import { index, GATEWAY, APEX, EXA, GATEWAY_GROUP } from './fixtures.js'

describe('the shared-recipient finding, re-measured from the committed index', () => {
  it('has sixteen services behind one gateway address', () => {
    expect(GATEWAY_GROUP.map((s) => s.serviceId).sort()).toEqual(
      [
        'anthropic',
        'aviationstack',
        'codestorage',
        'fal',
        'firecrawl',
        'goflightlabs',
        'kicksdb',
        'modal',
        'openai',
        'openrouter',
        'oxylabs',
        'rpc',
        'serpapi',
        'spyfu',
        'storage',
        'twocaptcha',
      ].sort(),
    )
  })

  it('ranks shared payout addresses biggest first', () => {
    const shared = sharedRecipients(index)
    expect(shared[0]?.recipient.toLowerCase()).toBe(GATEWAY.toLowerCase())
    expect(shared[0]?.services).toHaveLength(16)
    expect(shared[1]?.recipient.toLowerCase()).toBe(APEX.toLowerCase())
    expect(shared[1]?.realms).toHaveLength(4)
  })

  it('indexes every resolved service under its payout address', () => {
    const byAddress = indexByRecipient(index)
    const total = [...byAddress.values()].reduce((n, v) => n + v.length, 0)
    expect(total).toBe(index.resolved.length)
  })
})

describe('computeBlastRadius', () => {
  it('reports fifteen services the operator never named when they allow OpenAI', () => {
    const radius = computeBlastRadius({
      recipients: [GATEWAY],
      index,
      intendedServiceIds: ['openai'],
    })
    expect(radius.reachable).toHaveLength(16)
    expect(radius.collateral).toHaveLength(15)
    expect(radius.collateral.map((s) => s.serviceId)).toContain('twocaptcha')
    expect(radius.collateral.map((s) => s.serviceId)).toContain('rpc')
    expect(radius.hasSharedRecipients).toBe(true)
  })

  it('reports zero collateral for a service with its own payout address', () => {
    const radius = computeBlastRadius({
      recipients: [EXA],
      index,
      intendedServiceIds: ['exa'],
    })
    expect(radius.reachable).toHaveLength(1)
    expect(radius.collateral).toHaveLength(0)
    expect(radius.hasSharedRecipients).toBe(false)
    expect(isolationAdvice(radius)).toBeUndefined()
  })

  it('counts each service once even when two allowlisted addresses overlap', () => {
    const radius = computeBlastRadius({
      recipients: [GATEWAY, GATEWAY.toLowerCase() as Address, EXA],
      index,
      intendedServiceIds: ['openai', 'exa'],
    })
    expect(radius.entries).toHaveLength(2)
    expect(radius.reachable).toHaveLength(17)
    expect(radius.collateral).toHaveLength(15)
  })

  it('names the four separate domains hiding behind one address', () => {
    const radius = computeBlastRadius({
      recipients: [APEX],
      index,
      intendedServiceIds: ['apex-db'],
    })
    expect(radius.entries[0]?.realms.sort()).toEqual([
      'api.apex-db.org',
      'api.recallradar.dev',
      'api.rxatlas.dev',
      'api.trialbase-db.org',
    ])
    expect(radius.collateral.map((s) => s.serviceId).sort()).toEqual([
      'recallradar',
      'rxatlas',
      'trialbase-db',
    ])
  })

  it('carries the snapshot provenance so nothing on screen is a number without an origin', () => {
    const radius = computeBlastRadius({ recipients: [GATEWAY], index, intendedServiceIds: [] })
    expect(radius.indexCapturedAt).toBe(index.capturedAt)
    expect(radius.chainId).toBe(4217)
  })

  it('reports an allowlist that matches nothing rather than failing silently', () => {
    const radius = computeBlastRadius({
      recipients: ['0x000000000000000000000000000000000000dEaD'],
      index,
      intendedServiceIds: [],
    })
    expect(radius.reachable).toHaveLength(0)
    expect(blastRadiusHeadline(radius)).toContain('matches no service')
  })

  it('is a pure function of its arguments', () => {
    const args = {
      recipients: [GATEWAY] as Address[],
      index,
      intendedServiceIds: ['openai'],
    }
    const a = computeBlastRadius(args)
    const b = computeBlastRadius(args)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(args.recipients).toEqual([GATEWAY])
  })
})

describe('headline and advice', () => {
  it('states the collateral count and the worst address', () => {
    const radius = computeBlastRadius({
      recipients: [GATEWAY],
      index,
      intendedServiceIds: ['openai'],
    })
    const headline = blastRadiusHeadline(radius)
    expect(headline).toContain('16 services reachable')
    expect(headline).toContain('15 of them not named')
    expect(headline).toContain(GATEWAY)
  })

  it('recommends budget isolation exactly when recipients cannot isolate', () => {
    const shared = computeBlastRadius({
      recipients: [GATEWAY],
      index,
      intendedServiceIds: ['openai'],
    })
    expect(isolationAdvice(shared)).toContain('one key per service')

    const clean = computeBlastRadius({
      recipients: [EXA],
      index,
      intendedServiceIds: ['exa'],
    })
    expect(isolationAdvice(clean)).toBeUndefined()
  })
})

describe('compile then measure, which is the order the UI uses', () => {
  it('computes the radius of the exact recipients the compiler will write on chain', () => {
    const policy = compilePolicy(
      {
        agent: 'research-bot',
        token: MPP_SETTLEMENT_ASSET_MAINNET,
        decimals: 6,
        budget: 50_000000n,
        periodSeconds: 2_592_000,
        expiry: 1_792_000_000,
        serviceIds: ['openai'],
      },
      index,
    )
    const radius = computeBlastRadius({
      recipients: policy.recipients,
      index,
      intendedServiceIds: policy.input.serviceIds,
    })
    expect(policy.covered).toHaveLength(1)
    expect(radius.reachable).toHaveLength(16)
    // The policy says one service. The chain will permit sixteen. That gap is the product.
    expect(radius.collateral.length).toBe(15)
  })
})
