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
        border: {
          DEFAULT: '#1a1a1a',
          light: '#222222',
        },
        accent: {
          safe: '#bcff2f',
          caution: '#ffb84d',
          danger: '#ff4444',
          info: '#4b8dff',
        },
        primary: '#f3f4f6',
        secondary: '#9ca3af',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Roboto Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
