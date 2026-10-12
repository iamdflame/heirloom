import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { io } from '../lib/anim';
import { TIMING } from './anchors';

/** Word-accurate burned-in captions (display text): Geist 34 px, bone on a 70% ink pill, bottom centre. */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const c = TIMING.captions.find((x) => frame >= x.from && frame <= x.to);
  if (!c) return null;
  const t = Math.min(io(frame, c.from, 6), 1 - io(frame, c.to - 5, 5));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        style={{
          fontFamily: FONT.sans,
          fontSize: 34,
          lineHeight: 1.3,
          color: C.bone,
          background: 'rgba(8,9,10,0.7)',
          padding: '10px 28px 12px',
          borderRadius: c.text.includes('\n') ? 26 : 999,
          whiteSpace: 'pre-line',
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
