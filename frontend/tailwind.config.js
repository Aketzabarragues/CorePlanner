/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        siemens: {
          900: 'rgb(0 52 102)',
          700: 'rgb(0 74 137)',
          500: 'rgb(0 100 180)',
        },
      },
    },
  },
  plugins: [],
}
