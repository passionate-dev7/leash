/**
 * Drives the Leash HTTP API the way the browser does, against a running API and Moderato.
 * The team root is a throwaway secp256k1 key generated in this process: it plays the browser's
 * passkey and signs authorize and cut-off transactions. The API never sees it.
 *
 *   pnpm --filter @leash/api start        (in another shell)
 *   pnpm --filter @leash/api e2e
 *
 * E2E_SKIP_CUT=1 sends a harmless transaction where the cut-off should go. The run must then
 * fail: it is the mutation that proves the cut-off assertions can fail.
 */
import { createClient, encodeFunctionData, http, parseAbi, parseEventLogs, publicActions, walletActions } from 'viem'
import type { Address, Hash } from 'viem'
import { tempoModerato } from 'viem/chains'
import { generatePrivateKey } from 'viem/accounts'
import { Abis, Account, Actions, Addresses } from 'viem/tempo'

const API = (process.env['LEASH_API_URL'] ?? 'http://127.0.0.1:4180').replace(/\/+$/, '')
const SKIP_CUT = process.env['E2E_SKIP_CUT'] === '1'
const OUSD = '0x20c0000000000000000000006a37DA5C996874BE' as const
const PATH_USD = '0x20c0000000000000000000000000000000000000' as const
const ATLAS_MASTER = '0xF45B4Ece0BcA5A00a7E0f5108348e9b8184584d6' as const
const ALL = ['atlas-search', 'atlas-scrape', 'atlas-fx', 'relay-summarize', 'relay-keywords']

type Json = Record<string, any>
const hashes: Record<string, string[]> = { authorize: [], settlements: [], cutoff: [] }
const refusals: string[] = []
const log = (...a: unknown[]) => console.log(...a)

class Failure extends Error {}
function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Failure(message)
}

