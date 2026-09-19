import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Address } from 'viem'
import type { RecipientIndex, ResolvedRecipient } from '../../src/types.js'

/**
 * The tests run against the committed recipient index, which was produced by probing live
 * 402 challenges. Nothing here is invented: if `pnpm catalog:refresh` produces a different
 * shape, these tests are supposed to notice.
 */
export const index: RecipientIndex = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../data/recipients.4217.json', import.meta.url)),
    'utf8',
  ),
) as RecipientIndex

/** The shared Tempo gateway payout address. Sixteen services sit behind it. */
export const GATEWAY: Address = '0xca4e835F803cB0b7C428222B3A3B98518d4779Fe'
/** Four independent domains sit behind this one. */
export const APEX: Address = '0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8'
/** A service with a payout address of its own, so recipient scoping does isolate it. */
export const EXA: Address = '0xB98eF29eb2be19Ae646A8FC0248255B90A332dbC'

const at = (address: Address): ResolvedRecipient[] =>
  index.resolved.filter((r) => r.recipient.toLowerCase() === address.toLowerCase())

export const GATEWAY_GROUP = at(GATEWAY)
export const APEX_GROUP = at(APEX)
