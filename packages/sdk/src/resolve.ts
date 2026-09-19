import type { Address } from 'viem'
import {
  CHANNEL_RESERVE,
  OFF_CATALOG_SERVICES,
  decodeChallenge,
  fetchCatalog,
  offerIntent,
  probeEndpoint,
  probeUrl,
  tempoPayable,
} from '@leash/policy'
import type {
  CatalogService,
  PaymentOffer,
  RecipientIndex,
  ResolvedRecipient,
  UnresolvedService,
} from '@leash/policy'

/**
 * Live recipient resolution, re-run immediately before an `authorizeKey`.
 *
 * `@leash/policy`'s `resolveByChallenge` takes the first offer on the requested chain. That
 * was enough to build the committed snapshot, and it is not enough to sign against, because a
 * single 402 now carries several chain-4217 offers in different currencies **that pay
 * different addresses**. Measured 2026-09-19 on `openai.mpp.tempo.xyz/v1/responses`:
 *
 *   charge 4217 0x20c0…b9537d11c60e8b50 -> 0xca4e835F803cB0b7C428222B3A3B98518d4779Fe
 *   charge 4217 0x20c0…8b4c619d2eedec7a -> 0x975937feafc6869a260c176854dda8764a78e122
 *   charge 4217 0x20c0…0000000000000000 -> 0xca4e835F803cB0b7C428222B3A3B98518d4779Fe
 *   session 4217 0x20c0…b9537d11c60e8b50 -> 0xca4e835F803cB0b7C428222B3A3B98518d4779Fe
 *
 * So "the recipient for chain 4217" is not a function of the chain alone. It is a function of
 * (chain, currency, intent), and a resolver that ignores the currency will allowlist a payout
 * address the policy's own budget token never pays. This module picks by currency, keeps the
 * offers it did not take, and reports both.
 */

const norm = (a: string): string => a.toLowerCase()

export type OfferChoice = {
  offer: PaymentOffer
  /** Chain-matched offers the resolver did not take, so a UI can show what was on the table. */
  alternatives: PaymentOffer[]
  /** False when no offer quoted the policy's budget token and the first one was taken instead. */
  preferredCurrencyMatched: boolean
}

/**
 * Prefers a charge-intent offer in the requested currency, then any offer in that currency,
 * then the first charge offer on the chain, then the first offer on the chain.
 */
export function chooseOffer(
  offers: readonly PaymentOffer[],
  chainId: number,
  preferCurrency?: Address,
): OfferChoice | undefined {
  const onChain = offers.filter((o) => o.methodDetails?.chainId === chainId)
  if (onChain.length === 0) return undefined
  const wanted = preferCurrency ? norm(preferCurrency) : undefined
  const pick =
    (wanted &&
      onChain.find((o) => o.currency && norm(o.currency) === wanted && offerIntent(o) === 'charge')) ||
    (wanted && onChain.find((o) => o.currency && norm(o.currency) === wanted)) ||
    onChain.find((o) => offerIntent(o) === 'charge') ||
    onChain[0]
  if (!pick) return undefined
  return {
    offer: pick,
    alternatives: onChain.filter((o) => o !== pick),
    preferredCurrencyMatched: Boolean(wanted && pick.currency && norm(pick.currency) === wanted),
  }
}

let catalogCache: { services: CatalogService[]; fetchedAt: string; bytes: number } | undefined

/**
 * The live MPP catalog plus the services it does not list, cached for the process. Pass
 * `refresh` to re-fetch; the console exposes that as a button so a stale catalog is a choice
 * rather than an accident.
 */
export async function catalogServices(
  options: { refresh?: boolean } = {},
): Promise<{ services: CatalogService[]; fetchedAt: string; bytes: number }> {
  if (catalogCache && !options.refresh) return catalogCache
  const { catalog, bytes, fetchedAt } = await fetchCatalog()
  catalogCache = {
    services: [...tempoPayable(catalog), ...OFF_CATALOG_SERVICES],
    fetchedAt,
    bytes,
  }
  return catalogCache
}

