import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { checkQuote, formatUnits } from '@leash/policy/quote-cap'
import type { PriceBook, QuoteCapPolicy, QuoteVerdict } from '@leash/policy/quote-cap'
import { allRoutes } from '@leash/policy/route'
import bookJson from '@leash/policy/data/price-book.4217.json'
import { cn } from '@/components/ui/cn'

const book = bookJson as PriceBook
const HOST = 'stablestudio.dev'
const PATH = '/api/generate/nano-banana/generate'
const NB = `https://${HOST}${PATH}`
const RECIPIENT = '0x07F067959297767c887dbfA3C72379c66E82a045'
const USDCE = '0x20c000000000000000000000b9537d11c60e8b50'

/** Real 402 challenges from stablestudio on Tempo mainnet (chain 4217), captured unpaid 2026-10-10 09:45 IST. */
const QUOTES = [
  { id: 'missing', time: '10 Oct 09:45', body: '{}', amount: '10000000', why: 'Prompt missing from the body.' },
  { id: 'valid', time: '10 Oct 09:45–50', body: '{"prompt":"a red apple"}', amount: '70000', why: 'Valid prompt.' },
  { id: 'catalog', time: 'catalog', body: '{"prompt":"a red apple"}', amount: '39000', why: 'The mpp.dev catalog price.' },
] as const

const TOLERANCES = [
  { v: 0, label: 'Exact' },
  { v: 5_000, label: '+50%' },
  { v: 10_000, label: '2x' },
  { v: 30_000, label: '4x' },
]
const CAPS = [
  { v: 0, cap: 100_000n, label: '$0.10' },
  { v: 1, cap: 1_000_000n, label: '$1.00' },
  { v: 2, cap: undefined, label: 'None' },
]

const usd = (x: bigint | string) => `$${formatUnits(BigInt(x))}`

type ForkStep = { step: string; label: string; status: string; tx: string | null; error?: string | null }
type ForkProof = { fork?: string; chainId?: number; block?: number; limitBefore?: string; limitAfter?: string; steps: ForkStep[] }

