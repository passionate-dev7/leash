import type { Address } from 'viem'
import type {
  BlastRadius,
  BlastRadiusEntry,
  RecipientIndex,
  ResolvedRecipient,
} from './types.js'

/** Addresses are compared lowercased everywhere. Checksum case is display only. */
export const norm = (a: string): string => a.toLowerCase()

/**
 * Groups a recipient index by payout address. This is the index that makes the whole feature
 * cheap: one pass over 43 resolved services, then every blast-radius query is a map lookup.
 */
export function indexByRecipient(
  index: RecipientIndex,
): Map<string, ResolvedRecipient[]> {
  const byAddress = new Map<string, ResolvedRecipient[]>()
  for (const r of index.resolved) {
    const key = norm(r.recipient)
    const bucket = byAddress.get(key)
    if (bucket) bucket.push(r)
    else byAddress.set(key, [r])
  }
  return byAddress
}

/**
 * The feature.
 *
 * Given the recipients an operator is about to write into a `SelectorRule`, return every
 * catalog service that address can actually pay, split into what they asked for and what
 * they did not. Sixteen services share `0xca4e835F…4779Fe`, so "allow OpenAI" is in fact
 * "allow sixteen services including CAPTCHA solving and an RPC endpoint".
 * MPP-CATALOG.md §4.
 *
 * Pure: no network, no clock. The only inputs are the allowlist, the index, and which
 * services the operator believes they selected.
 */
export function computeBlastRadius(args: {
  /** The addresses about to be written into the allowlist. */
  recipients: readonly Address[]
  /** The resolved catalog snapshot to evaluate against. */
  index: RecipientIndex
  /** Catalog service ids the operator explicitly selected. */
  intendedServiceIds: readonly string[]
}): BlastRadius {
  const { recipients, index, intendedServiceIds } = args
  const intended = new Set(intendedServiceIds)
  const byAddress = indexByRecipient(index)

  const entries: BlastRadiusEntry[] = []
  const reachable: ResolvedRecipient[] = []
  const collateral: ResolvedRecipient[] = []
  const seen = new Set<string>()

  // Deduplicate the allowlist while preserving the caller's order, so the UI reads the way
  // the operator wrote it.
  const uniqueRecipients: Address[] = []
  const recipientSeen = new Set<string>()
  for (const r of recipients) {
    const key = norm(r)
    if (recipientSeen.has(key)) continue
    recipientSeen.add(key)
    uniqueRecipients.push(r)
  }

  for (const address of uniqueRecipients) {
    const services = byAddress.get(norm(address)) ?? []
    const entryIntended: ResolvedRecipient[] = []
    const entryCollateral: ResolvedRecipient[] = []
    for (const s of services) {
      if (intended.has(s.serviceId)) entryIntended.push(s)
      else entryCollateral.push(s)
      if (!seen.has(s.serviceId)) {
        seen.add(s.serviceId)
        reachable.push(s)
        if (!intended.has(s.serviceId)) collateral.push(s)
      }
    }
    entries.push({
      recipient: address,
      intended: entryIntended,
      collateral: entryCollateral,
      realms: [...new Set(services.map((s) => s.realm).filter((r): r is string => Boolean(r)))],
      shared: services.length > 1,
    })
  }

  const worst = entries.reduce<BlastRadiusEntry | undefined>((acc, e) => {
    if (!acc) return e.collateral.length > 0 ? e : undefined
    return e.collateral.length > acc.collateral.length ? e : acc
  }, undefined)

  return {
    reachable,
    collateral,
    entries,
    hasSharedRecipients: entries.some((e) => e.shared),
    ...(worst ? { worst } : {}),
    indexCapturedAt: index.capturedAt,
    chainId: index.chainId,
  }
}

/**
 * One line an operator reads before signing. Deliberately blunt: the point of the feature is
 * that the honest sentence is alarming.
 */
export function blastRadiusHeadline(radius: BlastRadius): string {
  if (radius.reachable.length === 0)
    return 'This allowlist matches no service in the catalog snapshot.'
  if (radius.collateral.length === 0)
    return `${radius.reachable.length} service${radius.reachable.length === 1 ? '' : 's'} reachable, all of them named in the policy.`
  const worst = radius.worst
  const extra = radius.collateral.length
  const base = `${radius.reachable.length} services reachable, ${extra} of them not named in the policy.`
  if (!worst) return base
  return `${base} ${worst.recipient} alone pays ${worst.intended.length + worst.collateral.length} services across ${worst.realms.length} realm${worst.realms.length === 1 ? '' : 's'}.`
}

/**
 * Addresses in the snapshot that pay more than one service, biggest first. Answers "which
 * allowlist entries are traps" without needing a proposed policy.
 */
export function sharedRecipients(
  index: RecipientIndex,
): { recipient: Address; services: ResolvedRecipient[]; realms: string[] }[] {
  const byAddress = indexByRecipient(index)
  const out: { recipient: Address; services: ResolvedRecipient[]; realms: string[] }[] = []
  for (const services of byAddress.values()) {
    if (services.length < 2) continue
    const first = services[0]
    if (!first) continue
    out.push({
      recipient: first.recipient,
      services,
      realms: [...new Set(services.map((s) => s.realm).filter((r): r is string => Boolean(r)))],
    })
  }
  return out.sort((a, b) => b.services.length - a.services.length)
}

/**
 * Budget is the isolation mechanism where recipients cannot isolate. Given a shared payout
 * address, the honest advice is one key per service sized to that service, so a compromised
 * key scoped to the gateway can still only burn its own allowance.
 * MPP-CATALOG.md §4 item 3.
 */
export function isolationAdvice(radius: BlastRadius): string | undefined {
  if (!radius.hasSharedRecipients) return undefined
  const worst = radius.worst
  if (!worst || worst.collateral.length === 0) return undefined
  return `Recipient scoping cannot separate these. ${worst.recipient} is one payout address for ${worst.intended.length + worst.collateral.length} services. Isolate with budget instead: issue one key per service, each capped at that service's expected spend.`
}
