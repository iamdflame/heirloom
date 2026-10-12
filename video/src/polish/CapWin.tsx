import React from 'react';
import { Freeze, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';
import { io } from '../lib/anim';
import { captureFile, captureSeconds, hasCapture } from '../components/Capture';
import { Vignette } from '../components/Engraving';

/**
 * A real capture in a brass-framed window at an arbitrary rect (split layouts). The clip covers the window,
 * centred on a focus point (fx, fy in 0..1 of the capture), with a slow push-in toward that point.
 * Holds its last frame if the slot outlasts the clip.
 */
export const CapWin: React.FC<{
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  startFrom?: number;
  rate?: number;
  zoom?: number;
  fx?: number;
  fy?: number;
  push?: number;
  url?: string;
  enter?: boolean;
  vignette?: number;
}> = ({ id, x, y, w, h, startFrom = 0, rate = 1, zoom = 1, fx = 0.5, fy = 0.5, push = 0.04, url, enter = true, vignette = 0.25 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const e = enter ? io(frame, 0, 30) : 1;
  const p = frame / Math.max(1, durationInFrames);
  const k = zoom * Math.max(w / 1920, h / 1080) * (1 + push * p);
  const vw = 1920 * k;
  const vh = 1080 * k;
  const left = Math.min(0, Math.max(w - vw, w / 2 - fx * vw));
  const top = Math.min(0, Math.max(h - vh, h / 2 - fy * vh));
  const secs = captureSeconds(id);
  const clipFrames = Math.max(1, Math.floor(((secs - startFrom) * fps) / rate) - 1);
  const src = hasCapture(id) ? staticFile(captureFile(id)) : null;
  const video = (style?: React.CSSProperties) =>
    src ? <OffthreadVideo src={src} startFrom={Math.round(startFrom * fps)} playbackRate={rate} muted style={{ position: 'absolute', left, top, width: vw, height: vh, ...style }} /> : null;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: 18,
          padding: 1.5,
          background: `linear-gradient(135deg, ${C.brassHi}, ${C.brassLo} 35%, ${C.brass} 65%, ${C.brassLo})`,
          boxShadow: '0 40px 120px rgba(0,0,0,0.75), 0 0 70px rgba(200,168,106,0.10)',
          opacity: e,
          transform: `translateY(${(1 - e) * 24}px)`,
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 16.5, overflow: 'hidden', background: C.ink }}>
          <Sequence durationInFrames={clipFrames} layout="none">
            {video()}
          </Sequence>
          {frame >= clipFrames && <Freeze frame={clipFrames - 1}>{video()}</Freeze>}
          {vignette > 0 && <Vignette strength={vignette} />}
        </div>
      </div>
      {url && (
        <div style={{ position: 'absolute', left: x + 4, top: y - 36, fontFamily: FONT.mono, fontSize: 22, color: C.muted, opacity: e, whiteSpace: 'nowrap' }}>
          <span style={{ color: C.brass }}>●</span> {url}
        </div>
      )}
    </div>
  );
};

/** The right-hand 60% capture window of a split layout. */
export const RIGHT = { x: 792, y: 118, w: 1032, h: 772 };
/** The left 40% column for the motion graphic. */
export const LEFT = { x: 96, w: 640 };

/** The owner's neatlogs recording (public/captures/NEATLOGS.mp4), if it has been dropped in. Never imitated. */
export const hasNeatlogs = () => hasCapture('NEATLOGS');
