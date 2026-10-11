import type * as React from 'react'
import { useEffect, useState } from 'react'
import { decideCuts } from '@leash/policy/delivery-cut'
import type { PaidCallOutcome } from '@leash/policy/delivery-cut'
import { formatUnits } from '@leash/policy/quote-cap'
import { Button } from '@/components/shadcn/button'
import { Card, Chip, Hash, Metric, SectionHead, TextLink } from '@/components/kit'
import { cn } from '@/lib/utils'

/**
 * Delivery Cut: a vendor took payment and did not deliver; one signature removes it from the agent key,
 * so the chain refuses its next charge. Proof comes from scripts/fork/run-delivery-cut.sh (LOCAL anvil fork
 * of Tempo mainnet, no real funds) via public/delivery-cut-proof.json.
 */
type Step = { step: string; label: string; status: string; tx: string | null; error?: string | null }
type Proof = {
  label: string; fork: string; chainId: number; block: number
  vendor: { name: string; origin: string; endpoint: string; recipient: string; quoted: number }
  failure: { status: number; body: string; source: string; note: string }
  caveat: string; balances: Record<string, string>; steps: Step[]
}

const usd = (x: string | number | bigint) => `$${formatUnits(BigInt(x))}`
const short = (h: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '')

function useProof() {
  const [p, setP] = useState<Proof | null | undefined>(undefined)
  useEffect(() => {
    fetch('./delivery-cut-proof.json').then((r) => (r.ok ? r.json() : null)).then((j) => setP(j && Array.isArray(j.steps) ? j : null)).catch(() => setP(null))
  }, [])
  return p
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <span className="text-body text-ink-muted">{k}</span>
      <span className={cn('num text-right text-body-lg', tone === 'warn' && 'text-warning-ink')}>{v}</span>
    </div>
  )
}

