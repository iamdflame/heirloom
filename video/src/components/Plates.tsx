import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, FONT, VERDICT } from '../theme';
import { io, springStamp, springUI } from '../lib/anim';

/** An engraved brass plate: brushed dark face, bevelled brass rim, two screw heads. */
export const Plate: React.FC<{ children: React.ReactNode; width?: number | string; pad?: string; style?: React.CSSProperties; glow?: number }> = ({
  children,
  width,
  pad = '28px 40px',
  style,
  glow = 0,
}) => (
  <div
    style={{
      position: 'relative',
      width,
      padding: 2,
      borderRadius: 14,
      background: `linear-gradient(135deg, ${C.brassHi} 0%, ${C.brassLo} 30%, ${C.brass} 55%, ${C.brassLo} 80%, ${C.brassHi} 100%)`,
      boxShadow: `0 30px 80px rgba(0,0,0,0.65), 0 0 ${40 * glow}px rgba(230,203,142,${0.35 * glow})`,
      ...style,
    }}
  >
    <div
      style={{
        position: 'relative',
        borderRadius: 12,
        padding: pad,
        background: `linear-gradient(180deg, #1A1D1F 0%, ${C.raised} 60%, #0C0D0E 100%)`,
        boxShadow: 'inset 0 1px 0 rgba(230,203,142,0.18), inset 0 -1px 0 rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}
    >
      {/* brushed metal lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.08,
          background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 3px)',
        }}
      />
      {[12, -12].map((x) => (
        <div
          key={x}
          style={{
            position: 'absolute',
            top: '50%',
            [x > 0 ? 'left' : 'right']: 12,
            width: 10,
            height: 10,
            marginTop: -5,
            borderRadius: 10,
            background: `radial-gradient(circle at 35% 35%, ${C.brassHi}, ${C.brassLo})`,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ position: 'absolute', left: 1, right: 1, top: 4, height: 1.5, background: 'rgba(0,0,0,0.55)', transform: `rotate(${x * 3}deg)` }} />
        </div>
      ))}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  </div>
);

/** "Debian 13 · python-django 3:4.2.28-0+deb13u2" plates that slide in and settle. */
export const DistroPlate: React.FC<{ name: string; pkg: string; version: string; at: number; from?: number; scale?: number }> = ({ name, pkg, version, at, from = -1, scale = 1 }) => {
  const frame = useCurrentFrame();
  const s = springUI(frame, at);
  return (
    <div style={{ transform: `translateX(${(1 - s) * 220 * from}px) scale(${scale})`, opacity: Math.min(1, s * 1.4), transformOrigin: 'left center' }}>
      <Plate pad="26px 48px 28px">
        <div style={{ fontFamily: FONT.serif, fontSize: 64, color: C.bone, lineHeight: 1 }}>{name}</div>
        <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 30, color: C.brassHi, letterSpacing: '0.01em' }}>
          <span style={{ color: C.muted }}>{pkg} </span>
          {version}
        </div>
      </Plate>
    </div>
  );
};

/** A rubber-stamp label: slams down from 1.6× with a slight rotation. */
export const Stamp: React.FC<{ text: string; color: string; at: number; size?: number; rotate?: number; style?: React.CSSProperties }> = ({ text, color, at, size = 22, rotate = -4, style }) => {
  const frame = useCurrentFrame();
  const s = springStamp(frame, at);
  if (frame < at) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: FONT.mono,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: '0.12em',
        color,
        border: `2px solid ${color}`,
        borderRadius: 6,
        padding: `${size * 0.18}px ${size * 0.5}px`,
        transform: `scale(${1.6 - 0.6 * s}) rotate(${rotate}deg)`,
        opacity: Math.min(1, s * 2),
        background: `${color}14`,
        boxShadow: `0 0 ${18 * (1 - s) + 6}px ${color}33`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {text}
    </span>
  );
};

/** The 19 advisories cascade in, each getting its NO 4.2 PATCH stamp. */
export const CveCascade: React.FC<{ items: { cve: string; date: string }[]; at: number; every?: number; columns?: number; stampDelay?: number; dim?: number }> = ({
  items,
  at,
  every = 6,
  columns = 2,
  stampDelay = 14,
  dim = 1,
}) => {
  const frame = useCurrentFrame();
  const per = Math.ceil(items.length / columns);
  return (
    <div style={{ display: 'flex', gap: 56, opacity: dim }}>
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.slice(c * per, c * per + per).map((it, j) => {
            const i = c * per + j;
            const t = io(frame, at + i * every, 30);
            return (
              <div key={it.cve} style={{ display: 'flex', alignItems: 'center', gap: 22, height: 50, opacity: t, transform: `translateY(${(1 - t) * -28}px)` }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 18, color: C.muted, width: 104 }}>{it.date}</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 28, color: C.bone, width: 290 }}>{it.cve}</span>
                <Stamp text="NO 4.2 PATCH" color={VERDICT.AFFECTED.color} at={at + i * every + stampDelay} size={18} rotate={-3} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Two date plates lock around a glowing band: "Oct 1 … 5 days … Oct 6". */
export const DatePlates: React.FC<{
  left: { date: string; text: React.ReactNode };
  right: { date: string; text: React.ReactNode };
  days: number;
  at: number;
  lockAt: number;
}> = ({ left, right, days, at, lockAt }) => {
  const frame = useCurrentFrame();
  const sL = springUI(frame, at);
  const sR = springUI(frame, at + 22);
  const lock = io(frame, lockAt, 40, EASE_IN_OUT);
  const gap = interpolate(lock, [0, 1], [260, 0]);
  const band = io(frame, lockAt + 16, 40);
  const pulse = 0.75 + 0.25 * Math.sin((frame - lockAt) / 14);
  const plate = (p: { date: string; text: React.ReactNode }, s: number, dir: number, glow: number) => (
    <div style={{ transform: `translateX(${(1 - s) * 300 * dir + (dir * gap) / 2}px)`, opacity: Math.min(1, s * 1.5) }}>
      <Plate width={560} pad="30px 44px" glow={glow}>
        <div style={{ fontFamily: FONT.serif, fontSize: 84, color: C.brassHi, lineHeight: 1 }}>{p.date}</div>
        <div style={{ marginTop: 14, fontFamily: FONT.sans, fontSize: 30, color: C.bone, lineHeight: 1.25 }}>{p.text}</div>
      </Plate>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {plate(left, sL, -1, lock * 0.4)}
      <div style={{ position: 'relative', width: 300 * band + 40, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 -20px', zIndex: 2 }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 40,
            height: 40,
            borderRadius: 40,
            opacity: band,
            background: `linear-gradient(90deg, ${C.brassLo}, ${C.brassHi}, ${C.brassLo})`,
            boxShadow: `0 0 ${60 * pulse}px rgba(230,203,142,${0.55 * pulse})`,
          }}
        />
        <div style={{ position: 'relative', fontFamily: FONT.mono, fontWeight: 500, fontSize: 30, color: C.ink, opacity: band, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {days} days
        </div>
      </div>
      {plate(right, sR, 1, lock * 0.4)}
    </div>
  );
};
