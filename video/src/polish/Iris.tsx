import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT } from '../theme';
import { GuillocheRing } from '../components/Engraving';

export const IRIS_FRAMES = 36;
/** The outgoing scene is gone (faded to ink) before the ring is big enough to cut through any of its words. */
export const OUT_FADE = 8;
const DIAG = Math.hypot(960, 540) + 40;

/** Brass-ring iris: the incoming scene opens through a circle; its own content fades in so nothing reads half-masked. */
export const IrisIn: React.FC<{ children: React.ReactNode; frames?: number }> = ({ children, frames = IRIS_FRAMES }) => {
  const frame = useCurrentFrame();
  if (frame >= frames) return <AbsoluteFill>{children}</AbsoluteFill>;
  const t = interpolate(frame, [0, frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });
  const r = t * DIAG;
  const rim = interpolate(t, [0, 0.1, 0.8, 1], [0, 1, 1, 0]);
  const inner = interpolate(t, [0.2, 0.75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${r}px at 50% 50%)`, background: C.ink }}>
        <AbsoluteFill style={{ opacity: inner }}>{children}</AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={960} cy={540} r={r} fill="none" stroke={C.brassHi} strokeWidth={3} opacity={rim} />
          <circle cx={960} cy={540} r={r + 14} fill="none" stroke={C.brass} strokeWidth={1} opacity={rim * 0.6} />
        </svg>
        <div style={{ position: 'absolute', opacity: rim * 0.7, transform: `rotate(${t * 90}deg)` }}>
          <GuillocheRing size={(r + 30) * 2 * 1.25} at={-999} copies={8} lobes={48} amp={1.4} r={40} strokeWidth={0.12} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Outgoing side: fades to ink over the first OUT_FADE frames of the next scene's iris. */
export const IrisOut: React.FC<{ children: React.ReactNode; from: number }> = ({ children, from }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [from, from + OUT_FADE], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

/** Slow push-in on the whole scene (2.5%) so no shot sits static. */
export const Push: React.FC<{ children: React.ReactNode; frames: number; amount?: number; origin?: string }> = ({ children, frames, amount = 0.025, origin = '50% 46%' }) => {
  const frame = useCurrentFrame();
  const s = 1 + amount * interpolate(frame, [0, frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: origin }}>{children}</AbsoluteFill>;
};
