import { Easing } from 'remotion';

export const C = {
  ink: '#08090A',
  raised: '#0F1112',
  raised2: '#16191B',
  line: '#23272A',
  bone: '#ECE6DA',
  muted: '#9A958A',
  brass: '#C8A86A',
  brassHi: '#E6CB8E',
  brassLo: '#8A6F3E',
} as const;

export const VERDICT = {
  FIX_READY: { label: 'FIX READY', color: '#5BC98F' },
  NOT_AFFECTED: { label: 'NOT AFFECTED', color: '#7FB2FF' },
  UNPROVEN: { label: 'UNPROVEN', color: '#E8B44C' },
  AFFECTED: { label: 'AFFECTED', color: '#FF6B5E' },
  NO_PROBE: { label: 'NO PROBE', color: '#8D8A83' },
} as const;
export type Chip = keyof typeof VERDICT;

export const FONT = {
  serif: '"Instrument Serif", Georgia, serif',
  sans: '"Geist", system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
};

export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const SPRING_UI = { damping: 200 };
export const SPRING_STAMP = { damping: 18, stiffness: 120 };

export const FPS = 60;
export const W = 1920;
export const H = 1080;
/** 5% safe margins. */
export const SAFE_X = 96;
export const SAFE_Y = 54;
