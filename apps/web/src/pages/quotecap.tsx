import { useEffect, useMemo, useState } from 'react'
import { checkQuote, formatUnits } from '@leash/policy/quote-cap'
import type { PriceBook, QuoteCapPolicy } from '@leash/policy/quote-cap'
import { allRoutes } from '@leash/policy/route'
import bookJson from '@leash/policy/data/price-book.4217.json'
import { Button } from '@/components/shadcn/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/shadcn/toggle-group'
import { Separator } from '@/components/shadcn/separator'
import { cn } from '@/lib/utils'

const book = bookJson as PriceBook
const NB = 'https://stablestudio.dev/api/generate/nano-banana/generate'
const USDCE = '0x20c000000000000000000000b9537d11c60e8b50'

/** Real 402 challenges from stablestudio on Tempo mainnet (chain 4217), captured unpaid 2026-10-10 09:45 IST. */
const QUOTES = [
  { id: 'missing', label: 'No prompt', amount: '10000000', note: 'The request body was empty. stablestudio still asked for payment, at 256 times its listing.' },
  { id: 'valid', label: 'With prompt', amount: '70000', note: 'A normal request. The 402 asked for 1.8 times the catalog price.' },
  { id: 'catalog', label: 'Listed', amount: '39000', note: 'What the mpp.dev catalog says this call costs.' },
] as const

const TOLERANCES = [
  { v: '0', label: 'Exact' },
  { v: '5000', label: '+50%' },
  { v: '10000', label: '2x' },
  { v: '30000', label: '4x' },
]
const CAPS: Record<string, bigint | undefined> = { '100000': 100_000n, '1000000': 1_000_000n, none: undefined }

const usd = (x: bigint | string) => `$${formatUnits(BigInt(x))}`

type ForkStep = { step: string; label: string; status: string; tx: string | null; error?: string | null }
type ForkProof = { fork?: string; block?: number; limitBefore?: string; limitAfter?: string; steps: ForkStep[] }

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

function Row({ k, v, big, tone }: { k: string; v: string; big?: boolean; tone?: 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <span className="text-body text-ink-muted">{k}</span>
      <span className={cn('num', big ? 'text-headline' : 'text-body-lg', tone === 'bad' && 'text-error-ink')}>{v}</span>
    </div>
  )
}

