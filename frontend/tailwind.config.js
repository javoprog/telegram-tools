/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        telegram: {
          blue: '#24A1DE',
          dark: '#17212B',
          light: '#2B5278',
          bg: '#0E1621',
          card: '#182533',
          border: '#242F3D'
        }
      }
    },
  },
  plugins: [],
}
