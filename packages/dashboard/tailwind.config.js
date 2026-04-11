/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0f',
          surface: '#12121a',
          elevated: '#1a1a2e',
        },
        surface: '#12121a',
        elevated: '#1a1a2e',
        border: {
          DEFAULT: '#1e1e2e',
        },
        accent: {
          safe: '#00ff88',
          caution: '#ff9500',
          danger: '#ff3b3b',
          info: '#3b82f6',
        },
        primary: '#e0e0e0',
        secondary: '#6b6b80',
        text: {
          primary: '#e0e0e0',
          secondary: '#6b6b80',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['DM Sans', 'sans-serif'],
      },
      borderRadius: {
        xl: '8px',
      },
      animation: {
        'pulse-safe': 'pulse-safe 1.8s ease-in-out infinite',
        'shake-danger': 'shake-danger 360ms ease-in-out 1',
        'slide-in': 'slide-in 300ms ease-out both',
      },
      keyframes: {
        'pulse-safe': {
          '0%, 100%': { boxShadow: '0 0 0 rgba(0, 255, 136, 0)' },
          '50%': { boxShadow: '0 0 18px rgba(0, 255, 136, 0.45)' },
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
