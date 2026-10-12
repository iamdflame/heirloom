import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { io, springStamp } from '../lib/anim';
import { BrassUnderline, Counter } from '../components/Kinetic';

/** Left-column motion graphic for split layouts: kicker, a big serif number that stamps in, a title and a sub line. */
export const Stat: React.FC<{
  at: number;
  kicker: string;
  n?: number;
  big?: React.ReactNode;
  color?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  top?: number;
  out?: number;
}> = ({ at, kicker, n, big, color = C.brassHi, title, sub, top = 230, out = 1e9 }) => {
  const frame = useCurrentFrame();
  const s = springStamp(frame, at + 6);
  const o = Math.min(io(frame, at, 16), 1 - io(frame, out - 12, 12));
  return (
    <div style={{ position: 'absolute', left: 96, top, width: 640, opacity: o }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.18em', color: C.brass }}>{kicker}</div>
      <div style={{ marginTop: 10, fontFamily: FONT.serif, fontSize: 230, lineHeight: 0.95, color, textShadow: `0 0 70px ${color}44`, transform: `scale(${1.3 - 0.3 * s})`, transformOrigin: '0% 60%', opacity: Math.min(1, s * 1.5) }}>
        {big ?? <Counter to={n ?? 0} at={at + 6} dur={30} />}
      </div>
      <BrassUnderline at={at + 18} width={300} style={{ marginTop: 10 }} />
      <div style={{ marginTop: 22, fontFamily: FONT.serif, fontSize: 58, lineHeight: 1.08, color: C.bone, opacity: io(frame, at + 14, 24), transform: `translateY(${(1 - io(frame, at + 14, 24)) * 18}px)` }}>{title}</div>
      {sub && <div style={{ marginTop: 18, fontFamily: FONT.sans, fontSize: 30, lineHeight: 1.35, color: C.muted, opacity: io(frame, at + 26, 24) }}>{sub}</div>}
    </div>
  );
};
