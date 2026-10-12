import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { EASE_IN_OUT, EASE_OUT } from '../theme';
import { beats, io } from '../lib/anim';
import { EndCard } from '../components/Overlays';
import { CaptureClip, captureSeconds } from '../components/Capture';
import { Vignette } from '../components/Engraving';
import { Ground } from '../components/Engraving';
import { REPO, SITE_URL } from '../data';
import { SceneProps, Seq } from './common';

export const S10: React.FC<SceneProps> = ({ scale, frames }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  // the end card is anchored to the scene's end so the 4 s hold survives any retime
  const card = Math.min(b(5.4), frames - 60 * 5);
  const fade = io(frame, card - 30, 50, EASE_IN_OUT);
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.06} />
      <Seq from={0} to={card + 30}>
        <AbsoluteFill style={{ opacity: 1 - fade }}>
          {captureSeconds('SH11') >= 3 ? (
            <CaptureClip id="SH11" label="Site finale: the movement slowing to a stop" mode="full" push={0.035} />
          ) : (
            // the site's own finale frame, pushing in toward the H medallion and settling (eased, not linear)
            <AbsoluteFill style={{ overflow: 'hidden' }}>
              <Img
                src={staticFile('site-finale.jpg')}
                style={{ width: '100%', height: '100%', objectFit: 'cover', transformOrigin: '42% 33%', transform: `scale(${1 + 0.14 * io(frame, 0, card + 30, EASE_OUT)})` }}
              />
              <Vignette strength={0.7} />
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
