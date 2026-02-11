/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Three Squares brand colors
        'ts-blue': '#4A7FB5',          // Pacific Blue - Primary
        'ts-navy': '#1E3A5F',          // Navy - Primary Dark
        'ts-gold': '#F5C518',          // Golden Sun - Accent
        'ts-amber': '#D4A030',         // Amber - Warm accent
        'ts-text': '#1A1A1A',          // Text
        'ts-surface': '#F0EDE8',       // Surface
        'ts-brown': '#8B5E3C',         // Rich Brown (food-inspired)
        'ts-green': '#4A7C3F',         // Fresh Green (accents)
        // Legacy aliases for easier migration
        'primary': '#4A7FB5',
        'primary-dark': '#1E3A5F',
        'accent': '#F5C518',
      },
      fontFamily: {
        'sans': ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        'display': ['Satoshi', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
