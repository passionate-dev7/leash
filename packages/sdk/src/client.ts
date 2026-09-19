import { createClient, http, publicActions, walletActions } from 'viem'
import type { Account as ViemAccount, Address } from 'viem'
import { tempo, tempoModerato } from 'viem/chains'
import { Transport } from 'viem/tempo'
import {
  CHAIN_ID,
  INDEXER_URL,
  MODERATO_TOKENS,
  MPP_SETTLEMENT_ASSET_MAINNET,
  RPC_URL,
  SPONSOR_URL,
} from '@leash/policy'

export type NetworkName = 'moderato' | 'mainnet'

export type NetworkConfig = {
  name: NetworkName
  chainId: number
  rpcUrl: string
  /** The TIP-20 gas is paid in. There is no native token on Tempo. */
  feeToken: Address
  /** The token a policy budget is denominated in by default. */
  settlementToken: Address
  /** Public fee-payer relay, when one is reachable without an invite-only key. */
  sponsorUrl: string | undefined
  /** Indexer for this chain. */
  indexerUrl: string
  /** Whether that indexer answers an anonymous caller, or returns 402. */
  indexerRequiresPayment: boolean
  explorerUrl: string
}

/**
 * Both networks, with every asymmetry between them made explicit rather than assumed.
 *
 * `mainnet.sponsorUrl` is deliberately undefined. `sponsor.tempo.xyz` appears as a `url` in
 * the Moderato sponsor's self-description but has never been exercised, and authenticated
 * sponsorship goes through an invite-only console key. Filling it in optimistically would
 * make a client silently believe it is sponsored when its budget is still paying gas.
 * CRITICAL-PATH.md §8.
 */
export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  moderato: {
    name: 'moderato',
    chainId: CHAIN_ID.moderato,
    rpcUrl: RPC_URL.moderato,
    feeToken: MODERATO_TOKENS.PathUSD,
    settlementToken: MODERATO_TOKENS.PathUSD,
    sponsorUrl: SPONSOR_URL.moderato,
    indexerUrl: INDEXER_URL.moderato,
    indexerRequiresPayment: false,
    explorerUrl: 'https://explore.testnet.tempo.xyz',
  },
  mainnet: {
    name: 'mainnet',
    chainId: CHAIN_ID.mainnet,
    rpcUrl: RPC_URL.mainnet,
    feeToken: MPP_SETTLEMENT_ASSET_MAINNET,
    settlementToken: MPP_SETTLEMENT_ASSET_MAINNET,
    sponsorUrl: undefined,
    indexerUrl: INDEXER_URL.mainnet,
    /** Measured open 2026-09-19, 402 on 2026-09-18. The console probes rather than trusting this. */
    indexerRequiresPayment: false,
    explorerUrl: 'https://explore.tempo.xyz',
  },
}

export type CreateLeashClientOptions = {
  network: NetworkName
  /** Signs the transaction. Omit for a read-only client. */
  account?: ViemAccount
  /** Override the fee token. Defaults to the network's. */
  feeToken?: Address
  /** Set false to build unsponsored transactions even where a relay exists. */
  sponsor?: boolean
  rpcUrl?: string
}

/**
 * Builds a viem client for one Tempo network.
 *
 * Sponsorship is on by default wherever a relay is reachable. Unsponsored, gas is
 * pre-charged against the agent's own budget at the gas limit, which makes a 50 USDC budget
 * mean "50 USDC of payments minus an unpredictable gas tax". Sponsored, it means 50 USDC of
 * payments. CRITICAL-PATH.md §6.
 */
export function createLeashClient(options: CreateLeashClientOptions) {
  const network = NETWORKS[options.network]
  const feeToken = options.feeToken ?? network.feeToken
  const sponsored = (options.sponsor ?? true) && Boolean(network.sponsorUrl)

  const base = options.network === 'mainnet' ? tempo : tempoModerato
  const chain = base.extend({ feeToken })
  /**
   * `retryCount: 0` is deliberate and load-bearing.
   *
   * The node reports a refused access key as JSON-RPC -32603 with the message
   * `keychain validation failed: AccountKeychainError(KeyAlreadyRevoked(...))`. viem treats
   * -32603 as a retryable internal error, so with retries on it spins until the
   * transaction's `validBefore` window lapses and then reports "transaction expired", which
   * is both slow (49 s measured) and a lie about why the payment was refused. Measured on
   * Moderato 2026-09-18.
   *
   * For a spend-control product, never silently retrying a payment is also the right
   * default on its own merits.
   */
  const rpc = http(options.rpcUrl ?? network.rpcUrl, { retryCount: 0 })
  const transport =
    sponsored && network.sponsorUrl
      ? Transport.withRelay(rpc, http(network.sponsorUrl))
      : rpc

  const client = createClient({
    ...(options.account ? { account: options.account } : {}),
    chain,
    transport,
  })
    .extend(publicActions)
    .extend(walletActions)

  return Object.assign(client, {
    leash: {
      network,
      sponsored,
      feeToken,
      /** What to print next to any sponsorship claim in a UI. */
      sponsorshipNote: sponsored
        ? `Fee payer: ${network.sponsorUrl}. Gas does not debit the agent's budget.`
        : network.sponsorUrl
          ? 'Sponsorship disabled by configuration. Gas is pre-charged against the agent budget at the gas limit.'
          : `No sponsor endpoint configured for ${network.name}. Gas is pre-charged against the agent budget at the gas limit, and the displayed budget is payments plus an unpredictable gas tax.`,
    },
  })
}

export type LeashClient = ReturnType<typeof createLeashClient>

export const explorerTx = (network: NetworkConfig, hash: string): string =>
  `${network.explorerUrl}/tx/${hash}`

export const explorerAddress = (network: NetworkConfig, address: string): string =>
  `${network.explorerUrl}/address/${address}`
