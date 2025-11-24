export default {
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
        lima: '#d2d209',
        'lima-dark': '#baba08',
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
