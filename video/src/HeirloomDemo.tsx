import React from 'react';
import { AbsoluteFill, Audio, getStaticFiles, interpolate, Sequence, staticFile } from 'remotion';
import timing from '../timing.json';
import { C } from './theme';
import { loadFonts } from './fonts';
import { Captions } from './components/Overlays';
import { IRIS_FRAMES, IrisTransition } from './components/Iris';
import { S01 } from './scenes/S01';
import { S02 } from './scenes/S02';
import { S03 } from './scenes/S03';
import { S04 } from './scenes/S04';
import { S05 } from './scenes/S05';
import { S06 } from './scenes/S06';
import { S07 } from './scenes/S07';
import { S08 } from './scenes/S08';
import { S09 } from './scenes/S09';
import { S10 } from './scenes/S10';
import { SceneProps } from './scenes/common';

loadFonts();

const SCENES: Record<string, React.FC<SceneProps>> = { S01, S02, S03, S04, S05, S06, S07, S08, S09, S10 };
/** Act breaks open with the brass iris: problem → product, product → proof. */
const IRIS_IN = new Set(['S04', 'S08']);

export type DemoProps = { captions: boolean; audio: boolean; only?: string };

const exists = (name: string) => getStaticFiles().some((f) => f.name === name);
const db = (d: number) => Math.pow(10, d / 20);

export const HeirloomDemo: React.FC<DemoProps> = ({ captions, audio, only }) => {
  const scenes = timing.scenes.filter((s) => !only || s.id === only);
  const offset = only ? scenes[0].start : 0;
  const voWindows = timing.scenes.filter((s) => s.voFile).map((s) => [s.start + Math.round(timing.head * 60), s.start + Math.round((s.voSeconds ?? 0) * 60) + Math.round(timing.head * 60)]);
  const music = audio && exists('audio/music.mp3');
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {scenes.map((s, i) => {
        const Scene = SCENES[s.id];
        const next = scenes[i + 1];
        // the outgoing scene keeps running underneath the next scene's iris
        const extra = next && IRIS_IN.has(next.id) ? IRIS_FRAMES : 0;
        const body = <Scene scale={s.scale} frames={s.frames} />;
        return (
          <Sequence key={s.id} name={s.id} from={s.start - offset} durationInFrames={s.frames + extra}>
            {IRIS_IN.has(s.id) && !only ? <IrisTransition>{body}</IrisTransition> : body}
          </Sequence>
        );
      })}
      {captions && (
        <Sequence from={-offset}>
          <Captions />
        </Sequence>
      )}
      {audio &&
        timing.scenes
          .filter((s) => s.voFile && exists(s.voFile))
          .map((s) => (
            <Sequence key={`vo-${s.id}`} from={s.start - offset + Math.round(timing.head * 60)}>
              <Audio src={staticFile(s.voFile!)} />
            </Sequence>
          ))}
      {music && (
        <Sequence from={-offset}>
          <Audio
            src={staticFile('audio/music.mp3')}
            volume={(f) => {
              // −18 dB bed, ducked to −24 dB under VO with 0.3 s ramps
              let duck = 0;
              for (const [a, b] of voWindows) duck = Math.max(duck, interpolate(f, [a - 18, a, b, b + 18], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
              const fadeOut = interpolate(f, [timing.totalFrames - 120, timing.totalFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              return (db(-18) + (db(-24) - db(-18)) * duck) * fadeOut;
            }}
          />
        </Sequence>
      )}
      {audio &&
        timing.sfx
          .filter((c) => exists(`audio/sfx/${c.name}.mp3`))
          .map((c, i) => (
            <Sequence key={`sfx-${i}`} from={c.frame - offset}>
              <Audio src={staticFile(`audio/sfx/${c.name}.mp3`)} volume={db(-6)} />
            </Sequence>
          ))}
    </AbsoluteFill>
  );
};
