/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './404.html', './og.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ink scale (backgrounds), bone text, brass accents: "Proof instrument" dark palette
        paper: v('paper'),
        surface: v('surface'),
        raised: v('raised'),
        rule: v('rule'),
        ink: v('ink'),
        muted: v('muted'),
        brass: { DEFAULT: v('brass'), hi: v('brass-hi'), deep: v('brass-deep') },
        // v1 names kept so untouched sections still render on the dark ground
        ledger: v('surface'),
        'ledger-rule': v('rule'),
        margin: v('brass-deep'),
        fix: { fg: v('fix-fg'), bg: v('fix-bg') },
        na: { fg: v('na-fg'), bg: v('na-bg') },
        unp: { fg: v('unp-fg'), bg: v('unp-bg') },
        aff: { fg: v('aff-fg'), bg: v('aff-bg') },
        np: { fg: v('np-fg'), bg: v('np-bg') },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      maxWidth: { measure: '66ch' },
      borderRadius: { chip: '4px', sheet: '14px' },
      transitionTimingFunction: {
        ink: 'cubic-bezier(0.23,1,0.32,1)',
        out: 'cubic-bezier(0.23,1,0.32,1)',
        sheet: 'cubic-bezier(0.32,0.72,0,1)',
      },
    },
  },
  plugins: [],
};
