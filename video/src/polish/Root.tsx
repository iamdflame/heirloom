import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import { PolishDemo, DemoProps } from './PolishDemo';
import { Captions } from './Captions';
import { loadFonts } from '../fonts';
import { TIMING } from './anchors';

/** Captions alone on transparency: rendered as ProRes 4444 and overlaid on the silent master by ffmpeg. */
const CaptionsLayer: React.FC = () => {
  loadFonts();
  return (
    <AbsoluteFill>
      <Captions />
    </AbsoluteFill>
  );
};

// FPS env at bundle time is not available in the browser; the render script passes fps via inputProps.
export const PolishRoot: React.FC = () => (
  <>
    <Composition
      id="HeirloomDemo"
      component={PolishDemo as React.FC<DemoProps & { fps?: number }>}
      durationInFrames={TIMING.totalFrames}
      fps={TIMING.fps}
      width={1920}
      height={1080}
      defaultProps={{ captions: false } as DemoProps}
      calculateMetadata={({ props }) => {
        if (!props.only) return {};
        const s = TIMING.scenes.find((x) => x.id === props.only)!;
        return { durationInFrames: s.frames };
      }}
    />
    <Composition id="CaptionsLayer" component={CaptionsLayer} durationInFrames={TIMING.totalFrames} fps={TIMING.fps} width={1920} height={1080} />
  </>
);
