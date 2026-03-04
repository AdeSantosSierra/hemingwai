export default {
  darkMode: 'class',
  content: [
    // 🌟 ESTO LE DICE A TAILWIND DÓNDE BUSCAR CLASES 🌟
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Arimo', 'sans-serif'], // Arimo por defecto para texto
        display: ['SUSE', 'sans-serif'], // SUSE para títulos
      },
      colors: {
        lima: '#D4E600',
        'lima-dark': '#C6DD00',
        primary: '#D4E600',
        'background-light': '#F9FAFB',
        'background-dark': '#050505',
        'surface-light': '#FFFFFF',
        'surface-dark': '#111111',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out forwards',
      }
    },
  },
  plugins: [],
}
