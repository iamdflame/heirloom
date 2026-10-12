import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay ref={ref} className={cn('sheet-overlay fixed inset-0 z-50 bg-ink/30', className)} {...props} />
));
SheetOverlay.displayName = 'SheetOverlay';

type Side = 'right' | 'bottom';

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & { side?: Side }
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      data-side={side}
      className={cn(
        'sheet fixed z-50 flex flex-col bg-surface text-ink',
        side === 'right'
          ? 'inset-y-0 right-0 h-full w-[min(40rem,100vw)] rounded-l-sheet shadow-[0_8px_40px_rgb(0_0_0/0.18)]'
          : 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-sheet shadow-[0_-2px_12px_rgb(0_0_0/0.12)]',
        className,
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="press absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-chip text-muted hover-ink">
        <X className="h-5 w-5" aria-hidden />
        <span className="sr-only">Close receipt</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
