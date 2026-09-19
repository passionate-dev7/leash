import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Account } from 'viem/tempo'
import { agentKeyFromSecp256k1 } from './keys.js'
import type { AgentKey, RootAccount } from './keys.js'

/**
 * The Moderato workspace the apps run against.
 *
 * `testnet/keys.json` is chmod 600, gitignored, and holds nothing but Moderato-only material
 * this project generated. Private key bytes never leave this module: callers get an address
 * or a signing object, never the key. No user key is ever read, written or asked for.
 */

export const TESTNET_DIR = fileURLToPath(new URL('../../../testnet/', import.meta.url))
export const KEYS_PATH = `${TESTNET_DIR}keys.json`
export const ADDRS_PATH = `${TESTNET_DIR}addrs.json`

const MISSING = `${KEYS_PATH} is missing. Run "node 00-setup.mjs" in testnet/ to generate and fund Moderato-only throwaway accounts.`

type KeyFile = Record<string, Hex>
type AddrFile = Record<string, Address>

const readKeys = (): KeyFile => {
  if (!existsSync(KEYS_PATH)) throw new Error(MISSING)
  return JSON.parse(readFileSync(KEYS_PATH, 'utf8')) as KeyFile
}

const readAddrs = (): AddrFile =>
  existsSync(ADDRS_PATH) ? (JSON.parse(readFileSync(ADDRS_PATH, 'utf8')) as AddrFile) : {}

/** Labels present in the workspace, with the address each one resolves to. No key material. */
export function listWorkspaceRoles(): { label: string; address: Address }[] {
  const keys = readKeys()
  const addrs = readAddrs()
  return Object.keys(keys).map((label) => ({
    label,
    address: addrs[label] ?? (privateKeyToAccount(keys[label]!).address as Address),
  }))
}

/** A full secp256k1 signing account, as `viem/tempo` builds it. Satisfies `RootAccount`. */
export type OperatorAccount = ReturnType<typeof Account.fromSecp256k1>

export type Operator = {
  /** Which workspace label this account came from. */
  role: string
  address: Address
  /** The signing account. The private key stays inside this module. */
  account: OperatorAccount
}

/**
 * The root account that owns the fleet. Key management (`authorizeKey`, `revokeKey`,
 * `updateSpendingLimit`) requires it; an access key attempting any of them gets
 * `UnauthorizedCaller`.
 */
export function resolveOperator(role = process.env['LEASH_OPERATOR_ROLE'] ?? 'OWNER'): Operator {
  const keys = readKeys()
  const pk = keys[role]
  if (!pk)
    throw new Error(
      `${KEYS_PATH} has no "${role}" entry. Available labels: ${Object.keys(keys).join(', ')}. Set LEASH_OPERATOR_ROLE to one of them.`,
    )
  const account = Account.fromSecp256k1(pk)
  return { role, address: account.address as Address, account }
}

/** An address from the workspace by label, for merchants and fee payers. */
export function workspaceAddress(label: string): Address {
  const addrs = readAddrs()
  const found = addrs[label]
  if (!found) throw new Error(`${ADDRS_PATH} has no "${label}" address`)
  return found
}

/** A secp256k1 fee payer from the workspace, for the self-hosted sponsorship path. */
export function workspaceFeePayer(label = 'SPONSOR'): RootAccount {
  const keys = readKeys()
  const pk = keys[label]
  if (!pk) throw new Error(`${KEYS_PATH} has no "${label}" entry`)
  return Account.fromSecp256k1(pk) as RootAccount
}

/**
 * Generates a fresh agent key and records it in the workspace. The caller gets an `AgentKey`,
 * which can sign and can report its key id, and cannot hand back the private half.
 */
export function mintAgentKey(label: string): AgentKey {
  const keys = readKeys()
  const addrs = readAddrs()
  if (keys[label]) throw new Error(`${label} already exists in the workspace. Pick another label.`)
  const privateKey = generatePrivateKey()
  const key = agentKeyFromSecp256k1(privateKey)
  keys[label] = privateKey
  addrs[label] = key.keyId
  writeFileSync(KEYS_PATH, `${JSON.stringify(keys, null, 2)}\n`)
  chmodSync(KEYS_PATH, 0o600)
  writeFileSync(ADDRS_PATH, `${JSON.stringify(addrs, null, 2)}\n`)
  return key
}

/** Rebuilds a previously minted agent key so a later process can sign with it. */
export function loadAgentKey(label: string): AgentKey {
  const keys = readKeys()
  const pk = keys[label]
  if (!pk) throw new Error(`${KEYS_PATH} has no "${label}" entry`)
  return agentKeyFromSecp256k1(pk)
}

/** Every label the workspace holds an agent key for, keyed by key id for fleet lookups. */
export function agentKeyLabels(): Map<string, string> {
  const out = new Map<string, string>()
  for (const { label, address } of listWorkspaceRoles()) out.set(address.toLowerCase(), label)
  return out
}
