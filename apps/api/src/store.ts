import type { Address, Hex } from 'viem'
import type { DeliveryRecord, NetworkName, Outcome } from '@leash/sdk'
import type { Db } from './db.js'
import type { Cipher } from './keystore.js'

export type TeamRow = { account: Address; label: string; signer: 'passkey' | 'webcrypto'; created_at: string; network: NetworkName }
export type AgentStatus = 'pending' | 'active' | 'revoked'
export type AgentRow = {
  key_id: Address
  account: Address
  name: string
  private_key: Hex
  budget: string
  period: number
  token: Address
  service_ids: string
  expiry: number
  authorize_tx: Hex | null
  status: AgentStatus
  created_at: string
  /** 1 when the agent runs outside the desk: the desk never held its key. */
  external: number
}
export type RecordSource = 'runner' | 'external'
export type CutReason = 'failures' | 'manual'
export type CutoffStatus = 'prepared' | 'confirmed' | 'failed'
export type CutoffRow = {
  id: number
  account: Address
  recipient: Address
  service_ids: string
  tx: Hex | null
  status: CutoffStatus
  gas_used: string | null
  rescoped: string
  revoked: string
  unbounded: string
  unchanged: string
  failure: string | null
  created_at: string
  confirmed_at: string | null
  reason: CutReason
  evidence: string | null
}

export type LedgerRecord = DeliveryRecord & {
  seq: number
  agentName: string
  vendorId: string
  serviceId: string
  source: RecordSource
}

/** How long a pending agent waits for its authorization before it stops counting and is dropped. */
export const PENDING_TTL_MS = 60 * 60_000

const now = () => new Date().toISOString()
const rows = <T>(v: unknown[]): T[] => v as T[]

