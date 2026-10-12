import { lazy, Suspense, useState } from 'react';
import { Menu } from 'lucide-react';
import { GithubMark } from './GithubMark';
import { SECTIONS } from '@/lib/sections';
import { Hallmark } from './Hallmark';
import { REPO } from '@/lib/utils';

const MobileMenu = lazy(() => import('./MobileMenu'));

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-rule/60 bg-paper/70 backdrop-blur-md">
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-[90rem] items-center gap-8 px-5 md:px-10">
        <a href="#top" className="flex min-h-11 items-center gap-3 no-underline">
          <Hallmark size={30} draw />
          <span className="font-display text-[1.45rem] leading-none tracking-[-0.01em]">Heirloom</span>
        </a>
        <ul className="ml-2 hidden items-center gap-6 lg:flex">
          {SECTIONS.filter((x) => x[2]).map(([id, name]) => (
            <li key={id}>
              <a className="text-[0.9rem] text-muted no-underline hover-ink" href={`#${id}`}>
                {name}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1">
          <a
            href={REPO}
            className="press inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover-ink"
            aria-label="Heirloom on GitHub"
          >
            <GithubMark className="h-5 w-5" />
          </a>
          <button
            type="button"
            className="press inline-flex h-11 w-11 items-center justify-center rounded-full text-muted lg:hidden"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </nav>
      {open && (
        <Suspense fallback={null}>
          <MobileMenu open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </header>
  );
}
