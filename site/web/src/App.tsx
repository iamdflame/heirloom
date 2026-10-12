import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import type { LineId } from './data/types';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Register } from './components/Register';
import { Finding } from './components/Finding';
import { Examines } from './components/Examines';
import { Campaign } from './components/Campaign';
import { useSmoothScroll } from './components/fx';
import { Movement } from './components/Movement';
import { Question } from './components/Question';
import { Numbers } from './components/Numbers';
import { Economics } from './components/Economics';
import { Locker } from './components/Locker';
import { Limits } from './components/Limits';
import { Finale } from './components/Finale';
import { rowByAnchor, site } from './lib/site';
import { MAIN_CLASS } from './lib/layout';

const Receipt = lazy(() => import('./components/Receipt'));
const motionFeatures = () => import('./lib/motion-features').then((m) => m.default);
const DEFAULT_LINE = site.lines[0]!.id;

const fromHash = () => {
  const h = decodeURIComponent(window.location.hash.slice(1));
  return rowByAnchor.has(h) ? h : null;
};

export default function App() {
  const [anchor, setAnchor] = useState<string | null>(fromHash);
  const [line, setLine] = useState<LineId>(DEFAULT_LINE);
  const [everOpened, setEverOpened] = useState(Boolean(anchor));
  const trigger = useRef<HTMLElement | null>(null);
  useSmoothScroll();

  useEffect(() => {
    const sync = () => {
      const h = fromHash();
      // a plain #HL-4.2-… link (Fig. 2, Method) opened it: return focus there on close
      if (h && document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
        trigger.current = document.activeElement;
      setAnchor(h);
      if (h) setEverOpened(true);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const open = useCallback((a: string, l: LineId, el: HTMLElement | null) => {
    trigger.current = el;
    setLine(l);
    setAnchor(a);
    setEverOpened(true);
    history.pushState(null, '', `#${a}`);
  }, []);

  const close = useCallback(() => {
    setAnchor(null);
    if (window.location.hash) history.pushState(null, '', window.location.pathname + window.location.search);
  }, []);

  const returnFocus = useCallback(() => {
    const el = trigger.current;
    if (el && document.contains(el)) el.focus();
    else document.getElementById('register')?.querySelector<HTMLElement>('button[tabindex="0"]')?.focus();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={motionFeatures} strict>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-brass focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to the record
        </a>
        <Nav />
        <main id="main" className={MAIN_CLASS}>
          <Hero />
          <Examines />
          <Campaign />
          <Finding />
          <Register onOpen={open} />
          <Movement />
          <Question />
          <Numbers />
          <Economics />
          <Locker />
          <Limits />
          <Finale />
        </main>
        <Footer generatedAt={site.generated_at} />
        {everOpened && (
          <Suspense fallback={null}>
            <Receipt
              row={anchor ? rowByAnchor.get(anchor) ?? null : null}
              line={line}
              onLine={setLine}
              onClose={close}
              returnFocus={returnFocus}
            />
          </Suspense>
        )}
      </LazyMotion>
    </MotionConfig>
  );
}
