import { cn } from '@/lib/utils';

/** A report section: a fine rule above, an h2, then the body on the 12-column grid. */
export function Section({
  id,
  title,
  lede,
  children,
  className,
}: {
  id: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn('mt-20 border-t border-rule pt-10 md:mt-24', className)}>
      <header className="grid gap-2 md:grid-cols-12">
        <h2 id={`${id}-h`} className="text-3xl leading-tight md:col-span-9 md:text-4xl">
          {title}
        </h2>
        {lede && <p className="max-w-measure text-lg text-muted md:col-span-8">{lede}</p>}
      </header>
      {children}
    </section>
  );
}

/** The section break between parts of the report. */
export function Asterism() {
  return (
    <p aria-hidden className="asterism mt-20 text-center font-mono text-sm tracking-[0.6em] text-muted md:mt-24">
      * * *
    </p>
  );
}

/** "Oct 11 2026 · 21:20Z" from an ISO timestamp */
export function Stamp({ iso, time = true }: { iso: string; time?: boolean }) {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const hm = iso.length > 10 ? iso.slice(11, 16) : '';
  return (
    <time dateTime={iso} className="font-mono text-[0.75rem] tabular-nums text-muted">
      {M[(m ?? 1) - 1]} {d} {y}
      {time && hm && ` · ${hm}Z`}
    </time>
  );
}

/** Keeps an identifier (CVE id, version) on one line inside prose. */
export function Nb({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

/** Typesetting only: straight apostrophes to curly ones (the words stay verbatim). */
export const curly = (s: string) => s.replace(/(\w)'(\w)/g, '$1’$2');
