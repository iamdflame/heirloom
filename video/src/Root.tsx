import React from 'react';
import { Composition } from 'remotion';
import timing from '../timing.json';
import { HeirloomDemo, DemoProps } from './HeirloomDemo';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="HeirloomDemo"
      component={HeirloomDemo}
      durationInFrames={timing.totalFrames}
      fps={timing.fps}
      width={timing.width}
      height={timing.height}
      defaultProps={{ captions: false, audio: false }}
      calculateMetadata={({ props }) => {
        if (!props.only) return {};
        const s = timing.scenes.find((x) => x.id === props.only)!;
        return { durationInFrames: s.frames };
      }}
    />
  </>
);
