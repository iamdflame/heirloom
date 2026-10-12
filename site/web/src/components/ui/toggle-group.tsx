import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';

export const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root ref={ref} className={cn('flex flex-wrap items-center gap-2', className)} {...props} />
));
ToggleGroup.displayName = 'ToggleGroup';

export const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      'press inline-flex min-h-10 items-center gap-1.5 rounded-chip border border-rule px-2.5 font-mono text-xs uppercase tracking-wide text-muted',
      'data-[state=on]:border-ink data-[state=on]:text-ink',
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = 'ToggleGroupItem';
