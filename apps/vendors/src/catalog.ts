import { getAddress } from 'viem'
import type { Address } from 'viem'
import { VirtualAddress } from 'ox/tempo'

/** The OUSD TIP-20 on Moderato. Budget and payment token for every vendor service. */
export const OUSD: Address = '0x20c0000000000000000000006a37DA5C996874BE'

/** Atlas Data's payout master: a registered TIP-1022 virtual master on Moderato. */
export const ATLAS_MASTER: Address = '0xF45B4Ece0BcA5A00a7E0f5108348e9b8184584d6'
export const ATLAS_MASTER_ID = '0x52e26e0e' as const

/** Relay Compute pays every service to one plain address, the shared-payout case. */
export const RELAY_PAYOUT: Address = '0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4'

export type ServiceId = 'atlas-search' | 'atlas-scrape' | 'atlas-fx' | 'relay-summarize' | 'relay-keywords'

export type CatalogEntry = {
  vendorId: 'atlas' | 'relay'
  vendorName: string
  serviceId: ServiceId
  name: string
  description: string
  method: 'GET' | 'POST'
  path: string
  url: string
  /** The address the charge pays. For a virtual address, the master is credited. */
  recipient: Address
  master: Address
  virtual: boolean
  /** Decimal OUSD per call. */
  price: string
  currency: Address
  inputExample: Record<string, string>
}

type Definition = Omit<CatalogEntry, 'url'>

const virtualAddress = (userTag: `0x${string}`): Address =>
  getAddress(VirtualAddress.from({ masterId: ATLAS_MASTER_ID, userTag }))

export const DEFINITIONS: readonly Definition[] = [
  {
    vendorId: 'atlas',
    vendorName: 'Atlas Data',
    serviceId: 'atlas-search',
    name: 'Search',
    description: 'Hacker News story search. Returns title, url and points for stories that link out.',
    method: 'GET',
    path: '/v/atlas/search',
    recipient: virtualAddress('0x000000000001'),
    master: ATLAS_MASTER,
    virtual: true,
    price: '0.002',
    currency: OUSD,
    inputExample: { q: 'rust' },
  },
  {
    vendorId: 'atlas',
    vendorName: 'Atlas Data',
    serviceId: 'atlas-scrape',
    name: 'Scrape',
    description:
      'Fetches an https page and returns its title and text. The charge settles before the url is validated or fetched, so a bad url or a failing upstream is paid for and answered with an error.',
    method: 'POST',
    path: '/v/atlas/scrape',
    recipient: virtualAddress('0x000000000002'),
    master: ATLAS_MASTER,
    virtual: true,
    price: '0.003',
    currency: OUSD,
    inputExample: { url: 'https://example.com' },
  },
  {
    vendorId: 'atlas',
    vendorName: 'Atlas Data',
    serviceId: 'atlas-fx',
    name: 'FX rates',
    description: 'Daily reference exchange rates from the European Central Bank.',
    method: 'GET',
    path: '/v/atlas/fx',
    recipient: virtualAddress('0x000000000003'),
    master: ATLAS_MASTER,
    virtual: true,
    price: '0.001',
    currency: OUSD,
    inputExample: { base: 'USD', symbols: 'EUR,GBP' },
  },
  {
    vendorId: 'relay',
    vendorName: 'Relay Compute',
    serviceId: 'relay-summarize',
    name: 'Summarize',
    description: 'Extractive summary: the three highest scoring sentences by term frequency. Input is validated before the charge.',
    method: 'POST',
    path: '/v/relay/summarize',
    recipient: RELAY_PAYOUT,
    master: RELAY_PAYOUT,
    virtual: false,
    price: '0.004',
    currency: OUSD,
    inputExample: { text: 'Paste any article text here.' },
  },
  {
    vendorId: 'relay',
    vendorName: 'Relay Compute',
    serviceId: 'relay-keywords',
    name: 'Keywords',
    description: 'The eight most frequent meaningful terms in a text.',
    method: 'POST',
    path: '/v/relay/keywords',
    recipient: RELAY_PAYOUT,
    master: RELAY_PAYOUT,
    virtual: false,
    price: '0.002',
    currency: OUSD,
    inputExample: { text: 'Paste any article text here.' },
  },
]

/** Every service with absolute urls. `baseUrl` is the origin (and path prefix) the API is served from. */
export function catalog(baseUrl: string): CatalogEntry[] {
  const base = baseUrl.replace(/\/+$/, '')
  return DEFINITIONS.map((d) => ({ ...d, url: `${base}${d.path}` }))
}
