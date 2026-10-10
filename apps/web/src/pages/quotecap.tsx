import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { checkQuote, formatUnits } from '@leash/policy/quote-cap'
import type { PriceBook, QuoteCapPolicy } from '@leash/policy/quote-cap'
import { allRoutes } from '@leash/policy/route'
import bookJson from '@leash/policy/data/price-book.4217.json'
import { cn } from '@/components/ui/cn'

const book = bookJson as PriceBook
const NB = 'https://stablestudio.dev/api/generate/nano-banana/generate'
const RECIPIENT = '0x07F067959297767c887dbfA3C72379c66E82a045'
const USDCE = '0x20c000000000000000000000b9537d11c60e8b50'

/** Real 402 challenges from stablestudio on Tempo mainnet, captured unpaid on 2026-10-10 09:45 IST. */
const SCENARIOS = [
  { id: 'missing', label: 'Body without a prompt', body: '{}', amount: '10000000', note: 'A field is missing. The vendor asks 256x the listing.' },
  { id: 'valid', label: 'Valid prompt', body: '{"prompt":"a red apple"}', amount: '70000', note: 'A normal call. Still 1.8x the listing.' },
  { id: 'listed', label: 'At the listing', body: '{"prompt":"a red apple"}', amount: '39000', note: 'What the mpp.dev catalog says this call costs.' },
] as const

const TOLERANCES = [
  { bps: 0, label: 'Exact' },
  { bps: 5_000, label: '+50%' },
  { bps: 10_000, label: '2x' },
  { bps: 30_000, label: '4x' },
]
const CAPS = [
  { v: 100_000n, label: '$0.10' },
  { v: 1_000_000n, label: '$1.00' },
  { v: undefined, label: 'None' },
]

const usd = (x: bigint | string) => `$${formatUnits(BigInt(x))}`

type ForkStep = { step: string; label: string; status: string; tx: string | null; amount?: number | null; error?: string | null }
type ForkProof = { fork?: string; chainId?: number; block?: number; limitBefore?: string; limitAfter?: string; steps: ForkStep[] }

