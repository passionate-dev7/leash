import { tempoModerato } from 'viem/chains'
import type { Address } from 'viem'

export const API_BASE = __LEASH_API__
export const CHAIN = tempoModerato
export const RPC_URL = 'https://rpc.moderato.tempo.xyz'
export const EXPLORER = 'https://explore.testnet.tempo.xyz'
export const OUSD: Address = '0x20c0000000000000000000006a37DA5C996874BE'
export const PATHUSD: Address = '0x20c0000000000000000000000000000000000000'
export const TOKEN_DECIMALS = 6

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`

export const MAINNET_EXPLORER = 'https://explore.tempo.xyz'
export const mainnetAddressUrl = (address: string) => `${MAINNET_EXPLORER}/address/${address}`
