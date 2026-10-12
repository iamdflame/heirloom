import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { beats, io } from '../lib/anim';
import { BrassUnderline, Counter } from '../components/Kinetic';
import { CaptureClip } from '../components/Capture';
import { Ground } from '../components/Engraving';
import { CFO_BASE, COST_PER_CVE, COST_STATUS, SITE_URL } from '../data';
import { SceneProps, Seq } from './common';

export const S09: React.FC<SceneProps> = ({ scale, frames }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  const t1 = b(4.4);
  const t2 = b(7.4);
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.05} glow={1.4} />
      <Seq from={0} to={t1}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 26, letterSpacing: '0.2em', color: C.muted, opacity: io(frame, b(0.3), 30) }}>MODEL COST PER ADVISORY</div>
          <div style={{ fontFamily: FONT.serif, fontSize: 300, lineHeight: 1, color: C.brassHi, marginTop: 10, opacity: io(frame, b(0.4), 20), textShadow: '0 0 80px rgba(230,203,142,0.25)' }}>
            <Counter to={COST_PER_CVE} at={b(0.5)} dur={b(2.1)} decimals={2} prefix="$" />
          </div>
          <BrassUnderline at={b(2.4)} width={520} />
          <div style={{ marginTop: 26, fontFamily: FONT.sans, fontSize: 36, color: C.bone, opacity: io(frame, b(2.6), 30) }}>
            ({COST_STATUS}) · campaign model spend ÷ advisories
          </div>
        </AbsoluteFill>
      </Seq>
      <Seq from={t1} to={t2}>
        <CaptureClip id="SH09" label="Site economics cards" url={`${SITE_URL} · economics`} />
      </Seq>
      <Seq from={t2} to={frames}>
        <CaptureClip id="CFO01" label="cfo.ai Base page: the business model" url={CFO_BASE.replace('https://', '')} enter={false} />
      </Seq>
    </AbsoluteFill>
  );
};
