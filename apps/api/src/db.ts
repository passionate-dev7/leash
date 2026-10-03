import { chmodSync, existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { ensureDataDir } from './config.js'

const SCHEMA = `
create table if not exists team (
  account text primary key,
  label text not null,
  signer text not null check (signer in ('passkey', 'webcrypto')),
  created_at text not null,
  network text not null default 'moderato' check (network in ('moderato', 'mainnet'))
);
create table if not exists agent (
  key_id text primary key,
  account text not null references team(account),
  name text not null,
  private_key text not null,
  budget text not null,
  period integer not null,
  token text not null,
  service_ids text not null,
  expiry integer not null,
  authorize_tx text,
  status text not null check (status in ('pending', 'active', 'revoked')),
  created_at text not null,
  external integer not null default 0
);
create index if not exists agent_account on agent(account);
create table if not exists record (
  seq integer primary key autoincrement,
  id text not null,
  account text not null,
  agent_key_id text not null,
  agent_name text not null,
  vendor_id text not null,
  service_id text not null,
  url text not null,
  method text not null,
  request_hash text not null,
  realm text,
  recipient text,
  amount text,
  currency text,
  memo text,
  status integer,
  refused text,
  settlement_tx text,
  settlement_block integer,
  settlement_status text,
  key_spend text,
  outcome text not null,
  started_at text not null,
  finished_at text not null,
  source text not null default 'runner' check (source in ('runner', 'external'))
);
create index if not exists record_account on record(account, seq);
create table if not exists cutoff (
  id integer primary key autoincrement,
  account text not null,
  recipient text not null,
  service_ids text not null,
  tx text,
  status text not null check (status in ('prepared', 'confirmed', 'failed')),
  gas_used text,
  rescoped text not null,
  revoked text not null,
  unbounded text not null,
  unchanged text not null,
  failure text,
  created_at text not null,
  confirmed_at text,
  reason text not null default 'manual' check (reason in ('failures', 'manual')),
  evidence text
);
create index if not exists cutoff_account on cutoff(account);
create table if not exists desk_seen (
  digest text primary key,
  expires_at integer not null
);
create table if not exists faucet (
  address text primary key,
  at integer not null
);
create table if not exists faucet_global (
  at integer not null
);
`

export function openDatabase(file = `${ensureDataDir()}leash.db`): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = wal')
  db.exec('pragma foreign_keys = on')
  db.exec('pragma busy_timeout = 5000')
  // Rows that are rewritten (key encryption) must not survive in freed pages.
  db.exec('pragma secure_delete = on')
  db.exec(SCHEMA)
  // Databases created before cutoffs carried a reason and an evidence snapshot.
  const columns = (db.prepare('pragma table_info(cutoff)').all() as { name: string }[]).map((c) => c.name)
  if (!columns.includes('reason')) db.exec("alter table cutoff add column reason text not null default 'manual' check (reason in ('failures', 'manual'))")
  if (!columns.includes('evidence')) db.exec('alter table cutoff add column evidence text')
  // Databases created before agents could run outside the desk.
  const agentColumns = (db.prepare('pragma table_info(agent)').all() as { name: string }[]).map((c) => c.name)
  if (!agentColumns.includes('external')) db.exec('alter table agent add column external integer not null default 0')
  // Databases created before mainnet teams: every existing team is a Moderato team.
  const teamColumns = (db.prepare('pragma table_info(team)').all() as { name: string }[]).map((c) => c.name)
  if (!teamColumns.includes('network')) db.exec("alter table team add column network text not null default 'moderato' check (network in ('moderato', 'mainnet'))")
  const recordColumns = (db.prepare('pragma table_info(record)').all() as { name: string }[]).map((c) => c.name)
  if (!recordColumns.includes('source')) db.exec("alter table record add column source text not null default 'runner' check (source in ('runner', 'external'))")
  // Databases created before the desk kept its own receive time and the settlement block time.
  if (!recordColumns.includes('received_at')) db.exec('alter table record add column received_at text')
  if (!recordColumns.includes('settled_at')) db.exec('alter table record add column settled_at text')
  db.exec('create index if not exists record_settlement on record(settlement_tx)')
  db.exec('create index if not exists record_key_id on record(agent_key_id, id)')
  if (file !== ':memory:') for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) chmodSync(f, 0o600)
  return db
}

export type Db = DatabaseSync