export function createStore(db: Db, cipher: Cipher) {
  const q = {
    upsertTeam: db.prepare(
      'insert into team(account, label, signer, created_at, network) values (?, ?, ?, ?, ?) on conflict(account) do update set label = excluded.label',
    ),
    team: db.prepare('select * from team where account = ?'),
    insertAgent: db.prepare(
      'insert into agent(key_id, account, name, private_key, budget, period, token, service_ids, expiry, status, created_at, external) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    agent: db.prepare('select * from agent where key_id = ?'),
    agents: db.prepare('select * from agent where account = ? order by created_at, key_id'),
    plainAgents: db.prepare("select key_id, private_key from agent where external = 0 and private_key not like 'enc1:%'"),
    setKey: db.prepare('update agent set private_key = ? where key_id = ?'),
    mostRecords: db.prepare("select r.account from record r join team t on t.account = r.account where ? = 1 or t.network = 'moderato' group by r.account order by count(*) desc, min(r.seq) limit 1"),
    // A pending agent holds a slot only while its authorization can still arrive.
    countOpenAgents: db.prepare("select count(*) as n from agent where account = ? and (status = 'active' or (status = 'pending' and created_at >= ?))"),
    purgePending: db.prepare("delete from agent where account = ? and status = 'pending' and created_at < ?"),
    claimDesk: db.prepare('insert or ignore into desk_seen(digest, expires_at) values (?, ?)'),
    pruneDesk: db.prepare('delete from desk_seen where expires_at < ?'),
    setAgent: db.prepare('update agent set status = ?, authorize_tx = coalesce(?, authorize_tx) where key_id = ?'),
    insertRecord: db.prepare(
      `insert into record(id, account, agent_key_id, agent_name, vendor_id, service_id, url, method, request_hash, realm, recipient, amount, currency, memo, status, refused,
        settlement_tx, settlement_block, settlement_status, key_spend, outcome, started_at, finished_at, source)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    recordBySettlement: db.prepare('select seq from record where settlement_tx = ?'),
    recordByKeyAndId: db.prepare('select seq from record where agent_key_id = ? and id = ?'),
    ledger: db.prepare('select * from record where account = ? order by seq desc limit ?'),
    ledgerAll: db.prepare('select * from record where account = ? order by seq'),
    insertCutoff: db.prepare(
      'insert into cutoff(account, recipient, service_ids, status, rescoped, revoked, unbounded, unchanged, created_at, reason, evidence) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    cutoff: db.prepare('select * from cutoff where id = ?'),
    cutoffs: db.prepare('select * from cutoff where account = ? order by id desc'),
    finishCutoff: db.prepare('update cutoff set status = ?, tx = ?, gas_used = ?, failure = ?, confirmed_at = ? where id = ?'),
    blocks: db.prepare("select recipient from cutoff where account = ? and status = 'confirmed' and tx is not null"),
    faucetAt: db.prepare('select at from faucet where address = ?'),
    setFaucet: db.prepare('insert into faucet(address, at) values (?, ?) on conflict(address) do update set at = excluded.at'),
    faucetGlobal: db.prepare('select count(*) as n from faucet_global where at > ?'),
    addFaucetGlobal: db.prepare('insert into faucet_global(at) values (?)'),
    stats: db.prepare(
      `select
         (select count(*) from record where outcome in ('delivered', 'paid_not_delivered')) as paidCalls,
         (select count(*) from record where outcome = 'delivered') as delivered,
         (select count(*) from record where outcome = 'paid_not_delivered') as paidNotDelivered,
         (select count(*) from record where outcome = 'refused') as refused,
         (select count(*) from team) as teams,
         (select count(*) from agent where status = 'active') as activeAgents,
         (select count(*) from cutoff where status = 'confirmed' and tx is not null) as cutoffsConfirmed,
         (select min(started_at) from record) as firstRecordAt`,
    ),
  }

  const toRecord = (r: Record<string, unknown>): LedgerRecord => ({
    seq: Number(r['seq']),
    id: r['id'] as string,
    url: r['url'] as string,
    method: r['method'] as string,
    requestHash: r['request_hash'] as Hex,
    realm: (r['realm'] as string | null) ?? null,
    keyId: r['agent_key_id'] as Address,
    account: r['account'] as Address,
    recipient: (r['recipient'] as Address | null) ?? null,
    amount: (r['amount'] as string | null) ?? null,
    currency: (r['currency'] as Address | null) ?? null,
    memo: (r['memo'] as Hex | null) ?? null,
    status: r['status'] === null ? null : Number(r['status']),
    refused: (r['refused'] as string | null) ?? null,
    settlement: r['settlement_tx']
      ? {
          tx: r['settlement_tx'] as Hex,
          block: Number(r['settlement_block']),
          status: r['settlement_status'] as 'success' | 'reverted',
          keySpend: JSON.parse((r['key_spend'] as string | null) ?? '[]') as string[],
        }
      : null,
    outcome: r['outcome'] as Outcome,
    startedAt: r['started_at'] as string,
    finishedAt: r['finished_at'] as string,
    agentName: r['agent_name'] as string,
    vendorId: r['vendor_id'] as string,
    serviceId: r['service_id'] as string,
    source: r['source'] as RecordSource,
  })

  return {
    /** A team's network is fixed when it is created: the upsert never changes it. */
    upsertTeam(account: Address, label: string, signer: TeamRow['signer'], network: NetworkName = 'moderato') {
      q.upsertTeam.run(account, label, signer, now(), network)
    },
    team: (account: Address) => q.team.get(account) as TeamRow | undefined,

    /** `privateKey` is null for an agent that runs outside the desk: the desk never holds that key. */
    insertAgent(a: { keyId: Address; account: Address; name: string; privateKey: Hex | null; budget: string; period: number; token: Address; serviceIds: string[]; expiry: number }) {
      q.insertAgent.run(a.keyId, a.account, a.name, a.privateKey === null ? '' : cipher.seal(a.privateKey, a.keyId), a.budget, a.period, a.token, JSON.stringify(a.serviceIds), a.expiry, 'pending', now(), a.privateKey === null ? 1 : 0)
    },
    agent: (keyId: Address) => q.agent.get(keyId) as AgentRow | undefined,
    /** The agent's signing key, opened. Throws when the stored value fails authentication. */
    agentKey(agent: AgentRow): Hex {
      if (agent.external === 1) throw new Error(`agent ${agent.key_id} runs outside the desk: the desk holds no key for it`)
      return cipher.open(agent.private_key, agent.key_id) as Hex
    },
    /** Seals every key still stored in the clear. Returns how many it rewrote. */
    sealPlaintextKeys(): number {
      const open = rows<{ key_id: string; private_key: string }>(q.plainAgents.all())
      for (const r of open) q.setKey.run(cipher.seal(r.private_key, r.key_id), r.key_id)
      // An update leaves the old cell in the page; rebuilding the file and truncating the log drops the clear text.
      if (open.length > 0) {
        db.exec('vacuum')
        db.exec('pragma wal_checkpoint(truncate)')
      }
      return open.length
    },
    /** The team with the most ledger records, or undefined on an empty ledger. Mainnet teams count only when the desk runs them. */
    busiestTeam: (includeMainnet = true) => (q.mostRecords.get(includeMainnet ? 1 : 0) as { account: Address } | undefined)?.account,
    agents: (account: Address) => rows<AgentRow>(q.agents.all(account)),
    openAgentCount: (account: Address) => Number((q.countOpenAgents.get(account, new Date(Date.now() - PENDING_TTL_MS).toISOString()) as { n: number }).n),
    /** Drops the team's pending agents whose authorization window passed. Returns how many it removed. */
    purgePendingAgents: (account: Address): number => Number(q.purgePending.run(account, new Date(Date.now() - PENDING_TTL_MS).toISOString()).changes),
    /** Claims a signed request's digest. False when it was claimed before: a replay. */
    claimDeskDigest(digest: string, expiresAtMs: number): boolean {
      q.pruneDesk.run(Date.now())
      return Number(q.claimDesk.run(digest, expiresAtMs).changes) === 1
    },
    setAgentStatus(keyId: Address, status: AgentStatus, authorizeTx: Hex | null = null) {
      q.setAgent.run(status, authorizeTx, keyId)
    },

    /** Returns the ledger sequence number of the new row. */
    insertRecord(record: DeliveryRecord, ctx: { agentName: string; vendorId: string; serviceId: string }, source: RecordSource = 'runner'): number {
      const s = record.settlement
      const r = q.insertRecord.run(
        record.id, record.account, record.keyId, ctx.agentName, ctx.vendorId, ctx.serviceId, record.url, record.method, record.requestHash, record.realm,
        record.recipient, record.amount, record.currency, record.memo, record.status, record.refused,
        s?.tx ?? null, s?.block ?? null, s?.status ?? null, s ? JSON.stringify(s.keySpend) : null, record.outcome, record.startedAt, record.finishedAt, source,
      )
      return Number(r.lastInsertRowid)
    },
    hasSettlement: (tx: string) => q.recordBySettlement.get(tx.toLowerCase()) !== undefined,
    hasRecord: (keyId: Address, id: string) => q.recordByKeyAndId.get(keyId, id) !== undefined,
    ledger: (account: Address, limit: number) => rows<Record<string, unknown>>(q.ledger.all(account, limit)).map(toRecord),
    allRecords: (account: Address) => rows<Record<string, unknown>>(q.ledgerAll.all(account)).map(toRecord),

    insertCutoff(c: {
      account: Address
      recipient: Address
      serviceIds: string[]
      status: CutoffStatus
      rescoped: Address[]
      revoked: Address[]
      unbounded: Address[]
      unchanged: Address[]
      reason: CutReason
      evidence: unknown
    }) {
      const r = q.insertCutoff.run(
        c.account, c.recipient, JSON.stringify(c.serviceIds), c.status, JSON.stringify(c.rescoped), JSON.stringify(c.revoked), JSON.stringify(c.unbounded), JSON.stringify(c.unchanged), now(), c.reason, JSON.stringify(c.evidence),
      )
      return Number(r.lastInsertRowid)
    },
    cutoff: (id: number) => q.cutoff.get(id) as CutoffRow | undefined,
    cutoffs: (account: Address) => rows<CutoffRow>(q.cutoffs.all(account)),
    finishCutoff(id: number, status: CutoffStatus, tx: Hex | null, gasUsed: bigint | null, failure: string | null) {
      q.finishCutoff.run(status, tx, gasUsed === null ? null : String(gasUsed), failure, status === 'confirmed' ? now() : null, id)
    },

    /** Recipients this team cut on chain: a cut counts once its transaction confirmed. A prepared cut blocks nothing. */
    blocked: (account: Address): ReadonlySet<string> => new Set(rows<{ recipient: string }>(q.blocks.all(account)).map((r) => r.recipient.toLowerCase())),

    /** Claims a faucet slot. Returns false when the address was funded inside `windowMs`. */
    claimFaucet(address: Address, windowMs: number, globalLimit: number): 'ok' | 'address' | 'global' {
      const t = Date.now()
      const last = q.faucetAt.get(address.toLowerCase()) as { at: number } | undefined
      if (last && t - last.at < windowMs) return 'address'
      if (Number((q.faucetGlobal.get(t - 3_600_000) as { n: number }).n) >= globalLimit) return 'global'
      q.setFaucet.run(address.toLowerCase(), t)
      q.addFaucetGlobal.run(t)
      return 'ok'
    },
    releaseFaucet: (address: Address) => void db.prepare('delete from faucet where address = ?').run(address.toLowerCase()),

    stats: () => q.stats.get() as Record<string, number | string | null>,
  }
}

export type Store = ReturnType<typeof createStore>
