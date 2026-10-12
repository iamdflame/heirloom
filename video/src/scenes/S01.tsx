import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, FONT } from '../theme';
import { beats, io, springStamp } from '../lib/anim';
import { BrassUnderline, KineticTitle } from '../components/Kinetic';
import { CaptureClip, hasCapture, Photo } from '../components/Capture';
import { Vignette } from '../components/Engraving';
import { longDate, site } from '../data';
import { SceneProps } from './common';

/** A dial of 60 ticks; the seconds hand advances one tick at `tickAt`. */
const Dial: React.FC<{ tickAt: number; size: number }> = ({ tickAt, size }) => {
  const frame = useCurrentFrame();
  const s = springStamp(frame, tickAt);
  const draw = io(frame, 10, 70);
  const angle = -6 + 6 * s;
  return (
    <svg width={size} height={size} viewBox="-100 -100 200 200" style={{ overflow: 'visible' }}>
      <circle r={96} fill="none" stroke={C.brass} strokeWidth={0.35} opacity={0.5} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const a = (i / 60) * Math.PI * 2;
        const r0 = major ? 84 : 89;
        return (
          <line
            key={i}
            x1={Math.sin(a) * r0}
            y1={-Math.cos(a) * r0}
            x2={Math.sin(a) * 93}
            y2={-Math.cos(a) * 93}
            stroke={i === 0 && frame >= tickAt ? C.brassHi : C.brass}
            strokeWidth={major ? 0.9 : 0.4}
            opacity={io(frame, 10 + i * 0.8, 20) * (major ? 0.8 : 0.45)}
          />
        );
      })}
      <g transform={`rotate(${angle})`} opacity={io(frame, 30, 30)}>
        <line x1={0} y1={14} x2={0} y2={-90} stroke={C.brassHi} strokeWidth={0.8} />
        <circle r={2.6} fill={C.brassHi} />
      </g>
    </svg>
  );
};

export const S01: React.FC<SceneProps> = ({ scale }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  const fadeUp = io(frame, b(0.3), 70, EASE_IN_OUT);
  const date = longDate(site.eol);
  const broll = hasCapture('BR01');
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity: fadeUp }}>
        {broll ? <CaptureClip id="BR01" label="macro watch movement" mode="full" push={0.04} /> : <Photo src="photos/movement-1920.webp" dim={0.62} push={0.05} origin="70% 50%" />}
        <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(8,9,10,0.94) 0%, rgba(8,9,10,0.82) 38%, rgba(8,9,10,0.35) 70%, rgba(8,9,10,0.25) 100%)' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', right: 120, top: 540 - 380, opacity: 0.85 * fadeUp }}>
        <Dial tickAt={b(0.9)} size={760} />
      </div>
      <div style={{ position: 'absolute', left: 150, top: 330 }}>
        <KineticTitle text={date} at={b(1.3)} out={b(4.3)} size={170} />
      </div>
      <div style={{ position: 'absolute', left: 150, top: 340 }}>
        <KineticTitle text="Django 4.2 ·" at={b(4.7)} size={150} />
        <KineticTitle text="*end* *of* *life*" at={b(4.95)} size={150} style={{ marginTop: 6 }} />
        <BrassUnderline at={b(5.6)} width={720} style={{ marginTop: 26 }} />
        <div style={{ marginTop: 26, fontFamily: FONT.mono, fontSize: 24, color: C.muted, opacity: io(frame, b(6.2), 30), letterSpacing: '0.04em' }}>
          {site.eol} · source: {site.eol_source.replace('https://', '')}
        </div>
      </div>
      <Vignette strength={0.6} />
    </AbsoluteFill>
  );
};
