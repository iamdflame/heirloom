import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, FONT, VERDICT } from '../theme';
import { io, springStamp, springUI } from '../lib/anim';
import { Hallmark, GuillocheRing } from './Engraving';
import { BrassUnderline, Counter } from './Kinetic';
import timing from '../../timing.json';

/** Lower third: brass rule grows, then a mono kicker and a sans line slide up. */
export const LowerThird: React.FC<{ at: number; out: number; title: React.ReactNode; kicker?: string; x?: number; y?: number; width?: number }> = ({
  at,
  out,
  title,
  kicker,
  x = 96,
  y = 860,
  width = 980,
}) => {
  const frame = useCurrentFrame();
  if (frame < at - 1 || frame > out + 30) return null;
  const t = io(frame, at + 8, 30);
  const o = 1 - io(frame, out, 22, EASE_IN_OUT);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: o }}>
      <div
        style={{
          position: 'absolute',
          left: -28,
          top: -22,
          width: width + 56,
          height: 150,
          borderRadius: 18,
          background: 'linear-gradient(90deg, rgba(8,9,10,0.92), rgba(8,9,10,0.78) 70%, rgba(8,9,10,0))',
          opacity: io(frame, at, 24),
        }}
      />
      <div style={{ position: 'relative' }}>
        <BrassUnderline at={at} width={Math.min(width, 380)} dur={34} />
        {kicker && (
          <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.16em', color: C.brass, opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>{kicker}</div>
        )}
        <div style={{ marginTop: 8, fontFamily: FONT.sans, fontSize: 42, fontWeight: 500, color: C.bone, opacity: io(frame, at + 14, 30), transform: `translateY(${(1 - io(frame, at + 14, 30)) * 18}px)`, whiteSpace: 'nowrap' }}>
          {title}
        </div>
      </div>
    </div>
  );
};

/** Naive pipeline vs Heirloom on the known-answer backtest. */
export const BacktestSplit: React.FC<{ at: number; heirloomDelay?: number; v1: { false_not_affected: number; cases: number }; v2: { false_not_affected: number; cases: number } }> = ({ at, v1, v2, heirloomDelay = 26 }) => {
  const frame = useCurrentFrame();
  const split = io(frame, at, 50, EASE_IN_OUT);
  const side = (label: string, sub: string, n: number, col: string, delay: number, dir: number) => {
    const s = springUI(frame, at + delay);
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, opacity: s, transform: `translateX(${(1 - s) * 60 * dir}px)` }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 24, letterSpacing: '0.18em', color: C.muted }}>{label}</div>
        <div style={{ fontFamily: FONT.serif, fontSize: 300, lineHeight: 0.9, color: col, textShadow: `0 0 60px ${col}55` }}>
          <Counter from={0} to={n} at={at + delay + 6} dur={40} />
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: 34, color: C.bone, textAlign: 'center', lineHeight: 1.3 }}>{sub}</div>
      </div>
    );
  };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'stretch', padding: '140px 120px 200px' }}>
      {side('NAIVE PIPELINE', `false “not affected” · ${v1.cases} known-answer cases`, v1.false_not_affected, VERDICT.AFFECTED.color, 6, -1)}
      <div style={{ width: 2, margin: '0 60px', background: `linear-gradient(180deg, transparent, ${C.brass}, transparent)`, transform: `scaleY(${split})` }} />
      {side('HEIRLOOM', `false “not affected” · ${v2.cases} known-answer cases`, v2.false_not_affected, VERDICT.FIX_READY.color, heirloomDelay, 1)}
    </div>
  );
};

/** "PRECEDENT SEALED · P001": a wax-and-brass seal that presses in. */
export const PrecedentSeal: React.FC<{ at: number; id: string; answer: string; size?: number }> = ({ at, id, answer, size = 420 }) => {
  const frame = useCurrentFrame();
  const s = springStamp(frame, at);
  const shock = io(frame, at + 4, 40);
  if (frame < at) return null;
  return (
    <div style={{ position: 'relative', width: size, height: size, transform: `scale(${1.8 - 0.8 * s}) rotate(${(1 - s) * -12}deg)`, opacity: Math.min(1, s * 2) }}>
      <div style={{ position: 'absolute', inset: -40, borderRadius: '50%', border: `2px solid ${C.brassHi}`, opacity: (1 - shock) * 0.7, transform: `scale(${0.8 + shock * 0.6})` }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `radial-gradient(circle at 38% 32%, #3a2f1b, #1a150c 60%, #0d0b07)`,
          boxShadow: `0 0 0 3px ${C.brass}, 0 30px 90px rgba(0,0,0,0.8), 0 0 80px rgba(230,203,142,0.25), inset 0 0 40px rgba(0,0,0,0.7)`,
        }}
      />
      <div style={{ position: 'absolute', inset: 14 }}>
        <GuillocheRing size={size - 28} at={-999} copies={10} lobes={30} amp={2.4} r={44} strokeWidth={0.3} opacity={0.75} rotate={frame * 0.05} />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 24, letterSpacing: '0.3em', color: C.brass }}>PRECEDENT</div>
        <div style={{ fontFamily: FONT.serif, fontSize: 132, color: C.brassHi, lineHeight: 1 }}>{id}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 24, letterSpacing: '0.3em', color: C.brass }}>SEALED</div>
        <div style={{ marginTop: 12, fontFamily: FONT.mono, fontSize: 22, color: C.bone, opacity: io(frame, at + 20, 30) }}>{answer}</div>
      </div>
    </div>
  );
};

/** The closing card. */
export const EndCard: React.FC<{ at: number; site: string; repo: string; credit: string }> = ({ at, site, repo, credit }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Hallmark size={220} at={at} />
      <div style={{ marginTop: 34, fontFamily: FONT.serif, fontSize: 150, color: C.bone, lineHeight: 1, opacity: io(frame, at + 40, 40), transform: `translateY(${(1 - io(frame, at + 40, 40)) * 24}px)` }}>Heirloom</div>
      <div style={{ marginTop: 14, fontFamily: FONT.serif, fontSize: 54, color: C.muted, opacity: io(frame, at + 56, 40) }}>
        Old software, <span style={{ fontStyle: 'italic', color: C.brassHi }}>kept honest.</span>
      </div>
      <BrassUnderline at={at + 70} width={420} style={{ marginTop: 40 }} />
      <div style={{ marginTop: 36, display: 'flex', gap: 56, fontFamily: FONT.mono, fontSize: 30, color: C.bone, opacity: io(frame, at + 86, 36) }}>
        <span>{site}</span>
        <span style={{ color: C.line }}>│</span>
        <span>{repo}</span>
      </div>
      <div style={{ marginTop: 28, fontFamily: FONT.sans, fontSize: 28, color: C.muted, opacity: io(frame, at + 104, 36) }}>{credit}</div>
    </div>
  );
};

/** Burned-in captions from timing.json: Geist 34 px, bone on a 70% ink pill, bottom centre. */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const c = timing.captions.find((x) => frame >= x.from && frame <= x.to);
  if (!c) return null;
  const t = Math.min(io(frame, c.from, 8), 1 - io(frame, c.to - 6, 6));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        style={{
          fontFamily: FONT.sans,
          fontSize: 34,
          lineHeight: 1.3,
          color: C.bone,
          background: 'rgba(8,9,10,0.7)',
          padding: '10px 26px 12px',
          borderRadius: 999,
          opacity: t,
          maxWidth: 1400,
          textAlign: 'center',
        }}
      >
        {c.text}
      </div>
    </div>
  );
};
