import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, FONT, VERDICT } from '../theme';
import { beats, io, lerp } from '../lib/anim';
import { CveCascade, DistroPlate } from '../components/Plates';
import { Counter } from '../components/Kinetic';
import { Ground } from '../components/Engraving';
import { ADVISORIES, DEBIAN, SUMMARY, UBUNTU, UPSTREAM_42_PATCHES } from '../data';
import { SceneProps } from './common';

export const S02: React.FC<SceneProps> = ({ scale }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  // plates arrive big and centred, then lift into a header row
  const lift = io(frame, b(4.4), 60, EASE_IN_OUT);
  const plateScale = lerp(1.2, 0.78, lift);
  const counterT = io(frame, b(8.8), 40);
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.05} />
      <div style={{ position: 'absolute', left: lerp(530, 116, lift), top: lerp(250, 64, lift) }}>
        <DistroPlate name={DEBIAN.name} pkg="python-django" version={DEBIAN.version} at={b(0.4)} scale={plateScale} />
      </div>
      <div style={{ position: 'absolute', left: lerp(530, 116 + 580, lift), top: lerp(500, 64, lift) }}>
        <DistroPlate name={UBUNTU.name} pkg="python-django" version={UBUNTU.version} at={b(1.2)} scale={plateScale} from={1} />
      </div>
      <div style={{ position: 'absolute', left: 116, top: 316 }}>
        <CveCascade items={ADVISORIES} at={b(4.9)} every={Math.max(4, b(0.12))} columns={3} stampDelay={b(0.3)} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 150,
          top: 790,
          opacity: counterT,
          transform: `translateY(${(1 - counterT) * 20}px)`,
          fontFamily: FONT.serif,
          fontSize: 76,
          color: C.bone,
          display: 'flex',
          alignItems: 'baseline',
          gap: 22,
        }}
      >
        <Counter to={SUMMARY.cves} at={b(8.8)} dur={50} style={{ color: C.brassHi }} />
        <span>advisories</span>
        <span style={{ color: C.line }}>·</span>
        <span style={{ color: VERDICT.AFFECTED.color }}>{UPSTREAM_42_PATCHES}</span>
        <span>upstream 4.2 patches</span>
      </div>
      <div style={{ position: 'absolute', left: 150, top: 760, width: interpolate(counterT, [0, 1], [0, 1620]), height: 1, background: C.line }} />
    </AbsoluteFill>
  );
};
