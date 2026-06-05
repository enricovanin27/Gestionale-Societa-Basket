import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-primary/10 text-primary',
        secondary:   'bg-secondary text-secondary-foreground',
        destructive: 'bg-red-100 text-red-700',
        success:     'bg-green-100 text-green-700',
        warning:     'bg-yellow-100 text-yellow-700',
        orange:      'bg-orange-100 text-orange-700',
        outline:     'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
