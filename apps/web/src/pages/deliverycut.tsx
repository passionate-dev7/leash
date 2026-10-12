import type * as React from 'react'
import { useEffect, useState } from 'react'
import { decideCuts } from '@leash/policy/delivery-cut'
import type { PaidCallOutcome } from '@leash/policy/delivery-cut'
import { formatUnits } from '@leash/policy/quote-cap'
import { computeBlastRadius } from '@leash/policy/blast-radius'
import type { RecipientIndex, ResolvedRecipient } from '@leash/policy'
import { ModeratoReceipts } from '@/components/moderato-receipts'
import { Button } from '@/components/shadcn/button'
import { Card, Chip, Hash, Metric, SectionHead, TextLink } from '@/components/kit'
import { StepFeed, ForkNote } from '@/pages/quotecap'
import { mainnetAddressUrl } from '@/lib/config'
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

/* The saved 3 Oct 2026 unpaid 402 probe of mpp.tempo.xyz, as a recipient index: one entry per service per Tempo payout address. */
type ProbeEntry = { id: string; name: string; realm: string; url: string; httpMethod: string; challenges?: { method: string; request: { recipient?: string; amount?: string; currency?: string; methodDetails?: { chainId?: number } } }[] }

function useProbeIndex() {
  const [idx, setIdx] = useState<RecipientIndex | null>(null)
  useEffect(() => {
    fetch('./evidence/probe-all402-2026-10-03.json').then((r) => (r.ok ? r.json() : null)).then((rows: ProbeEntry[] | null) => {
      if (!Array.isArray(rows)) return
      const resolved: ResolvedRecipient[] = []
      for (const row of rows) {
        const seen = new Set<string>()
        for (const c of row.challenges ?? []) {
          const r = c.request.recipient
          if (c.method !== 'tempo' || !r || c.request.methodDetails?.chainId !== 4217 || seen.has(r.toLowerCase())) continue
          seen.add(r.toLowerCase())
          resolved.push({ serviceId: row.id, name: row.name, realm: row.realm, recipient: r as ResolvedRecipient['recipient'], currency: (c.request.currency ?? '0x') as ResolvedRecipient['currency'], decimals: 6, amount: c.request.amount ?? '0', intent: 'charge', chainId: 4217, endpoint: { method: row.httpMethod, path: new URL(row.url).pathname, url: row.url }, source: 'live-402', resolvedAt: '2026-10-03T00:00:00Z' })
        }
      }
      setIdx({ capturedAt: '2026-10-03T00:00:00Z', catalogBytes: 0, catalogServiceCount: rows.length, chainId: 4217, resolved, unresolved: [] })
    }).catch(() => setIdx(null))
  }, [])
  return idx
}

function useOthers(recipient: string, vendorId: string): string[] | null {
  const idx = useProbeIndex()
  if (!idx) return null
  return computeBlastRadius({ recipients: [recipient as `0x${string}`], index: idx, intendedServiceIds: [vendorId] }).collateral.map((s) => s.name)
}

function SideEffect({ names }: { names: string[] | null }) {
  if (!names) return <li><span className="font-semibold text-failed">Side effect:</span> this cut removes a payout address, so every gateway paying that address stops too. Reading the probe…</li>
  return (
    <li><span className="font-semibold text-failed">Side effect:</span> this cut also stops these <span className="num font-semibold text-failed">{names.length}</span> other gateways: {names.join(', ')}. Their payout address is the same as fal's.</li>
  )
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <span className="text-body text-ink-muted">{k}</span>
      <span className={cn('text-right text-body-lg', tone === 'warn' ? 'font-medium text-failed' : 'num')}>{v}</span>
    </div>
  )
}

