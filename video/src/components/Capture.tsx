import React from 'react';
import { Freeze, getStaticFiles, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import captures from '../data/captures.json';
import { C, FONT } from '../theme';
import { io } from '../lib/anim';
import { GuillocheRing, Vignette } from './Engraving';

const CAPS = captures as Record<string, { seconds: number; file: string; source?: string }>;

const has = (name: string) => getStaticFiles().some((f) => f.name === name);
export const captureFile = (id: string) => (CAPS[id] ? CAPS[id].file : `captures/${id}.mp4`);
export const hasCapture = (id: string) => has(captureFile(id));

/** Labelled stand-in until V-CAP's real clip lands in public/captures/. */
const Placeholder: React.FC<{ id: string; label: string }> = ({ id, label }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `repeating-linear-gradient(135deg, ${C.raised} 0 22px, #0d0f10 22px 44px)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      <div style={{ position: 'absolute', opacity: 0.25, transform: `rotate(${frame * 0.1}deg)` }}>
        <GuillocheRing size={620} at={-999} strokeWidth={0.12} />
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 30, color: C.brassHi, letterSpacing: '0.2em' }}>CAPTURE {id}</div>
      <div style={{ fontFamily: FONT.sans, fontSize: 34, color: C.bone, maxWidth: 1100, textAlign: 'center' }}>{label}</div>
      <div style={{ fontFamily: FONT.mono, fontSize: 22, color: C.muted }}>placeholder · replaced by ~/video-out/captures/{id}.mp4</div>
    </div>
  );
};

/**
 * A real screen capture. `window` composites it over ink as a rounded window with a brass hairline;
 * `full` fills the frame. Always: a slow 3% push-in and a soft vignette. Holds the last frame if the slot outlasts the clip.
 */
export const CaptureClip: React.FC<{
  id: string;
  label: string;
  url?: string;
  mode?: 'window' | 'full';
  startFrom?: number; // seconds into the clip
  rate?: number;
  push?: number;
  origin?: string;
  scale?: number; // window size relative to the frame
  enter?: boolean;
}> = ({ id, label, url, mode = 'window', startFrom = 0, rate = 1, push = 0.03, origin = '50% 50%', scale = 0.86, enter = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const ok = hasCapture(id);
  const p = frame / Math.max(1, durationInFrames);
  const zoom = 1 + push * p;
  const clipFrames = CAPS[id] ? Math.floor((CAPS[id].seconds - startFrom) * fps / rate) - 1 : Infinity;
  const src = ok ? staticFile(captureFile(id)) : '';
  const media = ok ? (
    <>
      <Sequence durationInFrames={Number.isFinite(clipFrames) ? Math.max(1, clipFrames) : undefined} layout="none">
        <OffthreadVideo src={src} startFrom={Math.round(startFrom * fps)} playbackRate={rate} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </Sequence>
      {Number.isFinite(clipFrames) && frame >= clipFrames && (
        <Freeze frame={Math.max(0, clipFrames - 1)}>
          <OffthreadVideo src={src} startFrom={Math.round(startFrom * fps)} playbackRate={rate} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        </Freeze>
      )}
    </>
  ) : (
    <Placeholder id={id} label={label} />
  );
  const inner = (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: origin }}>
      {media}
    </div>
  );
  if (mode === 'full') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: C.ink }}>
        {inner}
        <Vignette strength={0.55} />
      </div>
    );
  }
  const e = enter ? io(frame, 0, 40) : 1;
  const w = 1920 * scale;
  const h = 1080 * scale;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: (1920 - w) / 2,
          top: (1080 - h) / 2 + 12,
          width: w,
          height: h,
          borderRadius: 20,
          padding: 1.5,
          background: `linear-gradient(135deg, ${C.brassHi}, ${C.brassLo} 35%, ${C.brass} 65%, ${C.brassLo})`,
          boxShadow: '0 50px 140px rgba(0,0,0,0.75), 0 0 80px rgba(200,168,106,0.10)',
          opacity: e,
          transform: `translateY(${(1 - e) * 30}px) scale(${0.985 + 0.015 * e})`,
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 18.5, overflow: 'hidden', background: C.ink }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{inner}</div>
          <Vignette strength={0.35} />
        </div>
      </div>
      {url && (
        <div
          style={{
            position: 'absolute',
            left: (1920 - w) / 2 + 4,
            top: (1080 - h) / 2 - 30,
            fontFamily: FONT.mono,
            fontSize: 22,
            color: C.muted,
            opacity: e,
            letterSpacing: '0.02em',
          }}
        >
          <span style={{ color: C.brass }}>●</span> {url}
        </div>
      )}
    </div>
  );
};

/** A still photo from the site's own photo set (Unsplash), with a Ken Burns drift: the b-roll stand-in. */
export const Photo: React.FC<{ src: string; push?: number; dim?: number; origin?: string }> = ({ src, push = 0.06, dim = 0.45, origin = '50% 50%' }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = 1 + push * (frame / durationInFrames);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`, transformOrigin: origin, filter: 'saturate(0.8) contrast(1.05)' }} />
      <div style={{ position: 'absolute', inset: 0, background: `rgba(8,9,10,${dim})` }} />
      <Vignette strength={0.85} />
    </div>
  );
};

export { has as hasStatic };
