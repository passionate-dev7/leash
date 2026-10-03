import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicCatalog } from '../src/services.js'
import { evidenceOf, recommendCut, vendorRows } from '../src/vendors.js'
import { memoryStore, seed } from './helpers.js'

const rows = (store: ReturnType<typeof memoryStore>) =>
  vendorRows({ catalog: publicCatalog(), records: store.allRecords('0x1111111111111111111111111111111111111111'), cutoffs: [], blocked: new Set() })
const scrape = (rs: ReturnType<typeof rows>) => rs.find((s) => s.serviceId === 'atlas-scrape')!

test('roll-up counts only settled payments and computes the failure rate over them', () => {
  const store = memoryStore()
  seed(store, [
    ...Array.from({ length: 6 }, () => ({ serviceId: 'atlas-scrape', outcome: 'delivered' as const })),
    ...Array.from({ length: 2 }, () => ({ serviceId: 'atlas-scrape', outcome: 'paid_not_delivered' as const })),
    { serviceId: 'atlas-scrape', outcome: 'refused' },
    { serviceId: 'atlas-scrape', outcome: 'unsettled', settled: false },
  ])
  const s = scrape(rows(store))
  assert.equal(s.paid, 8)
  assert.equal(s.delivered, 6)
  assert.equal(s.paidNotDelivered, 2)
  assert.equal(s.refused, 1)
  assert.equal(s.failureRate, 0.25)
  assert.equal(s.spent, String(8 * 3000))
  assert.deepEqual(s.siblings, [])
  assert.deepEqual(rows(store).find((x) => x.serviceId === 'relay-summarize')!.siblings, ['relay-keywords'])
})

test('evidence: window, newest-first txs, cap of 10, and an empty service has rate 0', () => {
  const store = memoryStore()
  seed(store, [
    ...Array.from({ length: 12 }, () => ({ serviceId: 'atlas-scrape', outcome: 'paid_not_delivered' as const, minutesAgo: 30 })),
    { serviceId: 'atlas-scrape', outcome: 'paid_not_delivered', minutesAgo: 25 * 60 },
    { serviceId: 'atlas-scrape', outcome: 'delivered', minutesAgo: 25 * 60 },
  ])
  const all = store.allRecords('0x1111111111111111111111111111111111111111')
  const e = evidenceOf(all)
  assert.equal(e.window, '24h')
  assert.equal(e.paid, 12)
  assert.equal(e.paidNotDelivered, 12)
  assert.equal(e.failureRate, 1)
  assert.equal(e.txs.length, 10)
  const newest = all.filter((r) => r.outcome === 'paid_not_delivered' && Date.parse(r.startedAt) > Date.now() - 3_600_000).sort((a, b) => b.seq - a.seq)
  assert.deepEqual(e.txs, newest.slice(0, 10).map((r) => r.settlement!.tx))
  assert.deepEqual(evidenceOf([]), { window: '24h', paid: 0, paidNotDelivered: 0, failureRate: 0, txs: [] })
})

test('recommendCut: needs at least 3 failures and a rate of at least 15 percent in the window', () => {
  const ev = (paid: number, failed: number) => ({ window: '24h' as const, paid, paidNotDelivered: failed, failureRate: paid === 0 ? 0 : failed / paid, txs: [] })
  assert.equal(recommendCut(ev(2, 2)), false, 'two failures is not enough even at 100 percent')
  assert.equal(recommendCut(ev(29, 6)), true, 'the measured scrape route: 6 of 29, 21 percent')
  assert.equal(recommendCut(ev(20, 3)), true, '3 of 20 is exactly 15 percent')
  assert.equal(recommendCut(ev(21, 3)), false, '3 of 21 is under 15 percent')
  assert.equal(recommendCut(ev(23, 0)), false, 'a healthy service')
  assert.equal(recommendCut(ev(0, 0)), false)
})

test('a failure older than 24 hours does not recommend a cut, a recent one does', () => {
  const old = memoryStore()
  seed(old, [
    { serviceId: 'atlas-scrape', outcome: 'paid_not_delivered', minutesAgo: 30 * 60 },
    { serviceId: 'atlas-scrape', outcome: 'paid_not_delivered', minutesAgo: 31 * 60 },
    { serviceId: 'atlas-scrape', outcome: 'paid_not_delivered', minutesAgo: 32 * 60 },
  ])
  const o = scrape(rows(old))
  assert.equal(o.paidNotDelivered, 3, 'the all-time roll-up still shows them')
  assert.equal(o.evidence.paidNotDelivered, 0)
  assert.equal(o.recommendCut, false)
  const fresh = memoryStore()
  seed(fresh, [
    { serviceId: 'atlas-scrape', outcome: 'paid_not_delivered' },
    { serviceId: 'atlas-scrape', outcome: 'paid_not_delivered' },
    { serviceId: 'atlas-scrape', outcome: 'paid_not_delivered' },
  ])
  const f = scrape(rows(fresh))
  assert.equal(f.recommendCut, true)
  assert.equal(f.evidence.txs.length, 3)
})
