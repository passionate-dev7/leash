import type { Address } from 'viem'
import { MPP_CATALOG_URL, CHANNEL_RESERVE } from './constants.js'
import type {
  Catalog,
  CatalogEndpoint,
  CatalogService,
  Intent,
  ResolvedRecipient,
  UnresolvedService,
  RecipientIndex,
} from './types.js'

/** Fetches the live MPP catalog. No caching here; callers decide. */
export async function fetchCatalog(
  options: { signal?: AbortSignal; url?: string } = {},
): Promise<{ catalog: Catalog; bytes: number; fetchedAt: string }> {
  const url = options.url ?? MPP_CATALOG_URL
  const res = await fetch(url, {
    signal: options.signal ?? AbortSignal.timeout(60_000),
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`MPP catalog ${url} returned HTTP ${res.status}`)
  const text = await res.text()
  const catalog = JSON.parse(text) as Catalog
  if (!Array.isArray(catalog.services))
    throw new Error('MPP catalog has no services array')
  return {
    catalog,
    bytes: new TextEncoder().encode(text).length,
    fetchedAt: new Date().toISOString(),
  }
}

export function tempoPayable(catalog: Catalog): CatalogService[] {
  return catalog.services.filter((s) => Boolean(s.methods?.tempo))
}

/**
 * Tempo-payable services that `GET /api/services` does not list. The indexer is the one that
 * matters: it is the telemetry feed Leash itself reads, it is session-intent, and it is the
 * clearest live proof that a token-scoped key cannot pay everything. INDEXER.md §1.
 *
 * Probed exactly like a catalog entry, so its recipient comes from the same live challenge
 * path and carries the same provenance.
 */
export const OFF_CATALOG_SERVICES: CatalogService[] = [
  {
    id: 'tempo-indexer',
    name: 'Tempo Indexer (hosted)',
    url: 'https://docs.tempo.xyz',
    serviceUrl: 'https://api.tempo.xyz',
    description:
      'SQL over indexed Tempo chain data. Not listed in the MPP catalog; discovered by hitting it.',
    categories: ['data', 'blockchain'],
    integration: 'first-party',
    realm: 'tempo-api',
    provider: { name: 'Tempo' },
    methods: { tempo: { intents: ['session'] } },
    endpoints: [
      {
        method: 'GET',
        path: '/v1/indexer/query?chainId=4217&sql=SELECT%201',
        description: 'Query indexed chain data',
        payment: { intent: 'session', method: 'tempo', decimals: 6, unitType: 'request' },
      },
    ],
  },
]

/** The endpoint a probe should hit: first GET, else the first declared endpoint. */
export function probeEndpoint(service: CatalogService): CatalogEndpoint | undefined {
  const endpoints = service.endpoints ?? []
  return endpoints.find((e) => (e.method ?? 'GET').toUpperCase() === 'GET') ?? endpoints[0]
}

/**
 * Path parameters in catalog paths are written `:name`. Substituting `1` is what the
 * verification run did and it is what produced the 43 live challenges in MPP-CATALOG.md §3.
 */
export function probeUrl(service: CatalogService, endpoint: CatalogEndpoint): string {
  const path = endpoint.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '1')
  return service.serviceUrl.replace(/\/$/, '') + path
}

/** One `request="..."` offer decoded out of a `WWW-Authenticate: Payment` header. */
export type PaymentOffer = {
  amount?: string
  currency?: string
  recipient?: Address
  methodDetails?: {
    chainId?: number
    decimals?: number
    escrowContract?: Address
    sessionProtocol?: string
    credentialTypes?: string[]
  }
  suggestedDeposit?: string
  unitType?: string
}

/**
 * A single header can carry several offers, one per payment method. Anything that fails to
 * decode is dropped rather than throwing, because one malformed offer must not lose the rest.
 */
export function decodeChallenge(header: string | null): PaymentOffer[] {
  if (!header) return []
  const offers: PaymentOffer[] = []
  for (const m of header.matchAll(/request="([^"]+)"/g)) {
    const raw = m[1]
    if (!raw) continue
    try {
      offers.push(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as PaymentOffer)
    } catch {
      // A method whose request blob is not JSON is not payable by us. Skip it.
    }
  }
  return offers
}

/**
 * Picks the offer for the chain we are actually scoping a key on. Without this filter a
 * service that quotes both Base and Tempo will contribute a Base USDC address to a Tempo
 * allowlist, producing a key that can pay nothing. MPP-CATALOG.md §2.
 */
export function selectOffer(offers: PaymentOffer[], chainId: number): PaymentOffer | undefined {
  return offers.find((o) => o.methodDetails?.chainId === chainId)
}

/** `session` when the offer names an escrow contract, otherwise `charge`. */
export function offerIntent(offer: PaymentOffer): Intent {
  return offer.methodDetails?.escrowContract ? 'session' : 'charge'
}

export type ResolveResult =
  | { ok: true; resolved: ResolvedRecipient }
  | { ok: false; unresolved: UnresolvedService }

/**
 * Path A from MPP-CATALOG.md §2: hit the endpoint unauthenticated and decode the challenge.
 * Authoritative, because it is what the service will actually charge.
 */
export async function resolveByChallenge(
  service: CatalogService,
  chainId: number,
  options: { timeoutMs?: number } = {},
): Promise<ResolveResult> {
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
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
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

  const offers = decodeChallenge(header)
  const offer = selectOffer(offers, chainId)
  if (status !== 402 || !offer?.recipient || !offer.currency) {
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
            : `402 carried no offer for chain ${chainId}`,
      },
    }
  }

  const intent = offerIntent(offer)
  return {
    ok: true,
    resolved: {
      serviceId: service.id,
      name: service.name,
      realm: service.realm,
      provider: service.provider?.name,
      integration: service.integration,
      categories: service.categories,
      recipient: offer.recipient,
      currency: offer.currency as Address,
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
 * Probes every tempo-payable service concurrently in bounded batches and returns an index
 * carrying its own provenance. This is the artifact the blast-radius function runs against.
 */
export async function buildRecipientIndex(
  chainId: number,
  options: { concurrency?: number; timeoutMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<RecipientIndex> {
  const { catalog, bytes } = await fetchCatalog()
  const services = [...tempoPayable(catalog), ...OFF_CATALOG_SERVICES]
  const batch = options.concurrency ?? 12
  const resolved: ResolvedRecipient[] = []
  const unresolved: UnresolvedService[] = []

  for (let i = 0; i < services.length; i += batch) {
    const slice = services.slice(i, i + batch)
    const results = await Promise.all(
      slice.map((s) => resolveByChallenge(s, chainId, { timeoutMs: options.timeoutMs })),
    )
    for (const r of results) {
      if (r.ok) resolved.push(r.resolved)
      else unresolved.push(r.unresolved)
    }
    options.onProgress?.(Math.min(i + batch, services.length), services.length)
  }

  return {
    capturedAt: new Date().toISOString(),
    catalogBytes: bytes,
    catalogServiceCount: catalog.services.length,
    chainId,
    resolved,
    unresolved,
  }
}
