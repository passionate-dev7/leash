import type * as React from 'react'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/* LEASH v3 kit: cards, status chips, big metrics, truncated mono hashes. Tokens in index.css. */

export function Card({ className, children, ...rest }: React.ComponentProps<'section'>) {
  return <section className={cn('card', className)} {...rest}>{children}</section>
}

export type Tone = 'ok' | 'bad' | 'warn' | 'info'
export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('chip', `chip-${tone}`)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', tone === 'ok' ? 'bg-success' : tone === 'bad' ? 'bg-error' : tone === 'warn' ? 'bg-warning' : 'bg-accent-ink')} />
      {children}
    </span>
  )
}

export function Metric({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="stat card-raised p-5">
      <p className="text-body-sm text-ink-muted">{label}</p>
      <p className={cn('metric-value mt-2', tone === 'bad' && 'text-error-ink', tone === 'ok' && 'text-success-ink', tone === 'warn' && 'text-warning-ink', tone === 'info' && 'text-primary')}>{value}</p>
      {hint && <p className="mt-2 text-body-sm text-ink-subtle">{hint}</p>}
    </div>
  )
}

export const shortHash = (h: string, a = 6, b = 4) => (h.length > a + b + 2 ? `${h.slice(0, a)}…${h.slice(-b)}` : h)

export function Hash({ value, a, b }: { value: string; a?: number; b?: number }) {
  const [done, setDone] = useState(false)
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-surface-2 py-0.5 pl-2 pr-1 align-middle">
      <span className="hash text-body-sm text-ink" title={value}>{shortHash(value, a, b)}</span>
      <button
        type="button"
        aria-label="Copy"
        className="grid size-6 cursor-pointer place-items-center rounded-sm text-ink-subtle hover:bg-surface-3 hover:text-ink"
        onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200) }}
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-body-sm font-medium text-accent-ink">{children}</p>
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
  return <a className={cn('link font-medium text-accent-ink underline-offset-4 hover:underline', className)} {...p} />
}
