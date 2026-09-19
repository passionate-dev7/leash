import { encodeFunctionData, pad, toHex } from 'viem'
import type { Address, Hex } from 'viem'
import { Abis } from 'viem/tempo'

/**
 * Calldata builders for the two shapes an MPP payment actually takes on chain.
 * Determined by decoding transactions a real MPP client produced, not from docs.
 * MPP-CATALOG.md §5.
 */

/** A 32-byte memo. MPP puts a payment reference here; anything shorter is right-padded. */
export function memo(text: string): Hex {
  const hex = toHex(text)
  if ((hex.length - 2) / 2 > 32)
    throw new Error(`memo "${text}" is longer than 32 bytes`)
  return pad(hex, { size: 32, dir: 'right' })
}

/**
 * `charge` intent: 144 of 152 catalogued intents. The scope that governs this is
 * `{target: token, selector: 0x95777d59, recipients: [payTo]}`.
 *
 * Note this is deliberately not `transfer`. A key scoped to `transferWithMemo` cannot
 * escape through `transfer`, and a client that reaches for `transfer` gets `CallNotAllowed`
 * even when paying an allowed merchant. Confirmed by transacting. BUILD-SPEC §7.
 */
export function chargeCalldata(args: {
  to: Address
  amount: bigint
  reference: string
}): Hex {
  return encodeFunctionData({
    abi: Abis.tip20,
    functionName: 'transferWithMemo',
    args: [args.to, args.amount, memo(args.reference)],
  })
}

/**
 * The call a key scoped only to `transferWithMemo` must never be able to make. Exported so
 * the adversarial suite and the demo can attempt it for real rather than simulate a refusal.
 */
export function plainTransferCalldata(args: { to: Address; amount: bigint }): Hex {
  return encodeFunctionData({
    abi: Abis.tip20,
    functionName: 'transfer',
    args: [args.to, args.amount],
  })
}
