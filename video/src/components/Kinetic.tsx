import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, EASE_OUT, FONT } from '../theme';
import { io } from '../lib/anim';

type Props = {
  text: string;
  at: number;
  out?: number;
  size?: number;
  color?: string;
  /** words wrapped in *asterisks* render italic brass */
  accent?: string;
  font?: 'serif' | 'sans' | 'mono';
  align?: 'left' | 'center';
  stagger?: number;
  lineHeight?: number;
  maxWidth?: number;
  style?: React.CSSProperties;
  letterSpacing?: string;
};

/** Word-by-word reveal: y 24 px → 0 and opacity, 40 ms (2.4 frame) stagger. Exits by lifting and fading. */
export const KineticTitle: React.FC<Props> = ({
  text,
  at,
  out,
  size = 120,
  color = C.bone,
  accent = C.brassHi,
  font = 'serif',
  align = 'left',
  stagger = 2.4,
  lineHeight = 1.02,
  maxWidth,
  style,
  letterSpacing = '-0.01em',
}) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  const exit = out === undefined ? 0 : io(frame, out, 26, EASE_IN_OUT);
  return (
    <div
      style={{
        fontFamily: FONT[font],
        fontSize: size,
        lineHeight,
        color,
        textAlign: align,
        maxWidth,
        letterSpacing,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const t = io(frame, at + i * stagger, 34, EASE_OUT);
        const italic = /^\*.*\*[.,]?$/.test(w);
        const clean = w.replace(/\*/g, '');
        const ex = out === undefined ? 0 : io(frame, out + i * 1.2, 22, EASE_IN_OUT);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              whiteSpace: 'pre',
              opacity: t * (1 - ex),
              transform: `translateY(${(1 - t) * 24 - ex * 18}px)`,
              filter: exit > 0 ? `blur(${ex * 6}px)` : undefined,
              fontStyle: italic ? 'italic' : undefined,
              color: italic ? accent : undefined,
            }}
          >
            {clean}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </div>
  );
};

/** A brass hairline that grows from the left. */
export const BrassUnderline: React.FC<{ at: number; width: number; dur?: number; thickness?: number; style?: React.CSSProperties; out?: number }> = ({
  at,
  width,
  dur = 50,
  thickness = 2,
  style,
  out,
}) => {
  const frame = useCurrentFrame();
  const t = io(frame, at, dur);
  const o = out === undefined ? 1 : 1 - io(frame, out, 20, EASE_IN_OUT);
  return (
    <div style={{ width, height: thickness, position: 'relative', opacity: o, ...style }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: 'left center',
          transform: `scaleX(${t})`,
          background: `linear-gradient(90deg, ${C.brassLo}, ${C.brassHi} 45%, ${C.brass} 80%, ${C.brassLo})`,
          boxShadow: `0 0 18px ${C.brass}55`,
        }}
      />
      {/* the glint that rides the leading edge */}
      <div
        style={{
          position: 'absolute',
          top: -3,
          left: t * width - 3,
          width: 6,
          height: thickness + 6,
          borderRadius: 6,
          background: C.brassHi,
          opacity: t > 0 && t < 1 ? 0.9 : 0,
          filter: 'blur(2px)',
        }}
      />
    </div>
  );
};

/** Count-up number. */
export const Counter: React.FC<{ from?: number; to: number; at: number; dur?: number; decimals?: number; prefix?: string; suffix?: string; style?: React.CSSProperties }> = ({
  from = 0,
  to,
  at,
  dur = 70,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
}) => {
  const frame = useCurrentFrame();
  const t = io(frame, at, dur);
  const v = from + (to - from) * t;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
};
