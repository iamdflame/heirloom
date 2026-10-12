import { lazy, Suspense, useState } from 'react';
import { Menu } from 'lucide-react';
import { GithubMark } from './GithubMark';
import { SECTIONS } from '@/lib/sections';
import { Seal } from './Seal';
import { ThemeToggle } from './ThemeToggle';
import { REPO } from '@/lib/utils';

const MobileMenu = lazy(() => import('./MobileMenu'));

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur-0">
      <nav aria-label="Primary" className="mx-auto flex h-14 max-w-[84rem] items-center gap-6 px-5 md:px-10">
        <a href="#top" className="flex min-h-11 items-center gap-2 text-lg font-medium no-underline">
          <Seal size={24} />
          <span>Heirloom</span>
        </a>
        <ul className="ml-4 hidden items-center gap-5 md:flex">
          {SECTIONS.map(([id, name]) => (
            <li key={id}>
              <a className="text-[0.95rem] text-muted no-underline hover-ink" href={`#${id}`}>
                {name}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center">
          <a
            href={REPO}
            className="press inline-flex h-11 w-11 items-center justify-center rounded-chip text-muted hover-ink"
            aria-label="Heirloom on GitHub"
          >
            <GithubMark className="h-5 w-5" />
          </a>
          <ThemeToggle />
          <button
            type="button"
            className="press inline-flex h-11 w-11 items-center justify-center rounded-chip text-muted md:hidden"
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