export type LiveResolution = {
  resolvedAt: string
  chainId: number
  preferCurrency?: Address
  resolved: ResolvedRecipient[]
  unresolved: UnresolvedService[]
  /** Offers on the requested chain that were not taken, keyed by service id. */
  alternates: Record<
    string,
    { currency?: string; recipient?: string; intent: string; amount?: string }[]
  >
  /** Services whose chosen offer does not quote `preferCurrency`. */
  currencyMisses: string[]
}

async function resolveOne(
  service: CatalogService,
  chainId: number,
  preferCurrency: Address | undefined,
  timeoutMs: number,
): Promise<
  | { ok: true; resolved: ResolvedRecipient; choice: OfferChoice }
  | { ok: false; unresolved: UnresolvedService }
> {
  const endpoint = probeEndpoint(service)
  if (!endpoint)
    return {
      ok: false,
      unresolved: {
        serviceId: service.id,
        name: service.name,
        realm: service.realm,
        reason: 'catalog entry declares no endpoints',
      },
    }
  const url = probeUrl(service, endpoint)
  const method = (endpoint.method ?? 'GET').toUpperCase()
  let status: number
  let header: string | null
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
    status = res.status
    header = res.headers.get('www-authenticate')
  } catch (error) {
    return {
      ok: false,
      unresolved: {
        serviceId: service.id,
        name: service.name,
        realm: service.realm,
        url,
        error: error instanceof Error ? error.name : String(error),
        reason: 'network error probing the endpoint',
      },
    }
  }

  const choice = chooseOffer(decodeChallenge(header), chainId, preferCurrency)
  const recipient = choice?.offer.recipient
  const currency = choice?.offer.currency
  if (status !== 402 || !choice || !recipient || !currency)
    return {
      ok: false,
      unresolved: {
        serviceId: service.id,
        name: service.name,
        realm: service.realm,
        url,
        status,
        reason:
          status !== 402
            ? `endpoint returned HTTP ${status} instead of a 402 challenge`
            : `402 carried no usable offer for chain ${chainId}`,
      },
    }

  const offer = choice.offer
  const intent = offerIntent(offer)
  return {
    ok: true,
    choice,
    resolved: {
      serviceId: service.id,
      name: service.name,
      realm: service.realm,
      provider: service.provider?.name,
      integration: service.integration,
      categories: service.categories,
      recipient,
      currency: currency as Address,
      decimals: offer.methodDetails?.decimals ?? endpoint.payment?.decimals ?? 6,
      amount: offer.amount ?? endpoint.payment?.amount ?? '0',
      unitType: offer.unitType ?? endpoint.payment?.unitType,
      intent,
      ...(intent === 'session'
        ? { escrowContract: (offer.methodDetails?.escrowContract ?? CHANNEL_RESERVE) as Address }
        : {}),
      chainId,
      endpoint: { method, path: endpoint.path, url },
      source: 'live-402',
      resolvedAt: new Date().toISOString(),
    },
  }
}

/**
 * Probes the named services right now. Pass no ids to probe the whole catalog, which takes
 * about a minute for 143 entries and is what rebuilds the blast-radius index.
 */
