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
  <SheetPrimitive.Overlay ref={ref} className={cn('sheet-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]', className)} {...props} />
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
      data-lenis-prevent
      className={cn(
        'sheet fixed z-50 flex flex-col border-brass/30 bg-surface text-ink',
        side === 'right'
          ? 'inset-y-0 right-0 h-full w-[min(42rem,100vw)] rounded-l-sheet border-l shadow-[0_8px_80px_rgb(0_0_0/0.7)]'
          : 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-sheet border-t shadow-[0_-2px_24px_rgb(0_0_0/0.6)]',
        className,
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="press absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover-ink">
        <X className="h-5 w-5" aria-hidden />
        <span className="sr-only">Close receipt</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
