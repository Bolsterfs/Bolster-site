/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy:       '#0D1B3E',
        'card-bg':  '#162046',
        'mid-gray': '#8896B3',
        'off-white': '#F0F4FF',
        blue: {
          500: '#2D5BE3',
          600: '#2549C4',
          700: '#1E3DA8',
          800: '#162E8A',
          900: '#0E2070',
        },
        teal: {
          600: '#0F8B72',
          700: '#0A7A64',
          400: '#14B8A6',
          500: '#0F8B72',
          900: '#0A3D32',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
