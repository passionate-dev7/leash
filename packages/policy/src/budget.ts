import type { CompiledPolicy, ResolvedRecipient } from './types.js'

/**
 * Budget sizing. BUILD-SPEC §5.2.
 *
 * Sponsored, a budget is exactly N * amount. Unsponsored, gas is pre-charged against the
 * same budget at the **gas limit** and only partly refunded, so headroom must be computed
 * from the limit. Sizing from observed `gasUsed` produces a budget that trips
 * `SpendingLimitExceeded` on a payment that would otherwise fit.
 */

/** `ceil(gasLimit * maxFeePerGas / 10^(18-decimals))`, the per-transaction budget pre-charge. */
export function gasPreCharge(args: {
  gasLimit: bigint
  maxFeePerGas: bigint
  decimals: number
}): bigint {
  const scale = 10n ** BigInt(18 - args.decimals)
  const numerator = args.gasLimit * args.maxFeePerGas
  return (numerator + scale - 1n) / scale
}

export type BudgetSizing = {
  sponsored: boolean
  /** Sum of the payments themselves. */
  payments: bigint
  /** Budget consumed by gas. Zero when sponsored. */
  gasReserve: bigint
  /** What to put in `TokenLimit.amount`. */
  total: bigint
  /** How the number was arrived at, for display next to it. */
  basis: string
}

export function sizeBudget(args: {
  callCount: number
  amountPerCall: bigint
  sponsored: boolean
  decimals: number
  /** Required when unsponsored. Use the limit you will actually submit, not gasUsed. */
  gasLimit?: bigint
  maxFeePerGas?: bigint
}): BudgetSizing {
  const payments = BigInt(args.callCount) * args.amountPerCall
  if (args.sponsored)
    return {
      sponsored: true,
      payments,
      gasReserve: 0n,
      total: payments,
      basis: `${args.callCount} x ${args.amountPerCall}. Sponsored, so gas never debits the key: measured 3,000,000 budget movement for a 3,000,000 payment on Moderato tx 0x2c2b9fc2.`,
    }
  if (args.gasLimit === undefined || args.maxFeePerGas === undefined)
    throw new Error('unsponsored sizing needs gasLimit and maxFeePerGas')
  const perCall = gasPreCharge({
    gasLimit: args.gasLimit,
    maxFeePerGas: args.maxFeePerGas,
    decimals: args.decimals,
  })
  const gasReserve = BigInt(args.callCount) * perCall
  return {
    sponsored: false,
    payments,
    gasReserve,
    total: payments + gasReserve,
    basis: `${args.callCount} x ${args.amountPerCall} plus ${args.callCount} x ceil(${args.gasLimit} * ${args.maxFeePerGas} / 10^${18 - args.decimals}) = ${perCall} pre-charged at the gas limit. Measured overhead on Moderato was 3,597 units on a 3,000,000 payment, 0.12%.`,
  }
}

/**
 * Sizes a budget from the policy's own covered services: one call to each service's probed
 * endpoint, times an expected call volume. Uses the prices the live 402 challenges quoted,
 * so the number carries its origin.
 */
export function sizeFromPolicy(args: {
  policy: CompiledPolicy
  /** Calls per service over the period. Either one number for all, or per service id. */
  callsPerService: number | Record<string, number>
  sponsored: boolean
  gasLimit?: bigint
  maxFeePerGas?: bigint
}): BudgetSizing & { perService: { service: ResolvedRecipient; calls: number; cost: bigint }[] } {
  const { policy } = args
  const perService = policy.covered.map((service) => {
    const calls =
      typeof args.callsPerService === 'number'
        ? args.callsPerService
        : (args.callsPerService[service.serviceId] ?? 0)
    return { service, calls, cost: BigInt(service.amount) * BigInt(calls) }
  })
  const payments = perService.reduce((sum, p) => sum + p.cost, 0n)
  const callCount = perService.reduce((sum, p) => sum + p.calls, 0)
  const sizing = args.sponsored
    ? sizeBudget({
        callCount,
        amountPerCall: 0n,
        sponsored: true,
        decimals: policy.input.decimals,
      })
    : sizeBudget({
        callCount,
        amountPerCall: 0n,
        sponsored: false,
        decimals: policy.input.decimals,
        ...(args.gasLimit !== undefined ? { gasLimit: args.gasLimit } : {}),
        ...(args.maxFeePerGas !== undefined ? { maxFeePerGas: args.maxFeePerGas } : {}),
      })
  return {
    ...sizing,
    payments,
    total: payments + sizing.gasReserve,
    basis: `${callCount} calls priced from live 402 challenges resolved ${policy.covered[0]?.resolvedAt ?? 'n/a'}. ${sizing.basis.split('. ').slice(1).join('. ')}`,
    perService,
  }
}

/**
 * How many more calls a key can make at a given price before the cap bites. The number an
 * operator actually wants next to a gauge.
 */
export function callsRemaining(args: {
  remaining: bigint
  pricePerCall: bigint
  sponsored: boolean
  gasPerCall?: bigint
}): number {
  const cost = args.pricePerCall + (args.sponsored ? 0n : (args.gasPerCall ?? 0n))
  if (cost <= 0n) return Number.POSITIVE_INFINITY
  return Number(args.remaining / cost)
}
