import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { EASE_IN_OUT } from '../theme';
import { beats, io } from '../lib/anim';
import { EndCard } from '../components/Overlays';
import { CaptureClip, captureSeconds, hasCapture } from '../components/Capture';
import { Ground } from '../components/Engraving';
import { REPO, SITE_URL } from '../data';
import { SceneProps, Seq } from './common';

export const S10: React.FC<SceneProps> = ({ scale, frames }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  // the end card is anchored to the scene's end so the 4 s hold survives any retime
  const card = Math.min(b(5.4), frames - 60 * 9);
  const fade = io(frame, card - 30, 50, EASE_IN_OUT);
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.06} />
      <Seq from={0} to={card + 30}>
        <AbsoluteFill style={{ opacity: 1 - fade }}>
          {captureSeconds('SH11') >= 3 || !hasCapture('BR03') ? (
            <CaptureClip id="SH11" label="Site finale: the movement slowing to a stop" mode="full" push={0.035} />
          ) : (
            <AbsoluteFill style={{ filter: 'saturate(0.7) brightness(0.75)' }}>
              <CaptureClip id="BR03" label="macro movement" mode="full" rate={0.6} push={0.06} />
            </AbsoluteFill>
          )}
        </AbsoluteFill>
      </Seq>
      <Seq from={card} to={frames}>
        <EndCard at={10} site={SITE_URL} repo={REPO} credit="Built during #neatHack with neatlogs · Entire · cfo.ai" />
      </Seq>
    </AbsoluteFill>
  );
};
