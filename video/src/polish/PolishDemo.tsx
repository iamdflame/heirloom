import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { C } from '../theme';
import { loadFonts } from '../fonts';
import { S01 } from '../scenes/S01';
import { S02 } from '../scenes/S02';
import { S04 } from '../scenes/S04';
import { S05 } from './S05';
import { S09 } from '../scenes/S09';
import { S10 } from '../scenes/S10';
import { SceneProps } from '../scenes/common';
import { S03 } from './S03';
import { S06 } from './S06';
import { S07 } from './S07';
import { S08 } from './S08';
import { Captions } from './Captions';
import { IRIS_FRAMES, IrisIn, IrisOut, Push } from './Iris';
import { TIMING } from './anchors';

loadFonts();

const SCENES: Record<string, React.FC<SceneProps>> = { S01, S02, S03, S04, S05, S06, S07, S08, S09, S10 };
/** Act breaks open with the brass iris: problem → product, product → proof. */
const IRIS_IN = new Set(['S04', 'S08']);
/** Scenes whose own layers already push (full-frame b-roll / capture windows) get a lighter global push. */
const PUSH: Record<string, number> = { S01: 0.02, S04: 0.015, S10: 0.015 };

export type DemoProps = { captions: boolean; only?: string };

export const PolishDemo: React.FC<DemoProps> = ({ captions, only }) => {
  const scenes = TIMING.scenes.filter((s) => !only || s.id === only);
  const offset = only ? scenes[0].start : 0;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {scenes.map((s, i) => {
        const Scene = SCENES[s.id];
        const next = scenes[i + 1];
        // the outgoing scene runs on under the next scene's iris, fading to ink before the ring reaches its words
        const extra = next && IRIS_IN.has(next.id) ? IRIS_FRAMES : 0;
        let body = (
          <Push frames={s.frames} amount={PUSH[s.id] ?? 0.025}>
            <Scene scale={s.scale} frames={s.frames} />
          </Push>
        );
        if (extra) body = <IrisOut from={s.frames}>{body}</IrisOut>;
        return (
          <Sequence key={s.id} name={s.id} from={s.start - offset} durationInFrames={s.frames + extra}>
            {IRIS_IN.has(s.id) && !only ? <IrisIn>{body}</IrisIn> : body}
          </Sequence>
        );
      })}
      {captions && (
        <Sequence from={-offset}>
          <Captions />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
