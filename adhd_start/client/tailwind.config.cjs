module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        // Premium Dark Palette
        dark: {
          950: '#020617', // Deepest background
          900: '#0f172a', // Card background
          800: '#1e293b', // Lighter card/border
          700: '#334155', // Borders
        },
        // ADHD-Friendly Accents (High visibility but not harsh)
        primary: {
          DEFAULT: '#3b82f6', // Blue
          glow: 'rgba(59, 130, 246, 0.5)',
        },
        accent: {
          DEFAULT: '#10b981', // Emerald
          glow: 'rgba(16, 185, 129, 0.5)',
        }
      },
      boxShadow: {
        'glow-sm': '0 0 10px -2px var(--tw-shadow-color)',
        'glow-md': '0 0 15px -3px var(--tw-shadow-color)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};