async function api(method: 'GET' | 'POST', path: string, body?: unknown, expect = 200): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(300_000),
  })
  const json = (await res.json()) as Json
  check(res.status === expect, `${method} ${path} answered ${res.status} (wanted ${expect}): ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

const chain = tempoModerato.extend({ feeToken: PATH_USD })
const root = Account.fromSecp256k1(generatePrivateKey())
const client = createClient({ account: root, chain, transport: http() }).extend(publicActions).extend(walletActions)
const balanceOf = parseAbi(['function balanceOf(address) view returns (uint256)'])
const ousd = (a: Address) => client.readContract({ address: OUSD, abi: balanceOf, functionName: 'balanceOf', args: [a] })

async function main() {
  const health = await api('GET', '/api/health')
  check(health.ok && health.chainId === 42431, 'API is not reading Moderato')
  log(`api ${API}  chain ${health.chainId}  block ${health.block}`)
  log(`throwaway team root ${root.address}`)

  // 1. team and funds
  await api('POST', '/api/teams', { account: root.address, label: 'e2e team', signer: 'webcrypto' })
  const funded = await api('POST', '/api/faucet', { address: root.address })
  check(BigInt(funded.ousd) > 0n && BigInt(funded.pathusd) > 0n, 'faucet did not credit OUSD and PathUSD')
  await api('POST', '/api/faucet', { address: root.address }, 429)
  const startOusd = await ousd(root.address)
  check(startOusd === BigInt(funded.ousd), 'faucet response differs from the chain balance')
  log(`funded: ${funded.ousd} OUSD units, ${funded.pathusd} PathUSD units (repeat call rate limited)`)

  const catalog = await api('GET', '/api/catalog')
  const svc = (id: string) => catalog.services.find((s: Json) => s.serviceId === id)
  check(catalog.services.length === 5 && svc('atlas-scrape').virtual && !svc('relay-summarize').virtual, 'catalog shape')
  const group = catalog.payoutGroups.find((g: Json) => g.serviceIds.includes('relay-summarize'))
  check(group.serviceIds.length === 2, 'relay services must share one payout group')
  const scrapeRecipient = svc('atlas-scrape').recipient as Address

  // 2. two agents, authorized by the root
  const agents: { name: string; keyId: Address }[] = []
  for (const name of ['researcher-a', 'researcher-b']) {
    const created = await api('POST', `/api/teams/${root.address}/agents`, { name, budget: '1.00', periodSeconds: 86400, serviceIds: ALL })
    const a = created.authorize
    check(a.scopes[0].recipients.length === 4, 'one scope with 4 distinct recipients expected (3 virtual + 1 shared)')
    check(created.privateKey === undefined && JSON.stringify(created).indexOf('privateKey') < 0, 'API response leaked key material')
    const tx = await Actions.accessKey.authorize(client, {
      accessKey: a.accessKey,
      expiry: a.expiry,
      limits: a.limits.map((l: Json) => ({ token: l.token, limit: BigInt(l.limit), period: l.period })),
      scopes: a.scopes,
    })
    const rx = await client.waitForTransactionReceipt({ hash: tx })
    check(rx.status === 'success', `authorize for ${name} reverted`)
    const confirmed = await api('POST', `/api/agents/${created.keyId}/confirm`, { tx })
    check(confirmed.status === 'active', `${name} not active after confirm`)
    hashes['authorize']!.push(tx)
    agents.push({ name, keyId: created.keyId })
  }
  const team = await api('GET', `/api/teams/${root.address}`)
  check(team.agents.length === 2 && team.agents.every((a: Json) => a.status === 'active' && a.scopes && BigInt(a.remaining) > 0n), 'team view must show 2 active agents with chain-read scopes and remaining')
  check(team.agents.every((a: Json) => JSON.stringify(a).indexOf('private') < 0), 'team view leaked key material')
  log(`agents active: ${agents.map((a) => `${a.name} ${a.keyId}`).join(', ')}`)
  const wrongAuthorize = await api('POST', `/api/agents/${agents[0]!.keyId}/confirm`, { tx: `0x${'ab'.repeat(32)}` }, 200)
  check(wrongAuthorize.status === 'active', 'confirm on an active agent is idempotent')

  // 3. research task by agent A, one failing scrape and one healthy scrape by agent B
  const merchantBefore = await ousd(ATLAS_MASTER)
  const run = await api('POST', `/api/agents/${agents[0]!.keyId}/run`, { topic: 'rust' })
  check(run.records.length >= 2, `research produced ${run.records.length} records, errors: ${JSON.stringify(run.errors)}`)
  const delivered = run.records.filter((r: Json) => r.outcome === 'delivered')
  check(delivered.length >= 1 && run.records[0].serviceId === 'atlas-search' && run.records[0].outcome === 'delivered', 'the search call must be delivered')
  const failing = await api('POST', `/api/agents/${agents[0]!.keyId}/call`, { serviceId: 'atlas-scrape', input: { url: 'https://nonexistent.invalid/page' } })
  check(failing.record.outcome === 'paid_not_delivered' && failing.record.status === 502 && failing.record.settlement?.status === 'success', 'a scrape of a dead host must be paid and not delivered (502)')
  const healthy = await api('POST', `/api/agents/${agents[1]!.keyId}/call`, { serviceId: 'atlas-scrape', input: { url: 'https://example.com' } })
  check(healthy.record.outcome === 'delivered' && JSON.parse(healthy.body).title.length > 0, 'scrape of example.com must deliver a title')

  // every settlement in the ledger reads back on chain with the payment the record claims
  const ledger = (await api('GET', `/api/teams/${root.address}/ledger?limit=200`)).records as Json[]
  const settled = ledger.filter((r) => r.settlement)
  check(settled.length >= 4, `ledger holds ${settled.length} settled records`)
  let atlasPaid = 0n
  for (const r of settled) {
    const rx = await client.getTransactionReceipt({ hash: r.settlement.tx as Hash })
    check(rx.status === 'success', `settlement ${r.settlement.tx} did not succeed on chain`)
    const t = parseEventLogs({ abi: Abis.tip20, logs: rx.logs, eventName: 'TransferWithMemo' }).find((e) => e.args.memo === r.memo)
    check(t && t.args.to.toLowerCase() === r.recipient.toLowerCase() && String(t.args.amount) === r.amount && t.args.from.toLowerCase() === root.address.toLowerCase(), `settlement ${r.settlement.tx} does not carry the recorded payment`)
    if (r.vendorId === 'atlas') atlasPaid += BigInt(r.amount)
    hashes['settlements']!.push(r.settlement.tx)
  }
  const merchantAfter = await ousd(ATLAS_MASTER)
  check(merchantAfter - merchantBefore >= atlasPaid && atlasPaid > 0n, `Atlas master credited ${merchantAfter - merchantBefore}, expected at least ${atlasPaid}`)
  const spentOusd = startOusd - (await ousd(root.address))
  check(spentOusd >= settled.reduce((s, r) => s + BigInt(r.amount), 0n), 'team OUSD fell by less than the settled payments')
  log(`ledger: ${ledger.length} records, ${settled.length} settled and read back on chain; Atlas master credited ${merchantAfter - merchantBefore} units; team spent ${spentOusd} units`)

  const before = (await api('GET', `/api/teams/${root.address}/vendors`)).services as Json[]
  const scrapeBefore = before.find((s) => s.serviceId === 'atlas-scrape')!
  check(scrapeBefore.paidNotDelivered >= 1 && scrapeBefore.delivered >= 1 && scrapeBefore.cut === null, 'vendors view must show scrape paid, delivered and paid-but-failed, not cut')
  check(before.find((s) => s.serviceId === 'relay-summarize')!.siblings.join() === 'relay-keywords', 'relay services must list each other as siblings')

  // 4. cut the scrape service: one transaction for both keys
  const cut = await api('POST', `/api/teams/${root.address}/cutoffs`, { recipient: scrapeRecipient })
  check(cut.calls.length === 2 && cut.rescoped.length === 2 && cut.revoked.length === 0 && cut.unbounded.length === 0, `cut plan: ${JSON.stringify({ calls: cut.calls.length, rescoped: cut.rescoped.length, revoked: cut.revoked.length })}`)
  check(cut.servicesCut.join() === 'atlas-scrape', 'cutting the scrape recipient must cut scrape and nothing else')
  const blockedCall = await api('POST', `/api/agents/${agents[0]!.keyId}/call`, { serviceId: 'atlas-scrape', input: { url: 'https://example.com' } })
  check(blockedCall.record.outcome === 'refused' && blockedCall.record.refused === 'LeashBlocked' && blockedCall.record.settlement === null, 'before the cut lands, the local block list must refuse the call')
  refusals.push(`${agents[0]!.name} scrape before confirm: ${blockedCall.record.refused}`)
  const pendingView = (await api('GET', `/api/teams/${root.address}/vendors`)).services.find((s: Json) => s.serviceId === 'atlas-scrape')
  check(pendingView.blocked === true && pendingView.cut?.status === 'prepared', 'vendors view must show the prepared cut and the local block')

  const cutTx = SKIP_CUT
    ? await client.sendTransaction({ calls: [{ to: Addresses.accountKeychain, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'getAllowedCalls', args: [root.address, agents[0]!.keyId] }) }] })
    : await client.sendTransaction({ calls: cut.calls })
  const cutRx = await client.waitForTransactionReceipt({ hash: cutTx })
  check(cutRx.status === 'success', 'cut transaction reverted')
  log(`cut transaction ${cutTx}${SKIP_CUT ? ' (SKIPPED: harmless transaction instead)' : ''}`)
  const confirmedCut = await api('POST', `/api/cutoffs/${cut.id}/confirm`, { tx: cutTx })
  check(confirmedCut.status === 'confirmed' && BigInt(confirmedCut.gasUsed) > 0n, 'cut not confirmed')
  hashes['cutoff']!.push(cutTx)

  // read the scopes back straight from the chain, not through the API
  for (const a of agents) {
    const [isScoped, scopes] = await client.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'getAllowedCalls', args: [root.address, a.keyId] })
    const recipients = scopes.flatMap((s) => s.selectorRules.flatMap((r) => r.recipients.map((x) => x.toLowerCase())))
    check(isScoped && !recipients.includes(scrapeRecipient.toLowerCase()) && recipients.includes(svc('atlas-search').recipient.toLowerCase()), `${a.name}: chain scopes after the cut`)
  }

  // 5. refused by the chain, other services still paid
  for (const a of agents) {
    const refused = await api('POST', `/api/agents/${a.keyId}/call`, { serviceId: 'atlas-scrape', input: { url: 'https://example.com' } })
    check(refused.record.outcome === 'refused' && refused.record.refused === 'CallNotAllowed' && refused.record.settlement === null, `${a.name}: scrape after the cut must be refused CallNotAllowed, got ${refused.record.outcome}/${refused.record.refused}`)
    refusals.push(`${a.name} scrape after cut: ${refused.record.refused}`)
    const search = await api('POST', `/api/agents/${a.keyId}/call`, { serviceId: 'atlas-search', input: { q: 'tempo' } })
    check(search.record.outcome === 'delivered' && search.record.settlement?.status === 'success', `${a.name}: search must still be paid and delivered`)
    hashes['settlements']!.push(search.record.settlement.tx)
  }
  const summarize = await api('POST', `/api/agents/${agents[1]!.keyId}/call`, { serviceId: 'relay-summarize', input: { text: 'Leash cuts a vendor in one transaction. The chain refuses the next payment to that vendor. Other vendors keep getting paid.' } })
  check(summarize.record.outcome === 'delivered', 'relay-summarize must still be delivered after the scrape cut')
  hashes['settlements']!.push(summarize.record.settlement.tx)

  const after = (await api('GET', `/api/teams/${root.address}/vendors`)).services as Json[]
  const scrapeAfter = after.find((s) => s.serviceId === 'atlas-scrape')!
  check(scrapeAfter.cut?.status === 'confirmed' && scrapeAfter.cut.tx === cutTx && scrapeAfter.blocked === false, 'vendors view must show the confirmed cut and no local block')
  check(scrapeAfter.refused === 3 && after.find((s) => s.serviceId === 'atlas-search')!.cut === null, 'refusals counted on scrape only')
  const stats = await api('GET', '/api/stats')
  check(stats.cutoffsConfirmed >= 1 && stats.refused >= 3 && stats.paidCalls >= 8, 'stats must reflect the run')

  log('\nauthorize txs:\n  ' + hashes['authorize']!.join('\n  '))
  log('settlement txs:\n  ' + [...new Set(hashes['settlements']!)].join('\n  '))
  log('cutoff tx:\n  ' + hashes['cutoff']!.join('\n  '))
  log('refused calls (no transaction, the chain or the block list said no):\n  ' + refusals.join('\n  '))
  log('\nE2E PASS')
}

main().catch((e) => {
  console.error(`\nE2E FAIL: ${e instanceof Failure ? e.message : ((e as { shortMessage?: string }).shortMessage ?? (e as Error).message)}`)
  process.exit(1)
})
