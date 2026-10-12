import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { C, FONT } from '../theme';

export type SceneProps = { scale: number; frames: number };

/** A mono kicker in the top-left safe corner: the record we're looking at. */
export const Kicker: React.FC<{ children: React.ReactNode; opacity?: number; style?: React.CSSProperties }> = ({ children, opacity = 1, style }) => (
  <div style={{ position: 'absolute', left: 96, top: 64, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.16em', color: C.muted, opacity, ...style }}>{children}</div>
);

/** Sequence shorthand: [from, to) in frames. */
export const Seq: React.FC<{ from: number; to: number; children: React.ReactNode; name?: string }> = ({ from, to, children, name }) => (
  <Sequence from={from} durationInFrames={Math.max(1, to - from)} name={name}>
    <AbsoluteFill>{children}</AbsoluteFill>
  </Sequence>
);
