import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { api } from '@/lib/api'
import type { AgentView, CatalogService, CutConfirm, CutPlan, CutReason, LedgerRecord, VendorRow } from '@/lib/api'
import { waitForSuccess } from '@/lib/chain'
import type { RootClient } from '@/lib/chain'
import { usePoll } from '@/lib/session'
import { short, units } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Select, Field } from '@/components/ui/form'
import { Sheet } from '@/components/ui/sheet'
import { AddressLink, Empty, Notice, Status, TxLink } from '@/components/ui/status'
import { NeedsTeam, PageHead } from '@/components/page'
import { Evidence, VendorTable, vendorLabel } from '@/components/vendors'
import { useNetwork } from '@/lib/network'
import { OutcomeStatus } from '@/components/records'

type Phase = 'review' | 'prepared' | 'signing' | 'done'

function CutSheet({
  row,
  reason,
  svc,
  account,
  client,
  agents,
  onClose,
  onChanged,
  onTry,
}: {
  row: VendorRow
  reason: CutReason
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
  const { name: net } = useNetwork()

  const names = new Map(agents.map((a) => [a.keyId.toLowerCase(), a.name]))
  const nameOf = (k: Address) => names.get(k.toLowerCase()) ?? short(k)

  const prepare = async () => {
    setBusy(true)
    setError(null)
    try {
      setPlan(await api.planCutoff(account, row.recipient, reason))
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
      await waitForSuccess(hash, net)
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

  const label = vendorLabel(row, net)
  // On Moderato a row is one service and its siblings share the payout; on mainnet a row is the payout and every service behind it goes together.
  const sibs = net === 'mainnet' ? [] : row.siblings
  const behind = net === 'mainnet' ? row.services : [row.serviceId]
  const manual = reason === 'manual'

  return (
    <Sheet
      title={phase === 'done' ? (manual ? 'Removed from scope' : 'Cut-off confirmed') : manual ? `Remove ${label} from scope` : `Cut ${label}`}
      onClose={onClose}
      footer={
        phase === 'review' ? (
          <>
            <Button variant="secondary" className="flex-1 justify-start py-4" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 justify-start py-4" busy={busy} onClick={prepare}>{manual ? 'Prepare removal' : 'Prepare cut-off'}</Button>
          </>
        ) : phase === 'prepared' || phase === 'signing' ? (
          <>
            <Button variant="secondary" className="flex-1 justify-start py-4" onClick={onClose} disabled={busy}>Close</Button>
            <Button variant="danger" className="flex-1 justify-start py-4" busy={busy} disabled={!plan || plan.calls.length === 0} onClick={sign}>
              {manual ? 'Sign removal with team key' : 'Sign cut-off with team key'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" className="flex-1 justify-start py-4" onClick={onClose}>Done</Button>
            {net === 'moderato' && <Button className="flex-1 justify-start py-4" onClick={onTry}>Try a payment</Button>}
          </>
        )
      }
    >
      <div className="grid gap-6">
        <section>
          <h3 className="text-body-sm font-semibold">{manual ? 'Why' : 'Measured failures'}</h3>
          {manual ? (
            <p className="mt-1 text-body-sm text-ink-muted">You are removing this service from every agent key without a failure record behind it. Use Cut when the vendor takes money and does not deliver.</p>
          ) : (
            <div className="mt-1 text-body-sm">
              <Evidence row={row} max={10} />
            </div>
          )}
        </section>
        <section>
          <h3 className="text-body-sm font-semibold">What gets cut</h3>
          <p className="mt-1 text-body-sm text-ink-muted">
            The payout address <AddressLink address={row.recipient} /> is removed from every agent key in one transaction. A scope is per address, so everything that pays out there goes with it.
          </p>
          <ul className="mt-3 divide-y divide-hairline border border-hairline text-body-sm">
            {behind.length === 0 ? (
              <li className="flex items-baseline justify-between gap-4 px-4 py-2">
                <span className="num">{short(row.recipient, 10, 6)}</span>
                <span className="text-ink-muted">no service is known behind this payout</span>
              </li>
            ) : (
              behind.map((s) => (
                <li key={s} className="flex items-baseline justify-between gap-4 px-4 py-2">
                  <span className="num">{s}</span>
                  <span className="text-ink-muted">{svc ? `${svc.vendorName}, ${svc.virtual ? 'virtual address' : 'shared payout'}` : net === 'mainnet' ? 'cut with this payout' : ''}</span>
                </li>
              ))
            )}
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
            <p className="text-body-sm text-ink-muted">
              {net === 'mainnet' ? 'The next payment any agent key on this team makes to this address is refused by the chain.' : 'Next, try a payment from an agent to see the chain refuse it.'}
            </p>
          </section>
        )}
      </div>
    </Sheet>
  )
}

function TrySheet({ row, svc, agents, onClose, onChanged }: { row: VendorRow; svc: CatalogService | undefined; agents: AgentView[]; onClose: () => void; onChanged: () => void }) {
  const { symbol } = useNetwork()
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
              <dt>Amount moved</dt><dd className="num text-ink">{record.outcome === 'refused' ? '0' : units(record.amount)} {symbol}</dd>
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
  const { name: net } = useNetwork()
  const catalog = usePoll(net === 'moderato' ? () => api.catalog() : null, 0, [net])
  const vendors = usePoll(() => api.vendors(account), 5000, [account])
  const team = usePoll(() => api.team(account), 8000, [account])
  const [cut, setCut] = useState<{ row: VendorRow; reason: CutReason } | null>(null)
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
        <Empty title="No vendor has been paid yet">
          {net === 'mainnet'
            ? 'Run an agent with leash-agent pay --network mainnet. Each payout address it pays shows up here with how many calls were delivered.'
            : 'Run research from the Agents tab. Each service an agent pays shows up here with how many calls were delivered.'}
        </Empty>
      )}
      {rows.length > 0 && (
        <VendorTable
          rows={rows}
          svcById={svcById}
          action={(r) =>
            r.cut?.status === 'confirmed' ? (
              <span className="flex flex-col items-start gap-1 max-md:items-end">
                <Status tone="bad">Cut</Status>
                <span className="flex items-center gap-2 text-caption text-ink-muted"><TxLink hash={r.cut.tx} /></span>
                {net === 'moderato' && <Button size="sm" variant="tertiary" onClick={() => setTrying(r)}>Try a payment</Button>}
              </span>
            ) : (
              <span className="flex flex-col items-start gap-1 max-md:items-end">
                {r.cut?.status === 'prepared' && <span className="text-caption text-ink-muted">Prepared, not signed</span>}
                {r.recommendCut ? (
                  <>
                    <span className="text-caption text-error-ink">Recommended: failures in the last 24h</span>
                    <Button size="sm" variant="danger-outline" onClick={() => setCut({ row: r, reason: 'failures' })}>Cut</Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" className="max-md:px-0" onClick={() => setCut({ row: r, reason: 'manual' })}>Remove from scope</Button>
                )}
              </span>
            )
          }
        />
      )}
      {cut && (
        <CutSheet
          row={cut.row}
          reason={cut.reason}
          svc={svcById.get(cut.row.serviceId)}
          account={account}
          client={client}
          agents={agents}
          onClose={() => { setCut(null); refresh() }}
          onChanged={refresh}
          onTry={() => { const r = cut.row; setCut(null); setTrying(r); refresh() }}
        />
      )}
      {trying && <TrySheet row={trying} svc={svcById.get(trying.serviceId)} agents={agents} onClose={() => setTrying(null)} onChanged={refresh} />}
    </>
  )
}

export const VendorsPage = () => <NeedsTeam>{({ account, client }) => <VendorsBody account={account.address} client={client} />}</NeedsTeam>
