import type { Address, Hash, Hex } from 'viem'
import { API_BASE } from './config'
import type { NetworkName } from './config'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: string,
  ) {
    super(detail ? `${message}: ${detail}` : message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init?.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, `Leash API unreachable at ${API_BASE || 'this origin'}`, cause instanceof Error ? cause.message : String(cause))
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, `Non-JSON response (${res.status})`, text.slice(0, 200))
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; detail?: string }
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body.detail)
  }
  return data as T
}

export type CatalogService = {
  vendorId: string
  vendorName: string
  serviceId: string
  name: string
  description: string
  method: 'GET' | 'POST'
  path: string
  url: string
  recipient: Address
  master: Address | null
  virtual: boolean
  price: string
  currency: Address
  inputExample: unknown
}
export type Catalog = { services: CatalogService[]; payoutGroups: { recipient: Address; master: Address | null; serviceIds: string[] }[] }
/** A mainnet service as the live 402 probe found it: the payout it names and the price it quoted per call, in base units. */
export type MainnetCatalog = { network: 'mainnet'; services: { serviceId: string; recipient: Address; amount: string; currency: Address }[]; payoutGroups: { recipient: Address; serviceIds: string[] }[] }

export type Scope = { target: Address; selectorRules: { selector: Hex; recipients: Address[] }[] }
export type AgentView = {
  keyId: Address
  name: string
  status: 'pending' | 'active' | 'revoked'
  /** True when the agent runs in its owner's own process: Leash never held its key and cannot run it. */
  external: boolean
  /** Decimal OUSD per period, as entered ("1.50"). */
  budget: string
  budgetUnits: string
  period: number
  serviceIds: string[]
  /** Base units, read from chain; null while pending or when the read failed. */
  remaining: string | null
  scopes: Scope[] | null
  readBlock: number | null
  readError: string | null
  authorizeTx: Hash | null
}
export type TeamView = {
  team: { account: Address; label: string; signer: string; network: NetworkName; created_at?: string }
  /** The team address's balance of its network's budget token, read from that chain. */
  balance: { token: Address; units: string | null; block: number | null; chainId: number; error: string | null }
  agents: AgentView[]
  totals: Record<string, unknown>
}

export type AuthorizePayload = {
  accessKey: { accessKeyAddress: Address; keyType: 'secp256k1' }
  expiry: number
  limits: { token: Address; limit: string; period: number }[]
  scopes: { address: Address; selector: Hex; recipients: Address[] }[]
}

export type Outcome = 'delivered' | 'paid_not_delivered' | 'refused' | 'free' | 'unsettled'
export type LedgerRecord = {
  seq: number
  id: string
  keyId: Address
  agentName: string
  vendorId: string
  serviceId: string
  url: string
  method: string
  recipient: Address | null
  amount: string | null
  status: number | null
  refused: string | null
  outcome: Outcome
  settlement: { tx: Hash; block: number; status: 'success' | 'reverted' } | null
  startedAt: string
  /** 'external' when the agent's own process reported the record, 'runner' when Leash ran the call. */
  source: 'runner' | 'external'
}

export type VendorRow = {
  serviceId: string
  vendorId: string
  recipient: Address
  virtual: boolean
  paid: number
  delivered: number
  paidNotDelivered: number
  refused: number
  spent: string
  failureRate: number
  siblings: string[]
  /** What the row stands for: the one service on Moderato, the services behind a payout on mainnet (empty for an address nothing is known about). */
  services: string[]
  cut: { status: 'prepared' | 'confirmed' | 'failed'; tx: Hash | null } | null
  blocked: boolean
  /** Failures measured in the last 24 hours; txs are the settlement hashes of paid_not_delivered records, newest first. */
  evidence: { window: '24h'; paid: number; paidNotDelivered: number; failureRate: number; txs: Hash[] }
  /** The API's verdict that the 24h failures measured for this service justify a cut. */
  recommendCut: boolean
}

export type CutReason = 'failures' | 'manual'

export type CutPlan = {
  id: number
  calls: { to: Address; data: Hex }[]
  rescoped: Address[]
  revoked: Address[]
  unchanged: Address[]
  unbounded: Address[]
  servicesCut: string[]
}
export type CutConfirm = { id: number; status: 'confirmed' | 'failed'; tx: Hash | null; gasUsed: string | null; failure: string | null; servicesCut: string[]; rescoped: Address[]; revoked: Address[]; unbounded: Address[] }

