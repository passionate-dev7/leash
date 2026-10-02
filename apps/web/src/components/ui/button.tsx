import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed',
  secondary: 'bg-ink text-inverse-ink hover:bg-inverse-surface active:bg-ink-muted',
  tertiary: 'border border-primary text-primary hover:bg-primary hover:text-on-primary active:bg-primary-pressed',
  ghost: 'text-primary hover:bg-surface-1 active:bg-surface-2',
  danger: 'bg-error text-on-primary hover:bg-error-ink active:bg-error-ink',
}
const sizes: Record<Size, string> = { sm: 'min-h-8 px-3 py-1.5', md: 'min-h-10 px-4 py-2.5' }

export function Button({
  variant = 'primary',
  size = 'md',
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 text-body-sm transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle disabled:border-surface-2 disabled:hover:bg-surface-2 disabled:hover:text-ink-subtle',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {busy && <span aria-hidden className="size-3 animate-spin border-2 border-current border-t-transparent rounded-full" />}
      {children}
    </button>
  )
}
