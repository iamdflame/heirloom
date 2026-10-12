import { interpolate, spring } from 'remotion';
import { EASE_IN_OUT, EASE_OUT, FPS, SPRING_STAMP, SPRING_UI } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0→1 over [at, at+dur] with the house ease-out. */
export const io = (frame: number, at: number, dur = 36, ease = EASE_OUT) =>
  interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing: ease });
export const inOut = (frame: number, at: number, dur = 48) => io(frame, at, dur, EASE_IN_OUT);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const springUI = (frame: number, at: number) => spring({ frame: frame - at, fps: FPS, config: SPRING_UI });
export const springStamp = (frame: number, at: number) => spring({ frame: frame - at, fps: FPS, config: SPRING_STAMP });

/** Visible between in and out with fades at both ends: 0→1→0. */
export const window = (frame: number, at: number, out: number, fadeIn = 24, fadeOut = 18) =>
  Math.min(io(frame, at, fadeIn), 1 - io(frame, out - fadeOut, fadeOut, EASE_IN_OUT));

/** Seconds → frames, scaled to the scene's retimed length. */
export const beats = (scale: number) => (sec: number) => Math.round(sec * FPS * scale);
export const sec = (s: number) => Math.round(s * FPS);
