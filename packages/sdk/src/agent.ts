import { keccak256, toHex } from 'viem'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Account } from 'viem/tempo'
import { NETWORKS } from './client.js'
import type { NetworkConfig } from './client.js'
import type { AgentAccount, DeliveryRecord } from './mpp.js'

/**
 * Running an agent outside the Leash desk.
 *
 * The desk never holds an external agent's key. The agent pays with its own access key, then
 * reports each DeliveryRecord to the desk signed by that same key, so the desk can attribute the
 * record without trusting the sender. The desk still reads every settlement back from the chain
 * before it counts a record as a payment.
 */

/** The OUSD TIP-20 on Moderato: budget, payment and fee token for an agent. */
export const OUSD: Address = '0x20c0000000000000000000006a37DA5C996874BE'

/**
 * The network an agent pays on. Gas is paid in OUSD, the token the budget is denominated in:
 * an access key can only spend a token it has a limit for.
 */
export const AGENT_NETWORK: NetworkConfig = { ...NETWORKS.moderato, feeToken: OUSD, settlementToken: OUSD }

/** JSON with object keys sorted at every depth, so two parties serialise one record to the same bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

/** The 32 bytes an agent signs: keccak256 of the record's canonical JSON. */
export const recordDigest = (record: unknown): Hex => keccak256(toHex(canonicalJson(record)))

/** Who signs a record: a secp256k1 private key, or any viem account that can personal_sign. */
export type RecordSigner = Hex | { address: Address; signMessage: (args: { message: { raw: Hex } }) => Promise<Hex> }

const signerOf = (signer: RecordSigner) => (typeof signer === 'string' ? privateKeyToAccount(signer) : signer)

/** EIP-191 personal_sign over the record digest. The signature recovers to the agent's key id. */
export async function signRecord(signer: RecordSigner, record: unknown): Promise<Hex> {
  return signerOf(signer).signMessage({ message: { raw: recordDigest(record) } })
}

export class DeskError extends Error {
  override name = 'DeskError'
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string | null,
  ) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

const trim = (base: string) => base.replace(/\/+$/, '')

/** Posts one signed record to the desk. Throws DeskError when the desk refuses it. */
export async function postRecord(deskApi: string, signer: RecordSigner, record: DeliveryRecord): Promise<{ accepted: true; outcome: string; seq: number }> {
  const keyId = signerOf(signer).address
  const signature = await signRecord(signer, record)
  const res = await fetch(`${trim(deskApi)}/api/agents/${keyId}/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ record, signature }),
    signal: AbortSignal.timeout(60_000),
  })
  const text = await res.text()
  let json: { error?: string; detail?: string | null } & Record<string, unknown> = {}
  try {
    json = JSON.parse(text)
  } catch {
    throw new DeskError(res.status, `non-JSON answer (${res.status})`, text.slice(0, 200))
  }
  if (!res.ok) throw new DeskError(res.status, json.error ?? `HTTP ${res.status}`, json.detail ?? null)
  return json as { accepted: true; outcome: string; seq: number }
}

/**
 * An `onRecord` for createLeashFetch that reports every record to the desk. A paid response must
 * not be lost because the desk was unreachable, so a failed report goes to `onError` (stderr by
 * default) instead of throwing out of the fetch.
 */
export function reportTo(
  deskApi: string,
  signer: RecordSigner,
  onError: (error: unknown, record: DeliveryRecord) => void = (e, r) => console.error(`leash: the desk did not take record ${r.id}: ${(e as Error).message}`),
): (record: DeliveryRecord) => Promise<void> {
  return async (record) => {
    try {
      await postRecord(deskApi, signer, record)
    } catch (e) {
      onError(e, record)
    }
  }
}

/** Recipients the desk has cut or is cutting for the team. The chain is the enforcer; this is the local fast path. */
export async function fetchBlocked(deskApi: string, team: Address): Promise<Set<string>> {
  const res = await fetch(`${trim(deskApi)}/api/teams/${team}/blocked`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new DeskError(res.status, `blocked list answered ${res.status}`, null)
  const json = (await res.json()) as { recipients?: string[] }
  return new Set((json.recipients ?? []).map((r) => r.toLowerCase()))
}

/** The signing account for an agent key authorized under `team`. Its `accessKeyAddress` is the key id. */
export function agentAccount(privateKey: Hex, team: Address): AgentAccount {
  return Account.fromSecp256k1(privateKey, { access: team }) as unknown as AgentAccount
}
