import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// shadcn/ui toggle (installed with `uicraft add shadcn/toggle-group`), restyled to LEASH tokens.
const toggleVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap text-body-sm transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-ink data-[state=on]:text-on-primary',
  {
    variants: {
      variant: {
        default: 'bg-paper text-ink hover:bg-surface-1',
        outline: 'border border-hairline bg-paper text-ink hover:bg-surface-1',
      },
      size: { default: 'min-h-11 px-4', sm: 'min-h-9 px-3', lg: 'min-h-12 px-5' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Toggle({ className, variant, size, ...props }: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
}

export { Toggle, toggleVariants }
