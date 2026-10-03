import type { Address, Hex } from 'viem'
import type { DeliveryRecord } from '@leash/sdk'
import { createStore } from '../src/store.js'
import { openDatabase } from '../src/db.js'
import { createCipher } from '../src/keystore.js'
import { publicCatalog } from '../src/services.js'

export const KEY = Buffer.alloc(32, 7)
export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
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
