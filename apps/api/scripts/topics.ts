/**
 * Runs real research topics against a running API and counts the outcomes the live upstreams produced.
 * A throwaway team root plays the browser. Nothing is injected: every failure it reports came from a vendor
 * that charged and then answered non-2xx.
 *
 *   pnpm --filter @leash/api exec tsx scripts/topics.ts rust "open source llm" ...
 */
import { createClient, http, publicActions, walletActions } from 'viem'
import { tempoModerato } from 'viem/chains'
import { generatePrivateKey } from 'viem/accounts'
import { Account, Actions } from 'viem/tempo'

const API = (process.env['LEASH_API_URL'] ?? 'http://127.0.0.1:4180').replace(/\/+$/, '')
const PATH_USD = '0x20c0000000000000000000000000000000000000' as const
type Json = Record<string, any>

async function api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(600_000),
  })
  const json = (await res.json()) as Json
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

const topics = process.argv.slice(2)
if (topics.length === 0) throw new Error('pass at least one topic')
const root = Account.fromSecp256k1(generatePrivateKey())
const client = createClient({ account: root, chain: tempoModerato.extend({ feeToken: PATH_USD }), transport: http() }).extend(publicActions).extend(walletActions)

await api('POST', '/api/teams', { account: root.address, label: 'topics run', signer: 'webcrypto' })
await api('POST', '/api/faucet', { address: root.address })
const created = await api('POST', `/api/teams/${root.address}/agents`, {
  name: 'topic-runner',
  budget: '5.00',
  periodSeconds: 86400,
  serviceIds: ['atlas-search', 'atlas-scrape', 'relay-summarize', 'relay-keywords'],
})
const a = created.authorize
const tx = await Actions.accessKey.authorize(client, {
  accessKey: a.accessKey,
  expiry: a.expiry,
  limits: a.limits.map((l: Json) => ({ token: l.token, limit: BigInt(l.limit), period: l.period })),
  scopes: a.scopes,
})
await client.waitForTransactionReceipt({ hash: tx })
await api('POST', `/api/agents/${created.keyId}/confirm`, { tx })

const total = { delivered: 0, paid_not_delivered: 0, refused: 0, other: 0 }
const failures: string[] = []
for (const topic of topics) {
  const run = await api('POST', `/api/agents/${created.keyId}/run`, { topic })
  const scrapes = (run.records as Json[]).filter((r) => r.serviceId === 'atlas-scrape')
  const by = (o: string) => scrapes.filter((r) => r.outcome === o).length
  const row = { delivered: by('delivered'), paid_not_delivered: by('paid_not_delivered'), refused: by('refused') }
  for (const r of run.records as Json[]) {
    const k = r.outcome === 'delivered' || r.outcome === 'paid_not_delivered' || r.outcome === 'refused' ? r.outcome : 'other'
    total[k as keyof typeof total]++
    if (r.outcome === 'paid_not_delivered') failures.push(`${r.serviceId} ${r.status} ${r.url} ${r.settlement?.tx}`)
  }
  console.log(`topic ${JSON.stringify(topic)}: scrapes ${scrapes.length} (delivered ${row.delivered}, paid_not_delivered ${row.paid_not_delivered}, refused ${row.refused}); all records ${run.records.length}; errors ${JSON.stringify(run.errors)}`)
}
console.log('all services:', JSON.stringify(total))
console.log('paid_not_delivered:\n  ' + (failures.join('\n  ') || 'none'))
console.log('team', root.address)
