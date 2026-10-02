import type { ReactNode } from 'react'
import { cn } from './cn'
import { txUrl, addressUrl } from '@/lib/config'
import { short } from '@/lib/format'

type Tone = 'ok' | 'bad' | 'warn' | 'info' | 'idle'
const tones: Record<Tone, { dot: string; text: string }> = {
  ok: { dot: 'bg-success', text: 'text-ink' },
  bad: { dot: 'bg-error', text: 'text-error-ink' },
  warn: { dot: 'bg-warning', text: 'text-ink' },
  info: { dot: 'bg-primary', text: 'text-ink' },
  idle: { dot: 'bg-ink-subtle', text: 'text-ink-muted' },
}

/** Carbon status indicator: a square marker and a plain label. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = tones[tone]
  return (
    <span className={cn('inline-flex items-center gap-2 text-body-sm', t.text)}>
      <span aria-hidden className={cn('size-2 shrink-0', t.dot)} />
      {children}
    </span>
  )
}

export function Notice({ tone, title, children }: { tone: 'error' | 'success' | 'info' | 'warning'; title?: string; children?: ReactNode }) {
  const style = {
    error: 'border-error bg-error-tint',
    success: 'border-success bg-success-tint',
    info: 'border-primary bg-info-tint',
    warning: 'border-warning bg-warning-tint',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('border-l-4 px-4 py-3 text-body-sm', style)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn('text-ink-muted', title && 'mt-1')}>{children}</div>}
    </div>
  )
}

export function TxLink({ hash }: { hash: string | null | undefined }) {
  if (!hash) return <span className="text-ink-subtle">none</span>
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="num text-primary hover:text-link-hover hover:underline" title={hash}>
      {short(hash, 8, 6)}
    </a>
  )
}

export function AddressLink({ address, full }: { address: string; full?: boolean }) {
  return (
    <a href={addressUrl(address)} target="_blank" rel="noreferrer" className="num text-primary hover:text-link-hover hover:underline" title={address}>
      {full ? address : short(address, 8, 6)}
    </a>
  )
}

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-hairline bg-surface-1 p-8">
      <h3 className="text-card-title font-light">{title}</h3>
      <p className="mt-2 max-w-xl text-body text-ink-muted">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export const Panel = ({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn('border border-hairline bg-canvas', className)}>
    <header className="flex min-h-12 items-center justify-between gap-4 border-b border-hairline px-4">
      <h2 className="text-body-sm font-semibold">{title}</h2>
      {aside}
    </header>
    <div className="p-4">{children}</div>
  </section>
)
