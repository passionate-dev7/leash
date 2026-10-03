import { tempo, tempoModerato } from 'viem/chains'
import type { Address } from 'viem'

export const API_BASE = __LEASH_API__
export const TOKEN_DECIMALS = 6

export type NetworkName = 'moderato' | 'mainnet'

export const OUSD: Address = '0x20c0000000000000000000006a37DA5C996874BE'
export const PATHUSD: Address = '0x20c0000000000000000000000000000000000000'
export const USDCE: Address = '0x20c000000000000000000000b9537d11c60e8b50'

/**
 * The two chains a team can live on. `token` is what the team's agents hold their budget in and pay with;
 * `feeToken` is what the team key pays gas in. Mainnet has one token for both, so a deposit covers everything.
 */
export const NETWORKS = {
  moderato: {
    name: 'moderato',
    label: 'Moderato testnet',
    chain: tempoModerato,
    chainId: 42431,
    rpcUrl: 'https://rpc.moderato.tempo.xyz',
    explorer: 'https://explore.testnet.tempo.xyz',
    token: OUSD,
    symbol: 'OUSD',
    feeToken: PATHUSD,
    feeSymbol: 'PathUSD',
  },
  mainnet: {
    name: 'mainnet',
    label: 'Tempo mainnet',
    chain: tempo,
    chainId: 4217,
    rpcUrl: 'https://rpc.tempo.xyz',
    explorer: 'https://explore.tempo.xyz',
    token: USDCE,
    symbol: 'USDC.e',
    feeToken: USDCE,
    feeSymbol: 'USDC.e',
  },
} as const

export const CHAIN = NETWORKS.moderato.chain
export const RPC_URL = NETWORKS.moderato.rpcUrl
export const EXPLORER = NETWORKS.moderato.explorer

export const txUrl = (hash: string, network: NetworkName = 'moderato') => `${NETWORKS[network].explorer}/tx/${hash}`
export const addressUrl = (address: string, network: NetworkName = 'moderato') => `${NETWORKS[network].explorer}/address/${address}`

export const MAINNET_EXPLORER = NETWORKS.mainnet.explorer
export const mainnetAddressUrl = (address: string) => addressUrl(address, 'mainnet')
