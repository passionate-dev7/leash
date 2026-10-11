import * as React from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// shadcn/ui button (installed with `uicraft add shadcn/button`), restyled to LEASH tokens: lime primary, rounded.
const buttonVariants = cva(
  'inline-flex cursor-pointer rounded-md items-center justify-center gap-2 whitespace-nowrap font-sans font-semibold transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary shadow-md shadow-primary/10 hover:bg-primary-hover active:bg-primary-pressed',
        outline: 'border border-hairline-strong bg-surface-1 text-ink hover:bg-surface-2',
        ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
        link: 'text-accent-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-5 text-body',
        lg: 'min-h-14 px-8 text-body',
        sm: 'min-h-9 px-3 text-body-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
