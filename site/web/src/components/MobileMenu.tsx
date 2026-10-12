import { Sheet, SheetContent, SheetTitle, SheetDescription } from './ui/sheet';
import { SECTIONS } from '@/lib/sections';

export default function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-6 pb-8 pt-6">
        <SheetTitle className="label">Sections</SheetTitle>
        <SheetDescription className="sr-only">Jump to a section of the record</SheetDescription>
        <ul className="mt-4 divide-y divide-rule">
          {SECTIONS.map(([id, name]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="flex min-h-12 items-center text-xl no-underline"
                onClick={() => onOpenChange(false)}
              >
                {name}
              </a>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
