import type { Address, Hex } from 'viem'
import { Account, WebCryptoP256 } from 'viem/tempo'
import * as AddressOx from 'ox/Address'
import * as PublicKeyOx from 'ox/PublicKey'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

/**
 * Agent key generation.
 *
 * The default is a non-extractable WebCrypto P256 key: the private half lives inside the
 * platform key store as a `CryptoKey` that cannot be serialised, so there is no value to
 * write down, log, or leak. `authorizeKey`'s `signatureType` 1 is exactly this key type,
 * and the key id is `Address.fromPublicKey(publicKey)`, the same derivation the
 * `KeyAuthorized` event reports.
 *
 * Leash never writes a private key anywhere. The secp256k1 path exists because Node
 * scripts and CI need a key they can rebuild across processes, and it takes the key
 * material from the caller rather than inventing a place to store it.
 */

/** The root account an access key is authorized under, as `viem/tempo` types it. */
export type RootAccount = NonNullable<
  NonNullable<Parameters<typeof Account.fromSecp256k1>[1]>['access']
>

export type AccessKeyAccount = ReturnType<typeof Account.fromWebCryptoP256>

export type AgentKey = {
  /** The key id. This, not the account address, is what every keychain read takes. */
  keyId: Address
  /** `authorizeKey`'s `signatureType`. 0 secp256k1, 1 p256, 2 webAuthn. */
  signatureType: 0 | 1 | 2
  keyType: 'secp256k1' | 'p256'
  /** True when the private half cannot be exported from this process. */
  nonExtractable: boolean
  /** Builds the signing account, bound to the root account it is an access key for. */
  toAccount: (root: RootAccount) => AccessKeyAccount
}

export class WebCryptoUnavailableError extends Error {
  override name = 'WebCryptoUnavailableError'
  constructor() {
    super(
      'globalThis.crypto.subtle is unavailable, so a non-extractable P256 key cannot be generated in this runtime. Use generateSecp256k1AgentKey and supply the key material yourself.',
    )
  }
}

export const webCryptoAvailable = (): boolean =>
  typeof globalThis.crypto?.subtle?.generateKey === 'function'

/**
 * Generates a P256 key pair whose private half is a non-extractable `CryptoKey`.
 * `ox/WebCryptoP256.createKeyPair` defaults `extractable` to false; this asserts it rather
 * than trusting the default, because the whole security claim rests on that one flag.
 */
export async function generateP256AgentKey(): Promise<
  AgentKey & { keyPair: Awaited<ReturnType<typeof WebCryptoP256.createKeyPair>> }
> {
  if (!webCryptoAvailable()) throw new WebCryptoUnavailableError()
  const keyPair = await WebCryptoP256.createKeyPair({ extractable: false })
  if (keyPair.privateKey.extractable)
    throw new Error(
      'WebCrypto returned an extractable private key. Refusing to use it as an agent key.',
    )
  const keyId = AddressOx.fromPublicKey(keyPair.publicKey) as Address
  return {
    keyId,
    signatureType: 1,
    keyType: 'p256',
    nonExtractable: true,
    keyPair,
    toAccount: (root) => Account.fromWebCryptoP256(keyPair, { access: root }),
  }
}

/**
 * A secp256k1 agent key from caller-supplied material. Leash does not persist it; the
 * caller decides where it lives, and on this project that is only ever `testnet/keys.json`.
 */
export function agentKeyFromSecp256k1(privateKey: Hex): AgentKey {
  const keyId = privateKeyToAccount(privateKey).address
  return {
    keyId,
    signatureType: 0,
    keyType: 'secp256k1',
    nonExtractable: false,
    toAccount: (root) => Account.fromSecp256k1(privateKey, { access: root }) as AccessKeyAccount,
  }
}

/**
 * Generates fresh secp256k1 material and hands it straight back to the caller. Used only by
 * the testnet workspace, which writes it to a chmod-600 file it already owns.
 */
export function generateSecp256k1AgentKey(): { key: AgentKey; privateKey: Hex } {
  const privateKey = generatePrivateKey()
  return { key: agentKeyFromSecp256k1(privateKey), privateKey }
}

/**
 * Derives the key id from a public key exactly the way the precompile does.
 *
 * The trap this exists to remove: an access key account object reports `.address` as the
 * *parent* account's address. Passing it where a key id belongs makes every read return
 * zeros with no error. BUILD-SPEC §4.2.
 */
export function keyIdFromPublicKey(publicKey: Hex | { x: bigint; y: bigint; prefix: number }): Address {
  const pk = typeof publicKey === 'string' ? PublicKeyOx.fromHex(publicKey) : publicKey
  return AddressOx.fromPublicKey(pk) as Address
}

/** Reads the key id off an access key account, never its `.address`. */
export function keyIdOf(account: { accessKeyAddress?: Address; address: Address }): Address {
  if (!account.accessKeyAddress)
    throw new Error(
      'this account is not an access key. Its .address is a root account address, and using it as a key id would make every keychain read return zeros.',
    )
  return account.accessKeyAddress
}