function useForkProof() {
  const [proof, setProof] = useState<ForkProof | null | undefined>(undefined)
  useEffect(() => {
    fetch('./fork-proof.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProof(j && Array.isArray(j.steps) ? j : null))
      .catch(() => setProof(null))
  }, [])
  return proof
}

/* ---------- rail: the agent's policy, as a settings sheet ---------- */

function Segmented<T extends number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="border-b border-hairline py-4">
      <legend className="float-left mb-2 w-full text-caption text-ink-muted">{label}</legend>
      <div className="clear-both flex border border-ink">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={o.v === value}
            onClick={() => onChange(o.v)}
            className={cn(
              'min-h-10 flex-1 cursor-pointer border-r border-hairline px-2 text-body-sm transition-colors duration-150 last:border-r-0',
              o.v === value ? 'bg-ink text-on-primary' : 'bg-paper text-ink hover:bg-surface-1',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Rail({ tol, setTol, cap, setCap, strict, setStrict }: { tol: number; setTol: (v: number) => void; cap: number; setCap: (v: number) => void; strict: boolean; setStrict: (v: boolean) => void }) {
  const capV = CAPS[cap]!.cap
  return (
    <aside className="order-2 lg:order-1 lg:sticky lg:top-20 lg:self-start">
      <div className="border border-hairline bg-paper px-5 pb-5">
        <div className="flex items-baseline justify-between border-b border-hairline py-4">
          <h2 className="text-body-sm">Agent policy</h2>
          <span className="text-caption text-ink-subtle">example</span>
        </div>
        <Segmented label="Tolerance above the listed price" value={tol} options={TOLERANCES} onChange={setTol} />
        <Segmented label="Hard cap per call" value={cap} options={CAPS.map((c) => ({ v: c.v, label: c.label }))} onChange={setCap} />
        <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-hairline py-4">
          <span>
            <span className="block text-body-sm">Refuse unlisted endpoints</span>
            <span className="block text-caption text-ink-muted">Otherwise they are held to the hard cap.</span>
          </span>
          <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="mt-1 size-4 cursor-pointer accent-ink" />
        </label>
        <dl className="num grid grid-cols-[1fr_auto] gap-y-1 pt-4 text-caption">
          <dt className="text-ink-muted">Chain limit on key</dt><dd>$0.20 / day</dd>
          <dt className="text-ink-muted">Key scope</dt><dd>stablestudio only</dd>
          <dt className="text-ink-muted">Settles in</dt><dd>USDC.e</dd>
        </dl>
        <pre className="mt-4 overflow-x-auto bg-surface-1 p-3 font-mono text-caption leading-relaxed text-ink">{`createLeashFetch({
  network, agent,
  quoteCap: { book, policy: {
    toleranceBps: ${tol},
    maxPerCall: ${capV === undefined ? 'undefined' : `${capV}n`},
    unlisted: '${strict ? 'refuse' : 'cap'}',
  } },
})`}</pre>
      </div>
    </aside>
  )
}

/* ---------- the receipt: one 402 quote, printed ---------- */

function Perforation({ flip }: { flip?: boolean }) {
  // A row of punched holes: the torn edge of thermal paper.
  return (
    <svg className={cn('perf', flip && 'rotate-180')} viewBox="0 0 240 8" preserveAspectRatio="none" aria-hidden>
      <path fill="currentColor" d={Array.from({ length: 24 }, (_, i) => `M${i * 10} 0 L${i * 10 + 5} 6 L${i * 10 + 10} 0 Z`).join(' ')} />
    </svg>
  )
}

function Line({ k, v, strong, tone }: { k: string; v: ReactNode; strong?: boolean; tone?: 'bad' | 'ok' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-0.5', strong && 'font-semibold')}>
      <span className="text-ink-muted">{k}</span>
      <span className={cn('text-right', tone === 'bad' && 'text-error-ink', tone === 'ok' && 'text-success-ink')}>{v}</span>
    </div>
  )
}

function Receipt({ q, v }: { q: (typeof QUOTES)[number]; v: QuoteVerdict }) {
  const ratio = v.listed && v.listed > 0n ? Number((v.quoted * 100n) / v.listed) / 100 : null
  const ratioLabel = ratio === null ? '' : ratio >= 10 ? `${Math.round(ratio)}x` : `${ratio.toFixed(2)}x`
  return (
    <article aria-label={`402 quote ${usd(q.amount)}: ${v.ok ? 'paid' : 'refused'}`} className="receipt w-full max-w-[340px] shrink-0 text-caption">
      <Perforation flip />
      <div className="px-5 pb-5 pt-3">
        <div className="flex items-baseline justify-between border-b border-dashed border-surface-3 pb-2">
          <span className="font-semibold">402 PAYMENT REQUIRED</span>
          <span className="text-ink-subtle">{q.time}</span>
        </div>
        <div className="border-b border-dashed border-surface-3 py-2 text-ink-muted">
          <p className="truncate">POST {HOST}</p>
          <p className="truncate">{PATH}</p>
          <p className="truncate">body {q.body}</p>
        </div>
        <div className="border-b border-dashed border-surface-3 py-2">
          <Line k="listed" v={v.listed === null ? 'unlisted' : usd(v.listed)} />
          <Line k="ceiling" v={v.ceiling === null ? 'none' : usd(v.ceiling)} />
          <Line k="asked" v={usd(q.amount)} strong tone={v.ok ? undefined : 'bad'} />
          {ratio !== null && ratio !== 1 && <Line k="vs listing" v={ratioLabel} />}
        </div>
        <div className="flex items-center justify-between gap-4 pt-4">
          <span key={`${v.ok}`} className={cn('stamp', v.ok ? 'text-success-ink' : 'text-error')}>{v.ok ? 'PAID' : 'REFUSED'}</span>
          <span className="max-w-[150px] text-right text-ink-muted">{v.ok ? 'key signs, tx settles' : 'nothing signed, nothing sent'}</span>
        </div>
        <p className="mt-3 text-ink-subtle">to {RECIPIENT.slice(0, 6)}…{RECIPIENT.slice(-4)} · chain 4217</p>
      </div>
      <Perforation />
    </article>
  )
}

/* ---------- stream sections ---------- */

function ForkFeed() {
  const proof = useForkProof()
  if (proof === undefined) return null
  return (
    <section aria-labelledby="fork-h" className="mt-16">
      <h2 id="fork-h" className="text-card-title">The same quotes on a fork of Tempo mainnet</h2>
      <p className="mt-2 max-w-2xl text-body-sm text-ink-muted">
        {proof
          ? `anvil fork of ${proof.fork?.replace('https://', '')} at block ${proof.block?.toLocaleString()}. The agent key's chain limit went from ${usd(proof.limitBefore ?? '0')} to ${usd(proof.limitAfter ?? '0')}. Hashes exist only on the local fork. Revert reasons are inferred; the fork returns no revert data.`
          : 'The fork run is not published yet: run scripts/fork/run-fork-demo.sh, then scripts/fork/to-web.py.'}
      </p>
      {proof && (
        <ol className="mt-6 border-t border-hairline">
          {proof.steps.map((s, i) => {
            const bad = /refus|revert/i.test(s.status)
            const ok = /success/i.test(s.status)
            return (
              <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-hairline py-3 md:grid-cols-[2.5rem_1fr_12rem]">
                <span className="num pt-0.5 text-caption text-ink-subtle">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <p className="text-body-sm">{s.label}</p>
                  {s.error && <p className="num mt-0.5 text-caption text-ink-muted">{s.error}</p>}
                  {s.tx && <p className="num mt-0.5 truncate text-caption text-ink-subtle">fork tx {s.tx}</p>}
                </div>
                <span className={cn('num col-start-2 text-caption md:col-start-3 md:text-right', bad ? 'text-error-ink' : ok ? 'text-success-ink' : 'text-ink-muted')}>{s.status}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function RouteRows() {
  const [calls, setCalls] = useState(10_000)
  const plans = useMemo(() => allRoutes(book), [])
  return (
    <section aria-labelledby="route-h" className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="route-h" className="text-card-title">Route: the same API from a cheaper seller</h2>
          <p className="mt-2 max-w-2xl text-body-sm text-ink-muted">Resellers list the same upstream call at different prices. Leash points the agent at the cheapest listing, and Quote-Cap then holds that seller to it.</p>
        </div>
        <label className="text-caption text-ink-muted">
          Calls per month
          <select value={calls} onChange={(e) => setCalls(Number(e.target.value))} className="num mt-1 block min-h-10 cursor-pointer border border-ink bg-paper px-3 text-body-sm text-ink">
            {[1_000, 10_000, 100_000].map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-6 border-t border-hairline">
        {plans.map((p) => (
          <div key={p.group.id} className="grid gap-3 border-b border-hairline py-4 md:grid-cols-[12rem_1fr_9rem] md:items-center">
            <p className="text-body-sm font-semibold">{p.group.label}</p>
            <div className="num space-y-1 text-caption">
              {p.options.map((o, i) => (
                <div key={o.url} className="flex items-baseline gap-3">
                  <span className={cn('w-4 shrink-0', i === 0 ? 'text-ink' : 'text-ink-subtle')}>{i === 0 ? '→' : ''}</span>
                  <span className={cn('w-28 shrink-0 truncate', i === 0 ? 'text-ink' : 'text-ink-subtle line-through')}>{o.service}</span>
                  <span className={cn('w-16 shrink-0 text-right', i === 0 ? 'text-ink' : 'text-ink-subtle')}>{usd(o.amount)}</span>
                  <span className="hidden truncate text-ink-subtle sm:inline">{o.url.replace('https://', '')}</span>
                </div>
              ))}
            </div>
            <div className="md:text-right">
              <p className="num text-body">{usd(p.savingPerCall * BigInt(calls))}</p>
              <p className="text-caption text-ink-muted">saved, {(p.savingBps / 100).toFixed(0)}% per call</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-caption text-ink-subtle">Listed prices from the mpp.dev catalog, 2026-10-10. Live 402s matched the listing where the seller answered. Sellers' outputs were not compared with paid calls.</p>
    </section>
  )
}

export function QuoteCapPage() {
  const [tol, setTol] = useState(0)
  const [cap, setCap] = useState(1)
  const [strict, setStrict] = useState(false)
  const policy: QuoteCapPolicy = { toleranceBps: tol, maxPerCall: CAPS[cap]!.cap, unlisted: strict ? 'refuse' : 'cap' }
  const verdicts = QUOTES.map((q) => checkQuote(book, policy, { method: 'POST', url: NB, amount: q.amount, currency: USDCE }))
  const refused = verdicts.filter((v) => !v.ok).length

  return (
    <div className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
      <Rail tol={tol} setTol={setTol} cap={cap} setCap={setCap} strict={strict} setStrict={setStrict} />
      <div className="order-1 min-w-0 lg:order-2">
        <header className="max-w-3xl">
          <h1 className="text-headline">stablestudio lists this image call at $0.039. Its 402 asked for $10.00.</h1>
          <p className="mt-3 text-body text-ink-muted">
            A default MPP client signs whatever amount the 402 names. Leash checks each quote against the listed price before the agent key signs. Below are the three real quotes from Tempo mainnet, run through the agent policy.
          </p>
        </header>

        <div className="mt-6 flex items-baseline justify-between border-b border-hairline pb-2">
          <h2 className="text-body-sm font-semibold">402 quotes</h2>
          <span className="num text-caption text-ink-muted" aria-live="polite">{refused} refused · {QUOTES.length - refused} paid</span>
        </div>
        <div className="mt-6 flex snap-x gap-6 overflow-x-auto pb-2">
          {QUOTES.map((q, i) => (
            <div key={q.id} className="snap-start">
              <Receipt q={q} v={verdicts[i]!} />
              <p className="mt-2 max-w-[340px] text-caption text-ink-muted">{q.why}</p>
            </div>
          ))}
        </div>

        <section aria-labelledby="how-h" className="mt-16 grid gap-8 md:grid-cols-2">
          <div>
            <h2 id="how-h" className="text-card-title">Two locks</h2>
            <p className="mt-2 text-body-sm text-ink-muted">
              <span className="text-ink">Before signing.</span> The guard runs in mppx's onChallenge hook. A quote above the listed price plus tolerance, or above the hard cap, throws QuoteCapExceeded. No credential is created, so there is nothing to refund.
            </p>
            <p className="mt-3 text-body-sm text-ink-muted">
              <span className="text-ink">If the guard is bypassed.</span> The agent's Tempo access key is scoped to the vendor's payout address with a daily limit the chain enforces. The fork run below shows the chain reverting both.
            </p>
          </div>
          <div className="num border-l border-hairline pl-6 text-caption leading-relaxed text-ink-muted">
            <p className="text-ink">record (refused)</p>
            <p>outcome: "refused"</p>
            <p>refused: "QuoteCapExceeded"</p>
            <p>quote.listed: "39000"</p>
            <p>quote.quoted: "10000000"</p>
            <p>quote.reason: "above_listing"</p>
            <p>settlement: null</p>
          </div>
        </section>

        <ForkFeed />
        <RouteRows />
      </div>
    </div>
  )
}
