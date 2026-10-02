import { useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { Actions } from 'viem/tempo'
import { api } from '@/lib/api'
import type { AgentView, Catalog, LedgerRecord } from '@/lib/api'
import { waitForSuccess } from '@/lib/chain'
import type { RootClient } from '@/lib/chain'
import { usePoll } from '@/lib/session'
import { ago, short, units } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Check, Field, Input } from '@/components/ui/form'
import { Empty, Notice, Panel, Status, TxLink } from '@/components/ui/status'
import { NeedsTeam, PageHead, Cell, Th } from '@/components/page'
import { RecordTable } from '@/components/records'
import { asRecords } from '@/lib/records'

type Step = { label: string; state: 'run' | 'done' | 'fail'; detail?: string }

function AddAgent({ account, client, catalog, onDone }: { account: Address; client: RootClient; catalog: Catalog; onDone: () => void }) {
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('1.00')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(catalog.services.map((s) => [s.serviceId, s])), [catalog])
  const vendors = useMemo(() => {
    const m = new Map<string, { name: string; services: typeof catalog.services }>()
    for (const s of catalog.services) {
      const v = m.get(s.vendorId) ?? { name: s.vendorName, services: [] }
      v.services.push(s)
      m.set(s.vendorId, v)
    }
    return [...m.entries()]
  }, [catalog])

  /** Services the key can also pay because they share a payout address with a picked service. */
  const exposure = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const id of picked) {
      const svc = byId.get(id)
      if (!svc) continue
      const group = catalog.payoutGroups.find((g) => g.recipient.toLowerCase() === svc.recipient.toLowerCase())
      const extra = (group?.serviceIds ?? []).filter((s) => !picked.has(s))
      if (extra.length) out.set(id, extra)
    }
    return out
  }, [picked, byId, catalog])

  const budgetValid = /^\d{1,6}(\.\d{1,6})?$/.test(budget) && Number(budget) > 0
  const valid = name.trim().length >= 2 && budgetValid && picked.size > 0

  const mark = (label: string, state: Step['state'], detail?: string) =>
    setSteps((prev) => [...prev.filter((s) => s.label !== label), { label, state, detail }])

  const submit = async () => {
    setBusy(true)
    setSteps([])
    let stage = 'Create key on the API'
    try {
      mark(stage, 'run')
      const created = await api.createAgent(account, { name: name.trim(), budget, periodSeconds: 86400, serviceIds: [...picked] })
      mark(stage, 'done', short(created.keyId, 8, 6))
      stage = 'Sign authorizeKey with the team key'
      mark(stage, 'run')
      const a = created.authorize
      const tx = await Actions.accessKey.authorize(client, {
        accessKey: { accessKeyAddress: a.accessKey.accessKeyAddress, keyType: a.accessKey.keyType },
        expiry: a.expiry,
        limits: a.limits.map((l) => ({ token: l.token, limit: BigInt(l.limit), period: l.period })),
        scopes: a.scopes,
      })
      mark(stage, 'done', short(tx, 8, 6))
      stage = 'Wait for the chain'
      mark(stage, 'run')
      await waitForSuccess(tx)
      mark(stage, 'done')
      stage = 'API reads the key back from chain'
      mark(stage, 'run')
      await api.confirmAgent(created.keyId, tx)
      mark(stage, 'done', 'active')
      setName('')
      setPicked(new Set())
      onDone()
    } catch (e) {
      mark(stage, 'fail', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Add an agent">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label="Agent name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="researcher-1" maxLength={32} />}</Field>
          <Field
            label="Daily budget (OUSD)"
            help="The chain enforces this limit per 24 hours on the agent's key."
            error={budget && !budgetValid ? 'Enter a positive amount with up to 6 decimals.' : null}
          >
            {(id) => <Input id={id} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="num" />}
          </Field>
        </div>
        <fieldset>
          <legend className="text-caption text-ink-muted">Services this key may pay</legend>
          <div className="mt-2 divide-y divide-hairline border border-hairline px-4">
            {vendors.map(([vendorId, v]) => (
              <div key={vendorId} className="py-2">
                <p className="text-caption font-semibold text-ink-muted">{v.name}</p>
                {v.services.map((s) => (
                  <Check
                    key={s.serviceId}
                    checked={picked.has(s.serviceId)}
                    onChange={(on) =>
                      setPicked((prev) => {
                        const next = new Set(prev)
                        if (on) next.add(s.serviceId)
                        else next.delete(s.serviceId)
                        return next
                      })
                    }
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span>
                        <span className="num">{s.serviceId}</span> <span className="text-ink-muted">{s.description}</span>
                      </span>
                      <span className="num text-ink-muted">{s.price} OUSD</span>
                    </span>
                  </Check>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
      </div>
      {exposure.size > 0 && (
        <div className="mt-6">
          <Notice tone="warning" title="Shared payout address">
            A key scoped by recipient address can pay everything behind that address.{' '}
            {[...exposure.entries()].map(([id, extra]) => (
              <span key={id} className="block">
                <span className="num">{id}</span> shares its payout with <span className="num">{extra.join(', ')}</span>, so this key can also pay {extra.length > 1 ? 'them' : 'it'}.
              </span>
            ))}
          </Notice>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button disabled={!valid} busy={busy} onClick={submit}>
          Authorize agent key
        </Button>
        <span className="text-body-sm text-ink-muted">Your team key signs one transaction and pays its gas in PathUSD.</span>
      </div>
      {steps.length > 0 && (
        <ol className="mt-6 grid gap-2" aria-live="polite">
          {steps.map((s) => (
            <li key={s.label} className="text-body-sm">
              <Status tone={s.state === 'done' ? 'ok' : s.state === 'fail' ? 'bad' : 'info'}>
                {s.label}
                {s.state === 'run' && '...'}
                {s.detail && <span className={s.state === 'fail' ? 'ml-2' : 'num ml-2 text-ink-muted'}>{s.detail}</span>}
              </Status>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

function RunResearch({ agent, account }: { agent: AgentView; account: Address }) {
  const [topic, setTopic] = useState('agent payments')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<LedgerRecord[]>([])
  const startedAt = useRef(0)
  const live = useRef(false)

  // Records are written as each paid call finishes, so poll the ledger while the run request is open.
  useEffect(() => {
    if (!busy) return
    live.current = true
    const timer = setInterval(async () => {
      try {
        const all = asRecords(await api.ledger(account, 50))
        if (live.current) setRecords(all.filter((r) => r.keyId.toLowerCase() === agent.keyId.toLowerCase() && Date.parse(r.startedAt) >= startedAt.current).reverse())
      } catch {
        /* the run request itself reports failures; a missed poll just waits for the next one */
      }
    }, 1200)
    return () => {
      live.current = false
      clearInterval(timer)
    }
  }, [busy, account, agent.keyId])

  const run = async () => {
    setBusy(true)
    setError(null)
    setRecords([])
    startedAt.current = Date.now() - 2000
    try {
      const result = await api.runAgent(agent.keyId, topic.trim())
      setRecords(result.records)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-end gap-0">
        <div className="min-w-64 flex-1">
          <Field label={`Research topic for ${agent.name}`}>
            {(id) => <Input id={id} value={topic} onChange={(e) => setTopic(e.target.value)} className="bg-canvas" />}
          </Field>
        </div>
        <Button busy={busy} disabled={topic.trim().length < 2} onClick={run}>
          Run research
        </Button>
      </div>
      <p className="mt-2 text-caption text-ink-muted">
        The runner searches, scrapes the top stories, then summarizes. Each call is a real payment from this agent's key.
      </p>
      {error && <div className="mt-4"><Notice tone="error" title="Run failed">{error}</Notice></div>}
      {(busy || records.length > 0) && (
        <div className="mt-4">
          {records.length > 0 ? <RecordTable records={records} showAgent={false} /> : <p className="text-body-sm text-ink-muted">Waiting for the first payment to settle.</p>}
          {busy && <p className="mt-2 text-caption text-ink-muted">Running. Records appear as each payment finishes.</p>}
          {!busy && <p className="mt-2 text-caption text-ink-muted">Run finished with {records.length} record{records.length === 1 ? '' : 's'}.</p>}
        </div>
      )}
    </div>
  )
}

function AgentRow({ agent, account, client, onChange }: { agent: AgentView; account: Address; client: RootClient; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revoke = async () => {
    setRevoking(true)
    setError(null)
    try {
      const plan = await api.revokePlan(agent.keyId)
      const tx = await client.sendTransaction({ calls: plan.calls } as never)
      await waitForSuccess(tx)
      await api.revokeConfirm(agent.keyId, tx)
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRevoking(false)
    }
  }

  const tone = agent.status === 'active' ? 'ok' : agent.status === 'pending' ? 'warn' : 'idle'
  return (
    <>
      <tr className="border-t border-hairline">
        <Cell>
          <p className="font-semibold">{agent.name}</p>
          <p className="num text-caption text-ink-muted" title={agent.keyId}>{short(agent.keyId, 8, 6)}</p>
        </Cell>
        <Cell>
          <Status tone={tone}>{agent.status}</Status>
        </Cell>
        <Cell className="num text-right">{units(agent.budget)}</Cell>
        <Cell className="num text-right">{agent.remaining === null ? '' : units(agent.remaining)}</Cell>
        <Cell>
          <span className="num">{agent.serviceIds.join(', ')}</span>
        </Cell>
        <Cell>
          <TxLink hash={agent.authorizeTx} />
        </Cell>
        <Cell>
          <span className="flex">
            <Button size="sm" variant="tertiary" disabled={agent.status !== 'active'} onClick={() => setOpen((v) => !v)}>
              {open ? 'Close' : 'Run research'}
            </Button>
            <Button size="sm" variant="ghost" disabled={agent.status !== 'active'} busy={revoking} onClick={revoke}>
              Revoke
            </Button>
          </span>
        </Cell>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="px-4 pb-3">
            <Notice tone="error" title="Revoke failed">{error}</Notice>
          </td>
        </tr>
      )}
      {open && (
        <tr>
          <td colSpan={7} className="p-0">
            <RunResearch agent={agent} account={account} />
          </td>
        </tr>
      )}
    </>
  )
}

function AgentsBody({ account, client }: { account: Address; client: RootClient }) {
  const catalog = usePoll(() => api.catalog(), 0, [])
  const team = usePoll(() => api.team(account), 6000, [account])
  const [adding, setAdding] = useState(false)

  const agents = team.data?.agents ?? []
  const first = agents.length === 0

  return (
    <>
      <PageHead
        title="Agents"
        actions={
          <Button variant={adding || first ? 'tertiary' : 'primary'} onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close form' : 'Add an agent'}
          </Button>
        }
      >
        Each agent is a Tempo access key with a daily OUSD limit and a list of recipients it may pay. The runner holds the agent key. You hold the team key.
      </PageHead>
      <div className="grid gap-6">
        {(adding || (first && !team.loading && team.data)) && catalog.data && (
          <AddAgent account={account} client={client} catalog={catalog.data} onDone={() => { team.reload(); setAdding(false) }} />
        )}
        {catalog.error && <Notice tone="error" title="Could not load the service catalog">{catalog.error}</Notice>}
        {team.error && <Notice tone="error" title="Could not load the team">{team.error}</Notice>}
        {team.data && agents.length === 0 && (
          <Empty title="No agents hold a key yet">
            Pick the services an agent may pay and a daily budget above. Your team key signs the authorization, and the chain enforces it from then on. If the team has no funds, fund it on the Team tab first.
          </Empty>
        )}
        {agents.length > 0 && (
          <div className="overflow-x-auto border border-hairline">
            <table className="w-full min-w-[900px] text-body-sm">
              <thead>
                <tr>
                  <Th>Agent</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Daily budget (OUSD)</Th>
                  <Th className="text-right">Remaining now</Th>
                  <Th>Services in scope</Th>
                  <Th>Authorize tx</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <AgentRow key={a.keyId} agent={a} account={account} client={client} onChange={team.reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {team.data && <p className="text-caption text-ink-subtle">Remaining is read from the chain at {ago(Date.now())}, refreshed every few seconds.</p>}
      </div>
    </>
  )
}

export const AgentsPage = () => <NeedsTeam>{({ account, client }) => <AgentsBody account={account.address} client={client} />}</NeedsTeam>
