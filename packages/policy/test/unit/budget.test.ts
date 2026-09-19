import { describe, expect, it } from 'vitest'
import { callsRemaining, gasPreCharge, sizeBudget, sizeFromPolicy } from '../../src/budget.js'
import { compilePolicy } from '../../src/compile.js'
import { MPP_SETTLEMENT_ASSET_MAINNET } from '../../src/constants.js'
import { index } from './fixtures.js'

describe('gasPreCharge', () => {
  /**
   * The two conversions measured on Moderato, BUILD-SPEC §5. If the formula is wrong these
   * two lines are what catches it, because both were read off real receipts.
   */
  it('reproduces the two measured fee conversions', () => {
    expect(
      gasPreCharge({ gasLimit: 301_438n, maxFeePerGas: 11_930_452_729n, decimals: 6 }),
    ).toBe(3_597n)
    expect(
      gasPreCharge({ gasLimit: 76_738n, maxFeePerGas: 11_930_452_729n, decimals: 6 }),
    ).toBe(916n)
  })

  it('rounds up, because the chain charges the ceiling', () => {
    // 3,596.3 units of fee is charged as 3,597, not 3,596.
    expect(
      gasPreCharge({ gasLimit: 301_438n, maxFeePerGas: 11_930_452_729n, decimals: 6 }),
    ).toBeGreaterThan(
      (301_438n * 11_930_452_729n) / 10n ** 12n,
    )
  })

  it('scales for a token with different decimals', () => {
    expect(gasPreCharge({ gasLimit: 100_000n, maxFeePerGas: 10n ** 12n, decimals: 18 })).toBe(
      100_000n * 10n ** 12n,
    )
  })
})

describe('sizeBudget', () => {
  it('sponsored is exactly N times the amount, with no gas reserve', () => {
    const s = sizeBudget({ callCount: 10, amountPerCall: 3_000_000n, sponsored: true, decimals: 6 })
    expect(s.total).toBe(30_000_000n)
    expect(s.gasReserve).toBe(0n)
    expect(s.basis).toContain('0x2c2b9fc2')
  })

  it('unsponsored adds headroom computed from the gas limit, not from gas used', () => {
    const s = sizeBudget({
      callCount: 10,
      amountPerCall: 3_000_000n,
      sponsored: false,
      decimals: 6,
      gasLimit: 301_438n,
      maxFeePerGas: 11_930_452_729n,
    })
    expect(s.gasReserve).toBe(35_970n)
    expect(s.total).toBe(30_035_970n)
  })

  it('refuses to size an unsponsored budget without gas parameters', () => {
    expect(() =>
      sizeBudget({ callCount: 1, amountPerCall: 1n, sponsored: false, decimals: 6 }),
    ).toThrow(/gasLimit/)
  })

  it('a budget sized from gasUsed would under-reserve against a generous gas limit', () => {
    // The trap BUILD-SPEC §5.2 names: the pre-charge is at the limit, so sizing from the
    // 52,078 warm gasUsed leaves a 300k-limit transaction short.
    const fromUsed = gasPreCharge({
      gasLimit: 52_078n,
      maxFeePerGas: 11_930_452_729n,
      decimals: 6,
    })
    const fromLimit = gasPreCharge({
      gasLimit: 300_000n,
      maxFeePerGas: 11_930_452_729n,
      decimals: 6,
    })
    expect(fromLimit).toBeGreaterThan(fromUsed * 5n)
  })
})

describe('sizeFromPolicy', () => {
  const policy = compilePolicy(
    {
      agent: 'research-bot',
      token: MPP_SETTLEMENT_ASSET_MAINNET,
      decimals: 6,
      budget: 50_000000n,
      periodSeconds: 2_592_000,
      expiry: 1_792_000_000,
      serviceIds: ['openai', 'exa'],
    },
    index,
  )

  it('prices a call volume from the live-quoted endpoint prices', () => {
    const s = sizeFromPolicy({ policy, callsPerService: 100, sponsored: true })
    // openai 5,125 + exa 7,000 per call, 100 calls each.
    expect(s.payments).toBe(100n * 5125n + 100n * 7000n)
    expect(s.total).toBe(s.payments)
    expect(s.perService.map((p) => p.service.serviceId)).toEqual(['openai', 'exa'])
  })

  it('accepts a per-service call volume', () => {
    const s = sizeFromPolicy({
      policy,
      callsPerService: { openai: 1000, exa: 10 },
      sponsored: true,
    })
    expect(s.payments).toBe(1000n * 5125n + 10n * 7000n)
  })

  it('adds a gas reserve when unsponsored', () => {
    const s = sizeFromPolicy({
      policy,
      callsPerService: 10,
      sponsored: false,
      gasLimit: 300_000n,
      maxFeePerGas: 11_930_452_729n,
    })
    expect(s.gasReserve).toBeGreaterThan(0n)
    expect(s.total).toBe(s.payments + s.gasReserve)
  })
})

describe('callsRemaining', () => {
  it('ignores gas when sponsored', () => {
    expect(
      callsRemaining({ remaining: 50_000_000n, pricePerCall: 5_125n, sponsored: true }),
    ).toBe(9756)
  })

  it('charges gas against the same budget when unsponsored', () => {
    const sponsored = callsRemaining({
      remaining: 50_000_000n,
      pricePerCall: 5_125n,
      sponsored: true,
    })
    const unsponsored = callsRemaining({
      remaining: 50_000_000n,
      pricePerCall: 5_125n,
      sponsored: false,
      gasPerCall: 3_597n,
    })
    expect(unsponsored).toBeLessThan(sponsored)
    // 50,000,000 / (5,125 + 3,597) = 5,732 calls, against 9,756 sponsored.
    expect(unsponsored).toBe(5732)
  })
})
