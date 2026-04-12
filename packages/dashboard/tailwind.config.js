/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#000000',
          surface: '#0a0a0a',
          elevated: '#111111',
        },
        surface: '#0a0a0a',
        elevated: '#111111',
        border: {
          DEFAULT: '#1a1a1a',
          light: '#222222',
        },
        accent: {
          safe: '#bcff2f',
          caution: '#ffb84d',
          danger: '#ff4444',
          info: '#4b8dff',
          cyan: '#59d7ff',
        },
        primary: '#f3f4f6',
        secondary: '#9ca3af',
        text: {
          primary: '#f3f4f6',
          secondary: '#9ca3af',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Roboto Mono', 'monospace'],
        sans: ['Inter', 'DM Sans', 'sans-serif'],
      },
      borderRadius: {
        xl: '4px',
      },
      animation: {
        'pulse-safe': 'pulse-safe 1.8s ease-in-out infinite',
        'shake-danger': 'shake-danger 360ms ease-in-out 1',
        'slide-in': 'slide-in 300ms ease-out both',
      },
      keyframes: {
        'pulse-safe': {
          '0%, 100%': { boxShadow: '0 0 0 rgba(188, 255, 47, 0)' },
          '50%': { boxShadow: '0 0 18px rgba(188, 255, 47, 0.3)' },
        },
        'shake-danger': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-2px)' },
          '40%': { transform: 'translateX(2px)' },
          '60%': { transform: 'translateX(-1px)' },
          '80%': { transform: 'translateX(1px)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