export function DeliveryCutPage() {
  const proof = useProof()
  const others = useOthers(proof?.vendor.recipient ?? '', 'fal')
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
            <Metric label="Paid, then failed" value="47%" tone="failed" hint={<>42 of 89 calls, vet402 on Tempo, <TextLink href="https://github.com/tempoxyz/mpp/issues/1034" target="_blank" rel="noreferrer">mpp#1034</TextLink></>} />
            <Metric label="Signatures to cut" value="1" tone="accent" hint="next charge reverts" />
          </div>
          {!signed && (
            <div className="mt-8 hidden lg:block">
              <p className="text-body font-semibold">Before you sign: what this cut does</p>
              <ul className="mt-3 grid gap-2 text-body-sm text-ink-muted">
                <li><span className="font-semibold text-ink">Vendor:</span> fal ({proof.vendor.origin.replace('https://', '')}), paid <span className="num text-ink">{usd(proof.vendor.quoted)}</span> and answered HTTP {proof.failure.status}.</li>
                <li><span className="font-semibold text-ink">What changes:</span> the agent key may no longer pay the address <Hash value={proof.vendor.recipient} href={mainnetAddressUrl(proof.vendor.recipient)} />. fal's next charge reverts on chain. stablestudio and other vendors keep working.</li>
                <SideEffect names={others} />
                <li><span className="font-semibold text-ink">Not a refund:</span> the <span className="num text-ink">{usd(proof.vendor.quoted)}</span> already paid stays with fal.</li>
              </ul>
            </div>
          )}
        </header>

        <Card aria-label="The failed call" className="min-w-0 overflow-hidden">
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-body-sm text-ink-muted">fal · FLUX schnell · {proof.vendor.origin.replace('https://', '')}</p>
              <Chip tone={signed ? 'reverted' : 'failed'}>{signed ? 'Cut' : `HTTP ${proof.failure.status}`}</Chip>
            </div>
            <div className="mt-3 divide-y divide-hairline">
              <Row k="fal's 402 asked" v={usd(proof.vendor.quoted)} />
              <Row k="The agent paid" v={usd(proof.vendor.quoted)} />
              <Row k="fal answered" v={`HTTP ${proof.failure.status}, no image`} tone="warn" />
              <Row k="Delivered for the money" v="0% (lost 100%)" tone="warn" />
            </div>
            <p className="mt-2 text-body-sm text-ink-subtle">The request had an empty body. The 402 was captured live by Leash. Status and error from vet402's report.</p>
          </div>
          <div className="border-t border-hairline bg-surface-1/60 p-6 sm:p-7">
            <div id="dc-verdict" aria-live="polite">
              {signed ? (
                <div className="panel-reverted p-4">
                  <Chip tone="reverted">Cut signed</Chip>
                  <p className="mt-2 text-subhead font-semibold text-ink">fal is cut from the agent key</p>
                  <p className="mt-1 text-body-sm text-ink-muted">Its next charge reverts on chain. stablestudio, which delivered, still gets paid. </p>
                  <a href="#/delivery-cut" onClick={(e) => { e.preventDefault(); document.getElementById('tx-h')?.scrollIntoView({ behavior: 'smooth' }) }} className="link mt-2 inline-block text-body-sm font-medium text-link underline underline-offset-4">See the three new transactions ↓</a>
                </div>
              ) : (
                <div className="panel-failed p-4">
                  <Chip tone="failed">Paid, not delivered</Chip>
                  <p className="mt-2 text-subhead font-semibold text-failed"><span className="num">{decision ? usd(decision.lost) : usd(proof.vendor.quoted)}</span> lost</p>
                  <p className="mt-1 text-body-sm text-ink-muted">Cutting removes fal from what the agent key may pay{others ? <>, and <span className="font-semibold text-failed">{others.length} other gateways</span> on the same payout address</> : null}.</p>
                </div>
              )}
            </div>
            {!signed && (
              <div className="mt-5 rounded-md border border-hairline bg-paper p-4 lg:hidden">
                <p className="text-body font-semibold">Before you sign: what this cut does</p>
                <ul className="mt-3 grid gap-2 text-body-sm text-ink-muted">
                  <li><span className="font-semibold text-ink">Vendor:</span> fal ({proof.vendor.origin.replace('https://', '')}), paid <span className="num text-ink">{usd(proof.vendor.quoted)}</span> and answered HTTP {proof.failure.status}.</li>
                  <li><span className="font-semibold text-ink">What changes:</span> the agent key may no longer pay the address <Hash value={proof.vendor.recipient} href={mainnetAddressUrl(proof.vendor.recipient)} />. fal's next charge reverts on chain. stablestudio and other vendors keep working.</li>
                  <SideEffect names={others} />
                  <li><span className="font-semibold text-ink">Not a refund:</span> the <span className="num text-ink">{usd(proof.vendor.quoted)}</span> already paid stays with fal.</li>
                </ul>
              </div>
            )}
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

      <div className="pb-12"><ModeratoReceipts /></div>

      <section aria-labelledby="tx-h" className="grid gap-6 py-12">
        <SectionHead id="tx-h" eyebrow="Fork run 2 · Delivery Cut" title="The cut, on a fork of Tempo mainnet"
          intro={`Its own local anvil fork at block ${proof.block.toLocaleString()}, separate from the Quote-Cap run. Hashes resolve on that fork.`} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <Card className="min-w-0 p-2 sm:p-3">
            <div className="pt-2"><ForkNote /></div>
            <StepFeed steps={steps} />
            {!signed && <p className="px-3 py-3 text-body-sm text-ink-subtle">Sign the cut to replay the next three transactions.</p>}
          </Card>
          <Card className="min-w-0 p-6">
            <Chip tone="neutral">Evidence</Chip>
            <p className="mt-3 text-body font-semibold">A cut removes a payout address, not a brand.</p>
            <p className="mt-2 text-body-sm text-ink-muted">In our unpaid 402 probes of mpp.tempo.xyz on 3 Oct 2026 (saved at about Tempo mainnet block 42,298,273), <Hash value={proof.vendor.recipient} href={mainnetAddressUrl(proof.vendor.recipient)} /> was the recipient for fal and 11 other gateways, so this cut stops those charges too. The fork run only charged fal and stablestudio; it did not test the other gateways.</p>
            <Button asChild variant="outline" className="mt-5"><a href="/evidence/probe-all402-2026-10-03.json" target="_blank" rel="noreferrer">Open the probe file</a></Button>
          </Card>
        </div>
      </section>
    </div>
  )
}
