'use client';

import React from 'react';
import { MotionConfig } from 'framer-motion';

/**
 * `reducedMotion="user"` hace que framer-motion respete la preferencia
 * del sistema sin tocar componente por componente: apaga los cambios de
 * posición y escala, y deja pasar los de opacidad.
 *
 * Es la mitad que el CSS no puede cubrir, porque framer anima con JS y
 * la media query de `prefers-reduced-motion` no lo alcanza.
 */
export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <MotionConfig reducedMotion="user">{children}</MotionConfig>;
