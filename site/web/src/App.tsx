import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { LineId } from './data/types';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Register } from './components/Register';
import { Finding } from './components/Finding';
import { Method } from './components/Method';
import { Query } from './components/Query';
import { Backtest, Economics, Limits } from './components/Results';
import { Verify } from './components/Verify';
import { Asterism } from './components/Section';
import { rowByAnchor, site } from './lib/site';

const Receipt = lazy(() => import('./components/Receipt'));
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
      <LazyMotion features={domAnimation} strict>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to the record
        </a>
        <Nav />
        <main id="main" className="mx-auto max-w-[84rem] px-5 md:px-10">
          <Hero />
          <Register onOpen={open} />
          <Asterism />
          <Finding />
          <Method />
          <Query />
          <Asterism />
          <Backtest />
          <Limits />
          <Economics />
          <Asterism />
          <Verify />
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
