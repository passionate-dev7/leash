import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { api } from '@/lib/api'
import type { AgentView, CatalogService, CutConfirm, CutPlan, LedgerRecord, VendorRow } from '@/lib/api'
import { waitForSuccess } from '@/lib/chain'
import type { RootClient } from '@/lib/chain'
import { usePoll } from '@/lib/session'
import { pct, short, units } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Select, Field } from '@/components/ui/form'
import { Sheet } from '@/components/ui/sheet'
import { AddressLink, Empty, Notice, Status, TxLink } from '@/components/ui/status'
import { NeedsTeam, PageHead, Cell, Th } from '@/components/page'
import { OutcomeStatus } from '@/components/records'
import { cn } from '@/components/ui/cn'

function FailureBar({ rate, paid }: { rate: number; paid: number }) {
  if (paid === 0) return <span className="text-ink-subtle">no payments</span>
  return (
    <span className="flex items-center gap-3" title={`${pct(rate)} of paid calls were not delivered`}>
      <span className="h-2 w-24 shrink-0 bg-surface-2">
        <span className={cn('block h-full', rate > 0 ? 'bg-error' : 'bg-success')} style={{ width: `${Math.max(rate > 0 ? 4 : 0, Math.min(100, rate * 100))}%` }} />
      </span>
      <span className="num">{pct(rate)}</span>
    </span>
  )
}

type Phase = 'review' | 'prepared' | 'signing' | 'done'

