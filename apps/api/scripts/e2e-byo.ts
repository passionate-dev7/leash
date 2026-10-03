/**
 * Bring your own agent, end to end. A separate process (the leash-agent CLI) holds the agent key; the
 * desk API holds none. The team root is a throwaway secp256k1 key generated here: it plays the
 * browser's passkey and signs the authorization.
 *
 *   pnpm --filter @leash/api start        (in another shell)
 *   pnpm --filter @leash/api e2e:byo
 *
 * Flow: init (CLI) -> register the key id as an external agent -> authorize it on chain -> pay the
 * scrape route with a url the vendor refuses (paid, 422) and with a good url (delivered) -> both
 * records accepted and visible in the vendor roll-up -> forged and replayed records rejected.
 */
import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createClient, http, parseAbi, parseEventLogs, publicActions, walletActions } from 'viem'
import type { Address, Hash, Hex } from 'viem'
import { tempoModerato } from 'viem/chains'
import { generatePrivateKey } from 'viem/accounts'
import { Abis, Account, Actions } from 'viem/tempo'
import { signRecord } from '@leash/sdk'
import { signDeskRequest } from '@leash/policy'
import type { DeskSigner } from '@leash/policy'

const run = promisify(execFile)
const API = (process.env['LEASH_API_URL'] ?? 'http://127.0.0.1:4180').replace(/\/+$/, '')
const CLI = fileURLToPath(new URL('../../../packages/sdk/bin/leash-agent.mjs', import.meta.url))
const OUSD = '0x20c0000000000000000000006a37DA5C996874BE' as const
const PATH_USD = '0x20c0000000000000000000000000000000000000' as const

type Json = Record<string, any>
class Failure extends Error {}
function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Failure(message)
}
const log = (...a: unknown[]) => console.log(...a)

/** Team writes carry the root's signature, the way the browser sends them. The faucet and agent-signed records take none. */
const signsWrite = (method: string, path: string) => method === 'POST' && !path.startsWith('/api/faucet') && !path.endsWith('/records')

async function api(method: 'GET' | 'POST', path: string, body?: unknown, expect: number | number[] = 200, signer: DeskSigner | null = root as unknown as DeskSigner): Promise<Json> {
  const auth = signer && signsWrite(method, path) ? await signDeskRequest(signer, { method, path, chainId: 42431, body: body ?? {} }) : {}
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? auth : { 'content-type': 'application/json', ...auth },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  })
  const json = (await res.json()) as Json
  const ok = Array.isArray(expect) ? expect.includes(res.status) : res.status === expect
  check(ok, `${method} ${path} answered ${res.status} (wanted ${expect}): ${JSON.stringify(json).slice(0, 300)}`)
  return { ...json, __status: res.status }
}

async function cli(cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await run('node', [CLI, ...args], { cwd, timeout: 180_000, env: { ...process.env, LEASH_API_URL: API } })
  return { stdout, stderr }
}

const root = Account.fromSecp256k1(generatePrivateKey())
const client = createClient({ account: root, chain: tempoModerato.extend({ feeToken: PATH_USD }), transport: http() }).extend(publicActions).extend(walletActions)

