/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/web/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        heat: {
          4: '#fa5d190a',
          8: '#fa5d1914',
          12: '#fa5d191f',
          16: '#fa5d1929',
          20: '#fa5d1933',
          40: '#fa5d1966',
          90: '#fa5d19e6',
          100: '#fa5d19',
        },
        fc: {
          'bg-base': 'var(--fc-bg-base)',
          'bg-lighter': 'var(--fc-bg-lighter)',
          surface: 'var(--fc-surface)',
          'surface-raised': 'var(--fc-surface-raised)',
          'border-faint': 'var(--fc-border-faint)',
          'border-muted': 'var(--fc-border-muted)',
          'border-loud': 'var(--fc-border-loud)',
          'accent-black': 'var(--fc-accent-black)',
          'accent-white': '#ffffff',
          forest: '#42c366',
          honey: '#ecb730',
          crimson: '#eb3424',
          bluetron: '#2a6dfb',
          amethyst: '#9061ff',
        },
      },
      borderRadius: {
        'fc-sm': '8px',
        'fc-md': '12px',
        'fc-lg': '16px',
        'fc-full': '999px',
      },
      boxShadow: {
        'heat-button':
          'inset 0 -6px 12px 0 rgba(255, 0, 0, 0.2), 0 0.6px 0.8px 0 rgba(255, 139, 0, 0.22), 0 1.3px 1.7px 0 rgba(255, 139, 0, 0.19), 0 2.5px 3.1px 0 rgba(255, 139, 0, 0.16), 0 4.4px 5.5px 0 rgba(255, 139, 0, 0.13), 0 8.3px 10.3px 0 rgba(255, 139, 0, 0.1), 0 2px 4px 0 rgba(250, 93, 25, 0.3)',
      },
    },
  },
  plugins: [],
};