export function DeliveryCutPage() {
  const proof = useProof()
  const [signed, setSigned] = useState(false)
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null)
  const [btnOut, setBtnOut] = useState(false)
  useEffect(() => {
    if (!btn) return
    const io = new IntersectionObserver(([e]) => setBtnOut(!e!.isIntersecting))
    io.observe(btn)
    return () => io.disconnect()
  }, [btn])
  if (proof === undefined) return <p className="py-16 text-body text-ink-muted">Loading the fork run…</p>
  if (proof === null) return <p className="py-16 text-body text-ink-muted">Fork run not found. Run scripts/fork/run-delivery-cut.sh.</p>

  const pay = proof.steps.find((s) => s.step === 'pay_fal')
  const outcomes: PaidCallOutcome[] = [{ vendor: 'fal', recipient: proof.vendor.recipient, amount: BigInt(proof.vendor.quoted), settlementTx: pay?.tx ?? null, status: proof.failure.status, body: proof.failure.body }]
  const decision = decideCuts(outcomes)[0]
  const before = proof.steps.filter((s) => ['pay_fal', 'pay_ss'].includes(s.step))
  const after = proof.steps.filter((s) => ['cut', 'fal_next_charge', 'ss_after_cut'].includes(s.step))
  const steps = [...before, ...(signed ? after : [])]

  return (
    <div className="relative mx-auto max-w-[1200px] max-md:pb-24">
      <div className="grid gap-10 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:py-12">
        <header className="lg:pt-4">
          <h1 className="text-display-sm font-semibold sm:text-display-md">When a vendor takes the money and fails, cut it off.</h1>
          <p className="mt-5 text-body-lg text-ink-muted">
            On MPP the charge settles before the service checks the request. Leash spots the paid-but-failed call; one signature removes that vendor from the agent key, and the chain refuses its next charge.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Metric label="Paid, then failed" value="47%" tone="warn" hint={<>42 of 89 calls, vet402 on Tempo, <TextLink href="https://github.com/tempoxyz/mpp/issues/1034" target="_blank" rel="noreferrer">mpp#1034</TextLink></>} />
            <Metric label="Signatures to cut" value="1" tone="info" hint="next charge reverts" />
          </div>
        </header>

        <Card aria-label="The failed call" className="min-w-0 overflow-hidden">
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-body-sm text-ink-muted">fal · FLUX schnell · {proof.vendor.origin.replace('https://', '')}</p>
              <Chip tone={signed ? 'info' : 'warn'}>{signed ? 'Cut' : `HTTP ${proof.failure.status}`}</Chip>
            </div>
            <div className="mt-3 divide-y divide-hairline">
              <Row k="fal's 402 asked" v={usd(proof.vendor.quoted)} />
              <Row k="The agent paid" v={usd(proof.vendor.quoted)} />
              <Row k="fal answered" v={`HTTP ${proof.failure.status}, no image`} tone="warn" />
            </div>
            <p className="mt-2 text-body-sm text-ink-subtle">The request had an empty body. The 402 was captured live by Leash. Status and error from vet402's report.</p>
          </div>
          <div className="border-t border-hairline bg-surface-1/60 p-6 sm:p-7">
            <div id="dc-verdict" aria-live="polite">
              {signed ? (
                <div className="rounded-md border border-hairline-strong bg-surface-2 p-4">
                  <Chip tone="info">Cut signed</Chip>
                  <p className="mt-2 text-subhead font-semibold text-ink">fal is cut from the agent key</p>
                  <p className="mt-1 text-body-sm text-ink-muted">Its next charge reverts on chain. stablestudio, which delivered, still gets paid. See the transactions below.</p>
                </div>
              ) : (
                <div className="rounded-md border border-warning/30 bg-warning-tint p-4">
                  <Chip tone="warn">Paid, not delivered</Chip>
                  <p className="mt-2 text-subhead font-semibold text-warning-ink"><span className="num">{decision ? usd(decision.lost) : usd(proof.vendor.quoted)}</span> lost</p>
                  <p className="mt-1 text-body-sm text-ink-muted">Cutting removes fal's payout address <Hash value={proof.vendor.recipient} /> from what the agent key may pay.</p>
                </div>
              )}
            </div>
            <Button size="lg" variant={signed ? 'outline' : 'default'} className="mt-6 w-full max-md:hidden" onClick={() => setSigned(true)} disabled={signed}>
              {signed ? 'Cut signed' : 'Sign the cut'}
            </Button>
            {!signed && <Button ref={setBtn} size="lg" className="mt-6 w-full md:hidden" onClick={() => setSigned(true)}>Sign the cut</Button>}
            {!signed && btnOut && (
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper p-4 shadow-lg md:hidden">
                <Button size="lg" className="w-full" onClick={() => { setSigned(true); document.getElementById('dc-verdict')?.scrollIntoView({ block: 'center' }) }}>Sign the cut</Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      <section aria-labelledby="tx-h" className="grid gap-6 py-12">
        <SectionHead id="tx-h" eyebrow="Fork run 2 · Delivery Cut" title="The cut, on a fork of Tempo mainnet"
          intro={`Its own local anvil fork at block ${proof.block.toLocaleString()}, separate from the Quote-Cap run. Hashes resolve on that fork.`} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card className="min-w-0 p-2 sm:p-3">
            <ol className="divide-y divide-hairline">
              {steps.map((s) => {
                const ok = s.status === 'success'
                return (
                  <li key={s.step} className="flex items-center justify-between gap-4 rounded-md px-4 py-3 transition-colors hover:bg-surface-1">
                    <div className="min-w-0">
                      <p className="text-body [overflow-wrap:anywhere]">{s.label}</p>
                      {s.tx && <div className="mt-1"><Hash value={s.tx} a={10} b={6} /></div>}
                    </div>
                    <Chip tone={ok ? 'ok' : 'bad'}>{ok ? 'Settled' : 'Reverted'}</Chip>
                  </li>
                )
              })}
              {!signed && <li className="px-4 py-4 text-body-sm text-ink-subtle">Sign the cut to replay the next three transactions.</li>}
            </ol>
          </Card>
          <Card className="min-w-0 p-6">
            <Chip tone="info">Evidence</Chip>
            <p className="mt-3 text-body font-semibold">A cut removes a payout address, not a brand.</p>
            <p className="mt-2 text-body-sm text-ink-muted">In our unpaid 402 probes of mpp.tempo.xyz on 3 Oct 2026 (saved at about Tempo mainnet block 42,298,273), <Hash value={proof.vendor.recipient} /> was also the recipient for openai, firecrawl and nine other gateways, so this cut would stop those charges too. The fork run only charged fal and stablestudio; it did not test the other gateways.</p>
            <Button asChild variant="outline" className="mt-5"><a href="/evidence/probe-all402-2026-10-03.json" target="_blank" rel="noreferrer">Open the probe file</a></Button>
          </Card>
        </div>
      </section>
    </div>
  )
}