function useForkProof() {
  const [proof, setProof] = useState<ForkProof | null>(null)
  useEffect(() => {
    fetch('/fork-proof.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProof(j && Array.isArray(j.steps) ? j : null))
      .catch(() => setProof(null))
  }, [])
  return proof
}

function Stage({ n, title, state, children }: { n: number; title: string; state: 'done' | 'stop' | 'skip' | 'go'; children?: ReactNode }) {
  return (
    <li className={cn('relative border-l-4 py-3 pl-4', state === 'stop' ? 'border-error' : state === 'skip' ? 'border-surface-3' : state === 'go' ? 'border-success' : 'border-primary')}>
      <p className={cn('text-caption uppercase tracking-wider', state === 'skip' ? 'text-ink-subtle' : 'text-ink-muted')}>Step {n}</p>
      <p className={cn('text-body-sm font-semibold', state === 'skip' && 'text-ink-subtle line-through')}>{title}</p>
      {children && <div className={cn('mt-1 text-caption', state === 'skip' ? 'text-ink-subtle' : 'text-ink-muted')}>{children}</div>}
    </li>
  )
}

function Intercept({ policy, scenario }: { policy: QuoteCapPolicy; scenario: (typeof SCENARIOS)[number] }) {
  const v = checkQuote(book, policy, { method: 'POST', url: NB, amount: scenario.amount, currency: USDCE })
  const listed = v.listed ?? 0n
  const ratio = listed > 0n ? Number((BigInt(scenario.amount) * 100n) / listed) / 100 : 0
  const widthQuoted = Math.min(100, Math.max(4, (Math.log10(Number(scenario.amount)) - 3.5) * 30))
  const widthListed = Math.min(100, Math.max(4, (Math.log10(Number(listed)) - 3.5) * 30))
  const widthCeil = v.ceiling ? Math.min(100, Math.max(4, (Math.log10(Number(v.ceiling)) - 3.5) * 30)) : 100
  return (
    <div className="grid gap-px bg-inverse-surface lg:grid-cols-[1.4fr_1fr]">
      <div className="bg-inverse-canvas p-6 text-inverse-ink sm:p-8">
        <p className="font-mono text-caption text-inverse-ink-muted">POST {NB.replace('https://', '')}</p>
        <p className="font-mono text-caption text-inverse-ink-muted">body {scenario.body}</p>
        <p className="mt-1 font-mono text-caption text-warning">← 402 Payment Required · tempo charge · to {RECIPIENT.slice(0, 8)}…{RECIPIENT.slice(-4)}</p>

        <div className="mt-8 grid grid-cols-2 gap-6">
          <div>
            <p className="text-caption uppercase tracking-wider text-inverse-ink-muted">Listed on mpp.dev</p>
            <p className="num mt-1 text-display-md font-light">{usd(listed)}</p>
          </div>
          <div>
            <p className="text-caption uppercase tracking-wider text-inverse-ink-muted">Vendor asks</p>
            <p className={cn('num mt-1 text-display-md font-light', v.ok ? 'text-inverse-ink' : 'text-[#ff8389]')}>{usd(scenario.amount)}</p>
          </div>
        </div>

        <div className="mt-8 space-y-2" aria-hidden>
          <Bar label="listed" width={widthListed} className="bg-inverse-ink-muted" />
          <Bar label="ceiling" width={widthCeil} className="bg-primary" />
          <Bar label="asked" width={widthQuoted} className={v.ok ? 'bg-success' : 'bg-error'} />
          <p className="pt-1 text-caption text-inverse-ink-muted">log scale · {ratio}x the listing</p>
        </div>
      </div>

      <div className={cn('flex flex-col justify-between p-6 sm:p-8', v.ok ? 'bg-success-tint' : 'bg-error')}>
        <div>
          <p className={cn('text-caption uppercase tracking-[0.2em]', v.ok ? 'text-success-ink' : 'text-inverse-ink')}>Quote-Cap verdict</p>
          <p className={cn('mt-3 text-display-md font-light leading-none', v.ok ? 'text-success-ink' : 'text-inverse-ink')}>{v.ok ? 'Signed' : 'Refused'}</p>
          <p className={cn('mt-4 text-body', v.ok ? 'text-ink' : 'text-inverse-ink')}>
            {v.ok
              ? `${usd(scenario.amount)} is within the ceiling of ${v.ceiling ? usd(v.ceiling) : 'none'}. The agent key signs and the charge settles.`
              : `${usd(scenario.amount)} is above the ceiling of ${v.ceiling ? usd(v.ceiling) : 'the listing'}. No credential was created, no transaction signed, nothing left the wallet.`}
          </p>
        </div>
        <p className={cn('mt-6 font-mono text-caption', v.ok ? 'text-success-ink' : 'text-inverse-ink')}>
          {v.ok ? 'record.outcome = "delivered"' : `record.refused = "QuoteCapExceeded" · reason = "${v.reason}"`}
        </p>
      </div>
    </div>
  )
}

function Bar({ label, width, className }: { label: string; width: number; className: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 font-mono text-caption text-inverse-ink-muted">{label}</span>
      <div className="h-3 flex-1 bg-inverse-surface">
        <div className={cn('h-3 transition-all duration-500', className)} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-caption text-ink-muted">{label}</legend>
      <div className="flex flex-wrap border border-hairline-strong">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={o.v === value}
            onClick={() => onChange(o.v)}
            className={cn('h-10 flex-1 whitespace-nowrap px-4 text-body-sm', o.v === value ? 'bg-ink text-inverse-ink' : 'bg-canvas hover:bg-surface-1')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function RouteTable() {
  const [calls, setCalls] = useState(10_000)
  const plans = useMemo(() => allRoutes(book), [])
  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-caption uppercase tracking-[0.2em] text-primary">Route</p>
          <h2 className="mt-1 text-headline font-light">Same API, cheaper seller</h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">
            Several MPP sellers resell the same upstream API at different listed prices. Leash points the agent at the cheapest listing and the Quote-Cap then holds that seller to it.
          </p>
        </div>
        <label className="text-caption text-ink-muted">
          Calls per month
          <select value={calls} onChange={(e) => setCalls(Number(e.target.value))} className="mt-2 block h-10 border-b border-hairline-strong bg-surface-1 px-3 text-body-sm text-ink">
            {[1_000, 10_000, 100_000].map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-6 grid gap-px border border-hairline bg-hairline md:grid-cols-3">
        {plans.map((p) => {
          const max = Number(p.priciest.amount)
          return (
            <article key={p.group.id} className="flex flex-col bg-canvas p-6">
              <h3 className="text-subhead">{p.group.label}</h3>
              <ul className="mt-4 space-y-3">
                {p.options.map((o, i) => (
                  <li key={o.url}>
                    <div className="flex items-baseline justify-between gap-3 text-body-sm">
                      <span className={cn(i === 0 && 'font-semibold')}>{o.service}{i === 0 && <span className="ml-2 bg-primary px-1.5 py-0.5 text-caption text-on-primary">route here</span>}</span>
                      <span className="num">{usd(o.amount)}</span>
                    </div>
                    <div className="mt-1 h-2 bg-surface-1">
                      <div className={cn('h-2', i === 0 ? 'bg-primary' : 'bg-surface-3')} style={{ width: `${(Number(o.amount) / max) * 100}%` }} />
                    </div>
                    <p className="mt-1 truncate font-mono text-caption text-ink-subtle">{o.url.replace('https://', '')}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <p className="text-caption text-ink-muted">Saved at {calls.toLocaleString()} calls</p>
                <p className="num text-card-title font-light text-primary">{usd(p.savingPerCall * BigInt(calls))}</p>
                <p className="text-caption text-ink-subtle">{(p.savingBps / 100).toFixed(0)}% off per call</p>
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-3 text-caption text-ink-subtle">
        Listed prices: mpp.dev catalog, 2026-10-10. Live 402s matched the listing where the seller answered. Output equivalence between sellers was not checked with paid calls.
      </p>
    </section>
  )
}

function ForkProofSection() {
  const proof = useForkProof()
  return (
    <section className="mt-16">
      <p className="text-caption uppercase tracking-[0.2em] text-primary">Chain proof</p>
      <h2 className="mt-1 text-headline font-light">Replayed on a fork of Tempo mainnet</h2>
      <p className="mt-2 max-w-2xl text-body text-ink-muted">
        The same three stablestudio quotes, paid (or refused) by a scoped agent key on a local fork of Tempo mainnet. No real funds move.
      </p>
      {proof && (
        <p className="mt-4 text-caption text-ink-muted">
          anvil fork of {proof.fork} at block <span className="num">{proof.block?.toLocaleString()}</span>, chain {proof.chainId}. Agent key limit {usd(proof.limitBefore ?? '0')} before, {usd(proof.limitAfter ?? '0')} left after. Revert reasons are inferred: the fork returns no revert data. Tenderly does not support Tempo.
        </p>
      )}
      {proof ? (
        <ol className="mt-6 border border-hairline">
          {proof.steps.map((s, i) => (
            <li key={i} className="grid gap-2 border-b border-hairline p-4 last:border-b-0 md:grid-cols-[1fr_auto]">
              <div>
                <p className="text-body-sm">{s.label}</p>
                {s.error && <p className="mt-1 font-mono text-caption text-error-ink">{s.error}</p>}
                {s.tx && <p className="mt-1 truncate font-mono text-caption text-ink-subtle">local-fork tx (not on mainnet) {s.tx}</p>}
              </div>
              <span className={cn('self-start px-2 py-0.5 text-caption', /refus|revert/i.test(s.status) ? 'bg-error-tint text-error-ink' : /success|pass|ok/i.test(s.status) ? 'bg-success-tint text-success-ink' : 'bg-surface-1 text-ink-muted')}>{s.status}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 border border-dashed border-hairline p-6 text-body-sm text-ink-muted">Fork run not published yet. Run <span className="font-mono">scripts/fork/run-fork-demo.sh</span>.</p>
      )}
    </section>
  )
}

export function QuoteCapPage() {
  const [sid, setSid] = useState<(typeof SCENARIOS)[number]['id']>('missing')
  const [tol, setTol] = useState(0)
  const [capIdx, setCapIdx] = useState(1)
  const scenario = SCENARIOS.find((s) => s.id === sid)!
  const policy: QuoteCapPolicy = { toleranceBps: tol, maxPerCall: CAPS[capIdx]!.v, unlisted: 'cap' }
  const v = checkQuote(book, policy, { method: 'POST', url: NB, amount: scenario.amount, currency: USDCE })

  return (
    <div>
      <header className="mb-10 max-w-4xl">
        <p className="text-caption uppercase tracking-[0.2em] text-primary">Leash Quote-Cap · Tempo MPP</p>
        <h1 className="mt-2 text-display-md font-light">Your agent never pays more than the price on the menu.</h1>
        <p className="mt-4 text-body-lg text-ink-muted">
          An MPP vendor names its price in the 402 challenge, and a default client signs whatever it names. On Tempo mainnet, stablestudio lists an image call at $0.039 and asked for $10.00 when the prompt was missing. Leash checks every quote against the listing before the agent key signs.
        </p>
      </header>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Segmented label="Replay a real stablestudio 402" value={sid} options={SCENARIOS.map((s) => ({ v: s.id, label: s.label }))} onChange={setSid} />
        <Segmented label="Tolerance above listing" value={tol} options={TOLERANCES.map((t) => ({ v: t.bps, label: t.label }))} onChange={setTol} />
        <Segmented label="Hard cap per call" value={capIdx} options={CAPS.map((c, i) => ({ v: i, label: c.label }))} onChange={setCapIdx} />
      </div>

      <Intercept policy={policy} scenario={scenario} />
      <p className="mt-3 text-caption text-ink-subtle">{scenario.note} Captured unpaid from Tempo mainnet (chain 4217), 2026-10-10 09:45 IST.</p>

      <section className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-subhead">Where the check sits</h2>
          <ol className="mt-4 space-y-1">
            <Stage n={1} title="Agent calls the API" state="done">mppx fetch, no payment yet</Stage>
            <Stage n={2} title="Vendor answers 402 with a quote" state="done">amount {usd(scenario.amount)} in USDC.e</Stage>
            <Stage n={3} title="Quote-Cap compares quote to listing" state={v.ok ? 'go' : 'stop'}>
              listed {usd(v.listed ?? 0n)}, ceiling {v.ceiling ? usd(v.ceiling) : 'none'}{v.ok ? '' : ' · throws QuoteCapExceeded in onChallenge'}
            </Stage>
            <Stage n={4} title="Agent access key signs the charge" state={v.ok ? 'done' : 'skip'}>Tempo 0x76 tx, scoped key</Stage>
            <Stage n={5} title="Settles on chain, vendor delivers" state={v.ok ? 'done' : 'skip'}>joined to the ledger by memo</Stage>
          </ol>
        </div>
        <div>
          <h2 className="text-subhead">Two locks, not one</h2>
          <div className="mt-4 space-y-4 text-body-sm text-ink-muted">
            <p><span className="font-semibold text-ink">Before signing:</span> the Quote-Cap guard in the payment path refuses a quote above the listing plus tolerance, or above the per-call cap. Nothing is signed, so there is nothing to refund.</p>
            <p><span className="font-semibold text-ink">If the guard is bypassed:</span> the agent's Tempo access key is scoped to the vendor's payout and a spend limit the chain enforces, so a compromised agent still cannot overspend.</p>
            <pre className="overflow-x-auto bg-surface-1 p-4 font-mono text-caption text-ink">{`createLeashFetch({
  network, agent,
  quoteCap: { book, policy: { toleranceBps: ${tol}, maxPerCall: ${CAPS[capIdx]!.v ?? 'undefined'}n, unlisted: 'cap' } },
})`}</pre>
          </div>
        </div>
      </section>

      <RouteTable />
      <ForkProofSection />
    </div>
  )
}
