import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { HALLMARK_H, hallmarkRing, rosette, waveBand } from '../lib/guilloche';
import { io, springStamp } from '../lib/anim';

/** Procedural guilloché rosette (the site's generator). Lines draw on via stroke-dashoffset. */
export const GuillocheRing: React.FC<{
  size: number;
  at?: number;
  dur?: number;
  copies?: number;
  lobes?: number;
  amp?: number;
  r?: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({ size, at = 0, dur = 90, copies = 12, lobes = 24, amp = 4, r = 40, stroke = C.brass, strokeWidth = 0.18, opacity = 1, rotate = 0, style }) => {
  const frame = useCurrentFrame();
  const paths = useMemo(() => rosette({ r, amp, lobes, copies, steps: 720 }), [r, amp, lobes, copies]);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ opacity, transform: `rotate(${rotate}deg)`, overflow: 'visible', ...style }}>
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
        {paths.map((d, i) => {
          const t = io(frame, at + i * (dur / copies) * 0.5, dur);
          return <path key={i} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - t} />;
        })}
      </g>
    </svg>
  );
};

/** Horizontal guilloché wave band. */
export const GuillocheBand: React.FC<{ width: number; at?: number; dur?: number; opacity?: number; copies?: number; amp?: number; style?: React.CSSProperties }> = ({
  width,
  at = 0,
  dur = 80,
  opacity = 0.5,
  copies = 6,
  amp = 6,
  style,
}) => {
  const frame = useCurrentFrame();
  const paths = useMemo(() => waveBand({ width, y: 12, amp, wavelength: 56, copies, step: 4 }), [width, amp, copies]);
  const t = io(frame, at, dur);
  return (
    <svg width={width} height={24 + amp} viewBox={`0 0 ${width} 24`} style={{ overflow: 'visible', opacity, ...style }}>
      <g fill="none" stroke={C.brass} strokeWidth={0.7}>
        {paths.map((d, i) => (
          <path key={i} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - t} />
        ))}
      </g>
    </svg>
  );
};

const RING = hallmarkRing(5, 220);

/** The hallmark: slab-serif H in a guilloché ring. Draws its ring on, then the H stamps. */
export const Hallmark: React.FC<{ size: number; at?: number; stamp?: boolean; color?: string; glow?: boolean; style?: React.CSSProperties }> = ({
  size,
  at = 0,
  stamp = true,
  color = C.brass,
  glow = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const ring = io(frame, at, 60);
  const s = stamp ? springStamp(frame, at + 34) : 1;
  const hScale = stamp ? 1.35 - 0.35 * s : 1;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible', filter: glow ? `drop-shadow(0 0 ${size / 18}px ${C.brass}40)` : undefined, ...style }}>
      <defs>
        <linearGradient id="hm-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.brassHi} />
          <stop offset="0.5" stopColor={color} />
          <stop offset="1" stopColor={C.brassLo} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke="url(#hm-brass)" strokeWidth="1.6" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ring} />
      <g fill="none" stroke="url(#hm-brass)" strokeWidth="0.6" opacity="0.9">
        {RING.map((d, i) => (
          <path key={i} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - io(frame, at + 8 + i * 6, 56)} />
        ))}
      </g>
      <circle cx="50" cy="50" r="35" fill="none" stroke="url(#hm-brass)" strokeWidth="1.2" opacity={io(frame, at + 20, 30)} />
      <g style={{ transformOrigin: '50px 50px', transform: `scale(${hScale})` }} opacity={stamp ? Math.min(1, s * 1.6) : 1}>
        <path d={HALLMARK_H} fill="url(#hm-brass)" />
      </g>
    </svg>
  );
};

/** Ink ground with a faint warm radial glow and a slow guilloché watermark. */
export const Ground: React.FC<{ glow?: number; ring?: boolean; ringOpacity?: number; x?: string; y?: string }> = ({ glow = 1, ring = true, ringOpacity = 0.07, x = '50%', y = '46%' }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.ink, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 70% 60% at ${x} ${y}, rgba(200,168,106,${0.07 * glow}) 0%, rgba(15,17,18,0.6) 45%, ${C.ink} 80%)`,
        }}
      />
      {ring && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) rotate(${frame * 0.02}deg)` }}>
          <GuillocheRing size={1500} copies={14} lobes={36} amp={3} strokeWidth={0.06} opacity={ringOpacity} at={-999} />
        </div>
      )}
      <Vignette />
    </div>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.75 }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);
