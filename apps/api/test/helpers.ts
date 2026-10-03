import type { Address, Hex } from 'viem'
import { Account } from 'viem/tempo'
import type { DeliveryRecord } from '@leash/sdk'
import { signDeskRequest } from '@leash/policy'
import type { DeskSigner } from '@leash/policy'
import { createStore } from '../src/store.js'
import { openDatabase } from '../src/db.js'
import { createCipher } from '../src/keystore.js'
import { publicCatalog } from '../src/services.js'

export const KEY = Buffer.alloc(32, 7)
/** A team root: the key that signs the team's writes, and the chain its team lives on. */
export type TestRoot = { account: DeskSigner; chainId: number }
const root = (key: Hex, chainId: number): TestRoot => ({ account: Account.fromSecp256k1(key) as DeskSigner, chainId })
export const MODERATO_ROOT = root(`0x${'11'.repeat(32)}`, 42431)
export const MAINNET_ROOT = root(`0x${'22'.repeat(32)}`, 4217)
export const ACCOUNT: Address = MODERATO_ROOT.account.address
export const MAINNET_TEAM: Address = MAINNET_ROOT.account.address
export const RELAY_PAYOUT: Address = '0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4'
export const SCRAPE_RECIPIENT: Address = publicCatalog().find((s) => s.serviceId === 'atlas-scrape')!.recipient

export const memoryStore = () => createStore(openDatabase(':memory:'), createCipher(KEY))
export type TestStore = ReturnType<typeof memoryStore>

let n = 0
/** A finished ledger record. `minutesAgo` places it inside or outside the 24 hour window. */
export function record(over: { serviceId: string; outcome: DeliveryRecord['outcome']; minutesAgo?: number; settled?: boolean; amount?: string }): DeliveryRecord {
  n++
  const at = new Date(Date.now() - (over.minutesAgo ?? 1) * 60_000).toISOString()
  const settled = over.settled ?? (over.outcome === 'delivered' || over.outcome === 'paid_not_delivered')
  return {
    id: `rec-${n}`,
    url: `http://127.0.0.1/v/test/${over.serviceId}`,
    method: 'POST',
    requestHash: `0x${n.toString(16).padStart(64, '0')}` as Hex,
    realm: 'test',
    keyId: '0x2222222222222222222222222222222222222222',
    account: ACCOUNT,
    recipient: over.serviceId.startsWith('relay') ? RELAY_PAYOUT : SCRAPE_RECIPIENT,
    amount: over.amount ?? '3000',
    currency: '0x20c0000000000000000000006a37DA5C996874BE',
    memo: null,
    status: over.outcome === 'delivered' ? 200 : over.outcome === 'paid_not_delivered' ? 502 : null,
    refused: over.outcome === 'refused' ? 'CallNotAllowed' : null,
    settlement: settled ? { tx: `0x${n.toString(16).padStart(64, 'a')}` as Hex, block: n, status: 'success', keySpend: [over.amount ?? '3000'] } : null,
    outcome: over.outcome,
    startedAt: at,
    finishedAt: at,
  }
}

export function seed(store: TestStore, rows: Parameters<typeof record>[0][], vendorId = 'atlas') {
  store.upsertTeam(ACCOUNT, 'test team', 'webcrypto')
  for (const r of rows) store.insertRecord(record(r), { agentName: 'a', vendorId: r.serviceId.startsWith('relay') ? 'relay' : vendorId, serviceId: r.serviceId })
}

export type Json = Record<string, any>

/**
 * An HTTP caller for a test desk. A POST carries the signature of `as` (the team root) the way the
 * browser sends it; `unsigned` sends it bare, and `raw` replaces the body text after signing.
 */
export const caller = (base: () => string) =>
  async (method: 'GET' | 'POST', path: string, body?: unknown, opts: { as?: TestRoot; unsigned?: boolean; raw?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; json: Json }> => {
    const as = opts.as ?? MODERATO_ROOT
    const sent = body ?? {}
    const auth = method === 'POST' && !opts.unsigned && opts.raw === undefined ? await signDeskRequest(as.account, { method, path, chainId: as.chainId, body: sent }) : {}
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...auth, ...opts.headers },
      ...(method === 'POST' ? { body: opts.raw ?? JSON.stringify(sent) } : {}),
    })
    return { status: res.status, json: (await res.json()) as Json }
  }
