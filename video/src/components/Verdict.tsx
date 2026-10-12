import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, Chip, FONT, VERDICT } from '../theme';
import { io, springStamp, springUI } from '../lib/anim';

/** The verdict chip, stamped in. */
export const VerdictChip: React.FC<{ chip: Chip; at: number; size?: number; style?: React.CSSProperties }> = ({ chip, at, size = 28, style }) => {
  const frame = useCurrentFrame();
  const s = springStamp(frame, at);
  const v = VERDICT[chip];
  const ring = io(frame, at, 40);
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      {frame >= at && (
        <div
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: 999,
            border: `2px solid ${v.color}`,
            opacity: (1 - ring) * 0.8,
            transform: `scale(${1 + ring * 0.5})`,
          }}
        />
      )}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: size * 0.45,
          padding: `${size * 0.42}px ${size * 0.9}px`,
          borderRadius: 999,
          border: `2px solid ${v.color}`,
          background: `${v.color}1F`,
          color: v.color,
          fontFamily: FONT.mono,
          fontWeight: 500,
          fontSize: size,
          letterSpacing: '0.14em',
          opacity: frame < at ? 0 : Math.min(1, s * 2),
          transform: `scale(${1.5 - 0.5 * s})`,
          boxShadow: `0 0 ${30 + 30 * (1 - s)}px ${v.color}40`,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: v.color, boxShadow: `0 0 12px ${v.color}` }} />
        {v.label}
      </div>
    </div>
  );
};

/** A row of indicator lights that switch on one by one. */
export const Lights: React.FC<{ outcomes: string[]; at: number; every?: number; size?: number }> = ({ outcomes, at, every = 10, size = 30 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', gap: size * 0.45 }}>
      {outcomes.map((o, i) => {
        const on = io(frame, at + i * every, 14);
        const col = o === 'PASS' ? VERDICT.FIX_READY.color : VERDICT.AFFECTED.color;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: size,
                height: size,
                borderRadius: size,
                background: interpolate(on, [0, 1], [0, 1]) > 0.01 ? `radial-gradient(circle at 40% 35%, #fff8, ${col} 45%, ${col}aa)` : '#1a1d1f',
                opacity: 0.25 + 0.75 * on,
                border: `1px solid ${on > 0 ? col : C.line}`,
                boxShadow: on > 0 ? `0 0 ${24 * on}px ${col}, 0 0 ${60 * on}px ${col}55` : 'none',
              }}
            />
            <div style={{ fontFamily: FONT.mono, fontSize: 18, color: on > 0.5 ? col : C.muted, letterSpacing: '0.08em', opacity: 0.4 + 0.6 * on }}>{o}</div>
          </div>
        );
      })}
    </div>
  );
};

type Node = { key: string; label: string; sub: string; outcomes: string[]; x: number; y: number; lightsAt: number };

/** U⁻ (before the fix) → FAIL ×3, U⁺ (after) → PASS ×3, then the old line L → verdict. */
export const CalibrationTriangle: React.FC<{ nodes: [Node, Node, Node]; at: number; verdict: { chip: Chip; at: number }; width: number; height: number }> = ({
  nodes,
  at,
  verdict,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const edges: [Node, Node, number][] = [
    [nodes[0], nodes[1], nodes[1].lightsAt - 20],
    [nodes[0], nodes[2], nodes[2].lightsAt - 24],
    [nodes[1], nodes[2], nodes[2].lightsAt - 24],
  ];
  return (
    <div style={{ position: 'relative', width, height }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id="edge" x1="0" x2="1">
            <stop offset="0" stopColor={C.brassLo} />
            <stop offset="0.5" stopColor={C.brassHi} />
            <stop offset="1" stopColor={C.brassLo} />
          </linearGradient>
        </defs>
        {edges.map(([a, b, t0], i) => {
          const t = io(frame, t0, 40);
          return <line key={i} x1={a.x} y1={a.y} x2={a.x + (b.x - a.x) * t} y2={a.y + (b.y - a.y) * t} stroke="url(#edge)" strokeWidth={2} strokeDasharray="6 8" opacity={0.9} />;
        })}
      </svg>
      {nodes.map((n, i) => {
        const s = springUI(frame, at + i * 12);
        return (
          <div
            key={n.key}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * s})`,
              opacity: s,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
            }}
          >
            <div
              style={{
                padding: '22px 34px',
                borderRadius: 18,
                background: `linear-gradient(180deg, ${C.raised2}, ${C.raised})`,
                border: `1px solid ${C.brassLo}`,
                boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                minWidth: 360,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                <span style={{ fontFamily: FONT.serif, fontSize: 64, color: C.brassHi, lineHeight: 1 }}>{n.label}</span>
                <span style={{ fontFamily: FONT.sans, fontSize: 28, color: C.bone }}>{n.sub}</span>
              </div>
              <Lights outcomes={n.outcomes} at={n.lightsAt} />
            </div>
            {i === 2 && <VerdictChip chip={verdict.chip} at={verdict.at} size={30} />}
          </div>
        );
      })}
    </div>
  );
};

/** Gates tick on one by one. */
export const GateChecklist: React.FC<{ gates: { id: string; label: string; note?: string; ok: boolean }[]; at: number; every?: number; width?: number }> = ({ gates, at, every = 14, width = 900 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {gates.map((g, i) => {
        const t = io(frame, at + i * every, 26);
        const tick = springStamp(frame, at + i * every + 8);
        const col = g.ok ? VERDICT.FIX_READY.color : C.muted;
        return (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 24, opacity: t, transform: `translateX(${(1 - t) * -24}px)` }}>
            <div
              style={{
                width: 44,
                height: 44,
                flex: 'none',
                borderRadius: 44,
                border: `2px solid ${frame >= at + i * every + 8 ? col : C.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: col,
                fontSize: 26,
                fontFamily: FONT.sans,
                background: frame >= at + i * every + 8 ? `${col}1A` : 'transparent',
              }}
            >
              <span style={{ transform: `scale(${tick})`, display: 'inline-block' }}>✓</span>
            </div>
            <span style={{ fontFamily: FONT.mono, fontSize: 28, color: C.brassHi, width: 60 }}>{g.id}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: FONT.sans, fontSize: 30, color: C.bone }}>{g.label}</span>
              {g.note && <span style={{ fontFamily: FONT.mono, fontSize: 22, color: C.muted, marginTop: 4, whiteSpace: 'nowrap' }}>{g.note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
