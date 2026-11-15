/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0E1621', 700: '#162233', 600: '#1F3047' },
        brand: { DEFAULT: '#1F5A8A', 50: '#EAF1F7', 100: '#D3E3F0', 600: '#194A72', 700: '#133A5A' },
        brass: { DEFAULT: '#C8963E', 50: '#F8F0E1' },
        coral: { DEFAULT: '#B5534B', 50: '#F6E9E8' },
        marigold: { DEFAULT: '#C8963E', 50: '#F8F0E1' },
        jade: { DEFAULT: '#3F7D6B', 50: '#E6F0EC' },
        sky: { DEFAULT: '#4F86A8', 50: '#E7F0F6' },
        surface: '#F4F3F0',
        success: { DEFAULT: '#2F7D5B', 50: '#E6F0EC' },
        warning: { DEFAULT: '#B8862B', 50: '#F8F0E1' },
        danger: { DEFAULT: '#B5453F', 50: '#F6E9E8' },
        ink: { DEFAULT: '#14202E', soft: '#4F5B6B', mute: '#7A8594' },
        line: '#E2DFD8',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', '"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,22,33,0.05), 0 2px 6px rgba(14,22,33,0.06)',
        pop: '0 14px 36px rgba(14,22,33,0.16)',
        glow: '0 8px 24px rgba(31,90,138,0.3)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        blob: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '33%': { transform: 'translate(34px,-42px) scale(1.12)' }, '66%': { transform: 'translate(-26px,30px) scale(0.94)' } },
        spiny: { from: { transform: 'rotateX(-16deg) rotateY(0deg)' }, to: { transform: 'rotateX(-16deg) rotateY(360deg)' } },
        twinkle: { '0%,100%': { opacity: '0.35' }, '50%': { opacity: '1' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        grow: { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        draw: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        kenburns: { '0%': { transform: 'scale(1.04) translate3d(0,0,0)' }, '100%': { transform: 'scale(1.16) translate3d(-2%,-1.5%,0)' } },
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '70%': { transform: 'scale(1.06)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        blob: 'blob 16s ease-in-out infinite',
        spiny: 'spiny 28s linear infinite',
        twinkle: 'twinkle 3.2s ease-in-out infinite',
        marquee: 'marquee 38s linear infinite',
        kenburns: 'kenburns 40s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [],
}
