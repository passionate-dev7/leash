import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Address, Hex } from 'viem'

/**
 * What the console signed, and what the operator believed they were signing.
 *
 * The chain stores the allowlist. It does not store *intent*, and intent is the whole point of
 * the blast-radius feature: "this address pays sixteen services, you asked for one" is only
 * answerable if the one is written down. This file is that record.
 *
 * It holds addresses, service ids and transaction hashes. No key material. It is local state,
 * so it is gitignored; a key missing from it still renders, with every reachable service
 * counted as unnamed, which is the safe direction to be wrong in.
 */

const PATH = fileURLToPath(new URL('./.leash-operator.json', import.meta.url))

export type KeyRecord = {
  keyId: Address
  label: string
  agent: string
  chainId: number
  /** Service ids the operator explicitly selected. */
  intendedServiceIds: string[]
  /** Payout addresses written into the allowlist at signing time. */
  recipients: Address[]
  token: Address
  decimals: number
  budget: string
  periodSeconds: number
  expiry: number
  /** Smallest-unit price of the cheapest covered service, for "calls remaining". */
  priceFloor?: string
  /** Live 402 resolution timestamp the allowlist was built from. */
  resolvedAt: string
  /** Catalog snapshot the blast radius was evaluated against. */
  indexCapturedAt: string
  signedAt: string
  authorizeTx: Hex
  sponsored: boolean
  revokedAt?: string
  revokeTx?: Hex
}

type File = { version: 1; operator?: Address; keys: KeyRecord[] }

function read(): File {
  if (!existsSync(PATH)) return { version: 1, keys: [] }
  try {
    const parsed = JSON.parse(readFileSync(PATH, 'utf8')) as File
    if (!Array.isArray(parsed.keys)) return { version: 1, keys: [] }
    return parsed
  } catch {
    return { version: 1, keys: [] }
  }
}

function write(file: File): void {
  writeFileSync(PATH, `${JSON.stringify(file, null, 2)}\n`)
}

export const REGISTRY_PATH = PATH

export function listRecords(): KeyRecord[] {
  return read().keys
}

export function recordFor(keyId: Address): KeyRecord | undefined {
  const wanted = keyId.toLowerCase()
  return read().keys.find((k) => k.keyId.toLowerCase() === wanted)
}

export function saveRecord(record: KeyRecord, operator: Address): void {
  const file = read()
  file.operator = operator
  file.keys = [record, ...file.keys.filter((k) => k.keyId.toLowerCase() !== record.keyId.toLowerCase())]
  write(file)
}

export function markRevoked(keyId: Address, tx: Hex): void {
  const file = read()
  const wanted = keyId.toLowerCase()
  for (const k of file.keys)
    if (k.keyId.toLowerCase() === wanted) {
      k.revokedAt = new Date().toISOString()
      k.revokeTx = tx
    }
  write(file)
}
