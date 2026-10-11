import type * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { checkQuote, formatUnits } from '@leash/policy/quote-cap'
import type { PriceBook, QuoteCapPolicy } from '@leash/policy/quote-cap'
import { allRoutes } from '@leash/policy/route'
import bookJson from '@leash/policy/data/price-book.4217.json'
import { Button } from '@/components/shadcn/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/shadcn/toggle-group'
import { Card, Chip, Hash, Metric, SectionHead, TextLink, Eyebrow } from '@/components/kit'
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
      <span className={cn('num', big ? 'text-headline font-semibold' : 'text-body-lg', tone === 'bad' && 'text-error-ink')}>{v}</span>
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
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null)
  const [btnOut, setBtnOut] = useState(false)
  useEffect(() => {
    if (!btn) return
    const io = new IntersectionObserver(([e]) => setBtnOut(!e!.isIntersecting))
    io.observe(btn)
    return () => io.disconnect()
  }, [btn])

  return (
    <Card aria-label="Quote check" className="overflow-hidden">
      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-ink-muted">stablestudio · image generation</p>
          <Chip tone="info">Tempo mainnet 402</Chip>
        </div>
        <ToggleGroup type="single" value={qid} onValueChange={(x) => x && setQid(x)} aria-label="Which 402 quote" className="mt-4 w-full">
          {QUOTES.map((x) => <ToggleGroupItem key={x.id} value={x.id}>{x.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="mt-4 divide-y divide-hairline">
          <Row k="Listed price" v={v.listed === null ? 'unlisted' : usd(v.listed)} />
          <Row k="The 402 asks" v={usd(q.amount)} big tone={shown && !v.ok ? 'bad' : undefined} />
          <Row k="Most this agent will pay" v={v.ceiling === null ? 'no limit' : usd(v.ceiling)} />
        </div>
        <p className="mt-2 text-body-sm text-ink-subtle">{q.note}</p>
      </div>

      <div className="border-t border-hairline bg-surface-1/60 p-6 sm:p-7">
        <h2 className="text-body font-semibold">Agent policy</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <p id="tol-l" className="text-body-sm text-ink-muted">Allowed above the listing</p>
            <ToggleGroup type="single" value={tol} onValueChange={(x) => x && setTol(x)} aria-labelledby="tol-l" className="mt-2 w-full">
              {TOLERANCES.map((t) => <ToggleGroupItem key={t.v} value={t.v}>{t.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div>
            <p id="cap-l" className="text-body-sm text-ink-muted">Hard cap per call</p>
            <ToggleGroup type="single" value={cap} onValueChange={(x) => x && setCap(x)} aria-labelledby="cap-l" className="mt-2 w-full">
              <ToggleGroupItem value="100000">$0.10</ToggleGroupItem>
              <ToggleGroupItem value="1000000">$1.00</ToggleGroupItem>
              <ToggleGroupItem value="none">None</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <Button ref={setBtn} size="lg" className="mt-7 w-full" onClick={() => setRan(key)}>Let the agent pay this quote</Button>
        <div className={cn('fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper p-4 shadow-lg md:hidden', !btnOut && 'hidden')}>
          <Button size="lg" className="w-full" onClick={() => { setRan(key); document.getElementById('qc-verdict')?.scrollIntoView({ block: 'center' }) }}>Let the agent pay this quote</Button>
        </div>
        <div id="qc-verdict" aria-live="polite" className="min-h-24 pt-5">
          {shown ? (
            v.ok ? (
              <div className="rounded-md border border-success/30 bg-success-tint p-4">
                <Chip tone="ok">Paid</Chip>
                <p className="mt-2 text-subhead font-semibold text-success-ink"><span className="num">{usd(q.amount)}</span> settled</p>
                <p className="mt-1 text-body-sm text-ink-muted">Within the policy, so the agent key signs and the payment settles on Tempo.</p>
              </div>
            ) : (
              <div className="rounded-md border border-error/30 bg-error-tint p-4">
                <Chip tone="bad">Refused before signing</Chip>
                <p className="mt-2 text-body text-ink">The quote asked for <span className="num font-semibold">{usd(q.amount)}</span> against a <span className="num font-semibold">{v.listed === null ? 'missing' : usd(v.listed)}</span> listing.</p>
                <p className="mt-1 text-body-sm text-ink-muted">Leash stopped it before the agent key signed. Nothing to refund.</p>
              </div>
            )
          ) : (
            <div className="flex items-center gap-3 text-body-sm text-ink-muted">
              <span className="chip bg-surface-2 text-ink-muted">Not run yet</span>
              Press the button to run this quote through the policy.
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function StepRow({ label, tx, tone, status }: { label: string; tx: string | null; tone: 'ok' | 'bad' | 'info'; status: string }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-md px-4 py-3 transition-colors hover:bg-surface-1">
      <div className="min-w-0">
        <p className="text-body [overflow-wrap:anywhere]">{label}</p>
        {tx && <div className="mt-1"><Hash value={tx} a={10} b={6} /></div>}
      </div>
      <Chip tone={tone}>{status}</Chip>
    </li>
  )
}

function ForkSteps() {
  const proof = useForkProof()
  if (!proof) return null
  const settled = proof.steps.filter((s) => /success/i.test(s.status)).length
  const refused = proof.steps.filter((s) => /refus|revert/i.test(s.status)).length
  return (
    <section aria-labelledby="fork-h" className="grid gap-6">
      <SectionHead id="fork-h" eyebrow="Fork run 1 · Quote-Cap" title="The same quotes on a fork of Tempo mainnet"
        intro="Its own local anvil fork, separate from the Delivery Cut run. The guard refuses before signing; when it is bypassed, the chain refuses. Hashes resolve on that fork." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <div className="grid grid-cols-2 content-start gap-4 lg:grid-cols-1">
        <Metric label="Forked at block" value={proof.block?.toLocaleString() ?? '-'} />
        <Metric label="Daily limit left" value={usd(proof.limitAfter ?? '0')} hint={<>was <span className="num">{usd(proof.limitBefore ?? '0')}</span></>} />
      </div>
      <Card className="min-w-0 p-2 sm:p-3">
        <div className="flex flex-wrap gap-2 px-4 pb-1 pt-3"><Chip tone="ok">{settled} settled</Chip><Chip tone="info">{refused} refused, as intended</Chip></div>
        <ol className="divide-y divide-hairline">
          {proof.steps.map((s, i) => {
            const bad = /refus|revert/i.test(s.status)
            const ok = /success/i.test(s.status)
            return <StepRow key={i} label={s.label} tx={s.tx} tone={bad ? 'info' : ok ? 'ok' : 'info'} status={bad ? 'Refused' : ok ? 'Settled' : s.status} />
          })}
        </ol>
      </Card>
      </div>
    </section>
  )
}

function Routes() {
  const plans = useMemo(() => allRoutes(book), [])
  const best = Math.max(...plans.map((p) => p.savingBps / 100)).toFixed(0)
  return (
    <section id="route" aria-labelledby="route-h" className="grid scroll-mt-24 gap-6">
      <SectionHead id="route-h" eyebrow="Route · route: true" title="The same API, from the cheapest seller"
        intro={<>Resellers list the same upstream call at different prices. With <span className="hash rounded-sm bg-surface-2 px-1.5 py-0.5 text-body-sm text-accent-ink">route: true</span> the Leash SDK sends the call to the cheapest listing before paying, and the quote check holds that seller to its own price. The agent key must be allowed to pay that seller.</>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className="grid grid-cols-2 content-start gap-4 lg:grid-cols-1">
          <Metric label="Largest saving" value={`${best}%`} tone="info" />
          <Metric label="APIs compared" value={plans.length} hint="mpp.dev catalog, 10 Oct 2026" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const b = p.options[0]!
            const w = p.options[p.options.length - 1]!
            return (
              <Card key={p.group.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-body font-semibold">{p.group.label}</p>
                  <Chip tone="ok">{(p.savingBps / 100).toFixed(0)}% less</Chip>
                </div>
                <div className="mt-5 grid gap-2 text-body-sm">
                  <div className="flex items-center justify-between gap-3 rounded-md bg-success-tint px-3 py-2"><span className="text-ink">{b.service}</span><span className="num font-semibold text-success-ink">{usd(b.amount)}</span></div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-surface-1 px-3 py-2"><span className="text-ink-muted">{w.service}</span><span className="num text-ink-muted line-through">{usd(w.amount)}</span></div>
                </div>
                <p className="mt-auto pt-4 text-body-sm text-ink-subtle">Routed to {b.service}</p>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Rival({ name, href, what, diff }: { name: string; href: string; what: React.ReactNode; diff: React.ReactNode }) {
  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-subhead font-semibold">{name}</p>
        <TextLink href={href} target="_blank" rel="noreferrer" className="text-body-sm">Source ↗</TextLink>
      </div>
      <p className="mt-3 text-body-sm text-ink-muted">{what}</p>
      <div className="mt-auto pt-4"><div className="rounded-md bg-surface-1 p-3 text-body-sm text-ink"><span className="font-semibold text-accent-ink">Leash: </span>{diff}</div></div>
    </Card>
  )
}

function Positioning() {
  return (
    <section aria-labelledby="pos-h" className="grid gap-6">
      <SectionHead id="pos-h" title="How Leash differs from its closest rivals" intro="Three World's Fair projects work on the same risk: an agent's money leaving before anyone checks the price or the delivery. Each summary comes from the project's own repo or Arena page, read on 11 Oct 2026." />
      <div className="grid gap-4 md:grid-cols-3">
        <Rival name="vet402" href="https://github.com/kzmttkc/vet402-delivery"
          what="Buys x402 and MPP APIs with its own wallet on Solana, Tempo and Base, and publishes what each seller delivered next to the payment tx. Its Tempo run is the source for the 42 of 89 paid-then-failed calls in mpp#1034."
          diff="vet402 grades sellers; it does not control an agent's key. Leash acts on the agent's own payments: it refuses a wrong price before signing and cuts a failing vendor on chain. vet402's grades could feed a Leash cut." />
        <Rival name="Fermata" href="https://github.com/bilgin-kocak/fermata"
          what="Holds each MPP call's payment in escrow on Tempo, records the vendor's HTTPS answer with TLSNotary, and refunds the agent on a proven failure or timeout. Live on Tempo testnet; vendors are reached through Fermata's gateway."
          diff="Fermata recovers a failed payment; Leash does not refund. Leash needs no gateway, pays vendors directly, and checks the quoted price against the vendor's listing, which Fermata's README does not describe. After a failure Leash stops all later charges with one signature." />
        <Rival name="Cursus" href="https://colosseum.com/arena/projects/cursus"
          what="An accountability layer: organisations give humans and agents roles with limits on authority and budget, and results need evidence and human sign-off. Its first agent payment was x402 on Solana devnet."
          diff="Cursus records who acted under whose authority. Leash limits one thing, payments, and enforces it on Tempo: the agent key's vendor scope and daily limit are chain rules, and each quote is checked before the key signs." />
      </div>
      <p className="text-body-sm text-ink-subtle">Also nearby: Setra402 ("trust layer for agent payments", mechanism not public) and Rolepay (Discord communities paying people on Tempo, a different job).</p>
      <Card className="grid gap-4 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-center">
        <div>
          <Eyebrow>Business model</Eyebrow>
          <div className="mt-2"><Chip tone="warn">Planned, no revenue yet</Chip></div>
        </div>
        <p className="text-body text-ink-muted">The guard and SDK stay open source, so any MPP client can refuse an overpriced quote. Teams that run paying agents would pay a monthly fee per active agent key for the hosted spend desk: price book updates, delivery tracking and one-signature cuts. Route could later take a small share of the saving it finds on each call.</p>
      </Card>
    </section>
  )
}

function JudgeStep({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 p-5 md:p-6">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-body-sm font-bold text-accent-ink">{n}</span>
      <div><p className="text-body-lg font-semibold">{title}</p><p className="mt-1 text-body-sm text-ink-muted">{children}</p></div>
    </li>
  )
}

function ForJudges() {
  return (
    <section aria-labelledby="judge-h" className="grid gap-6">
      <SectionHead id="judge-h" title="Check it in 60 seconds: three clicks" />
      <Card className="overflow-hidden"><ol className="grid divide-hairline max-md:divide-y md:grid-cols-3 md:divide-x">
        <JudgeStep n={1} title={<TextLink href="#/quote-cap" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Click "Let the agent pay this quote"</TextLink>}>At the top. stablestudio's real $10.00 quote is refused against its $0.039 listing, before the agent key signs.</JudgeStep>
        <JudgeStep n={2} title={<TextLink href="#/quote-cap" onClick={(e) => { e.preventDefault(); document.getElementById('route')?.scrollIntoView({ behavior: 'smooth' }) }}>Click to see Route</TextLink>}>Three APIs sold by two sellers each, and how much the cheapest listing saves per call.</JudgeStep>
        <JudgeStep n={3} title={<TextLink href="#/delivery-cut">Open Delivery Cut</TextLink>}>Press "Sign the cut": fal took the money and failed, its next charge reverts, stablestudio still gets paid.</JudgeStep>
      </ol></Card>
      <p className="text-body-sm text-ink-muted">To rerun it: <span className="hash text-ink">scripts/fork/run-fork-demo.sh</span>, <span className="hash text-ink">scripts/fork/run-delivery-cut.sh</span> (Foundry, public Tempo RPC, no funds) and <span className="hash text-ink">pnpm -r test</span>.</p>
    </section>
  )
}

export function QuoteCapPage() {
  return (
    <div className="mx-auto max-w-[1200px] max-md:pb-24">
      <div className="grid gap-10 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8 lg:py-12">
        <header className="lg:pt-4">
          <h1 className="text-display-sm font-semibold sm:text-display-md">Your agent pays only the price you allow.</h1>
          <p className="mt-5 text-body-lg text-ink-muted">
            stablestudio lists one image call at <span className="num text-ink">$0.039</span>. Asked without a prompt, its 402 named <span className="num text-error-ink">$10.00</span>. A default MPP client signs whatever the 402 names. Leash checks every quote against the listing before the agent key signs.
          </p>
        </header>
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <QuoteCheck />
        </div>
        <div className="lg:col-start-1">
          <div className="grid gap-3">
            <div className="card-raised flex gap-4 p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-body-sm font-bold text-accent-ink">1</span>
              <div><p className="text-body font-semibold">Before signing</p><p className="mt-1 text-body-sm text-ink-muted">The check runs in the MPP client's challenge hook. A quote above the listing plus your allowance, or above the hard cap, is refused. Nothing signed, nothing to refund.</p></div>
            </div>
            <div className="card-raised flex gap-4 p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-body-sm font-bold text-accent-ink">2</span>
              <div><p className="text-body font-semibold">If the check is bypassed</p><p className="mt-1 text-body-sm text-ink-muted">The agent's Tempo access key only pays the vendor's address, up to a daily limit the chain enforces. Fork run 1 shows the chain refusing both.</p></div>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-20 py-12 lg:space-y-24">
        <ForJudges />
        <Routes />
        <ForkSteps />
        <Positioning />
      </div>
    </div>
  )
}
