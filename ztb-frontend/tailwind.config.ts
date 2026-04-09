import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ztb: {
          gold:      '#C9A853',
          'gold-dim':'#8B7038',
          'gold-glow': 'rgba(201,168,83,0.25)',
          blue:      '#5FA8D3',
          navy:      '#1B4F72',
          bg:        '#0B0E14',
          surface:   '#11151F',
          'surface-2':'#181D2B',
          text:      '#E8EDF5',
          muted:     '#6B7A8D',
          success:   '#4ADE80',
          danger:    '#F87171',
          warning:   '#FBBF24',
        },
      },
      fontFamily: {
        title: ['var(--font-title)', 'Sora', 'sans-serif'],
        ui:    ['var(--font-ui)', 'Space Grotesk', 'sans-serif'],
        mono:  ['Consolas', 'Monaco', '"Courier New"', 'monospace'],
      },
      backgroundImage: {
        'ztb-gradient':      'linear-gradient(135deg, #C9A853 0%, #5FA8D3 100%)',
        'ztb-gold-gradient': 'linear-gradient(135deg, #C9A853 0%, #E8D08A 100%)',
        'ztb-gold-cta':      'linear-gradient(135deg, #BF9940 0%, #C9A853 40%, #E2C46A 100%)',
        'ztb-blue-gradient': 'linear-gradient(135deg, #1B4F72 0%, #5FA8D3 100%)',
      },
      animation: {
        'fade-up':    'fadeUp 400ms cubic-bezier(0.2,0.8,0.2,1) both',
        'fade-up-d1': 'fadeUp 400ms cubic-bezier(0.2,0.8,0.2,1) 80ms both',
        'fade-up-d2': 'fadeUp 400ms cubic-bezier(0.2,0.8,0.2,1) 160ms both',
        'fade-up-d3': 'fadeUp 400ms cubic-bezier(0.2,0.8,0.2,1) 240ms both',
        'fade-up-d4': 'fadeUp 400ms cubic-bezier(0.2,0.8,0.2,1) 320ms both',
        'fade-in':    'fadeIn 300ms ease both',
        'slide-in':   'slideIn 300ms cubic-bezier(0.2,0.8,0.2,1) both',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'glow-ring':  'glowRing 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 14px rgba(201,168,83,0.3), 0 4px 20px rgba(201,168,83,0.15)' },
          '50%':     { boxShadow: '0 0 30px rgba(201,168,83,0.6), 0 8px 40px rgba(201,168,83,0.25)' },
        },
        glowRing: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(201,168,83,0.4)' },
          '50%':     { boxShadow: '0 0 0 8px rgba(201,168,83,0)' },
        },
      },
      boxShadow: {
        'ztb-card':       '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        'ztb-card-hover': '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,83,0.25), inset 0 1px 0 rgba(201,168,83,0.08)',
        'ztb-gold':       '0 0 20px rgba(201,168,83,0.4)',
        'ztb-gold-lg':    '0 8px 32px rgba(201,168,83,0.3)',
        'ztb-blue':       '0 0 20px rgba(95,168,211,0.35)',
      },
    },
  },
  plugins: [],
}

export default config
