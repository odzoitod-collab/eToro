import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#131722',
        surface: '#161b26',
        card: '#1c212e',
        border: '#2A3142',
        surfaceElevated: '#1e2636',
        subtle: '#1a2235',
        neon: '#21B053',
        accent: '#21B053',
        accentMuted: 'rgba(33, 176, 83, 0.14)',
        up: '#10b981',
        down: '#f87171',
        ink: '#F2F4F7',
        textPrimary: '#ECEEF1',
        textSecondary: '#A8B3C0',
        textMuted: '#9BA5B5',
        textSubtle: '#6E7A8C',
        textCaption: '#9AA5B5',
        hairline: 'rgba(255, 255, 255, 0.06)',
        hairlineStrong: 'rgba(255, 255, 255, 0.09)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
      fontSize: {
        cap: ['10px', { lineHeight: '1.25', letterSpacing: '0.05em' }],
      },
      letterSpacing: {
        heading: '-0.02em',
        cap: '0.05em',
      },
      borderRadius: {
        card: '12px',
        modal: '16px',
        strict: '4px',
      },
      boxShadow: {
        glass: '0 0 0 1px rgba(255, 255, 255, 0.08)',
        'elevation-1': '0 1px 3px rgba(0,0,0,0.3)',
        'elevation-2': '0 4px 12px rgba(0,0,0,0.35)',
        'elevation-3': '0 8px 24px rgba(0,0,0,0.4)',
      },
      transitionDuration: {
        hover: '200ms',
        card: '300ms',
        modal: '300ms',
      },
      transitionTimingFunction: {
        etoro: 'cubic-bezier(0.4, 0, 0.2, 1)',
        'etoro-smooth': 'cubic-bezier(0.25, 0.8, 0.25, 1)',
      },
      spacing: {
        panel: '16px',
        block: '24px',
        table: '4px',
      },
      backdropBlur: {
        glass: '12px',
        modal: '16px',
      },
    },
  },
  plugins: [],
} satisfies Config;