export const api = {
  health: () => request<{ ok: boolean; chainId: number; block: number | string; mainnet?: boolean }>('/api/health'),
  catalog: () => request<Catalog>('/api/catalog'),
  mainnetCatalog: () => request<MainnetCatalog>('/api/catalog?network=mainnet'),
  stats: () => request<Record<string, number | string | null>>('/api/stats'),
  faucet: (address: Address) => request<{ txs: Hash[]; ousd: string; pathusd: string }>('/api/faucet', { body: { address } }),
  upsertTeam: (account: Address, label: string, signer: 'passkey' | 'webcrypto', network: NetworkName) =>
    request<unknown>('/api/teams', { body: { account, label, signer, network } }),
  team: (account: Address) => request<TeamView>(`/api/teams/${account}`),
  createAgent: (account: Address, input: { name: string; budget: string; periodSeconds: number; serviceIds: string[]; external?: boolean; keyId?: Address }) =>
    request<{ keyId: Address; reach: string[]; omitted: { serviceId: string; reason: string }[]; authorize: AuthorizePayload }>(`/api/teams/${account}/agents`, { body: input }),
  confirmAgent: (keyId: Address, tx: Hash) => request<{ status: string }>(`/api/agents/${keyId}/confirm`, { body: { tx } }),
  runAgent: (keyId: Address, topic: string, signal?: AbortSignal) =>
    request<{ records: LedgerRecord[]; errors: { serviceId: string; message: string }[] }>(`/api/agents/${keyId}/run`, { body: { topic }, signal }),
  callAgent: (keyId: Address, serviceId: string, input: unknown) =>
    request<{ record: LedgerRecord; body: string | null }>(`/api/agents/${keyId}/call`, { body: { serviceId, input } }),
  ledger: (account: Address, limit = 100) => request<{ records: LedgerRecord[] }>(`/api/teams/${account}/ledger?limit=${limit}`),
  vendors: (account: Address) => request<{ services: VendorRow[] }>(`/api/teams/${account}/vendors`),
  planCutoff: (account: Address, recipient: Address, reason: CutReason) =>
    request<CutPlan>(`/api/teams/${account}/cutoffs`, { body: { recipient, reason } }),
  featured: () => request<{ account: Address }>('/api/featured'),
  mainnetEvidence: (blocks: number) => request<MainnetEvidence>(`/api/mainnet/evidence?blocks=${blocks}`),
  confirmCutoff: (id: number, tx: Hash) => request<CutConfirm>(`/api/cutoffs/${id}/confirm`, { body: { tx } }),
  revokePlan: (keyId: Address) => request<{ calls: { to: Address; data: Hex }[] }>(`/api/agents/${keyId}/revoke-plan`, { body: {} }),
  revokeConfirm: (keyId: Address, tx: Hash) => request<unknown>(`/api/agents/${keyId}/revoke-confirm`, { body: { tx } }),
  mainnet: (blocks: number) => request<MainnetReplay>(`/api/mainnet/mpp?blocks=${blocks}`),
}

export type ReplayWindow = { blocks: number; fromBlock: number; toBlock: number; fromTime: string; toTime: string }
export type MainnetEvidenceRow = {
  payout: Address
  /** Service ids behind this payout address. */
  services: string[]
  replay: { charges: number; payers: number; window: ReplayWindow }
  vet402: { paid: number; delivered: number; paidNotDelivered: number; txs: Hash[] }
  /** How many services one cut of this payout address takes with it. */
  cutTakes: number
}
export type MainnetEvidence = { payouts: MainnetEvidenceRow[]; window: ReplayWindow; outsideCachedAt: string; outsideStale: boolean }

export type MainnetReplay = {
  chainId: 4217
  generatedAt: string
  head: number
  fromBlock: number
  toBlock: number
  blocks: number
  fromTime: string
  toTime: string
  pages: number
  payoutsCatalogued: number
  charges: number
  payers: number
  volume: { usdce: string; ousd: string }
  untaggedCharges: number
  payouts: {
    payout: Address
    services: { serviceId: string; name: string }[]
    charges: number
    payers: number
    volume: { usdce: string; ousd: string }
    servers: { fingerprint: Hex; charges: number }[]
  }[]
  silentPayouts: number
}
