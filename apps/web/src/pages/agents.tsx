import { useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { Actions } from 'viem/tempo'
import { api } from '@/lib/api'
import type { AgentView, Catalog, LedgerRecord } from '@/lib/api'
import { API_BASE } from '@/lib/config'
import { waitForSuccess } from '@/lib/chain'
import type { RootClient } from '@/lib/chain'
import { usePoll } from '@/lib/session'
import { money, short } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Check, Field, Input, Radio } from '@/components/ui/form'
import { Empty, Notice, Panel, Status, TxLink } from '@/components/ui/status'
import { NeedsTeam, PageHead, Cell, Table, TBody, Th, THead, Tr } from '@/components/page'
import { RecordTable } from '@/components/records'
import { asRecords } from '@/lib/records'
import { cn } from '@/components/ui/cn'

type Step = { label: string; state: 'run' | 'done' | 'fail'; detail?: string }

function AddAgent({ account, client, catalog, onDone }: { account: Address; client: RootClient; catalog: Catalog; onDone: () => void }) {
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('1.00')
  const [mode, setMode] = useState<'desk' | 'own'>('desk')
  const [ownKey, setOwnKey] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)
  const [omitted, setOmitted] = useState<string[]>([])

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

  /** Editing starts a new agent, so the previous attempt's steps are dropped. */
  const touch = () => {
    if (busy) return
    setSteps([])
    setOmitted([])
  }

  const [attempted, setAttempted] = useState(false)
  const errors = {
    name: name.trim().length >= 2 ? null : 'Enter a name of at least 2 characters.',
    budget: /^\d{1,6}(\.\d{1,6})?$/.test(budget) && Number(budget) > 0 ? null : budget.trim() === '' ? 'Enter a daily budget in OUSD.' : 'Enter a positive amount with up to 6 decimals.',
    services: picked.size > 0 ? null : 'Select at least one service this key may pay.',
    ownKey: mode === 'desk' || /^0x[0-9a-fA-F]{40}$/.test(ownKey.trim()) ? null : ownKey.trim() === '' ? 'Paste the key id printed by leash-agent init.' : 'A key id is an address: 0x followed by 40 hex characters.',
  }
  const shown = (key: keyof typeof errors) => (attempted ? errors[key] : null)

  const mark = (label: string, state: Step['state'], detail?: string) =>
    setSteps((prev) => [...prev.filter((s) => s.label !== label), { label, state, detail }])

  const submit = async () => {
    setAttempted(true)
    if (errors.name || errors.budget || errors.services || errors.ownKey) return
    setBusy(true)
    setSteps([])
    setOmitted([])
    let stage = mode === 'own' ? 'Register your key id on the API' : 'Create key on the API'
    try {
      mark(stage, 'run')
      const created = await api.createAgent(account, {
        name: name.trim(),
        budget,
        periodSeconds: 86400,
        serviceIds: [...picked],
        ...(mode === 'own' ? { external: true, keyId: ownKey.trim() as Address } : {}),
      })
      mark(stage, 'done', short(created.keyId, 8, 6))
      if (created.omitted.length > 0) setOmitted(created.omitted.map((o) => o.serviceId))
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
      setOwnKey('')
      setPicked(new Set())
      setAttempted(false)
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
          <fieldset>
            <legend className="text-caption text-ink-muted">Who runs this agent</legend>
            <div className="mt-1">
              <Radio name="runs" checked={mode === 'desk'} onChange={() => { touch(); setMode('desk') }}>
                <span className="font-semibold">Leash runs it</span>
                <span className="block text-caption text-ink-muted">Leash generates the key, holds it, and runs research tasks for you.</span>
              </Radio>
              <Radio name="runs" checked={mode === 'own'} onChange={() => { touch(); setMode('own') }}>
                <span className="font-semibold">I run it</span>
                <span className="block text-caption text-ink-muted">Your process holds the key. Leash only learns the key id and the payments your agent reports.</span>
              </Radio>
            </div>
          </fieldset>
          {mode === 'own' && (
            <Field label="Agent key id" help={<>Run <span className="num">leash-agent init</span> where the agent runs and paste the key id it prints. The private key never reaches Leash.</>} error={shown('ownKey')}>
              {(id) => (
                <Input
                  id={id}
                  value={ownKey}
                  onChange={(e) => { touch(); setOwnKey(e.target.value) }}
                  placeholder="0x..."
                  className="num"
                  spellCheck={false}
                  aria-invalid={shown('ownKey') ? true : undefined}
                  aria-describedby={shown('ownKey') ? `${id}-error` : undefined}
                />
              )}
            </Field>
          )}
          <Field label="Agent name" error={shown('name')}>
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => { touch(); setName(e.target.value) }}
                placeholder="researcher-1"
                maxLength={32}
                aria-invalid={shown('name') ? true : undefined}
                aria-describedby={shown('name') ? `${id}-error` : undefined}
              />
            )}
          </Field>
          <Field label="Daily budget (OUSD)" help="The chain enforces this limit per 24 hours on the agent's key." error={shown('budget')}>
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={budget}
                onChange={(e) => { touch(); setBudget(e.target.value) }}
                className="num"
                aria-invalid={shown('budget') ? true : undefined}
                aria-describedby={shown('budget') ? `${id}-error` : undefined}
              />
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="text-caption text-ink-muted">Services this key may pay</legend>
          <div className={cn('mt-2 divide-y divide-hairline border px-4', shown('services') ? 'border-error' : 'border-hairline')}>
            {vendors.map(([vendorId, v]) => (
              <div key={vendorId} className="py-2">
                <p className="text-caption font-semibold text-ink-muted">{v.name}</p>
                {v.services.map((s) => (
                  <Check
                    key={s.serviceId}
                    checked={picked.has(s.serviceId)}
                    onChange={(on) => {
                      touch()
                      setPicked((prev) => {
                        const next = new Set(prev)
                        if (on) next.add(s.serviceId)
                        else next.delete(s.serviceId)
                        return next
                      })
                    }}
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="num">{s.serviceId}</span>
                      <span className="num text-ink-muted">{s.price} OUSD per call</span>
                    </span>
                    <span className="block text-caption text-ink-muted">{s.description}</span>
                  </Check>
                ))}
              </div>
            ))}
          </div>
          {shown('services') && <p role="alert" className="mt-1 text-caption text-error-ink">{shown('services')}</p>}
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
        <Button busy={busy} onClick={submit}>
          Authorize agent key
        </Button>
        <span className="text-body-sm text-ink-muted">Your team key signs one transaction and pays its gas in PathUSD.</span>
      </div>
      {omitted.length > 0 && (
        <div className="mt-6">
          <Notice tone="info" title="Cut services were left out">
            <span className="num">{omitted.join(', ')}</span> {omitted.length > 1 ? 'were' : 'was'} cut for this team earlier, so the new key was not granted {omitted.length > 1 ? 'them' : 'it'}.
          </Notice>
        </div>
      )}
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
  const [skipped, setSkipped] = useState<{ serviceId: string; message: string }[]>([])
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
    setSkipped([])
    startedAt.current = Date.now() - 2000
    try {
      const result = await api.runAgent(agent.keyId, topic.trim())
      setRecords(result.records)
      setSkipped(result.errors)
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
      {skipped.length > 0 && (
        <div className="mt-4">
          <Notice tone="warning" title="Some calls could not be made">
            {skipped.map((e, i) => (
              <span key={i} className="block">
                <span className="num">{e.serviceId}</span>: {e.message}
              </span>
            ))}
          </Notice>
        </div>
      )}
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

/** The lines an agent's own process needs to pay with its key and report to this desk. */
function Connect({ agent, account }: { agent: AgentView; account: Address }) {
  const api = API_BASE || location.origin
  const snippet = `import { agentAccount, AGENT_NETWORK, createLeashFetch, reportTo } from '@leash/sdk'
const agent = agentAccount(process.env.LEASH_AGENT_KEY, '${account}') // key id ${agent.keyId}
const leashFetch = createLeashFetch({ network: AGENT_NETWORK, agent, onRecord: reportTo('${api}', process.env.LEASH_AGENT_KEY) })`
  const cli = `leash-agent pay <service url> --team ${account} --api ${api}`
  return (
    <div className="border-t border-hairline bg-surface-1 p-4">
      <p className="text-body-sm font-semibold">{agent.name} runs outside Leash</p>
      <p className="mt-1 text-caption text-ink-muted">
        Its process holds key <span className="num">{agent.keyId}</span>. Every payment it makes is reported here, signed by that key, and counted once the chain shows the settlement.
      </p>
      <pre className="num mt-3 overflow-x-auto bg-surface-2 p-3 text-caption">{snippet}</pre>
      <p className="mt-3 text-caption text-ink-muted">Or pay one request from the command line:</p>
      <pre className="num mt-1 overflow-x-auto bg-surface-2 p-3 text-caption">{cli}</pre>
    </div>
  )
}

function AgentRow({ agent, account, client, catalog, onChange }: { agent: AgentView; account: Address; client: RootClient; catalog: Catalog; onChange: () => void }) {
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

  // Scope as the chain holds it: every service whose payout address is still in a recipient list.
  const onChain = new Set((agent.scopes ?? []).flatMap((s) => s.selectorRules.flatMap((r) => r.recipients.map((x) => x.toLowerCase()))))
  const inScope = agent.scopes === null ? agent.serviceIds : catalog.services.filter((s) => onChain.has(s.recipient.toLowerCase())).map((s) => s.serviceId)

  const tone = agent.status === 'active' ? 'ok' : agent.status === 'pending' ? 'warn' : 'idle'
  return (
    <>
      <Tr>
        <Cell>
          <p className="font-semibold">{agent.name}</p>
          <p className="num text-caption text-ink-muted" title={agent.keyId}>{short(agent.keyId, 8, 6)}</p>
          {agent.external && <p className="text-caption text-ink-muted">runs outside Leash</p>}
        </Cell>
        <Cell label="Status">
          <Status tone={tone}>{agent.status}</Status>
          {agent.readError && <p className="mt-1 max-w-48 text-caption text-error-ink">Chain read failed: {agent.readError}</p>}
        </Cell>
        <Cell label="Daily budget (OUSD)" className="num text-right">{money(agent.budgetUnits)}</Cell>
        <Cell label="Remaining now" className="num text-right">{agent.remaining === null ? '' : money(agent.remaining)}</Cell>
        <Cell label="In scope on chain">
          {agent.status === 'revoked' ? (
            <span className="text-ink-subtle">key revoked</span>
          ) : inScope.length === 0 ? (
            <span className="text-ink-subtle">no service in scope</span>
          ) : (
            <span className="num">{inScope.join(', ')}</span>
          )}
        </Cell>
        <Cell label="Authorize tx">
          <TxLink hash={agent.authorizeTx} />
        </Cell>
        <Cell className="max-md:border-t max-md:border-hairline max-md:pt-3">
          <span className="flex max-md:justify-end">
            <Button size="sm" variant="tertiary" disabled={agent.status !== 'active'} onClick={() => setOpen((v) => !v)}>
              {open ? 'Close' : agent.external ? 'Connect' : 'Run research'}
            </Button>
            <Button size="sm" variant="ghost" disabled={agent.status !== 'active'} busy={revoking} onClick={revoke}>
              Revoke
            </Button>
          </span>
        </Cell>
      </Tr>
      {error && (
        <Tr>
          <td colSpan={7} className="px-4 pb-3 max-md:block max-md:px-0">
            <Notice tone="error" title="Revoke failed">{error}</Notice>
          </td>
        </Tr>
      )}
      {open && (
        <Tr className="max-md:p-0">
          <td colSpan={7} className="p-0 max-md:block">
            {agent.external ? <Connect agent={agent} account={account} /> : <RunResearch agent={agent} account={account} />}
          </td>
        </Tr>
      )}
    </>
  )
}

function AgentsBody({ account, client }: { account: Address; client: RootClient }) {
  const catalog = usePoll(() => api.catalog(), 0, [])
  const team = usePoll(() => api.team(account), 6000, [account])
  const [adding, setAdding] = useState(false)
  const opened = useRef(false)

  const cat = catalog.data
  const agents = team.data?.agents ?? []
  const first = agents.length === 0

  // A team with no agents lands on the form. Once shown it stays until the user closes it, so the authorization steps remain readable.
  useEffect(() => {
    if (team.data && !opened.current) {
      opened.current = true
      if (team.data.agents.length === 0) setAdding(true)
    }
  }, [team.data])

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
        Each agent is a Tempo access key with a daily OUSD limit and a list of recipients it may pay. Leash can run an agent for you, or you run it yourself with its own key. You always hold the team key.
      </PageHead>
      <div className="grid gap-6">
        {adding && catalog.data && (
          <AddAgent account={account} client={client} catalog={catalog.data} onDone={team.reload} />
        )}
        {catalog.error && <Notice tone="error" title="Could not load the service catalog">{catalog.error}</Notice>}
        {team.error && <Notice tone="error" title="Could not load the team">{team.error}</Notice>}
        {team.data && agents.length === 0 && (
          <Empty title="No agents hold a key yet">
            Use Add an agent: pick the services it may pay and a daily budget. Your team key signs the authorization, and the chain enforces it from then on. If the team has no funds, fund it on the Team tab first.
          </Empty>
        )}
        {agents.length > 0 && cat && (
          <Table>
            <THead>
              <tr>
                <Th>Agent</Th>
                <Th>Status</Th>
                <Th className="text-right">Daily budget (OUSD)</Th>
                <Th className="text-right">Remaining now</Th>
                <Th>Services in scope on chain</Th>
                <Th>Authorize tx</Th>
                <Th>Actions</Th>
              </tr>
            </THead>
            <TBody>
              {agents.map((a) => (
                <AgentRow key={a.keyId} agent={a} account={account} client={client} catalog={cat} onChange={team.reload} />
              ))}
            </TBody>
          </Table>
        )}
        {agents.length > 0 && <p className="text-caption text-ink-subtle">Remaining is read from the chain on every refresh, every few seconds.</p>}
      </div>
    </>
  )
}

export const AgentsPage = () => <NeedsTeam>{({ account, client }) => <AgentsBody account={account.address} client={client} />}</NeedsTeam>
