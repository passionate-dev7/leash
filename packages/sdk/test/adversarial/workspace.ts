import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Address, Hex } from 'viem'
import { createPublicClient, http, parseAbi } from 'viem'
import { tempoModerato } from 'viem/chains'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

/**
 * Moderato throwaway accounts for the adversarial suite.
 *
 * Reuses the verification workspace at `testnet/` so the suite runs against the same funded
 * accounts a human can inspect. `keys.json` is chmod 600, gitignored, and holds nothing but
 * Moderato-only material this project generated. No user key is ever read, written or asked
 * for here.
 */

const TESTNET_DIR = fileURLToPath(new URL('../../../../testnet/', import.meta.url))
const KEYS_PATH = `${TESTNET_DIR}keys.json`
const ADDRS_PATH = `${TESTNET_DIR}addrs.json`

export const ROLES = [
  'OWNER',
  'SPONSOR',
  'MERCHANT_A',
  'MERCHANT_B',
] as const
export type Role = (typeof ROLES)[number]

export type Workspace = {
  keys: Record<string, Hex>
  addrs: Record<string, Address>
}

export function loadWorkspace(): Workspace {
  if (!existsSync(KEYS_PATH))
    throw new Error(
      `${KEYS_PATH} is missing. Run "node 00-setup.mjs" in testnet/ to generate and fund Moderato-only throwaway accounts.`,
    )
  const keys = JSON.parse(readFileSync(KEYS_PATH, 'utf8')) as Record<string, Hex>
  for (const role of ROLES)
    if (!keys[role]) throw new Error(`${KEYS_PATH} has no ${role} key`)
  const addrs = JSON.parse(readFileSync(ADDRS_PATH, 'utf8')) as Record<string, Address>
  return { keys, addrs }
}

/**
 * Mints a fresh agent key for this run and records it beside the others. A new key per run
 * keeps each run's budget arithmetic independent, so a case cannot pass because a previous
 * run happened to leave room.
 */
export function mintRunKey(label: string): { privateKey: Hex; keyId: Address } {
  const keys = JSON.parse(readFileSync(KEYS_PATH, 'utf8')) as Record<string, Hex>
  const addrs = JSON.parse(readFileSync(ADDRS_PATH, 'utf8')) as Record<string, Address>
  const privateKey = generatePrivateKey()
  const keyId = privateKeyToAccount(privateKey).address
  keys[label] = privateKey
  addrs[label] = keyId
  writeFileSync(KEYS_PATH, `${JSON.stringify(keys, null, 2)}\n`)
  chmodSync(KEYS_PATH, 0o600)
  writeFileSync(ADDRS_PATH, `${JSON.stringify(addrs, null, 2)}\n`)
  return { privateKey, keyId }
}

const erc = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
])

/**
 * Refuses to start against an unfunded account.
 *
 * Verifying against an empty balance is worse than not verifying: every payment would fail
 * for the wrong reason and every negative control would pass vacuously.
 */
export async function assertFunded(args: {
  address: Address
  token: Address
  minimum: bigint
  label: string
}): Promise<bigint> {
  const pc = createPublicClient({ chain: tempoModerato, transport: http() })
  const balance = (await pc.readContract({
    address: args.token,
    abi: erc,
    functionName: 'balanceOf',
    args: [args.address],
  })) as bigint
  if (balance < args.minimum)
    throw new Error(
      `${args.label} ${args.address} holds ${balance} of ${args.token}, below the ${args.minimum} this suite needs. Re-fund with tempo_fundAddress. Running against an empty account would make every negative control pass for the wrong reason.`,
    )
  return balance
}

export async function fundFromFaucet(address: Address): Promise<unknown> {
  const pc = createPublicClient({ chain: tempoModerato, transport: http() })
  return pc.request({
    method: 'tempo_fundAddress' as never,
    params: [address] as never,
  })
}
