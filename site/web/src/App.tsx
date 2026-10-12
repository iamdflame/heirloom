import { Nav } from './components/Nav';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Skip to the record
      </a>
      <Nav />
      <main id="main" className="mx-auto max-w-[84rem] px-5 md:px-10">
        <section id="top" className="pt-16 md:pt-24">
          <h1 className="max-w-[22ch] text-[2.4rem] leading-[1.08] tracking-[-0.02em] md:text-[4.25rem]">
            Django stopped patching 4.2 on 7 April 2026. Debian 13 and Ubuntu 24.04 still ship it.
          </h1>
        </section>
      </main>
      <Footer />
    </>
  );
}
