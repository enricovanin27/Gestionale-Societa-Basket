import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground shadow hover:opacity-90 rounded-xl',
        destructive: 'bg-destructive text-white shadow hover:opacity-90 rounded-xl',
        outline:     'border border-border bg-card shadow-sm hover:bg-secondary text-foreground rounded-xl',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl',
        ghost:       'hover:bg-secondary text-muted-foreground rounded-xl',
        link:        'text-primary underline-offset-4 hover:underline',
        success:     'bg-green-600 text-white shadow hover:bg-green-700 rounded-xl',
      },
      size: {
        default: 'h-10 px-4 py-2 text-sm',
        sm:      'h-8 px-3 text-xs rounded-lg',
        lg:      'h-12 px-6 text-base rounded-xl',
        icon:    'h-9 w-9 rounded-xl',
        'icon-sm': 'h-7 w-7 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
