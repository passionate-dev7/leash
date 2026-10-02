import type { Account } from 'viem'
import { Mppx, tempo } from 'mppx/server'
import { DEFINITIONS, OUSD } from './catalog.js'
import type { CatalogEntry, ServiceId } from './catalog.js'
import { fetchHtml, PageError } from './fetch-page.js'
import { extractPage, keywords, MAX_TEXT_CHARS, summarize } from './text.js'

export type VendorRouterOptions = {
  /** HMAC secret the challenges are signed with. Generate once and persist. */
  secretKey: string
  /** Appears in every challenge and in the MPP memo's server fingerprint. */
  realm?: string
  /**
   * Pays the gas of every settlement. Challenges then carry methodDetails.feePayer = true, the agent
   * signs without a fee token, and this account co-signs and broadcasts. Omitted, the payer pays its own gas.
   */
  feePayer?: Account
}

export type VendorRouter = (req: Request) => Promise<Response | null>

const MAX_BODY_CHARS = 100_000
const SCRAPE = { timeoutMs: 4_000, maxBytes: 1_500_000, maxRedirects: 3 } as const

const json = (status: number, body: unknown): Response => Response.json(body, { status })
const fail = (status: number, error: string): Response => json(status, { error })

type Paid = { challenge: Response } | { receipt: (response: Response) => Response }
type Handler = (ctx: { req: Request; url: URL; charge: () => Promise<Paid> }) => Promise<Response>

async function readJson(req: Request): Promise<Record<string, unknown> | string> {
  const text = await req.text()
  if (text.length > MAX_BODY_CHARS) return `body is larger than ${MAX_BODY_CHARS} characters`
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : 'body must be a JSON object'
  } catch {
    return 'body must be JSON'
  }
}

/** Runs the handler once the charge has settled, and attaches the receipt to a successful answer. */
async function paid(charge: () => Promise<Paid>, run: () => Promise<Response>): Promise<Response> {
  const result = await charge()
  if ('challenge' in result) return result.challenge
  const response = await run()
  return response.ok ? result.receipt(response) : response
}

const upstream = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`upstream answered ${res.status}`)
  return res.json()
}

const handlers: Record<ServiceId, Handler> = {
  async 'atlas-search'({ url, charge }) {
    const q = url.searchParams.get('q')?.trim() ?? ''
    if (q.length < 1 || q.length > 200) return fail(422, 'q is required and must be at most 200 characters')
    return paid(charge, async () => {
      try {
        const data = (await upstream(`https://hn.algolia.com/api/v1/search?${new URLSearchParams({ query: q, tags: 'story', hitsPerPage: '30' })}`)) as {
          hits?: { title?: string; url?: string | null; points?: number | null }[]
        }
        const stories = (data.hits ?? [])
          .filter((h) => typeof h.url === 'string' && h.url.length > 0 && typeof h.title === 'string')
          .map((h) => ({ title: h.title as string, url: h.url as string, points: h.points ?? 0 }))
        return json(200, stories)
      } catch (e) {
        return fail(502, `search upstream failed: ${(e as Error).message}`)
      }
    })
  },

  async 'atlas-scrape'({ req, charge }) {
    // Charges first, validates afterwards: the shape measured in tempoxyz/mpp#1034.
    const result = await charge()
    if ('challenge' in result) return result.challenge
    const body = await readJson(req)
    if (typeof body === 'string') return fail(422, body)
    const raw = body['url']
    if (typeof raw !== 'string' || !raw.startsWith('https://')) return fail(422, 'url is required and must be https')
    try {
      const page = await fetchHtml(raw, SCRAPE)
      const { title, text } = extractPage(page.body)
      return result.receipt(json(200, { url: page.finalUrl, title, text }))
    } catch (e) {
      return fail(502, `scrape upstream failed: ${e instanceof PageError ? e.message : (e as Error).message}`)
    }
  },

  async 'atlas-fx'({ url, charge }) {
    const base = url.searchParams.get('base') ?? 'USD'
    const symbols = url.searchParams.get('symbols') ?? ''
    if (!/^[A-Z]{3}$/.test(base)) return fail(422, 'base must be a 3 letter currency code')
    if (symbols !== '' && !/^[A-Z]{3}(,[A-Z]{3}){0,9}$/.test(symbols)) return fail(422, 'symbols must be up to 10 comma separated currency codes')
    return paid(charge, async () => {
      try {
        const query = new URLSearchParams({ base, ...(symbols ? { symbols } : {}) })
        return json(200, await upstream(`https://api.frankfurter.dev/v1/latest?${query}`))
      } catch (e) {
        return fail(502, `fx upstream failed: ${(e as Error).message}`)
      }
    })
  },

  async 'relay-summarize'({ req, charge }) {
    const body = await readJson(req)
    if (typeof body === 'string') return fail(422, body)
    const text = body['text']
    if (typeof text !== 'string' || text.trim().length === 0) return fail(422, 'text is required')
    return paid(charge, async () => json(200, summarize(text.slice(0, MAX_TEXT_CHARS * 4))))
  },

  async 'relay-keywords'({ req, charge }) {
    const body = await readJson(req)
    if (typeof body === 'string') return fail(422, body)
    const text = body['text']
    if (typeof text !== 'string' || text.trim().length === 0) return fail(422, 'text is required')
    return paid(charge, async () => json(200, { keywords: keywords(text.slice(0, MAX_TEXT_CHARS * 4)) }))
  },
}

/**
 * Both vendors on one MPP server. Returns null for a path that is not under /v/, so the host
 * can fall through to its own routes. Every service charges OUSD on Moderato.
 */
export function createVendorRouter(options: VendorRouterOptions): VendorRouter {
  const mppx = Mppx.create({
    methods: [tempo.charge({ testnet: true, ...(options.feePayer ? { feePayer: options.feePayer } : {}) })],
    secretKey: options.secretKey,
    realm: options.realm ?? 'vendors.leash',
  })
  const byRoute = new Map<string, CatalogEntry>(DEFINITIONS.map((d) => [d.path, { ...d, url: d.path }]))

  return async (req) => {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/v/')) return null
    const entry = byRoute.get(url.pathname)
    if (!entry) return fail(404, `no vendor service at ${url.pathname}`)
    if (req.method !== entry.method) return json(405, { error: `${entry.path} accepts ${entry.method}` })
    // Cloned before any handler reads the body: a handler that validates first would otherwise leave nothing to clone.
    const chargeable = req.clone()
    const charge = async (): Promise<Paid> => {
      const result = await mppx.charge({
        amount: entry.price,
        currency: OUSD,
        recipient: entry.recipient,
        description: `${entry.vendorName} ${entry.name}`,
      })(chargeable)
      return result.status === 402 ? { challenge: result.challenge } : { receipt: (r) => result.withReceipt(r) }
    }
    return handlers[entry.serviceId]({ req, url, charge })
  }
}
