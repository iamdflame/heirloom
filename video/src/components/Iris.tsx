import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT } from '../theme';
import { GuillocheRing } from './Engraving';

export const IRIS_FRAMES = 42;
const DIAG = Math.hypot(960, 540) + 40;

/** Brass-ring iris: the incoming scene opens through a circle whose rim is a brass guilloché ring. */
export const IrisTransition: React.FC<{ children: React.ReactNode; frames?: number }> = ({ children, frames = IRIS_FRAMES }) => {
  const frame = useCurrentFrame();
  if (frame >= frames) return <AbsoluteFill>{children}</AbsoluteFill>;
  const t = interpolate(frame, [0, frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });
  const r = t * DIAG;
  const rimOpacity = interpolate(t, [0, 0.1, 0.8, 1], [0, 1, 1, 0]);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${r}px at 50% 50%)` }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={960} cy={540} r={r} fill="none" stroke={C.brassHi} strokeWidth={3} opacity={rimOpacity} />
          <circle cx={960} cy={540} r={r + 14} fill="none" stroke={C.brass} strokeWidth={1} opacity={rimOpacity * 0.6} />
        </svg>
        <div style={{ position: 'absolute', opacity: rimOpacity * 0.7, transform: `rotate(${t * 90}deg)` }}>
          <GuillocheRing size={(r + 30) * 2 * 1.25} at={-999} copies={8} lobes={48} amp={1.4} r={40} strokeWidth={0.12} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
