import { useRef, useState } from 'react';
import { m, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { prNum, site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { cn } from '@/lib/utils';

// Five wheels of one module, centres on a line, so the teeth really mesh.
const MOD = 4.2;
const TEETH = [30, 18, 26, 16, 22];
const R = TEETH.map((n) => (MOD * n) / 2);
const ADD = MOD;
const CX: number[] = [];
TEETH.forEach((_, i) => CX.push(i === 0 ? R[0]! + ADD + 6 : CX[i - 1]! + R[i - 1]! + R[i]!));
const W = CX[4]! + R[4]! + ADD + 6;
const H = 2 * (R[0]! + ADD) + 12;
const CY = H / 2;
const frac = (x: number) => x - Math.floor(x);
// phase so a tooth of wheel i−1 sits in a gap of wheel i where they meet
const PHASE: number[] = [0];
for (let i = 1; i < 5; i++) {
  const f = frac(-PHASE[i - 1]! / (360 / TEETH[i - 1]!));
  PHASE.push(180 - (0.5 - f) * (360 / TEETH[i]!));
}

function gearPath(n: number, r: number) {
  const ro = r + ADD * 0.85;
  const ri = r - ADD * 1.1;
  const step = (Math.PI * 2) / n;
  const pt = (a: number, rr: number) => `${(rr * Math.cos(a)).toFixed(2)} ${(rr * Math.sin(a)).toFixed(2)}`;
  let d = '';
  for (let k = 0; k < n; k++) {
    const a = k * step;
    d += `${k ? 'L' : 'M'}${pt(a - step * 0.5, ri)} L${pt(a - step * 0.24, ri)} L${pt(a - step * 0.14, ro)} L${pt(a + step * 0.14, ro)} L${pt(a + step * 0.24, ri)} `;
  }
  d += 'Z';
  // spoke windows: four (or five) rounded cut-outs between rim and hub
  const spokes = n > 20 ? 5 : 4;
  const r1 = r * 0.3;
  const r2 = r * 0.72;
  for (let s = 0; s < spokes; s++) {
    const a0 = (s / spokes) * Math.PI * 2 + 0.2;
    const a1 = a0 + (Math.PI * 2) / spokes - 0.4;
    d += ` M${pt(a0, r1)} L${pt(a0, r2)} A${r2} ${r2} 0 0 1 ${pt(a1, r2)} L${pt(a1, r1)} A${r1} ${r1} 0 0 0 ${pt(a0, r1)} Z`;
  }
  return d;
}
const PATHS = TEETH.map((n, i) => gearPath(n, R[i]!));

/** Beat 7, "The movement": the method as a gear train that turns with scroll; each stage lights up with its proof. */
export function Movement() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [step, setStep] = useState(reduce ? 4 : 0);
  useMotionValueEvent(scrollYProgress, 'change', (p) => !reduce && setStep(Math.max(0, Math.min(4, Math.floor(p * 5.2)))));
  const turn = useTransform(scrollYProgress, [0, 1], [0, 540]);
  const st = STAGES();
  return (
    <section id="movement" aria-labelledby="movement-h" className="relative">
      <div ref={ref} className={cn('relative', reduce ? '' : 'h-[260vh]')}>
        <div className={cn('flex flex-col justify-center overflow-hidden py-24', !reduce && 'sticky top-0 h-[100svh] py-0')}>
          <div className={WRAP}>
            <p className="eyebrow">The movement · how a verdict is earned</p>
            <h2 id="movement-h" className="display mt-4 max-w-[20ch] text-[clamp(2.2rem,4.6vw,4.2rem)]">
              Five stages, <em className="italic text-brass-hi">each one driving the next.</em>
            </h2>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-8 w-full max-w-[64rem] md:mt-12" aria-hidden>
              <defs>
                <linearGradient id="gear-lit" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#F2DCA6" />
                  <stop offset="0.45" stopColor="#C8A86A" />
                  <stop offset="1" stopColor="#6E5730" />
                </linearGradient>
                <linearGradient id="gear-dim" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#5A4A2C" />
                  <stop offset="1" stopColor="#2A2318" />
                </linearGradient>
              </defs>
              {TEETH.map((n, i) => (
                <Wheel key={n} i={i} lit={i <= step} turn={turn} reduce={!!reduce} />
              ))}
            </svg>
            <ol className="mt-6 grid gap-2 md:mt-10 md:grid-cols-5 md:gap-4">
              {st.map((s, i) => (
                <li
                  key={s.name}
                  className={cn(
                    'rounded-[10px] border px-4 py-2.5 md:py-3 transition-[opacity,border-color,background-color] duration-500 ease-out',
                    i === step ? 'plate border-brass/60' : 'border-rule bg-surface/40',
                    i > step && 'opacity-45',
                  )}
                  aria-current={i === step ? 'step' : undefined}
                >
                  <p className="font-mono text-[0.7rem] tracking-[0.14em] text-brass">{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 text-[1.05rem] font-medium leading-snug">{s.name}</h3>
                  <p className={cn('mt-1.5 text-[0.88rem] leading-snug text-ink/80', i !== step && 'max-md:hidden')}>{s.proof}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div className={cn(WRAP, 'pb-24 pt-8 md:pb-36')}>
        <p className="display max-w-[16ch] text-[clamp(3.2rem,9vw,8.5rem)] leading-[0.9]">
          Never trust a test <em className="italic text-brass-hi">that hasn&rsquo;t failed.</em>
        </p>
      </div>
    </section>
  );
}

function Wheel({ i, lit, turn, reduce }: { i: number; lit: boolean; turn: MotionValue<number>; reduce: boolean }) {
  // wheel i turns opposite to i−1, at the tooth ratio
  const ratio = TEETH[0]! / TEETH[i]!;
  const rot = useTransform(turn, (a) => PHASE[i]! + (i % 2 ? -1 : 1) * a * ratio);
  return (
    <g transform={`translate(${CX[i]} ${CY})`}>
      <m.g style={reduce ? { rotate: PHASE[i] } : { rotate: rot }}>
        <path
          d={PATHS[i]}
          fillRule="evenodd"
          fill={lit ? 'url(#gear-lit)' : 'url(#gear-dim)'}
          stroke={lit ? '#E6CB8E' : '#3A3022'}
          strokeWidth="0.6"
          style={{ transition: 'fill 500ms, stroke 500ms', filter: lit ? 'drop-shadow(0 0 6px rgb(200 168 106 / 0.35))' : undefined }}
        />
      </m.g>
      <circle r={R[i]! * 0.2} fill={lit ? '#8F9296' : '#2A2C2E'} stroke="#08090A" strokeWidth="1" />
      <circle r={R[i]! * 0.07} fill={lit ? '#7A0F1A' : '#1A1B1C'} />
    </g>
  );
}

function STAGES() {
  const s = site.summary;
  const md = site.method;
  const f = site.finding;
  return [
    {
      name: 'Locate',
      proof: (
        <>
          The upstream fix commit and its test changes
          {f && (
            <>
              , e.g.{' '}
              <a className="link font-mono text-[0.9em]" href={f.fix_url}>
                {f.fix_commit.slice(0, 8)}
              </a>
            </>
          )}{' '}
          ·{' '}
          <a className="link" href={md.code.locate}>
            locate.py
          </a>
        </>
      ),
    },
    {
      name: 'Probe',
      proof: (
        <>
          An independent test from the advisory; the porter never sees the fix&rsquo;s code ·{' '}
          <a className="link" href={md.code.probe}>
            probe.py
          </a>
        </>
      ),
    },
    {
      name: 'Calibrate',
      proof: (
        <>
          Fails ×{s.probe_before} before the fix, passes ×{s.probe_after} after it, on upstream ·{' '}
          <a className="link" href={`#${md.example.anchor}`}>
            {md.example.cve}
          </a>
        </>
      ),
    },
    {
      name: 'Adapt & verify',
      proof: (
        <>
          {s.fail_to_pass} of {s.prs} ports go FAIL → PASS on 4.2, no new test failures ·{' '}
          <a className="link" href={md.code.verify}>
            verify.py
          </a>
        </>
      ),
    },
    {
      name: 'Decide & publish',
      proof: (
        <>
          <a className="link" href={md.example.pr}>
            PR {prNum(md.example.pr)}
          </a>{' '}
          or an evidence issue; one question to the owner ·{' '}
          <a className="link" href={md.code.decide}>
            decide.py
          </a>
        </>
      ),
    },
  ];
}
