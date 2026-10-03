import { getAddress, keccak256, toHex } from 'viem'
import type { Address, Hex } from 'viem'

/**
 * How the desk knows a team write came from the team. The team's root key signs a digest that names
 * the request it authorizes, and the desk verifies that signature against the team account. This file
 * is pure (viem only) so the browser, the API and the scripts compute one digest.
 */

export const DESK_DOMAIN = 'leash-desk-v1'
/** A signed request is accepted when its issuedAt is this close to the desk's clock, and only once. */
export const DESK_AUTH_WINDOW_MS = 5 * 60_000
export const DESK_HEADER_ISSUED_AT = 'x-leash-issued-at'
export const DESK_HEADER_SIGNATURE = 'x-leash-signature'

/** JSON with object keys sorted at every depth, so two parties serialise one value to the same bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

export type DeskRequest = {
  method: string
  /** The request path as sent, without query or any proxy prefix: "/api/teams/0x.../agents". */
  path: string
  /** The team account the write changes. */
  account: Address
  /** The chain id of the team's network. */
  chainId: number
  /** The JSON body as sent. */
  body: unknown
  /** Milliseconds since the epoch, from the signer's clock. */
  issuedAt: number
}

/** The action a request performs: its method and path, so a signature for one route cannot be spent on another. */
export const deskAction = (method: string, path: string): string => `${method.toUpperCase()} ${path}`

/** The 32 bytes the team key signs. */
export function deskDigest(r: DeskRequest): Hex {
  return keccak256(
    toHex(
      canonicalJson({
        domain: DESK_DOMAIN,
        action: deskAction(r.method, r.path),
        account: getAddress(r.account).toLowerCase(),
        chainId: r.chainId,
        bodyHash: keccak256(toHex(canonicalJson(r.body ?? {}))),
        issuedAt: r.issuedAt,
      }),
    ),
  )
}

/** A viem Tempo account: secp256k1, WebCrypto P256 or a passkey. `sign` returns the serialized signature envelope. */
export type DeskSigner = { address: Address; sign: (args: { hash: Hex }) => Promise<Hex> }

/** The headers that carry the team's signature on one request. */
export async function signDeskRequest(signer: DeskSigner, r: Omit<DeskRequest, 'account' | 'issuedAt'> & { issuedAt?: number }): Promise<Record<string, string>> {
  const issuedAt = r.issuedAt ?? Date.now()
  const signature = await signer.sign({ hash: deskDigest({ ...r, account: signer.address, issuedAt }) })
  return { [DESK_HEADER_ISSUED_AT]: String(issuedAt), [DESK_HEADER_SIGNATURE]: signature }
}
