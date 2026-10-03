import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { getAddress, isAddress } from 'viem'
import type { Address } from 'viem'
import { NETWORKS } from '@leash/sdk'
import type { NetworkConfig } from '@leash/sdk'
import { OUSD } from '@leash/vendors'

export const PORT = Number(process.env['LEASH_API_PORT'] ?? 4180)
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('LEASH_API_PORT must be a port number')

export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env['LEASH_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
])

/** The team the public landing shows. Unset: the team with the most ledger records. */
export const FEATURED_TEAM: Address | undefined = (() => {
  const raw = process.env['LEASH_FEATURED_TEAM']?.trim()
  if (!raw) return undefined
  if (!isAddress(raw, { strict: false })) throw new Error('LEASH_FEATURED_TEAM must be an address')
  return getAddress(raw)
})()

/** Where agents reach the vendors: this same process. */
export const LOCAL_BASE = `http://127.0.0.1:${PORT}`
/** The origin and path prefix the catalog advertises to browsers. */
export const PUBLIC_BASE = (process.env['LEASH_PUBLIC_URL'] ?? LOCAL_BASE).replace(/\/+$/, '')

export const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url))

export const MODERATO: NetworkConfig = NETWORKS.moderato

/**
 * The network an agent pays on. Gas is paid in OUSD, the token the budget is denominated in:
 * an access key can only spend a token it has a limit for, so a PathUSD fee token would need a
 * second limit. Measured on Moderato: one call debits 2000 units of payment plus about 205 of
 * gas from the same OUSD limit.
 */
export const AGENT_NETWORK: NetworkConfig = { ...MODERATO, feeToken: OUSD, settlementToken: OUSD }

export const PATH_USD: Address = MODERATO.feeToken
export const BUDGET_TOKEN: Address = OUSD

/** How long an authorized agent key stays valid. */
export const KEY_LIFETIME_SECONDS = 30 * 24 * 3600

export function ensureDataDir(): string {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  chmodSync(DATA_DIR, 0o700)
  return DATA_DIR
}

/** The HMAC secret the vendor challenges are signed with. Created once, then reused. */
export function vendorSecret(): string {
  const path = `${ensureDataDir()}vendor-secret`
  if (existsSync(path)) return readFileSync(path, 'utf8').trim()
  const secret = randomBytes(32).toString('base64')
  writeFileSync(path, secret, { mode: 0o600 })
  return secret
}
