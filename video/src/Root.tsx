import React from 'react';
import { Composition } from 'remotion';
import timing from '../timing.json';
import { AbsoluteFill } from 'remotion';
import { HeirloomDemo, DemoProps } from './HeirloomDemo';
import { Captions } from './components/Overlays';
import { loadFonts } from './fonts';

/** Captions alone on transparency: rendered as ProRes 4444 and overlaid on the silent master by ffmpeg. */
const CaptionsLayer: React.FC = () => {
  loadFonts();
  return (
    <AbsoluteFill>
      <Captions />
    </AbsoluteFill>
  );
};

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
    <Composition id="CaptionsLayer" component={CaptionsLayer} durationInFrames={timing.totalFrames} fps={timing.fps} width={timing.width} height={timing.height} />
  </>
);
