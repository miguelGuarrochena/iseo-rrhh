/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Fondo cálido tipo "paper" (estilo Pipely)
        paper: '#ECEAE4',
        surface: '#FFFFFF',
        // Tinta casi negra y texto suave
        ink: '#17161A',
        'ink-soft': '#5C5A63',
        line: '#E8E6E0',
        // Azul de marca modernizado
        brand: {
          50: '#eef3ff',
          100: '#dde6ff',
          200: '#b8caff',
          300: '#8facff',
          400: '#6a90fb',
          500: '#4a7af5',
          600: '#2563eb',
          700: '#1d51d1',
          800: '#1a45ab',
          900: '#163a8a',
        },
        // Acento cálido tomado del logo (uso puntual)
        peach: '#E59061',
        primary: '#2563eb',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(17,16,26,0.04), 0 8px 24px rgba(17,16,26,0.06)',
        lift: '0 2px 4px rgba(17,16,26,0.04), 0 20px 40px rgba(17,16,26,0.10)',
      },
      maxWidth: {
        '8xl': '88rem',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false, // Disable Tailwind's preflight to avoid conflicts with Mantine
  },
};
