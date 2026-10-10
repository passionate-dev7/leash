import type { Address } from 'viem'
import { decideCuts, DEFAULT_DELIVERY_CUT } from '@leash/policy'
import type { CallScope, CutDecision, DeliveryCutPolicy, PaidCallOutcome } from '@leash/policy'
import { planCutoff } from './cutoff.js'
import type { CutoffPlan } from './cutoff.js'

export type DeliveryCutPlan = { decision: CutDecision; plan: CutoffPlan }

/**
 * From a log of paid calls, the cut transactions for every vendor that settled and did not deliver.
 * Each plan is one envelope signed once by the root or an admin key; after it lands, the chain
 * refuses the agent keys' next transfer to that recipient (CallNotAllowed) or the key is revoked.
 */
export function planDeliveryCuts(
  outcomes: readonly PaidCallOutcome[],
  keys: readonly { keyId: Address; scopes: readonly CallScope[] }[],
  policy: DeliveryCutPolicy = DEFAULT_DELIVERY_CUT,
): DeliveryCutPlan[] {
  return decideCuts(outcomes, policy)
    .filter((d) => d.cut)
    .map((decision) => ({ decision, plan: planCutoff(keys, decision.recipient as Address) }))
}