async function main() {
  const health = await api('GET', '/api/health')
  check(health.ok && health.chainId === 42431, 'API is not reading Moderato')
  log(`api ${API}  chain ${health.chainId}  block ${health.block}`)
  log(`throwaway team root ${root.address}`)

  await api('POST', '/api/teams', { account: root.address, label: 'byo e2e team', signer: 'webcrypto' })
  // a stranger, with or without a key of their own, changes nothing about this team
  const intruder = { name: 'intruder', budget: '1.00', periodSeconds: 86400, serviceIds: ['atlas-scrape'], external: true, keyId: Account.fromSecp256k1(generatePrivateKey()).address }
  const bare = await api('POST', `/api/teams/${root.address}/agents`, intruder, 401, null)
  const foreign = await api('POST', `/api/teams/${root.address}/agents`, intruder, 401, Account.fromSecp256k1(generatePrivateKey()) as unknown as DeskSigner)
  const renamed = await api('POST', '/api/teams', { account: root.address, label: 'pwned', signer: 'webcrypto' }, 401, null)
  check(bare.error === 'unauthorized' && foreign.error === 'unauthorized' && renamed.error === 'unauthorized', 'an unsigned or foreign write must be unauthorized')
  check((await api('GET', `/api/teams/${root.address}`)).agents.length === 0, 'a refused write must register nothing')
  log('stranger writes refused: unsigned add 401, foreign-key add 401, unsigned rename 401')
  const funded = await api('POST', '/api/faucet', { address: root.address })
  check(BigInt(funded.ousd) > 0n && BigInt(funded.pathusd) > 0n, 'faucet did not credit OUSD and PathUSD')
  const catalog = await api('GET', '/api/catalog')
  const scrape = catalog.services.find((s: Json) => s.serviceId === 'atlas-scrape')
  check(scrape, 'catalog has no atlas-scrape')

  // 1. the agent process makes its own key. The desk never sees it.
  const dir = mkdtempSync(join(tmpdir(), 'leash-byo-'))
  try {
    const init = await cli(dir, 'init', '--json')
    const made = JSON.parse(init.stdout) as { keyId: Address; keyFile: string }
    const keyFile = join(dir, made.keyFile)
    check(/^0x[0-9a-fA-F]{40}$/.test(made.keyId), 'init must print a key id')
    check((statSync(keyFile).mode & 0o777) === 0o600, 'the key file must be mode 600')
    const agentKey = (JSON.parse(readFileSync(keyFile, 'utf8')) as { privateKey: Hex }).privateKey
    check(!init.stdout.includes(agentKey) && !init.stderr.includes(agentKey), 'init printed the private key')
    chmodSync(keyFile, 0o600)
    log(`agent process key id ${made.keyId} (key file mode 600, key not printed)`)
    const second = await cli(dir, 'init').then(() => null, (e: { stderr?: string }) => e.stderr ?? 'failed')
    check(second !== null && /already exists/.test(second), 'init must refuse to overwrite a key')

    // 2. the desk registers the key id and the team root authorizes it
    const created = await api('POST', `/api/teams/${root.address}/agents`, { name: 'outside-researcher', budget: '1.00', periodSeconds: 86400, serviceIds: ['atlas-scrape', 'atlas-search'], external: true, keyId: made.keyId })
    check(created.keyId === made.keyId && JSON.stringify(created).indexOf(agentKey) < 0, 'the desk must answer with the key id and no key material')
    const a = created.authorize
    const authorizeTx = await Actions.accessKey.authorize(client, {
      accessKey: a.accessKey,
      expiry: a.expiry,
      limits: a.limits.map((l: Json) => ({ token: l.token, limit: BigInt(l.limit), period: l.period })),
      scopes: a.scopes,
    })
    check((await client.waitForTransactionReceipt({ hash: authorizeTx })).status === 'success', 'authorize reverted')
    check((await api('POST', `/api/agents/${made.keyId}/confirm`, { tx: authorizeTx })).status === 'active', 'agent not active after confirm')
    const team = await api('GET', `/api/teams/${root.address}`)
    const listed = team.agents.find((x: Json) => x.keyId === made.keyId)
    check(listed.external === true && listed.status === 'active' && BigInt(listed.remaining) > 0n, 'team view must show the external agent active with a chain-read limit')
    await api('POST', `/api/agents/${made.keyId}/run`, { topic: 'rust' }, 409)
    await api('POST', `/api/agents/${made.keyId}/call`, { serviceId: 'atlas-search', input: { q: 'rust' } }, 409)
    log(`external agent authorized: ${authorizeTx}; desk /run and /call refuse it (409)`)

    // 3. the agent process pays. A url the vendor refuses after charging, then a good one.
    const pay = async (url: string) => {
      const out = await cli(dir, 'pay', scrape.url, '--method', 'POST', '--data', JSON.stringify({ url }), '--team', root.address, '--json')
      check(!out.stdout.includes(agentKey) && !out.stderr.includes(agentKey), 'pay printed the private key')
      return JSON.parse(out.stdout) as Json
    }
    const bad = await pay('http://example.com/not-https')
    check(bad.record.outcome === 'paid_not_delivered' && bad.status === 422 && bad.record.settlement?.status === 'success', `bad url: ${bad.record.outcome} ${bad.status}`)
    check(bad.desk.accepted === true, `desk did not take the bad-url record: ${JSON.stringify(bad.desk)}`)
    const good = await pay('https://example.com')
    check(good.record.outcome === 'delivered' && good.status === 200 && good.record.settlement?.status === 'success', `good url: ${good.record.outcome} ${good.status}`)
    check(good.desk.accepted === true && JSON.parse(good.body).title.length > 0, `desk did not take the good-url record: ${JSON.stringify(good.desk)}`)
    const txs: Hash[] = [bad.record.settlement.tx, good.record.settlement.tx]
    log(`paid 422 settlement ${txs[0]} (desk seq ${bad.desk.seq})`)
    log(`delivered settlement ${txs[1]} (desk seq ${good.desk.seq})`)

    // the desk's ledger and the chain agree with the process that paid
    const ledger = (await api('GET', `/api/teams/${root.address}/ledger?limit=50`)).records as Json[]
    check(ledger.length === 2 && ledger.every((r) => r.source === 'external' && r.agentName === 'outside-researcher' && r.serviceId === 'atlas-scrape'), `ledger: ${JSON.stringify(ledger.map((r) => [r.serviceId, r.source, r.outcome]))}`)
    for (const r of ledger) {
      const rx = await client.getTransactionReceipt({ hash: r.settlement.tx as Hash })
      const t = parseEventLogs({ abi: Abis.tip20, logs: rx.logs, eventName: 'TransferWithMemo' }).find((e) => e.args.memo === r.memo)
      check(rx.status === 'success' && t && t.args.to.toLowerCase() === scrape.recipient.toLowerCase() && String(t.args.amount) === r.amount && t.args.from.toLowerCase() === root.address.toLowerCase(), `settlement ${r.settlement.tx} does not carry the recorded payment`)
      check(r.settlement.keySpend.length === 1 && r.settlement.keySpend[0] === r.amount, `settlement ${r.settlement.tx} keySpend ${JSON.stringify(r.settlement.keySpend)}`)
    }
    const row = (await api('GET', `/api/teams/${root.address}/vendors`)).services.find((s: Json) => s.serviceId === 'atlas-scrape')
    check(row.paid === 2 && row.delivered === 1 && row.paidNotDelivered === 1, `vendors roll-up for scrape: ${JSON.stringify({ paid: row.paid, delivered: row.delivered, failed: row.paidNotDelivered })}`)
    log(`vendors: atlas-scrape paid ${row.paid}, delivered ${row.delivered}, paid-but-failed ${row.paidNotDelivered}, spent ${row.spent}`)

    // 4. rejected: a forged signature, a replayed settlement, and a settlement that is not the payment
    const fresh = (over: Json): Json => ({ ...good.record, id: `forged-${Math.random().toString(36).slice(2, 10)}`, ...over })
    const forgerKey = generatePrivateKey()
    const forged = fresh({ requestHash: `0x${'11'.repeat(32)}` })
    const rForged = await api('POST', `/api/agents/${made.keyId}/records`, { record: forged, signature: await signRecord(forgerKey, forged) }, [401])
    check(rForged.error === 'bad_signature', 'forged signature must be bad_signature')
    const replay = fresh({})
    const rReplay = await api('POST', `/api/agents/${made.keyId}/records`, { record: replay, signature: await signRecord(agentKey, replay) }, [409])
    check(rReplay.error === 'duplicate_record', 'a replayed settlement must be a duplicate')
    const notAPayment = fresh({ settlement: { ...good.record.settlement, tx: authorizeTx, keySpend: [] } })
    const rNot = await api('POST', `/api/agents/${made.keyId}/records`, { record: notAPayment, signature: await signRecord(agentKey, notAPayment) }, [422])
    check(rNot.error === 'settlement_not_confirmed', 'a tx that holds no such payment must be settlement_not_confirmed')
    const inflated = fresh({ amount: '999999', settlement: { ...good.record.settlement, tx: authorizeTx } })
    const rInflated = await api('POST', `/api/agents/${made.keyId}/records`, { record: inflated, signature: await signRecord(agentKey, inflated) }, [422])
    check(rInflated.error === 'settlement_not_confirmed', 'an inflated amount must be settlement_not_confirmed')
    check((await api('GET', `/api/teams/${root.address}/ledger?limit=50`)).records.length === 2, 'rejected records must write nothing')
    log(`rejected: forged signature ${rForged.__status} ${rForged.error}; replayed settlement ${rReplay.__status} ${rReplay.error}; settlement that is not the payment ${rNot.__status}; inflated amount ${rInflated.__status}`)

    // 5. the outcome counts in stats like any other
    const stats = await api('GET', '/api/stats')
    check(stats.paidCalls >= 2, 'stats must count the external payments')

    log('\nauthorize tx:\n  ' + authorizeTx)
    log('settlement txs:\n  ' + txs.join('\n  '))
    log('\nE2E BYO PASS')
  } finally {
    rmSync(dir, { recursive: true })
  }
}

main().catch((e) => {
  console.error(`\nE2E BYO FAIL: ${e instanceof Failure ? e.message : ((e as { shortMessage?: string; stderr?: string }).stderr ?? (e as { shortMessage?: string }).shortMessage ?? (e as Error).message)}`)
  process.exit(1)
})
