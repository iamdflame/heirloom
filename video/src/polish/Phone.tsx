import React from 'react';
import { OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../theme';
import { springUI } from '../lib/anim';
import { captureFile, hasCapture } from '../components/Capture';

/** A portrait phone capture in a slim ink bezel with a brass hairline; slides in and drifts up (parallax). */
export const Phone: React.FC<{ id: string; at: number; x: number; y: number; h: number; rate?: number }> = ({ id, at, x, y, h, rate = 1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!hasCapture(id) || frame < at) return null;
  const s = springUI(frame, at);
  const w = Math.round((h * 390) / 844);
  const drift = (frame / Math.max(1, durationInFrames)) * -24;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + drift,
        width: w + 20,
        height: h + 20,
        padding: 10,
        borderRadius: 44,
        background: '#0B0C0D',
        boxShadow: `0 0 0 1.5px ${C.brass}, 0 40px 120px rgba(0,0,0,0.8)`,
        opacity: Math.min(1, s * 1.4),
        transform: `translateX(${(1 - s) * 160}px) rotate(${(1 - s) * 4}deg)`,
      }}
    >
      <div style={{ width: w, height: h, borderRadius: 34, overflow: 'hidden', background: C.ink }}>
        <OffthreadVideo src={staticFile(captureFile(id))} playbackRate={rate} muted style={{ width: w, height: h, objectFit: 'cover' }} />
      </div>
    </div>
  );
};
