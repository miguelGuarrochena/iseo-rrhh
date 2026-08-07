/**
 * Stub de `framer-motion` para los tests.
 *
 * En jsdom no hay animaciones que valga la pena ejercitar, y montar la
 * librería real sólo agrega ruido. Lo que importa es que el contenido
 * llegue al DOM para poder consultarlo.
 *
 * Antes cada test escribía su propio `jest.mock('framer-motion')`
 * enumerando a mano los elementos que usaba (`motion.div` y nada más).
 * El día que un componente pasó a usar `motion.h1`, el mock devolvió
 * `undefined` y React tiró "Element type is invalid" — un error que no
 * dice nada sobre la causa real y que dejó cuatro suites rotas.
 *
 * Por eso `motion` es un Proxy: `motion.loQueSea` devuelve siempre un
 * componente que renderiza esa etiqueta. No hay lista que mantener y no
 * se puede volver a quedar corto.
 *
 * Se enchufa por `moduleNameMapper` en jest.config.js, igual que el stub
 * de `iceberg-js`, así aplica a toda la suite sin que cada test se tenga
 * que acordar.
 */
import React from 'react';

/**
 * Props que sólo entiende framer-motion. Si se las pasáramos al DOM,
 * React llenaría la consola de warnings por atributos desconocidos.
 */
const PROPS_DE_MOTION = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'custom',
  'layout',
  'layoutId',
  'layoutDependency',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
  'viewport',
  'onAnimationStart',
  'onAnimationComplete',
  'onUpdate',
  'onHoverStart',
  'onHoverEnd',
  'onTapStart',
  'onTapCancel',
  'onDragStart',
  'onDragEnd',
  'onViewportEnter',
  'onViewportLeave',
]);

const sinPropsDeMotion = (props: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(props).filter(([clave]) => !PROPS_DE_MOTION.has(clave))
  );

/** Componente que renderiza `etiqueta` con las props que el DOM entiende. */
const componentePara = (etiqueta: string) => {
  const Componente = React.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) =>
      React.createElement(
        etiqueta,
        { ...sinPropsDeMotion(props), ref },
        // El índice de `Record<string, unknown>` tipa `children` como
        // `unknown`. Acá es donde deja de serlo.
        children as React.ReactNode
      )
  );
  Componente.displayName = `motion.${etiqueta}`;
  return Componente;
};

/**
 * `motion.div`, `motion.h1`, `motion.loQueVenga`. Se cachea para que dos
 * renders del mismo elemento devuelvan el mismo componente y React no lo
 * trate como un tipo nuevo (lo remontaría en cada render).
 */
const cache = new Map<string, ReturnType<typeof componentePara>>();

export const motion: Record<
  string,
  ReturnType<typeof componentePara>
> = new Proxy({} as Record<string, ReturnType<typeof componentePara>>, {
  get: (_objetivo, etiqueta: string) => {
    if (!cache.has(etiqueta)) cache.set(etiqueta, componentePara(etiqueta));
    return cache.get(etiqueta);
  },
});

/** Sin animación de salida: lo que está montado, se muestra. */
export const AnimatePresence = ({ children }: React.PropsWithChildren) => (
  <>{children}</>
);

/** Sólo provee configuración; en los tests no cambia nada. */
export const MotionConfig = ({ children }: React.PropsWithChildren) => (
  <>{children}</>
);

export const useReducedMotion = () => true;