export async function resolveLive(args: {
  chainId: number
  serviceIds?: readonly string[]
  preferCurrency?: Address
  concurrency?: number
  timeoutMs?: number
  refreshCatalog?: boolean
  onProgress?: (done: number, total: number) => void
}): Promise<LiveResolution> {
  const { services } = await catalogServices({ refresh: args.refreshCatalog === true })
  const wanted = args.serviceIds ? new Set(args.serviceIds) : undefined
  const selected = wanted ? services.filter((s) => wanted.has(s.id)) : services

  const missing = wanted ? [...wanted].filter((id) => !services.some((s) => s.id === id)) : []
  const resolved: ResolvedRecipient[] = []
  const unresolved: UnresolvedService[] = missing.map((id) => ({
    serviceId: id,
    name: id,
    reason: 'no such service in the live MPP catalog',
  }))
  const alternates: LiveResolution['alternates'] = {}
  const currencyMisses: string[] = []

  const batch = args.concurrency ?? 12
  const timeoutMs = args.timeoutMs ?? 20_000
  for (let i = 0; i < selected.length; i += batch) {
    const results = await Promise.all(
      selected
        .slice(i, i + batch)
        .map((s) => resolveOne(s, args.chainId, args.preferCurrency, timeoutMs)),
    )
    for (const r of results) {
      if (!r.ok) {
        unresolved.push(r.unresolved)
        continue
      }
      resolved.push(r.resolved)
      if (r.choice.alternatives.length > 0)
        alternates[r.resolved.serviceId] = r.choice.alternatives.map((o) => ({
          currency: o.currency,
          recipient: o.recipient,
          intent: offerIntent(o),
          amount: o.amount,
        }))
      if (args.preferCurrency && !r.choice.preferredCurrencyMatched)
        currencyMisses.push(r.resolved.serviceId)
    }
    args.onProgress?.(Math.min(i + batch, selected.length), selected.length)
  }

  return {
    resolvedAt: new Date().toISOString(),
    chainId: args.chainId,
    ...(args.preferCurrency ? { preferCurrency: args.preferCurrency } : {}),
    resolved,
    unresolved,
    alternates,
    currencyMisses,
  }
}

export type RecipientDrift = {
  serviceId: string
  name: string
  snapshotRecipient?: Address
  liveRecipient?: Address
  /** True when the address the snapshot would have allowlisted is not the one live MPP quotes. */
  changed: boolean
  note: string
}

/**
 * Compares a live resolution against the committed snapshot. A cached payout address surviving
 * an allowlist rotation is the exact failure this product exists to prevent, so the console
 * refuses to sign silently when this returns a `changed` row.
 */
export function driftAgainst(snapshot: RecipientIndex, live: LiveResolution): RecipientDrift[] {
  const bySnapshot = new Map(snapshot.resolved.map((r) => [r.serviceId, r]))
  const out: RecipientDrift[] = []
  for (const r of live.resolved) {
    const prior = bySnapshot.get(r.serviceId)
    if (!prior) {
      out.push({
        serviceId: r.serviceId,
        name: r.name,
        liveRecipient: r.recipient,
        changed: false,
        note: `not present in the snapshot captured ${snapshot.capturedAt}; resolved live just now`,
      })
      continue
    }
    const changed = norm(prior.recipient) !== norm(r.recipient)
    out.push({
      serviceId: r.serviceId,
      name: r.name,
      snapshotRecipient: prior.recipient,
      liveRecipient: r.recipient,
      changed,
      note: changed
        ? `payout address moved since ${snapshot.capturedAt}. The live value is authoritative; the snapshot is not.`
        : `unchanged since ${snapshot.capturedAt}`,
    })
  }
  return out
}

/**
 * The snapshot with live entries substituted in. Blast radius still needs the full snapshot,
 * because the collateral a shared address reaches is drawn from every service in the catalog,
 * not just the ones the operator selected.
 */
export function mergeIndex(snapshot: RecipientIndex, live: LiveResolution): RecipientIndex {
  const byId = new Map(snapshot.resolved.map((r) => [r.serviceId, r]))
  for (const r of live.resolved) byId.set(r.serviceId, r)
  const liveIds = new Set(live.resolved.map((r) => r.serviceId))
  return {
    ...snapshot,
    resolved: [...byId.values()],
    unresolved: [
      ...snapshot.unresolved.filter((u) => !liveIds.has(u.serviceId)),
      ...live.unresolved.filter((u) => !byId.has(u.serviceId)),
    ],
  }
}
