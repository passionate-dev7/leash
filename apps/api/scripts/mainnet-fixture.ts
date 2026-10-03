/**
 * Finds a real MPP settlement on Tempo mainnet (chain 4217) that an access key paid, and saves its
 * receipt logs as the fixture test/fixtures/mainnet-settlement.json. Read only: one bounded getLogs
 * for AccessKeySpend near the tip, then getTransactionReceipt. Run: pnpm --filter @leash/api exec tsx scripts/mainnet-fixture.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createPublicClient, http, keccak256, parseEventLogs, toHex } from 'viem'
import type { Address, Hex } from 'viem'
import { tempo } from 'viem/chains'
import { Abis, Addresses } from 'viem/tempo'
import { NETWORKS } from '@leash/sdk'

const WINDOW = Number(process.env['WINDOW'] ?? 3_000)
const client = createPublicClient({ chain: tempo, transport: http(NETWORKS.mainnet.rpcUrl, { retryCount: 3 }) })
const usdce = NETWORKS.mainnet.settlementToken
const MPP_TAG = keccak256(toHex('mpp')).slice(0, 10)
const spendEvent = Abis.accountKeychain.find((x) => x.type === 'event' && x.name === 'AccessKeySpend')!

const head = await client.getBlockNumber()
const fromBlock = head - BigInt(WINDOW)
const logs = (await client.getLogs({ address: Addresses.accountKeychain, event: spendEvent as never, fromBlock, toBlock: head })) as unknown as { transactionHash: Hex | null }[]
console.log(`head ${head}, AccessKeySpend logs in ${fromBlock}..${head}: ${logs.length}`)

const seen = new Set<string>()
type Candidate = { tx: Hex; block: number; account: Address; key: Address; recipient: Address; amount: string; memo: Hex; spends: string[]; logs: { address: Address; topics: readonly Hex[]; data: Hex }[] }
const candidates: Candidate[] = []
for (const l of logs) {
  const hash = l.transactionHash!
  if (seen.has(hash)) continue
  seen.add(hash)
  const rx = await client.getTransactionReceipt({ hash })
  if (rx.status !== 'success') continue
  const transfers = parseEventLogs({ abi: Abis.tip20, logs: rx.logs.filter((x) => x.address.toLowerCase() === usdce.toLowerCase()) as never, eventName: 'TransferWithMemo' }) as unknown as { args: { from: Address; to: Address; amount: bigint; memo: Hex } }[]
  const spends = parseEventLogs({ abi: Abis.accountKeychain, logs: rx.logs as never, eventName: 'AccessKeySpend' }) as unknown as { args: { account: Address; publicKey: Address; token: Address; amount: bigint } }[]
  for (const t of transfers) {
    if (t.args.memo.slice(0, 10).toLowerCase() !== MPP_TAG.toLowerCase() || t.args.memo.slice(10, 12) !== '01') continue
    const mine = spends.filter((s) => s.args.account.toLowerCase() === t.args.from.toLowerCase() && s.args.token.toLowerCase() === usdce.toLowerCase())
    if (!mine.some((s) => s.args.amount === t.args.amount)) continue
    candidates.push({ tx: hash, block: Number(rx.blockNumber), account: t.args.from, key: mine.find((s) => s.args.amount === t.args.amount)!.args.publicKey, recipient: t.args.to, amount: String(t.args.amount), memo: t.args.memo, spends: mine.map((s) => String(s.args.amount)), logs: rx.logs.map((x) => ({ address: x.address, topics: x.topics, data: x.data })) })
  }
}
// One sponsored settlement (a single AccessKeySpend: the price) and one unsponsored (price and gas as separate spends).
const pick = [candidates.find((c) => c.spends.length === 1), candidates.find((c) => c.spends.length === 2)].filter((c): c is Candidate => c !== undefined)
if (pick.length < 2) throw new Error(`need a sponsored and an unsponsored settlement, found ${pick.length}; widen WINDOW`)
mkdirSync(new URL('../test/fixtures/', import.meta.url), { recursive: true })
const out = new URL('../test/fixtures/mainnet-settlement.json', import.meta.url)
writeFileSync(out, `${JSON.stringify({ chainId: 4217, rpc: NETWORKS.mainnet.rpcUrl, token: usdce, read: { method: 'eth_getLogs AccessKeySpend then eth_getTransactionReceipt', head: Number(head), fromBlock: Number(fromBlock) }, settlements: pick.map((c) => ({ tx: c.tx, block: c.block, claim: { account: c.account, keyId: c.key, recipient: c.recipient, amount: c.amount, memo: c.memo, currency: usdce }, logs: c.logs })) }, null, 2)}\n`)
console.log(`${candidates.length} candidates; wrote ${out.pathname}`)
for (const c of pick) console.log(c.tx, c.block, c.spends.join(','))
