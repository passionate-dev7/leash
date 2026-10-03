import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useId } from 'react'
import { cn } from './cn'

export function Field({ label, help, error, children }: { label: string; help?: ReactNode; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption text-ink-muted">
        {label}
      </label>
      {children(id)}
      {error ? <p id={`${id}-error`} role="alert" className="text-caption text-error-ink">{error}</p> : help ? <p className="text-caption text-ink-subtle">{help}</p> : null}
    </div>
  )
}

const control =
  'w-full min-h-10 bg-surface-1 px-4 text-body-sm text-ink placeholder:text-ink-subtle border-0 border-b border-ink-subtle outline-none focus:border-b-2 focus:border-primary focus:outline-2 focus:-outline-offset-2 focus:outline-primary disabled:bg-surface-2 disabled:text-ink-subtle aria-invalid:border-b-2 aria-invalid:border-error'

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(control, className)} {...rest} />
export const Select = ({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(control, 'pr-8', className)} {...rest} />

export function Radio({ checked, onChange, children, name }: { checked: boolean; onChange: () => void; children: ReactNode; name: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2 text-body-sm">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-ink bg-canvas checked:border-[5px] checked:border-ink focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex items-start gap-3 py-2 text-body-sm', disabled ? 'text-ink-subtle' : 'cursor-pointer')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 appearance-none border border-ink bg-canvas checked:border-ink checked:bg-ink focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        style={checked ? { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 8.5l3.2 3L13 4.5' fill='none' stroke='%23fff' stroke-width='1.6'/%3E%3C/svg%3E\")" } : undefined}
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}
