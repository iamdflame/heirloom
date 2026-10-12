import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Text buttons, not pills. One elevation: a border or nothing.
const buttonVariants = cva(
  'press inline-flex items-center justify-center gap-2 whitespace-nowrap font-serif text-base disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        text: 'underline decoration-ink/35 underline-offset-[0.2em] hover-underline',
        outline: 'border border-ink/80 rounded-chip px-3',
        ghost: 'rounded-chip',
      },
      size: { default: 'min-h-11 py-2', sm: 'min-h-10 px-2 text-sm', icon: 'h-11 w-11' },
    },
    defaultVariants: { variant: 'text', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
