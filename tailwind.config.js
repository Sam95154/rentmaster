/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#14243A', 700: '#1c3350', 600: '#274365' },
        brand: { DEFAULT: '#2864D8', 50: '#eef3fd', 100: '#dce7fb', 600: '#2057b8', 700: '#1a4694' },
        surface: '#F5F7FB',
        success: { DEFAULT: '#16A36A', 50: '#e8f6f0' },
        warning: { DEFAULT: '#E7A52C', 50: '#fcf4e3' },
        danger: { DEFAULT: '#DC4545', 50: '#fbeaea' },
        ink: { DEFAULT: '#14243A', soft: '#51607A', mute: '#7B8799' },
        line: '#E3E8F0',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(20,36,58,0.04), 0 1px 3px rgba(20,36,58,0.06)',
        pop: '0 10px 30px rgba(20,36,58,0.14)',
      },
    },
  },
  plugins: [],
}
