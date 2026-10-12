/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './404.html', './og.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'),
        ink: v('ink'),
        muted: v('muted'),
        rule: v('rule'),
        surface: v('surface'),
        ledger: v('ledger'),
        'ledger-rule': v('ledger-rule'),
        margin: v('margin'),
        fix: { fg: v('fix-fg'), bg: v('fix-bg') },
        na: { fg: v('na-fg'), bg: v('na-bg') },
        unp: { fg: v('unp-fg'), bg: v('unp-bg') },
        aff: { fg: v('aff-fg'), bg: v('aff-bg') },
        np: { fg: v('np-fg'), bg: v('np-bg') },
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      maxWidth: { measure: '68ch' },
      borderRadius: { chip: '4px', sheet: '12px' },
      transitionTimingFunction: {
        ink: 'cubic-bezier(0.23,1,0.32,1)',
        sheet: 'cubic-bezier(0.32,0.72,0,1)',
      },
    },
  },
  plugins: [],
};
