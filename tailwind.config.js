/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#fafafa',
          100: '#18181b',
          200: '#1e1e22',
          300: '#27272a',
          400: '#3f3f46',
          500: '#52525b',
        },
        long: {
          DEFAULT: '#10b981',
          light: '#34d399',
          dark: '#059669',
          bg: 'rgba(16, 185, 129, 0.1)',
        },
        short: {
          DEFAULT: '#ef4444',
          light: '#f87171',
          dark: '#dc2626',
          bg: 'rgba(239, 68, 68, 0.1)',
        },
        accent: {
          DEFAULT: '#8b5cf6',
          light: '#a78bfa',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'flash-green': 'flashGreen 0.6s ease-out',
        'flash-red': 'flashRed 0.6s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        flashGreen: {
          '0%': { backgroundColor: 'rgba(16, 185, 129, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashRed: {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
