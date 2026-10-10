import { useEffect, useState } from 'react'
import { decideCuts } from '@leash/policy/delivery-cut'
import type { PaidCallOutcome } from '@leash/policy/delivery-cut'
import { formatUnits } from '@leash/policy/quote-cap'
import { Button } from '@/components/shadcn/button'
import { Separator } from '@/components/shadcn/separator'
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

function Row({ k, v, tone }: { k: string; v: string; tone?: 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <span className="text-body text-ink-muted">{k}</span>
      <span className={cn('num text-right text-body-lg', tone === 'bad' && 'text-error-ink')}>{v}</span>
    </div>
  )
}

export function DeliveryCutPage() {
  const proof = useProof()
  const [signed, setSigned] = useState(false)
  if (proof === undefined) return <p className="py-16 text-body text-ink-muted">Loading the fork run…</p>
  if (proof === null) return <p className="py-16 text-body text-ink-muted">Fork run not found. Run scripts/fork/run-delivery-cut.sh.</p>

  const pay = proof.steps.find((s) => s.step === 'pay_fal')
  const outcomes: PaidCallOutcome[] = [{ vendor: 'fal', recipient: proof.vendor.recipient, amount: BigInt(proof.vendor.quoted), settlementTx: pay?.tx ?? null, status: proof.failure.status, body: proof.failure.body }]
  const decision = decideCuts(outcomes)[0]
  const before = proof.steps.filter((s) => ['pay_fal', 'pay_ss'].includes(s.step))
  const after = proof.steps.filter((s) => ['cut', 'fal_next_charge', 'ss_after_cut'].includes(s.step))
  const steps = [...before, ...(signed ? after : [])]

  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="grid gap-12 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-16">
        <header className="lg:pt-6">
          <h1 className="text-display-sm sm:text-display-md">When a vendor takes the money and fails, cut it off.</h1>
          <p className="mt-6 text-body-lg text-ink-muted">
            On MPP the charge settles before the service checks the request. vet402 paid 89 directory calls on Tempo, and 42 settled and then answered 400 or 422 (<a className="text-ink underline underline-offset-4" href="https://github.com/tempoxyz/mpp/issues/1034" target="_blank" rel="noreferrer">tempoxyz/mpp#1034</a>).
          </p>
        </header>

        <section aria-label="The failed call" className="min-w-0 border border-ink bg-paper lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="p-6 sm:p-8">
            <p className="text-body-sm text-ink-muted">fal · FLUX schnell · {proof.vendor.origin.replace('https://', '')}</p>
            <div className="mt-4">
              <Row k="fal's 402 asked" v={usd(proof.vendor.quoted)} />
              <Separator />
              <Row k="The agent paid" v={usd(proof.vendor.quoted)} />
              <Separator />
              <Row k="fal answered" v={`HTTP ${proof.failure.status}, no image`} tone="bad" />
            </div>
            <p className="mt-2 text-body-sm text-ink-muted">The request had an empty body. The 402 was captured live by Leash. Status and error from vet402's report.</p>
          </div>
          <div className="border-t border-hairline bg-canvas p-6 sm:p-8">
            <div aria-live="polite">
              {signed ? (
                <div className="border-l-4 border-success pl-4">
                  <p className="text-subhead text-success-ink">fal is cut from the agent key</p>
                  <p className="mt-1 text-body text-ink-muted">Its next charge reverts on chain. stablestudio, which delivered, still gets paid. See the transactions below.</p>
                </div>
              ) : (
                <div className="border-l-4 border-error pl-4">
                  <p className="text-subhead text-error-ink">Paid, not delivered: <span className="num">{decision ? usd(decision.lost) : usd(proof.vendor.quoted)}</span></p>
                  <p className="mt-1 text-body text-ink-muted">Cutting removes fal's payout address <span className="hash text-body-sm">{short(proof.vendor.recipient)}</span> from what the agent key may pay.</p>
                </div>
              )}
            </div>
            <Button size="lg" variant={signed ? 'outline' : 'default'} className="mt-8 w-full" onClick={() => setSigned(true)} disabled={signed}>
              {signed ? 'Cut signed' : 'Sign the cut'}
            </Button>
          </div>
        </section>
        <p className="text-body-lg text-ink-muted lg:col-start-1">Leash spots the paid-but-failed call. One signature removes that vendor from the agent key, and the chain refuses its next charge.</p>
      </div>

      <section aria-labelledby="tx-h" className="grid gap-8 py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <h2 id="tx-h" className="text-headline">The run, on a fork of Tempo mainnet</h2>
          <p className="mt-4 text-body-lg text-ink-muted">A local anvil fork at block {proof.block.toLocaleString()}. Hashes resolve on that fork.</p>
          <p className="mt-4 text-body-sm text-ink-muted"><span className="hash">{short(proof.vendor.recipient)}</span> is also the payout address in the 402s of openai and firecrawl on mpp.tempo.xyz, so this one cut stops all three.</p>
        </div>
        <div>
          <ol className="border-t border-ink">
            {steps.map((s) => {
              const ok = s.status === 'success'
              return (
                <li key={s.step} className="flex items-baseline justify-between gap-6 border-b border-hairline py-4">
                  <div className="min-w-0">
                    <p className="text-body">{s.label}</p>
                    {s.tx && <p className="hash mt-1 truncate text-caption text-ink-muted">{short(s.tx)}</p>}
                  </div>
                  <span className={cn('shrink-0 text-body-sm font-semibold', ok ? 'text-success-ink' : 'text-error-ink')}>{ok ? 'Settled' : 'Reverted'}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </section>
    </div>
  )
}
