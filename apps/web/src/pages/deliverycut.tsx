import { useEffect, useState } from 'react'
import { decideCuts, formatUnits } from '@leash/policy'
import type { PaidCallOutcome } from '@leash/policy'
import { cn } from '@/components/ui/cn'

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
const short = (h: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '-')

function useProof() {
  const [p, setP] = useState<Proof | null | undefined>(undefined)
  useEffect(() => {
    fetch('./delivery-cut-proof.json').then((r) => (r.ok ? r.json() : null)).then((j) => setP(j && Array.isArray(j.steps) ? j : null)).catch(() => setP(null))
  }, [])
  return p
}

export function DeliveryCutPage() {
  const proof = useProof()
  const [signed, setSigned] = useState(false)
  if (proof === undefined) return <p className="py-16 text-body-sm text-ink-muted">Loading the fork proof…</p>
  if (proof === null) return <p className="py-16 text-body-sm text-ink-muted">Fork proof not found. Run scripts/fork/run-delivery-cut.sh.</p>

  const pay = proof.steps.find((s) => s.step === 'pay_fal')
  const outcomes: PaidCallOutcome[] = [{ vendor: 'fal', recipient: proof.vendor.recipient, amount: BigInt(proof.vendor.quoted), settlementTx: pay?.tx ?? null, status: proof.failure.status, body: proof.failure.body }]
  const decision = decideCuts(outcomes)[0]
  const before = proof.steps.filter((s) => ['pay_fal', 'pay_ss'].includes(s.step))
  const after = proof.steps.filter((s) => ['cut', 'fal_next_charge', 'ss_after_cut'].includes(s.step))

  return (
    <div className="mx-auto max-w-[880px] py-10">
      <p className="text-caption text-ink-muted">Delivery Cut</p>
      <h1 className="mt-2 text-headline">fal took $0.003 and answered 422. One signature, and its next charge fails on chain.</h1>
      <p className="mt-4 max-w-[640px] text-body text-ink-muted">
        On MPP the charge settles before the service checks the request. vet402 paid 89 directory calls on Tempo; 42 settled and then answered 400 or 422.{' '}
        <a className="underline" href="https://github.com/tempoxyz/mpp/issues/1034" target="_blank" rel="noreferrer">tempoxyz/mpp#1034</a>
      </p>

      <section aria-label="The paid call" className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="border border-hairline bg-paper p-5">
          <h2 className="text-body-sm">What fal asked</h2>
          <p className="num mt-3 text-caption text-ink-muted">{proof.vendor.endpoint} · body {'{}'}</p>
          <p className="num mt-2 text-card-title">{usd(proof.vendor.quoted)}</p>
          <p className="mt-2 text-caption text-ink-muted">Real 402 from {proof.vendor.origin}, captured unpaid by LEASH.</p>
        </div>
        <div className="border border-hairline bg-paper p-5">
          <h2 className="text-body-sm">What fal sent back after settling</h2>
          <p className="num mt-3 text-card-title text-error-ink">HTTP {proof.failure.status}</p>
          <pre className="num mt-2 overflow-x-auto bg-surface-1 p-3 text-caption">{proof.failure.body}</pre>
          <p className="mt-2 text-caption text-ink-muted">Replayed from vet402's report. {proof.failure.note}</p>
        </div>
      </section>

      <section aria-label="Decision" className="mt-8 border-t border-ink pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-body">
            {decision?.cut ? <>Paid, not delivered: <span className="num">{usd(decision.lost)}</span> lost to <span className="num">{short(proof.vendor.recipient)}</span>.</> : 'Delivered.'}
          </p>
          <button type="button" onClick={() => setSigned(true)} disabled={signed}
            className={cn('min-h-12 cursor-pointer px-6 text-body-sm', signed ? 'border border-ink bg-paper text-ink' : 'bg-ink text-on-primary hover:opacity-90')}>
            {signed ? 'Cut signed' : 'Sign the cut'}
          </button>
        </div>
      </section>

      <section aria-label="Fork transactions" className="mt-8">
        <h2 className="text-body-sm">Transactions</h2>
        <ol className="mt-3 divide-y divide-hairline border-y border-hairline">
          {[...before, ...(signed ? after : [])].map((s) => (
            <li key={s.step} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-3">
              <span className="text-body-sm">{s.label}</span>
              <span className={cn('text-caption', s.status === 'success' ? 'text-success-ink' : 'text-error-ink')}>{s.status}</span>
              <span className="num text-caption text-ink-muted">{short(s.tx)}</span>
              {s.error && <span className="text-caption text-ink-muted">{s.error}</span>}
            </li>
          ))}
        </ol>
        {!signed && <p className="mt-3 text-caption text-ink-muted">Sign the cut to replay the rest of the fork run.</p>}
      </section>

      <footer className="mt-10 border-t border-hairline pt-4 text-caption text-ink-muted">
        <p className="font-semibold text-ink">{proof.label}.</p>
        <p className="mt-1">Anvil fork of Tempo mainnet (chain {proof.chainId}) at block <span className="num">{proof.block}</span>. {proof.caveat}</p>
      </footer>
    </div>
  )
}
