/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'districorr-primary': '#0D2F5B', // Azul oscuro del logo
        'districorr-accent': '#2A79D2',  // Azul más claro de la columna
        'districorr-bg-light': '#F3F4F6',
        'districorr-text-dark': '#1F2937',
        'districorr-text-medium': '#6C757D',
        'districorr-success': '#10B981',
        'districorr-error': '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}