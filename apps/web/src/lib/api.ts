import type { Address, Hash, Hex } from 'viem'
import { API_BASE } from './config'

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

export type Scope = { address: Address; selector: Hex; recipients: Address[] }
export type AgentView = {
  keyId: Address
  name: string
  status: 'pending' | 'active' | 'revoked'
  budget: string
  period: number
  serviceIds: string[]
  remaining: string | null
  scopes: Scope[]
  authorizeTx: Hash | null
}
export type TeamView = {
  team: { account: Address; label: string; signer: string; createdAt?: string }
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
  tx: Hash | null
  startedAt: string
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
  cut: { status: 'prepared' | 'confirmed' | 'failed'; tx: Hash | null } | null
  blocked: boolean
}

export type CutPlan = {
  id: number
  calls: { to: Address; data: Hex }[]
  rescoped: Address[]
  revoked: Address[]
  unchanged: Address[]
  unbounded: Address[]
  servicesCut: string[]
}
export type CutConfirm = { status: 'confirmed' | 'failed'; gasUsed?: string | null; reason?: string | null; [k: string]: unknown }

export const api = {
  health: () => request<{ ok: boolean; chainId: number; block: number | string }>('/api/health'),
  catalog: () => request<Catalog>('/api/catalog'),
  stats: () => request<Record<string, number | string | null>>('/api/stats'),
  faucet: (address: Address) => request<{ txs: Hash[]; ousd: string; pathusd: string }>('/api/faucet', { body: { address } }),
  upsertTeam: (account: Address, label: string, signer: 'passkey' | 'webcrypto') =>
    request<unknown>('/api/teams', { body: { account, label, signer } }),
  team: (account: Address) => request<TeamView>(`/api/teams/${account}`),
  createAgent: (account: Address, input: { name: string; budget: string; periodSeconds: number; serviceIds: string[] }) =>
    request<{ keyId: Address; authorize: AuthorizePayload }>(`/api/teams/${account}/agents`, { body: input }),
  confirmAgent: (keyId: Address, tx: Hash) => request<{ status: string }>(`/api/agents/${keyId}/confirm`, { body: { tx } }),
  runAgent: (keyId: Address, topic: string, signal?: AbortSignal) =>
    request<{ records: LedgerRecord[] }>(`/api/agents/${keyId}/run`, { body: { topic }, signal }),
  callAgent: (keyId: Address, serviceId: string, input: unknown) =>
    request<LedgerRecord>(`/api/agents/${keyId}/call`, { body: { serviceId, input } }),
  ledger: (account: Address, limit = 100) => request<LedgerRecord[] | { records: LedgerRecord[] }>(`/api/teams/${account}/ledger?limit=${limit}`),
  vendors: (account: Address) => request<VendorRow[] | { vendors: VendorRow[] }>(`/api/teams/${account}/vendors`),
  planCutoff: (account: Address, recipient: Address) => request<CutPlan>(`/api/teams/${account}/cutoffs`, { body: { recipient } }),
  confirmCutoff: (id: number, tx: Hash) => request<CutConfirm>(`/api/cutoffs/${id}/confirm`, { body: { tx } }),
  revokePlan: (keyId: Address) => request<{ calls: { to: Address; data: Hex }[] }>(`/api/agents/${keyId}/revoke-plan`, { body: {} }),
  revokeConfirm: (keyId: Address, tx: Hash) => request<unknown>(`/api/agents/${keyId}/revoke-confirm`, { body: { tx } }),
  mainnet: (blocks: number) => request<unknown>(`/api/mainnet/mpp?blocks=${blocks}`),
}
