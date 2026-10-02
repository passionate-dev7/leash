import type { Address, Hex } from 'viem'
import { Account, WebAuthnP256, WebCryptoP256 } from 'viem/tempo'

export type SignerKind = 'passkey' | 'webcrypto'
export type StoredSigner = {
  address: Address
  kind: SignerKind
  label: string
  /** Passkey only: credential id and uncompressed public key (the browser cannot read it back later). */
  credential?: { id: string; publicKey: Hex }
}

const LIST_KEY = 'leash.signers'
const ACTIVE_KEY = 'leash.active'

export function listSigners(): StoredSigner[] {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]') as StoredSigner[]
  } catch {
    return []
  }
}
const saveSigners = (list: StoredSigner[]) => localStorage.setItem(LIST_KEY, JSON.stringify(list))
export const getActive = (): Address | null => localStorage.getItem(ACTIVE_KEY) as Address | null
export const setActive = (address: Address) => localStorage.setItem(ACTIVE_KEY, address)

// Non-extractable CryptoKeys survive only in IndexedDB (structured clone); localStorage cannot hold them.
const DB = 'leash'
const STORE = 'p256'
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}
async function putKey(address: string, value: unknown) {
  const conn = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = conn.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, address.toLowerCase())
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  conn.close()
}
async function getKey<T>(address: string): Promise<T | undefined> {
  const conn = await db()
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const req = conn.transaction(STORE, 'readonly').objectStore(STORE).get(address.toLowerCase())
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
  conn.close()
  return value
}

type KeyPair = Awaited<ReturnType<typeof WebCryptoP256.createKeyPair>>

export const passkeySupported = () => typeof navigator !== 'undefined' && !!navigator.credentials && typeof PublicKeyCredential !== 'undefined'

export async function createSigner(kind: SignerKind, label: string): Promise<StoredSigner> {
  let stored: StoredSigner
  if (kind === 'passkey') {
    const credential = await WebAuthnP256.createCredential({ label })
    const account = Account.fromWebAuthnP256(credential)
    stored = { address: account.address, kind, label, credential: { id: credential.id, publicKey: credential.publicKey } }
  } else {
    const keyPair = await WebCryptoP256.createKeyPair({ extractable: false })
    const account = Account.fromWebCryptoP256(keyPair)
    await putKey(account.address, keyPair)
    stored = { address: account.address, kind, label }
  }
  saveSigners([...listSigners().filter((s) => s.address.toLowerCase() !== stored.address.toLowerCase()), stored])
  setActive(stored.address)
  return stored
}

export async function accountFor(signer: StoredSigner) {
  if (signer.kind === 'passkey') {
    if (!signer.credential) throw new Error('Stored passkey has no credential data')
    return Account.fromWebAuthnP256(signer.credential)
  }
  const keyPair = await getKey<KeyPair>(signer.address)
  if (!keyPair) throw new Error('This browser no longer holds the key for that team. Create a new team account.')
  return Account.fromWebCryptoP256(keyPair)
}

export function forgetSigner(address: Address) {
  saveSigners(listSigners().filter((s) => s.address.toLowerCase() !== address.toLowerCase()))
  if (getActive()?.toLowerCase() === address.toLowerCase()) localStorage.removeItem(ACTIVE_KEY)
}
