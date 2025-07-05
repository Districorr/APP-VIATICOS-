/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        districorr: {
          // --- Paleta Principal (del nuevo prompt de diseño) ---
          'primary': '#004A99',         // Genera .text-districorr-primary
          'accent': '#007BFF',          // Genera .text-districorr-accent
          'text-primary': '#212529',    // Genera .text-districorr-text-primary <= ESTE ES EL NOMBRE CORRECTO
          'text-secondary': '#6C757D',  // Genera .text-districorr-text-secondary
          'border': '#CED4DA',          // Genera .border-districorr-border
          'background': '#FFFFFF',      // Genera .bg-districorr-background
          'background-alt': '#F8F9FA',  // Genera .bg-districorr-background-alt
          
          // --- Colores de Estado ---
          'success': '#10B981',
          'error': '#EF4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}