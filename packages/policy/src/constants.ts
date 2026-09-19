import { Addresses, Selectors } from 'viem/tempo'
import type { Address, Hex } from 'viem'

/**
 * Everything here is re-exported from the generated `viem/tempo` tables rather than
 * transcribed. BUILD-SPEC §3.3 is the human-readable copy; this file is the machine one.
 * Source: viem@2.56.8, tempo/Selectors.ts, generated from
 * tempoxyz/tempo@d656ef5581505b59f1611b358e611f5a602d399e.
 */

export const ACCOUNT_KEYCHAIN: Address = Addresses.accountKeychain
export const CHANNEL_RESERVE: Address = Addresses.tip20ChannelReserve
export const PATH_USD: Address = Addresses.pathUsd

/** The `authorizeKey` overload that takes the full `KeyRestrictions` tuple. */
export const AUTHORIZE_KEY_SIGNATURE =
  'authorizeKey(address,uint8,(uint64,bool,(address,uint256,uint64)[],bool,(address,(bytes4,address[])[])[]))' as const

export const SELECTOR = {
  authorizeKey: Selectors.accountKeychain.authorizeKey[AUTHORIZE_KEY_SIGNATURE] as Hex,
  revokeKey: Selectors.accountKeychain.revokeKey as Hex,
  updateSpendingLimit: Selectors.accountKeychain.updateSpendingLimit as Hex,
  setAllowedCalls: Selectors.accountKeychain.setAllowedCalls as Hex,
  removeAllowedCalls: Selectors.accountKeychain.removeAllowedCalls as Hex,
  transferWithMemo: Selectors.tip20.transferWithMemo as Hex,
  transfer: Selectors.tip20.transfer as Hex,
  channelOpen: Selectors.tip20ChannelReserve.open as Hex,
  channelTopUp: Selectors.tip20ChannelReserve.topUp as Hex,
} as const

/**
 * The MPP settlement asset on mainnet 4217. 141 of 141 tempo-payable catalog services quote
 * it. Not the same address as pathUSD; allowlisting the wrong one produces a key that cannot
 * pay anything. MPP-CATALOG.md §1.
 */
export const MPP_SETTLEMENT_ASSET_MAINNET: Address =
  '0x20c000000000000000000000b9537d11c60e8b50'

/** Moderato faucet tokens, all 6 decimals. BUILD-SPEC §1. */
export const MODERATO_TOKENS = {
  PathUSD: '0x20c0000000000000000000000000000000000000',
  AlphaUSD: '0x20c0000000000000000000000000000000000001',
  BetaUSD: '0x20c0000000000000000000000000000000000002',
  ThetaUSD: '0x20c0000000000000000000000000000000000003',
} as const satisfies Record<string, Address>

export const RPC_URL = {
  mainnet: 'https://rpc.tempo.xyz',
  moderato: 'https://rpc.moderato.tempo.xyz',
} as const

export const INDEXER_URL = {
  /** Free, no auth, no MPP challenge. Requires an explicit `chainId`. */
  moderato: 'https://indexer.testnet.tempo.xyz/query',
  /** 402-gated on the first anonymous request. INDEXER.md §1. */
  mainnet: 'https://indexer.tempo.xyz/query',
  /** Hosted, 402-gated on both chains, pays through MPP session intent. */
  hosted: 'https://api.tempo.xyz/v1/indexer/query',
} as const

/** Tempo's public fee-payer relay on Moderato. Open, no API key. CRITICAL-PATH.md §3. */
export const SPONSOR_URL = {
  moderato: 'https://sponsor.moderato.tempo.xyz',
  /** UNCONFIRMED whether this is reachable without an invite-only console key. */
  mainnet: 'https://sponsor.tempo.xyz',
} as const

/** The address Tempo's Moderato relay signs with, for balance-delta attribution. */
export const PUBLIC_SPONSOR_ADDRESS: Address =
  '0x58Aa7CE42E1D13B2919E2ac7E006c4fBC171442c'

export const MPP_CATALOG_URL = 'https://mpp.dev/api/services'

/** Event topic0s, for raw `logs` queries where the indexer CTE is unavailable. */
export const TOPIC = {
  AccessKeySpend:
    '0xe0815e3aaadddf4dd75bde97fc060f0c38afe18e87a169be86a3f5c28247f192',
  KeyAuthorized:
    '0x7c46af0758d3eca5e8195833bff1e5153f6249fc0f2968a878fd28544315a03c',
  KeyRevoked:
    '0x14ce4f0c8c12936436b733974fb13d10fc13e8c41c06dc8e19d82001c93d7989',
  SpendingLimitUpdated:
    '0x2ed96330c6ac81a9996d367bd5d4a227c02b9b3ca4c2b077cb943abc6342d00d',
  AdminKeyAuthorized:
    '0x493bc0240c1da6c792754dc5247d39ed76c71c99a43e16777538687f8d05e88e',
} as const satisfies Record<string, Hex>

/** ABI event signature the indexer's `signature` parameter turns into a named CTE. */
export const ACCESS_KEY_SPEND_SIGNATURE =
  'AccessKeySpend(address indexed account, address indexed publicKey, address indexed token, uint256 amount, uint256 remainingLimit)' as const

export const PERIOD = {
  day: 86_400,
  week: 604_800,
  /** What "30 days" means on the wire. */
  month: 2_592_000,
  never: 0,
} as const
