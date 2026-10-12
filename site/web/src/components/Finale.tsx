import { useRef } from 'react';
import { useScroll } from 'motion/react';
import { ArrowRight, ArrowUp } from 'lucide-react';
import { site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { LiveMovement } from './HeroVisual';
import { Hallmark } from './Hallmark';
import { Magnetic, Reveal } from './fx';

/** Beat 12, the finale: the movement zoomed out, slowing to a stop as the page ends; the promise and the CTA. */
export function Finale() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const s = site.summary;
  return (
    <section ref={ref} id="finale" aria-labelledby="finale-h" className="relative isolate flex min-h-[110svh] items-end overflow-hidden pb-24 pt-40 md:items-center md:pb-0">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <LiveMovement progress={scrollYProgress} variant="finale" poster="finale-poster" posterClass="object-[50%_40%]" />
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-paper to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-paper to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_55%,rgb(var(--paper)/0.9),rgb(var(--paper)/0.7)_55%,rgb(var(--paper)/0.25)_100%)]" />
      </div>
      <div className={cn(WRAP, 'text-center')}>
        <Reveal>
          <Hallmark size={56} className="mx-auto text-brass-hi" />
        </Reveal>
        <Reveal delay={0.1}>
          <h2 id="finale-h" className="display mx-auto mt-8 max-w-[14ch] text-[clamp(3rem,8vw,7.5rem)] leading-[0.92]">
            Every verdict is <em className="italic text-brass-hi">a test run you can open.</em>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-[36rem] text-lg text-ink/85">
            {s.cves} advisories, {s.prs} candidate backports, {s.issues} evidence issues and {s.questions}{' '}
            {s.questions === 1 ? 'question' : 'questions'}. Each one links to the run that decided it.
          </p>
        </Reveal>
        <Reveal delay={0.3} className="mt-10 flex flex-wrap justify-center gap-3">
          <Magnetic href="#register" className="btn btn-brass press">
            Open the register <ArrowRight className="h-4 w-4" aria-hidden />
          </Magnetic>
          <Magnetic href={site.repo} className="btn btn-ghost press">
            Read the code
          </Magnetic>
          <a href="#top" className="btn press text-muted hover-ink">
            Back to the top <ArrowUp className="h-4 w-4" aria-hidden />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
