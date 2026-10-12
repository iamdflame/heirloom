// Server-rendered first screen (nav + hero) baked into dist/index.html by scripts/prerender.mjs, so the
// headline paints before any JS runs. main.tsx then renders the whole app into #root, replacing it.
import { renderToString } from 'react-dom/server';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { MAIN_CLASS } from './lib/layout';

export function render() {
  return renderToString(
    <>
      <Nav />
      <main id="main" className={MAIN_CLASS}>
        <Hero />
      </main>
    </>,
  );
}
