import type * as React from 'react'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/* LEASH v3 kit: cards, status chips, big metrics, truncated mono hashes. Tokens in index.css. */

export function Card({ className, children, ...rest }: React.ComponentProps<'section'>) {
  return <section className={cn('card', className)} {...rest}>{children}</section>
}

export type Tone = 'paid' | 'refused' | 'reverted' | 'failed' | 'neutral' | 'accent'
const DOT: Record<Tone, string> = { paid: 'bg-paid', refused: 'bg-refused', reverted: 'bg-reverted', failed: 'bg-failed', neutral: 'bg-neutral', accent: 'bg-link' }
const FG: Record<Tone, string> = { paid: 'text-paid', refused: 'text-refused', reverted: 'text-reverted', failed: 'text-failed', neutral: 'text-ink', accent: 'text-ink' }
export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('chip', `chip-${tone === 'accent' ? 'neutral' : tone}`)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT[tone])} />
      {children}
    </span>
  )
}

export function Metric({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="stat card-raised p-5">
      <p className="text-body-sm text-ink-muted">{label}</p>
      <p className={cn('metric-value mt-2', tone && FG[tone])}>{value}</p>
      {hint && <p className="mt-2 text-body-sm text-ink-subtle">{hint}</p>}
    </div>
  )
}

export const shortHash = (h: string, a = 6, b = 4) => (h.length > a + b + 2 ? `${h.slice(0, a)}…${h.slice(-b)}` : h)

export function Hash({ value, a, b, href }: { value: string; a?: number; b?: number; href?: string }) {
  const [done, setDone] = useState(false)
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-surface-2 py-0.5 pl-2 pr-1 align-middle">
      {href ? <a href={href} target="_blank" rel="noreferrer" className="link hash text-body-sm text-link hover:underline" title={`${value} on the Tempo explorer`}>{shortHash(value, a, b)} ↗</a> : <span className="hash text-body-sm text-ink" title={value}>{shortHash(value, a, b)}</span>}
      <button
        type="button"
        aria-label={`Copy ${value}`}
        className="relative grid size-6 cursor-pointer place-items-center rounded-sm after:absolute after:-inset-2.5 after:content-[''] text-ink-subtle hover:bg-surface-3 hover:text-ink"
        onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200) }}
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-body-sm font-medium text-ink-subtle">{children}</p>
}

export function SectionHead({ id, eyebrow, title, intro }: { id: string; eyebrow?: string; title: string; intro?: React.ReactNode }) {
  return (
    <div className="max-w-[760px]">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mt-2 text-headline font-semibold">{title}</h2>
      {intro && <p className="mt-3 text-body-lg text-ink-muted">{intro}</p>}
    </div>
  )
}

export function TextLink({ className, ...p }: React.ComponentProps<'a'>) {
  return <a className={cn('link font-medium text-link underline underline-offset-4 decoration-link/40 hover:text-link-hover-ink hover:decoration-link', className)} {...p} />
}

/** Over-the-listing consequence: "256x · +$9.96 (+25,541%)". */
export function overBy(quoted: bigint, listed: bigint | null, fmt: (x: bigint) => string) {
  if (listed === null || listed === 0n) return null
  const diff = quoted - listed
  const pct = Number((diff * 10000n) / listed) / 100
  return { diff, pct, mult: Number(quoted) / Number(listed), text: diff <= 0n ? 'at or under the listing' : `+${fmt(diff)} over (+${pct.toLocaleString('en-US', { maximumFractionDigits: 0 })}%)` }
}

export const utcTime = (iso?: string | null) => (iso ? `${new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })} UTC` : null)
