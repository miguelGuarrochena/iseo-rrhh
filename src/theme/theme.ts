import { MantineThemeOverride, MantineTransition } from '@mantine/core';

const fontStack =
  'var(--font-jakarta), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** La misma curva que usa el resto de la app (globals.css: --ease-out). */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Entrada de los modales. El `pop` de Mantine arranca en scale(0.9) y se
 * ve como si la ventana saliera de un punto; desde 0.95 parece que ya
 * estaba ahí y sólo se acerca. El modal escala desde el centro (a
 * diferencia de un popover, no cuelga de ningún botón que lo dispare).
 */
const modalTransition: MantineTransition = {
  in: { opacity: 1, transform: 'scale(1)' },
  out: { opacity: 0, transform: 'scale(0.95)' },
  common: { transformOrigin: 'center' },
  transitionProperty: 'transform, opacity',
};

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
    /**
     * Un solo lugar para el movimiento de los ~20 modales de la app. Sin
     * esto cada uno queda con el default de Mantine y la curva no es la
     * del resto de la interfaz.
     */
    Modal: {
      defaultProps: {
        transitionProps: {
          transition: modalTransition,
          duration: 200,
          timingFunction: EASE_OUT,
        },
        overlayProps: { backgroundOpacity: 0.45, blur: 2 },
      },
    },
    Drawer: {
      defaultProps: {
        transitionProps: { duration: 250, timingFunction: EASE_OUT },
      },
    },
    Tooltip: {
      defaultProps: {
        transitionProps: { duration: 125, timingFunction: EASE_OUT },
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
