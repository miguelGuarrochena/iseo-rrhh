'use client';

import { useEffect } from 'react';

/**
 * Si la URL trae un hash al cargar, lo ignoramos para no
 * saltar a la sección antes de mostrar el hero.
 */
export const HashScrollReset = () => {
  useEffect(() => {
    if (!window.location.hash) return undefined;
    const timer = setTimeout(() => window.scrollTo(0, 0), 0);
    return () => clearTimeout(timer);
  }, []);

  return null;
};
