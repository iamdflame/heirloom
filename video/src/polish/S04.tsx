import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT } from '../theme';
import { beats, io } from '../lib/anim';
import { KineticTitle } from '../components/Kinetic';
import { CaptureClip, captureSeconds, hasCapture } from '../components/Capture';
import { Ground, GuillocheRing, Hallmark } from '../components/Engraving';
import { SITE_URL } from '../data';
import { SceneProps, Seq } from '../scenes/common';
import { Phone } from './Phone';

export const S04: React.FC<SceneProps> = ({ scale, frames }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  // cut to the site hero only if V-CAP's clip is long enough to carry the rest of the scene
  const hero = captureSeconds('SH01') >= 3 ? 'SH01' : captureSeconds('SH02') >= 3 ? 'SH02' : null; // SH02 opens on the same hero
  const heroOk = hero !== null;
  const cut = heroOk ? b(7.4) : frames;
  const render3d = hasCapture('R3D01');
  const settle = io(frame, b(2.2), 60, EASE_IN_OUT);
  return (
    <AbsoluteFill>
      <Seq from={0} to={cut}>
        <Ground ring={false} glow={1.6} />
        {render3d || hasCapture('BR02') ? (
          <AbsoluteFill style={{ opacity: 1 - 0.55 * settle }}>
            <CaptureClip id={render3d ? 'R3D01' : 'BR02'} label="3D brass movement, slow orbit" mode="full" push={0.05} />
          </AbsoluteFill>
        ) : (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 0.9 - 0.4 * settle }}>
            <div style={{ position: 'absolute', transform: `rotate(${frame * 0.08}deg)` }}>
              <GuillocheRing size={1180} at={-999} copies={16} lobes={30} amp={3.2} strokeWidth={0.09} opacity={0.6 * io(frame, 0, 90)} />
            </div>
            <div style={{ position: 'absolute', transform: `rotate(${-frame * 0.12}deg)` }}>
              <GuillocheRing size={760} at={-999} copies={12} lobes={22} amp={4} strokeWidth={0.12} opacity={0.5 * io(frame, 10, 90)} />
            </div>
          </AbsoluteFill>
        )}
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 46%, rgba(8,9,10,${0.15 + 0.55 * settle}) 0%, rgba(8,9,10,${0.4 + 0.4 * settle}) 40%, ${C.ink} 85%)` }} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <Hallmark size={250} at={b(2.4) - 34} />
          <div style={{ marginTop: 30 }}>
            <KineticTitle text="Heirloom" at={b(3.4)} size={170} align="center" />
          </div>
          <div style={{ marginTop: 8 }}>
            <KineticTitle text="Old software, *kept* *honest.*" at={b(4.3)} size={62} color={C.muted} align="center" />
          </div>
        </AbsoluteFill>
      </Seq>
      {heroOk && (
      <Seq from={cut} to={frames}>
        <Ground ringOpacity={0.04} />
        <CaptureClip id={hero ?? 'SH01'} rate={hero === 'SH02' ? 0.75 : 1} label="Site hero, the 3D movement turning" url={SITE_URL} />
        {/* the same site on a phone (SHM, 390×844 @3x): a second layer that drifts against the window */}
        <Phone id="SHM" at={16} x={1490} y={300} h={700} />
      </Seq>
      )}
    </AbsoluteFill>
  );
};
