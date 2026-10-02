import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Address, Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { Account } from 'viem/tempo'
import { getTokenBalance } from '@leash/sdk'
import { ensureDataDir, PATH_USD } from './config.js'
import { fund, reader, retryRead } from './chain.js'

/** Below this much PathUSD (6 decimals, 5.00) the sponsor asks the Moderato faucet again. One settlement costs about 0.0002. */
const LOW_WATER = 5_000_000n

/**
 * The vendors' fee payer: a Moderato-only key generated once into the data dir (mode 600).
 * It never holds anything that is not testnet faucet money.
 */
export function sponsorAccount() {
  const path = `${ensureDataDir()}vendor-sponsor.key`
  let key: Hex
  if (existsSync(path)) {
    key = readFileSync(path, 'utf8').trim() as Hex
  } else {
    key = generatePrivateKey()
    writeFileSync(path, key, { mode: 0o600 })
  }
  chmodSync(path, 0o600)
  return Account.fromSecp256k1(key)
}

export const sponsorBalance = async (address: Address): Promise<bigint> => (await retryRead(() => getTokenBalance(reader, PATH_USD, address))).balance

/** Tops the sponsor up from the faucet when it is low. Returns the balance read afterwards. */
export async function ensureSponsorFunded(address: Address): Promise<{ topUp: boolean; balance: bigint }> {
  const before = await sponsorBalance(address)
  if (before >= LOW_WATER) return { topUp: false, balance: before }
  await fund(address)
  return { topUp: true, balance: await sponsorBalance(address) }
}
