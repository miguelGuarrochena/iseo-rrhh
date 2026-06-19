import { MantineThemeOverride } from '@mantine/core';

const fontStack =
  'var(--font-jakarta), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const theme: MantineThemeOverride = {
  primaryColor: 'brand',
  primaryShade: 6,
  colors: {
    // Azul de marca modernizado (mismo scale que Tailwind)
    brand: [
      '#eef3ff',
      '#dde6ff',
      '#b8caff',
      '#8facff',
      '#6a90fb',
      '#4a7af5',
      '#2563eb',
      '#1d51d1',
      '#1a45ab',
      '#163a8a',
    ],
    // Grises cálidos neutros
    gray: [
      '#f6f5f2',
      '#eceae4',
      '#dcd9d1',
      '#c4c0b6',
      '#a6a299',
      '#85817a',
      '#6b6760',
      '#4e4b46',
      '#34322e',
      '#1c1b19',
    ],
  },
  white: '#ffffff',
  black: '#17161a',
  defaultRadius: 'lg',
  fontFamily: fontStack,
  headings: {
    fontFamily: fontStack,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '3.25rem', lineHeight: '1.05', fontWeight: '800' },
      h2: { fontSize: '2.4rem', lineHeight: '1.12', fontWeight: '700' },
      h3: { fontSize: '1.4rem', lineHeight: '1.3', fontWeight: '700' },
    },
  },
  radius: {
    xs: '0.375rem',
    sm: '0.625rem',
    md: '0.875rem',
    lg: '1.125rem',
    xl: '1.75rem',
  },
  shadows: {
    sm: '0 1px 2px rgba(17,16,26,0.04), 0 4px 12px rgba(17,16,26,0.05)',
    md: '0 1px 2px rgba(17,16,26,0.04), 0 8px 24px rgba(17,16,26,0.06)',
    lg: '0 2px 4px rgba(17,16,26,0.04), 0 20px 40px rgba(17,16,26,0.10)',
    xl: '0 8px 16px rgba(17,16,26,0.06), 0 30px 60px rgba(17,16,26,0.12)',
  },
  components: {
    Button: {
      defaultProps: {
        radius: 'xl',
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
      },
    },
    Container: {
      defaultProps: {
        sizes: {
          xs: 540,
          sm: 720,
          md: 960,
          lg: 1140,
          xl: 1240,
        },
      },
    },
  },
};
