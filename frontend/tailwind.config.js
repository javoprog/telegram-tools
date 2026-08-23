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
          blue: '#2481CC',
          hover: '#1C72B8',
          soft: '#E7F3FC',
          bg: '#F0F2F5',
          card: '#FFFFFF',
          border: '#E4E4E7'
        }
      }
    },
  },
  plugins: [],
}
