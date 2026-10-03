import type { IncomingMessage } from 'node:http'
import { getAddress } from 'viem'
import type { Address, Hex } from 'viem'
import { SignatureEnvelope } from 'ox/tempo'
import { DESK_AUTH_WINDOW_MS, DESK_HEADER_ISSUED_AT, DESK_HEADER_SIGNATURE, deskDigest } from '@leash/policy'
import { HttpError } from './http.js'
import type { Store } from './store.js'

const unauthorized = (detail: string) => new HttpError(401, 'unauthorized', detail)

/** Signature types a team root can have. A keychain envelope is an access key speaking for the root, which is not the root. */
const ROOT_TYPES: readonly string[] = ['secp256k1', 'p256', 'webAuthn']

export type SignedWrite = {
  method: string
  /** The request path as the client signed it: no query, no proxy prefix. */
  path: string
  /** The team account the write changes. */
  account: Address
  chainId: number
  body: unknown
}

/**
 * Requires that the team account's root key signed this exact request: its method, path, body, team
 * and chain, within five minutes of the desk's clock, and never before. secp256k1, P256 (WebCrypto)
 * and WebAuthn (passkey) envelopes all verify against the team address, which is derived from the key.
 */
export function requireTeamSignature(store: Pick<Store, 'claimDeskDigest'>, req: IncomingMessage, write: SignedWrite, now = Date.now()): void {
  const header = (name: string) => {
    const v = req.headers[name]
    return typeof v === 'string' ? v : undefined
  }
  const issued = header(DESK_HEADER_ISSUED_AT)
  const signature = header(DESK_HEADER_SIGNATURE)
  if (!issued || !signature) throw unauthorized(`this write must be signed by the team key: send ${DESK_HEADER_ISSUED_AT} and ${DESK_HEADER_SIGNATURE}`)
  if (!/^\d{10,16}$/.test(issued)) throw unauthorized(`${DESK_HEADER_ISSUED_AT} must be milliseconds since the epoch`)
  const issuedAt = Number(issued)
  if (Math.abs(now - issuedAt) > DESK_AUTH_WINDOW_MS) throw unauthorized(`the signature was issued more than ${DESK_AUTH_WINDOW_MS / 60_000} minutes from the desk's clock`)
  if (!/^0x([0-9a-fA-F]{2}){65,2000}$/.test(signature)) throw unauthorized(`${DESK_HEADER_SIGNATURE} must be a serialized signature envelope`)

  const account = getAddress(write.account)
  const digest = deskDigest({ ...write, account, issuedAt })
  let valid = false
  try {
    const envelope = SignatureEnvelope.deserialize(signature as Hex)
    valid = ROOT_TYPES.includes(envelope.type) && SignatureEnvelope.verify(envelope, { payload: digest, address: account })
  } catch {
    valid = false
  }
  if (!valid) throw unauthorized(`the signature is not the team key's for ${account}`)
  // The digest is claimed only after the signature checked out, so a stranger cannot fill the table.
  if (!store.claimDeskDigest(digest, issuedAt + DESK_AUTH_WINDOW_MS)) throw unauthorized('this signed request was already used')
}