/* The one decision on the page: run a real 402 quote through the agent's policy. */
function QuoteCheck() {
  const [qid, setQid] = useState<string>('missing')
  const [tol, setTol] = useState('0')
  const [cap, setCap] = useState('1000000')
  const [ran, setRan] = useState<string | null>(null)
  const q = QUOTES.find((x) => x.id === qid)!
  const policy: QuoteCapPolicy = { toleranceBps: Number(tol), maxPerCall: CAPS[cap], unlisted: 'cap' }
  const v = checkQuote(book, policy, { method: 'POST', url: NB, amount: q.amount, currency: USDCE })
  const key = `${qid}|${tol}|${cap}`
  const shown = ran === key

  return (
    <section aria-label="Quote check" className="border border-ink bg-paper">
      <div className="p-6 sm:p-8">
        <p className="text-body-sm text-ink-muted">stablestudio · image generation · Tempo mainnet</p>
        <ToggleGroup type="single" value={qid} onValueChange={(x) => x && setQid(x)} aria-label="Which 402 quote" className="mt-4 w-full">
          {QUOTES.map((x) => <ToggleGroupItem key={x.id} value={x.id}>{x.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="mt-6">
          <Row k="Listed price" v={v.listed === null ? 'unlisted' : usd(v.listed)} />
          <Separator />
          <Row k="The 402 asks" v={usd(q.amount)} big tone={v.ok ? undefined : 'bad'} />
          <Separator />
          <Row k="Most this agent will pay" v={v.ceiling === null ? 'no limit' : usd(v.ceiling)} />
        </div>
        <p className="mt-2 text-body-sm text-ink-muted">{q.note}</p>
      </div>

      <div className="border-t border-hairline bg-canvas p-6 sm:p-8">
        <h2 className="text-body font-semibold">Agent policy</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <p id="tol-l" className="text-body-sm text-ink-muted">Allowed above the listing</p>
            <ToggleGroup type="single" value={tol} onValueChange={(x) => x && setTol(x)} aria-labelledby="tol-l" size="sm" className="mt-2 w-full">
              {TOLERANCES.map((t) => <ToggleGroupItem key={t.v} value={t.v}>{t.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div>
            <p id="cap-l" className="text-body-sm text-ink-muted">Hard cap per call</p>
            <ToggleGroup type="single" value={cap} onValueChange={(x) => x && setCap(x)} aria-labelledby="cap-l" size="sm" className="mt-2 w-full">
              <ToggleGroupItem value="100000">$0.10</ToggleGroupItem>
              <ToggleGroupItem value="1000000">$1.00</ToggleGroupItem>
              <ToggleGroupItem value="none">None</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <Button size="lg" className="mt-8 w-full" onClick={() => setRan(key)}>Let the agent pay this quote</Button>
        <div aria-live="polite" className="min-h-24 pt-6">
          {shown ? (
            v.ok ? (
              <div className="border-l-4 border-success pl-4">
                <p className="text-subhead text-success-ink">Paid {usd(q.amount)}</p>
                <p className="mt-1 text-body text-ink-muted">Within the policy, so the agent key signs and the payment settles on Tempo.</p>
              </div>
            ) : (
              <div className="border-l-4 border-error pl-4">
                <p className="text-subhead text-error-ink">Refused before signing</p>
                <p className="mt-1 text-body text-ink-muted">Leash threw QuoteCapExceeded inside the payment hook. No credential was made and no money moved, so there is nothing to refund.</p>
              </div>
            )
          ) : (
            <p className="text-body text-ink-muted">Pick a quote, set the policy, then press the button to see what the agent does.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function ForkSteps() {
  const proof = useForkProof()
  if (!proof) return null
  return (
    <section aria-labelledby="fork-h" className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <h2 id="fork-h" className="text-headline">The same quotes, run on a fork of Tempo mainnet</h2>
        <p className="mt-4 text-body-lg text-ink-muted">
          A local anvil fork at block {proof.block?.toLocaleString()}. The agent key's daily limit went from {usd(proof.limitBefore ?? '0')} to {usd(proof.limitAfter ?? '0')}. These hashes exist only on that fork, and no real money moved.
        </p>
      </div>
      <ol className="border-t border-ink">
        {proof.steps.map((s, i) => {
          const bad = /refus|revert/i.test(s.status)
          const ok = /success/i.test(s.status)
          return (
            <li key={i} className="flex items-baseline justify-between gap-6 border-b border-hairline py-4">
              <div className="min-w-0">
                <p className="text-body">{s.label}</p>
                {s.tx && <p className="hash mt-1 truncate text-caption text-ink-muted">{s.tx.slice(0, 10)}…{s.tx.slice(-8)}</p>}
              </div>
              <span className={cn('shrink-0 text-body-sm font-semibold', bad ? 'text-error-ink' : ok ? 'text-success-ink' : 'text-ink-muted')}>
                {bad ? 'Refused' : ok ? 'Settled' : s.status}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Routes() {
  const plans = useMemo(() => allRoutes(book), [])
  return (
    <section aria-labelledby="route-h" className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <h2 id="route-h" className="text-headline">The same API, from the cheapest seller</h2>
        <p className="mt-4 text-body-lg text-ink-muted">Resellers list the same upstream call at different prices. Leash sends the agent to the cheapest listing, and the quote check then holds that seller to its own price.</p>
        <p className="mt-4 text-body-sm text-ink-muted">Prices from the mpp.dev catalog on 10 Oct 2026.</p>
      </div>
      <ul className="border-t border-ink">
        {plans.map((p) => {
          const best = p.options[0]!
          const worst = p.options[p.options.length - 1]!
          return (
            <li key={p.group.id} className="flex items-baseline justify-between gap-6 border-b border-hairline py-4">
              <div className="min-w-0">
                <p className="text-body font-semibold">{p.group.label}</p>
                <p className="mt-1 text-body-sm text-ink-muted">{best.service} at <span className="num">{usd(best.amount)}</span> instead of {worst.service} at <span className="num">{usd(worst.amount)}</span></p>
              </div>
              <span className="shrink-0 text-body-lg"><span className="num">{(p.savingBps / 100).toFixed(0)}%</span> less</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function QuoteCapPage() {
  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="grid gap-12 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-16">
        <header className="lg:pt-6">
          <h1 className="text-display-md">Your agent never pays more than the listed price.</h1>
          <p className="mt-6 text-body-lg text-ink-muted">
            stablestudio lists one image call at <span className="num text-ink">$0.039</span>. When we asked without a prompt, its 402 asked for <span className="num text-ink">$10.00</span>. A default MPP client signs whatever the 402 names.
          </p>
          <p className="mt-4 text-body-lg text-ink-muted">Leash checks every quote against the listing before the agent key signs. If the price is wrong, the payment never starts.</p>
        </header>
        <QuoteCheck />
      </div>
      <div className="space-y-24 py-16 lg:space-y-32">
        <section aria-labelledby="locks-h" className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <h2 id="locks-h" className="text-headline">Two locks, in order</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-body font-semibold">1. Before signing</p>
              <p className="mt-2 text-body text-ink-muted">The check runs in the MPP client's challenge hook. A quote above the listing plus your allowance, or above the hard cap, is refused. Nothing is signed, so nothing needs a refund.</p>
            </div>
            <div>
              <p className="text-body font-semibold">2. If the check is bypassed</p>
              <p className="mt-2 text-body text-ink-muted">The agent's Tempo access key only pays the vendor's address, up to a daily limit the chain enforces. The fork run below shows the chain refusing both.</p>
            </div>
          </div>
        </section>
        <ForkSteps />
        <Routes />
      </div>
    </div>
  )
}
