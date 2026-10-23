/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f2', 100: '#d5ecdf', 200: '#a9d8be', 300: '#6fbb93', 400: '#2f8f5f',
          500: '#0f7a4a', 600: '#0b5a3a', 700: '#08492f', 800: '#004830', 900: '#03301f',
        },
        gold: { 50: '#fbf6ea', 100: '#f4e7c4', 300: '#e2c178', 500: '#c99a3c', 600: '#a97d28', 700: '#86621e' },
        paper: '#fafaf6',
      },
      fontFamily: { sans: ['Cairo', 'Tahoma', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
