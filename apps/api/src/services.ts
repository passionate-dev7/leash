import { catalog, DEFINITIONS } from '@leash/vendors'
import type { CatalogEntry, ServiceId } from '@leash/vendors'
import { LOCAL_BASE, PUBLIC_BASE } from './config.js'
import { bad } from './http.js'

export const SERVICE_IDS: readonly ServiceId[] = DEFINITIONS.map((d) => d.serviceId)

/** What browsers are told. */
export const publicCatalog = (): CatalogEntry[] => catalog(PUBLIC_BASE)
/** What agents call: this process, not the public funnel. */
export const localCatalog = (): CatalogEntry[] => catalog(LOCAL_BASE)

export const entryOf = (serviceId: string): CatalogEntry => {
  const e = localCatalog().find((s) => s.serviceId === serviceId)
  if (!e) throw bad(`unknown serviceId ${serviceId}`)
  return e
}

export function isServiceId(v: unknown): v is ServiceId {
  return typeof v === 'string' && (SERVICE_IDS as readonly string[]).includes(v)
}

/** Groups services that share a payout address: cutting one cuts them all. */
export function payoutGroups(): { recipient: string; master: string; serviceIds: ServiceId[] }[] {
  const groups = new Map<string, { recipient: string; master: string; serviceIds: ServiceId[] }>()
  for (const s of publicCatalog()) {
    const key = s.recipient.toLowerCase()
    const g = groups.get(key) ?? { recipient: s.recipient, master: s.master, serviceIds: [] }
    g.serviceIds.push(s.serviceId)
    groups.set(key, g)
  }
  return [...groups.values()]
}

export const servicesPaying = (recipient: string): ServiceId[] =>
  DEFINITIONS.filter((d) => d.recipient.toLowerCase() === recipient.toLowerCase()).map((d) => d.serviceId)

/** The HTTP request for one paid call, validated against the service's input shape. */
export function buildRequest(entry: CatalogEntry, input: unknown): { url: string; init: RequestInit } {
  const obj = input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null
  if (!obj) throw bad('input must be an object')
  const text = (key: string, max: number): string => {
    const v = obj[key]
    if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) throw bad(`input.${key} is required and must be a string of at most ${max} characters`)
    return v
  }
  switch (entry.serviceId) {
    case 'atlas-search':
      return { url: `${entry.url}?${new URLSearchParams({ q: text('q', 200) })}`, init: { method: 'GET' } }
    case 'atlas-fx': {
      const base = typeof obj['base'] === 'string' ? obj['base'] : 'USD'
      const symbols = typeof obj['symbols'] === 'string' ? obj['symbols'] : ''
      return { url: `${entry.url}?${new URLSearchParams({ base, symbols })}`, init: { method: 'GET' } }
    }
    case 'atlas-scrape':
      return { url: entry.url, init: jsonPost({ url: text('url', 2_000) }) }
    case 'relay-summarize':
    case 'relay-keywords':
      return { url: entry.url, init: jsonPost({ text: text('text', 100_000) }) }
  }
}

const jsonPost = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
