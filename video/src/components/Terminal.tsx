import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { io, springUI } from '../lib/anim';

export type TermLine = { text: string; at: number; color?: string; typed?: boolean; cps?: number; weight?: number; size?: number };

/** A real-output terminal: prompt lines type in (with a cursor), output lines print. */
export const Terminal: React.FC<{
  title: string;
  lines: TermLine[];
  at: number;
  width: number;
  height?: number;
  fontSize?: number;
  scrollTo?: { at: number; dur: number; by: number }[];
  style?: React.CSSProperties;
}> = ({ title, lines, at, width, height, fontSize = 24, scrollTo = [], style }) => {
  const frame = useCurrentFrame();
  const s = springUI(frame, at);
  const scroll = scrollTo.reduce((acc, k) => acc + io(frame, k.at, k.dur) * k.by, 0);
  const visible = lines.filter((l) => frame >= l.at);
  const last = visible[visible.length - 1];
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 16,
        background: 'linear-gradient(180deg, #111416 0%, #0B0C0D 100%)',
        border: `1px solid ${C.line}`,
        boxShadow: `0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(200,168,106,0.12), inset 0 1px 0 rgba(255,255,255,0.04)`,
        opacity: Math.min(1, s * 1.3),
        transform: `translateY(${(1 - s) * 40}px) scale(${0.97 + 0.03 * s})`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.line}`, background: '#0E1011' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: 12, background: C.line }} />
        ))}
        <div style={{ marginLeft: 14, fontFamily: FONT.mono, fontSize: 22, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden', padding: '20px 28px' }}>
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          {visible.map((l, i) => {
            const n = l.typed ? Math.floor(((frame - l.at) / 60) * (l.cps ?? 48)) : l.text.length;
            const shown = l.text.slice(0, Math.max(0, n));
            const typing = l.typed && n < l.text.length;
            const fade = l.typed ? 1 : io(frame, l.at, 10);
            return (
              <div
                key={i}
                style={{
                  fontFamily: FONT.mono,
                  fontSize: l.size ?? fontSize,
                  fontWeight: l.weight ?? 400,
                  lineHeight: 1.5,
                  color: l.color ?? C.bone,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  opacity: fade,
                  minHeight: '1.5em',
                }}
              >
                {shown}
                {(typing || (l === last && Math.floor(frame / 30) % 2 === 0)) && (
                  <span style={{ display: 'inline-block', width: '0.6em', height: '1.1em', verticalAlign: 'text-bottom', background: C.brass, marginLeft: 2 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