function CutSheet({
  row,
  svc,
  account,
  client,
  agents,
  onClose,
  onChanged,
  onTry,
}: {
  row: VendorRow
  svc: CatalogService | undefined
  account: Address
  client: RootClient
  agents: AgentView[]
  onClose: () => void
  onChanged: () => void
  onTry: () => void
}) {
  const [phase, setPhase] = useState<Phase>('review')
  const [plan, setPlan] = useState<CutPlan | null>(null)
  const [tx, setTx] = useState<string | null>(null)
  const [result, setResult] = useState<CutConfirm | null>(null)
  const [after, setAfter] = useState<AgentView[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')

  const names = new Map(agents.map((a) => [a.keyId.toLowerCase(), a.name]))
  const nameOf = (k: Address) => names.get(k.toLowerCase()) ?? short(k)

  const prepare = async () => {
    setBusy(true)
    setError(null)
    try {
      setPlan(await api.planCutoff(account, row.recipient))
      setPhase('prepared')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const sign = async () => {
    if (!plan) return
    setBusy(true)
    setError(null)
    setPhase('signing')
    try {
      setStage('Sign one transaction with the team key')
      const hash = await client.sendTransaction({ calls: plan.calls } as never)
      setTx(hash)
      setStage('Wait for the chain')
      await waitForSuccess(hash)
      setStage('API reads the scopes back from chain')
      const confirmed = await api.confirmCutoff(plan.id, hash)
      setResult(confirmed)
      const team = await api.team(account)
      setAfter(team.agents)
      setPhase('done')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('prepared')
    } finally {
      setBusy(false)
    }
  }

  const sibs = row.siblings

  return (
    <Sheet
      title={phase === 'done' ? 'Cut-off confirmed' : `Cut ${row.serviceId}`}
      onClose={onClose}
      footer={
        phase === 'review' ? (
          <>
            <Button variant="secondary" className="flex-1 justify-start py-4" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 justify-start py-4" busy={busy} onClick={prepare}>Prepare cut-off</Button>
          </>
        ) : phase === 'prepared' || phase === 'signing' ? (
          <>
            <Button variant="secondary" className="flex-1 justify-start py-4" onClick={onClose} disabled={busy}>Close</Button>
            <Button variant="danger" className="flex-1 justify-start py-4" busy={busy} disabled={!plan || plan.calls.length === 0} onClick={sign}>
              Sign cut-off with team key
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" className="flex-1 justify-start py-4" onClick={onClose}>Done</Button>
            <Button className="flex-1 justify-start py-4" onClick={onTry}>Try a payment</Button>
          </>
        )
      }
    >
      <div className="grid gap-6">
        <section>
          <h3 className="text-body-sm font-semibold">What gets cut</h3>
          <p className="mt-1 text-body-sm text-ink-muted">
            The payout address <AddressLink address={row.recipient} /> is removed from every agent key in one transaction. A scope is per address, so everything that pays out there goes with it.
          </p>
          <ul className="mt-3 divide-y divide-hairline border border-hairline text-body-sm">
            <li className="flex items-baseline justify-between gap-4 px-4 py-2">
              <span className="num">{row.serviceId}</span>
              <span className="text-ink-muted">{svc ? `${svc.vendorName}, ${svc.virtual ? 'virtual address' : 'shared payout'}` : ''}</span>
            </li>
            {sibs.map((s) => (
              <li key={s} className="flex items-baseline justify-between gap-4 px-4 py-2">
                <span className="num">{s}</span>
                <span className="text-ink-muted">shares this payout address, cut with it</span>
              </li>
            ))}
          </ul>
          {sibs.length === 0 && <p className="mt-2 text-caption text-ink-muted">Nothing else pays out to this address. Other services are untouched.</p>}
        </section>

        {plan && (
          <section>
            <h3 className="text-body-sm font-semibold">Prepared transaction</h3>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border border-hairline p-4 text-body-sm">
              <dt>Calls in the one transaction</dt><dd className="num">{plan.calls.length}</dd>
              <dt>Keys rescoped (recipient removed)</dt><dd className="num">{plan.rescoped.length}</dd>
              <dt>Keys revoked (nothing left to call)</dt><dd className="num">{plan.revoked.length}</dd>
              <dt>Keys that never could pay it</dt><dd className="num">{plan.unchanged.length}</dd>
              <dt>Services cut</dt><dd className="num">{plan.servicesCut.join(', ')}</dd>
            </dl>
            {plan.rescoped.length + plan.revoked.length > 0 && (
              <p className="mt-2 text-caption text-ink-muted">
                Affected: {[...plan.rescoped, ...plan.revoked].map(nameOf).join(', ')}.
              </p>
            )}
            {plan.calls.length === 0 && (
              <div className="mt-3">
                <Notice tone="info" title="Nothing to sign">
                  No active agent key can pay this address, so the chain already refuses it for every key. Leash recorded the cut-off with no transaction.
                </Notice>
              </div>
            )}
            {plan.unbounded.length > 0 && (
              <div className="mt-3">
                <Notice tone="warning" title={`${plan.unbounded.length} key${plan.unbounded.length > 1 ? 's' : ''} this cut cannot reach`}>
                  {plan.unbounded.map(nameOf).join(', ')} {plan.unbounded.length > 1 ? 'hold' : 'holds'} a rule that allows any recipient, so removing one address changes nothing for {plan.unbounded.length > 1 ? 'them' : 'it'}. Revoke {plan.unbounded.length > 1 ? 'those keys' : 'that key'} on the Agents tab.
                </Notice>
              </div>
            )}
            <p className="mt-3 text-caption text-ink-muted">Leash already blocks this address on the server side. The chain enforces it for every key once the transaction confirms.</p>
          </section>
        )}

        {phase === 'signing' && stage && (
          <p className="text-body-sm" aria-live="polite">
            <Status tone="info">{stage}...</Status>
            {tx && <span className="ml-3"><TxLink hash={tx} /></span>}
          </p>
        )}
        {error && <Notice tone="error" title="Cut-off did not complete">{error}</Notice>}

        {phase === 'done' && result && tx && (
          <section className="grid gap-3">
            <Notice tone={result.status === 'confirmed' ? 'success' : 'error'} title={`Cut-off ${result.status}`}>
              Transaction <TxLink hash={tx} />
              {result.gasUsed ? <> used <span className="num">{String(result.gasUsed)}</span> gas.</> : '.'}
              {result.failure ? ` ${result.failure}` : ''}
            </Notice>
            {after && (
              <div className="border border-hairline text-body-sm">
                <p className="border-b border-hairline px-4 py-2 text-caption font-semibold text-ink-muted">Read back from chain just now</p>
                <ul className="divide-y divide-hairline">
                  {after.filter((a) => a.status !== 'pending').map((a) => {
                    const holds = (a.scopes ?? []).some((s) => s.selectorRules.some((rule) => rule.recipients.some((r) => r.toLowerCase() === row.recipient.toLowerCase())))
                    return (
                      <li key={a.keyId} className="flex items-baseline justify-between gap-4 px-4 py-2">
                        <span>{a.name}</span>
                        <Status tone={holds ? 'bad' : 'ok'}>{a.status === 'revoked' ? 'key revoked' : holds ? 'still can pay this address' : 'cannot pay this address'}</Status>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            <p className="text-body-sm text-ink-muted">Next, try a payment from an agent to see the chain refuse it.</p>
          </section>
        )}
      </div>
    </Sheet>
  )
}

function TrySheet({ row, svc, agents, onClose, onChanged }: { row: VendorRow; svc: CatalogService | undefined; agents: AgentView[]; onClose: () => void; onChanged: () => void }) {
  const active = agents.filter((a) => a.status === 'active' && a.serviceIds.includes(row.serviceId))
  const [keyId, setKeyId] = useState<string>(active[0]?.keyId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [record, setRecord] = useState<LedgerRecord | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    setRecord(null)
    try {
      setRecord((await api.callAgent(keyId as Address, row.serviceId, svc?.inputExample ?? {})).record)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Try a payment to ${row.serviceId}`} onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-body-sm text-ink-muted">
          One real call from an agent whose key was scoped to this service. After a cut the chain should refuse it before any funds move.
        </p>
        {active.length === 0 ? (
          <Notice tone="info" title="No agent was scoped to this service">Add an agent that includes it on the Agents tab, then try again.</Notice>
        ) : (
          <>
            <Field label="Agent">
              {(id) => (
                <Select id={id} value={keyId} onChange={(e) => setKeyId(e.target.value)}>
                  {active.map((a) => (
                    <option key={a.keyId} value={a.keyId}>{a.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="num break-all border border-hairline bg-surface-1 p-3 text-caption">
              {svc?.method} {svc?.path} {JSON.stringify(svc?.inputExample ?? {})}
            </p>
            <Button busy={busy} onClick={run} disabled={!keyId}>Try a payment</Button>
          </>
        )}
        {error && <Notice tone="error" title="Call failed">{error}</Notice>}
        {record && (
          <div className="border border-hairline p-4 text-body-sm" aria-live="polite">
            <p className="flex items-center gap-3"><OutcomeStatus outcome={record.outcome} />{record.refused && <span className="num font-semibold text-error-ink">{record.refused}</span>}</p>
            <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-1 text-ink-muted">
              <dt>Amount moved</dt><dd className="num text-ink">{record.outcome === 'refused' ? '0' : units(record.amount)} OUSD</dd>
              <dt>HTTP status</dt><dd className="num text-ink">{record.status ?? 'none'}</dd>
              <dt>Settlement</dt><dd><TxLink hash={record.settlement?.tx} /></dd>
            </dl>
          </div>
        )}
      </div>
    </Sheet>
  )
}

function VendorsBody({ account, client }: { account: Address; client: RootClient }) {
  const catalog = usePoll(() => api.catalog(), 0, [])
  const vendors = usePoll(() => api.vendors(account), 5000, [account])
  const team = usePoll(() => api.team(account), 8000, [account])
  const [cut, setCut] = useState<VendorRow | null>(null)
  const [trying, setTrying] = useState<VendorRow | null>(null)

  const svcById = useMemo(() => new Map((catalog.data?.services ?? []).map((s) => [s.serviceId, s])), [catalog.data])
  const rows = vendors.data?.services ?? []
  const agents = team.data?.agents ?? []
  const refresh = () => {
    vendors.reload()
    team.reload()
  }

  return (
    <>
      <PageHead title="Vendors">
        A charge settles before the vendor runs your request, so paid and delivered are different facts. Cut a failing service and the next payment to it is refused by the chain.
      </PageHead>
      {vendors.error && <Notice tone="error" title="Could not load vendors">{vendors.error}</Notice>}
      {vendors.data && rows.length === 0 && (
        <Empty title="No vendor has been paid yet">Run research from the Agents tab. Each service an agent pays shows up here with how many calls were delivered.</Empty>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto border border-hairline">
          <table className="w-full min-w-[1100px] text-body-sm">
            <thead>
              <tr>
                <Th>Service</Th>
                <Th>Payout address</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Delivered</Th>
                <Th className="text-right">Paid, not delivered</Th>
                <Th className="text-right">Refused</Th>
                <Th className="text-right">Spent (OUSD)</Th>
                <Th>Failure rate</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const svc = svcById.get(r.serviceId)
                const isCut = r.cut?.status === 'confirmed'
                return (
                  <tr key={r.serviceId} className="border-t border-hairline">
                    <Cell>
                      <p className="num font-semibold">{r.serviceId}</p>
                      <p className="text-caption text-ink-muted">{svc?.vendorName ?? r.vendorId}</p>
                    </Cell>
                    <Cell>
                      <AddressLink address={r.recipient} />
                      <p className="text-caption text-ink-muted">
                        {r.virtual ? 'Virtual address, one per service' : r.siblings.length > 0 ? `Shared with ${r.siblings.join(', ')}` : 'Plain address'}
                      </p>
                    </Cell>
                    <Cell className="num text-right">{r.paid}</Cell>
                    <Cell className="num text-right">{r.delivered}</Cell>
                    <Cell className={cn('num text-right', r.paidNotDelivered > 0 && 'font-semibold text-error-ink')}>{r.paidNotDelivered}</Cell>
                    <Cell className="num text-right">{r.refused}</Cell>
                    <Cell className="num text-right">{units(r.spent)}</Cell>
                    <Cell><FailureBar rate={r.failureRate} paid={r.paid} /></Cell>
                    <Cell>
                      {isCut ? (
                        <span className="flex flex-col items-start gap-1">
                          <Status tone="bad">Cut</Status>
                          <span className="flex items-center gap-2 text-caption text-ink-muted"><TxLink hash={r.cut?.tx} /></span>
                          <Button size="sm" variant="tertiary" onClick={() => setTrying(r)}>Try a payment</Button>
                        </span>
                      ) : (
                        <span className="flex flex-col items-start gap-1">
                          {r.cut?.status === 'prepared' && <span className="text-caption text-ink-muted">Prepared, not signed</span>}
                          <Button size="sm" variant="danger-outline" onClick={() => setCut(r)}>Cut</Button>
                        </span>
                      )}
                    </Cell>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {cut && (
        <CutSheet
          row={cut}
          svc={svcById.get(cut.serviceId)}
          account={account}
          client={client}
          agents={agents}
          onClose={() => { setCut(null); refresh() }}
          onChanged={refresh}
          onTry={() => { const r = cut; setCut(null); setTrying(r); refresh() }}
        />
      )}
      {trying && <TrySheet row={trying} svc={svcById.get(trying.serviceId)} agents={agents} onClose={() => setTrying(null)} onChanged={refresh} />}
    </>
  )
}

export const VendorsPage = () => <NeedsTeam>{({ account, client }) => <VendorsBody account={account.address} client={client} />}</NeedsTeam>
