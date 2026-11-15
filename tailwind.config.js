/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1E1B4B', 700: '#2A2670', 600: '#38338F' },
        brand: { DEFAULT: '#5B3FE0', 50: '#F0EDFF', 100: '#E2DBFF', 600: '#4B30C8', 700: '#3C26A3' },
        coral: { DEFAULT: '#FF5C7A', 50: '#FFEDF0' },
        marigold: { DEFAULT: '#FFB020', 50: '#FFF5DE' },
        jade: { DEFAULT: '#12B886', 50: '#E3F8F0' },
        sky: { DEFAULT: '#2FA8FF', 50: '#E5F4FF' },
        surface: '#F6F5FF',
        success: { DEFAULT: '#12A57A', 50: '#E3F8F0' },
        warning: { DEFAULT: '#E7A52C', 50: '#FFF5DE' },
        danger: { DEFAULT: '#E5484D', 50: '#FDECEE' },
        ink: { DEFAULT: '#1E1B4B', soft: '#575478', mute: '#827FA0' },
        line: '#E6E3F5',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(30,27,75,0.04), 0 2px 6px rgba(30,27,75,0.06)',
        pop: '0 12px 34px rgba(30,27,75,0.18)',
        glow: '0 10px 30px rgba(91,63,224,0.35)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        blob: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '33%': { transform: 'translate(34px,-42px) scale(1.12)' }, '66%': { transform: 'translate(-26px,30px) scale(0.94)' } },
        spiny: { from: { transform: 'rotateX(-16deg) rotateY(0deg)' }, to: { transform: 'rotateX(-16deg) rotateY(360deg)' } },
        twinkle: { '0%,100%': { opacity: '0.35' }, '50%': { opacity: '1' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        grow: { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        draw: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '70%': { transform: 'scale(1.06)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        blob: 'blob 16s ease-in-out infinite',
        spiny: 'spiny 28s linear infinite',
        twinkle: 'twinkle 3.2s ease-in-out infinite',
        marquee: 'marquee 38s linear infinite',
      },
    },
  },
  plugins: [],
}
