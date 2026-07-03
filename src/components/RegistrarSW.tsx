'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker que hace instalable la PWA.
 * No renderiza nada; vive en el layout raíz.
 */
export const RegistrarSW = () => {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sin SW no se rompe nada: la web sigue funcionando normal.
      });
    }
  }, []);

  return null;
};
