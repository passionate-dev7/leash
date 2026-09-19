import type { Address, Hex } from 'viem'

/** Tempo chain ids. Verified via `eth_chainId`: mainnet 0x1079, Moderato 0xa5bf. */
export const CHAIN_ID = { mainnet: 4217, moderato: 42431 } as const
export type ChainName = keyof typeof CHAIN_ID

/**
 * A raw entry from `GET https://mpp.dev/api/services`.
 * Only the fields Leash reads are typed; the catalog carries more.
 */
export type CatalogService = {
  id: string
  name: string
  url?: string
  serviceUrl: string
  description?: string
  icon?: string
  categories?: string[]
  integration?: 'first-party' | 'third-party'
  tags?: string[]
  status?: string
  realm?: string
  provider?: { name?: string; url?: string }
  docs?: { homepage?: string; llmsTxt?: string; apiReference?: string }
  methods?: Record<string, { intents?: string[]; assets?: string[] }>
  endpoints?: CatalogEndpoint[]
  supportsCredits?: boolean
}

export type CatalogEndpoint = {
  method?: string
  path: string
  description?: string
  payment?: {
    intent?: string
    method?: string
    currency?: string
    decimals?: number
    amount?: string
    unitType?: string
  }
}

export type Catalog = {
  version: number
  services: CatalogService[]
}

/** MPP payment intents. `charge` settles on the token; `session` settles on the channel reserve. */
export type Intent = 'charge' | 'session'

/**
 * A recipient resolved for one service on one chain. `source` records how it was obtained
 * so nothing in the UI is a number without an origin.
 */
export type ResolvedRecipient = {
  serviceId: string
  name: string
  realm?: string
  provider?: string
  integration?: 'first-party' | 'third-party'
  categories?: string[]
  /** Checksum-preserving as returned by the challenge. Compare case-insensitively. */
  recipient: Address
  currency: Address
  decimals: number
  /** Smallest-unit list price for the probed endpoint. */
  amount: string
  unitType?: string
  intent: Intent
  /** Present only for `session` intent. */
  escrowContract?: Address
  chainId: number
  endpoint: { method: string; path: string; url: string }
  source: 'live-402' | 'openapi'
  resolvedAt: string
}

/** A service the probe reached but could not price. Kept so the UI can say why. */
export type UnresolvedService = {
  serviceId: string
  name: string
  realm?: string
  url?: string
  status?: number
  error?: string
  reason: string
}

export type RecipientIndex = {
  capturedAt: string
  catalogBytes: number
  catalogServiceCount: number
  chainId: number
  resolved: ResolvedRecipient[]
  unresolved: UnresolvedService[]
}

// ---------------------------------------------------------------------------
// Policy input / output
// ---------------------------------------------------------------------------

/** What an operator writes. One sentence, structured. */
export type PolicyInput = {
  /** Human label for the agent this key belongs to. */
  agent: string
  /** Settlement token the budget is denominated in. */
  token: Address
  /** Token decimals, used only for display and for parsing `budgetHuman`. */
  decimals: number
  /** Budget in smallest units per period. */
  budget: bigint
  /** Rolling period in seconds. 0 means a lifetime cap with no reset. */
  periodSeconds: number
  /** Unix seconds. The key stops working after this instant regardless of budget. */
  expiry: number
  /** Catalog service ids the agent may pay. */
  serviceIds: string[]
  /**
   * Extra raw recipients not in the MPP catalog (a self-hosted merchant, a test address).
   * These are allowlisted on the `transferWithMemo` selector for `token`.
   */
  extraRecipients?: Address[]
  /**
   * Allow the channel-reserve `open`/`topUp` selectors so session-intent services are payable.
   * Off by default: recipient allowlists do not constrain this path, see MPP-CATALOG.md §5.
   */
  allowSessionChannels?: boolean
  /** Inner key type. 0 secp256k1, 1 p256, 2 webAuthn. */
  signatureType?: 0 | 1 | 2
}

/** The on-chain `TokenLimit` struct. */
export type TokenLimit = { token: Address; amount: bigint; period: bigint }
/** The on-chain `SelectorRule` struct. */
export type SelectorRule = { selector: Hex; recipients: Address[] }
/** The on-chain `CallScope` struct. */
export type CallScope = { target: Address; selectorRules: SelectorRule[] }

/** The exact tuple `authorizeKey(address,uint8,KeyRestrictions)` takes as its third argument. */
export type KeyRestrictions = {
  expiry: bigint
  enforceLimits: boolean
  limits: TokenLimit[]
  allowAnyCalls: boolean
  allowedCalls: CallScope[]
}

/** Flat scope shape consumed by `viem/tempo` `Actions.accessKey.authorize`. */
export type FlatScope = { address: Address; selector: Hex; recipients?: Address[] }

/** A service the policy names but cannot actually govern, with the reason. */
export type CoverageGap = {
  serviceId: string
  name: string
  kind: 'session-intent' | 'currency-mismatch' | 'unresolved'
  detail: string
}

export type CompiledPolicy = {
  input: PolicyInput
  /** Exactly what goes on the wire. */
  restrictions: KeyRestrictions
  /** The same thing in the flat form `viem/tempo` wants. */
  scopes: FlatScope[]
  /** `authorizeKey` calldata for `0xaAAAaaAA…`, for inspection and for the docs path. */
  calldata: Hex
  /** `0x980a6025`. Asserted, not assumed. */
  selector: Hex
  /** Distinct recipients actually written into the allowlist. */
  recipients: Address[]
  /** Services the policy governs end to end. */
  covered: ResolvedRecipient[]
  /** Services named but not governable, each with a reason the UI must show. */
  gaps: CoverageGap[]
  /** Sum of one call to every covered service's probed endpoint, in smallest units. */
  oneCallOfEachCost: bigint
}

// ---------------------------------------------------------------------------
// Blast radius
// ---------------------------------------------------------------------------

export type BlastRadiusEntry = {
  recipient: Address
  /** Services the operator asked for at this address. */
  intended: ResolvedRecipient[]
  /** Services reachable at this address that the operator did NOT ask for. */
  collateral: ResolvedRecipient[]
  /** Distinct realms behind this address. >1 means separate domains share a payout address. */
  realms: string[]
  shared: boolean
}

export type BlastRadius = {
  /** Every service reachable by the compiled allowlist, intended or not. */
  reachable: ResolvedRecipient[]
  /** Only the ones the operator did not name. This is the number that belongs on screen. */
  collateral: ResolvedRecipient[]
  entries: BlastRadiusEntry[]
  /** True if any allowlisted address pays more than one catalog service. */
  hasSharedRecipients: boolean
  /** Worst single address by collateral count, for the headline. */
  worst?: BlastRadiusEntry
  /** Provenance of the index this was computed against. */
  indexCapturedAt: string
  chainId: number
}
