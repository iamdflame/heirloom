import { useRef } from 'react';
import { m, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { longDate, site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { Photo } from './Photo';

const MONTH = longDate(site.eol).split(' ')[1];
const ORIGIN: Record<string, string> = { eval: 'the last upstream release', distro: 'still shipping' };

/** Beat 2, "It examines every part": a full-bleed macro photograph, the statement, the version plates. */
export function Examines() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-12%', '12%']);
  return (
    <section ref={ref} id="examines" aria-labelledby="examines-h" className="relative isolate overflow-hidden py-28 md:py-44">
      <m.div aria-hidden className="absolute inset-x-0 -inset-y-[14%] -z-10" style={reduce ? undefined : { y }}>
        <Photo name="movement" sizes="100vw" className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/40 to-paper" />
        <div className="absolute inset-0 bg-gradient-to-r from-paper/90 via-paper/30 to-transparent" />
      </m.div>
      <div className={WRAP}>
        <p className="eyebrow">It examines every part</p>
        <h2 id="examines-h" className="display mt-5 max-w-[16ch] text-[clamp(2.6rem,6.4vw,6rem)]">
          Django stopped patching 4.2 in {MONTH}. <em className="italic text-brass-hi">Debian and Ubuntu still ship it.</em>
        </h2>
        <p className="mt-6 max-w-[38rem] text-lg text-ink/80">
          Django published {site.summary.cves} security advisories after 4.2&rsquo;s end of life on {longDate(site.eol)}. Heirloom
          checked each one on the three 4.2 release lines people still run.
        </p>
        <ul className="mt-12 grid max-w-[64rem] gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="The three release lines">
          {site.lines.map((l, i) => (
            <m.li
              key={l.id}
              className="plate relative rounded-[10px] px-5 py-4"
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-10% 0px' }}
              transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: 0.15 + i * 0.14 }}
            >
              <span aria-hidden className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-brass/70 shadow-[0_0_0_3px_rgb(var(--brass)/0.15)]" />
              <span aria-hidden className="absolute bottom-4 right-4 h-1.5 w-1.5 rounded-full bg-brass/70 shadow-[0_0_0_3px_rgb(var(--brass)/0.15)]" />
              <p className="label">
                {l.abbr} · {l.name} {l.note !== 'upstream' && `(${l.note})`}
              </p>
              <p className="engraved mt-2 font-mono text-[1.15rem] leading-tight [overflow-wrap:anywhere] xl:text-[1.2rem]">{l.version}</p>
              <p className="mt-2 text-sm text-muted">{ORIGIN[l.kind] ?? ''}</p>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
