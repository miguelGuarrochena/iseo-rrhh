'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { getPendientesResumen } from '@/lib/services/rrhh';
import { PendientesResumen } from '@/types/rrhh';

interface EstadoPendientes {
  resumen: PendientesResumen | null;
  refrescar: () => Promise<void>;
  limpiar: () => void;
}

/**
 * Los numeritos del menú, en un solo lugar.
 *
 * Antes cada barra de navegación se los pedía por su cuenta y los
 * guardaba en su propio `useState`. Dos consecuencias, las dos visibles:
 * el menú lateral los pedía una única vez al montar y no los volvía a
 * mirar nunca —leías una conversación y el "1" seguía ahí hasta recargar
 * la página—, y en pantallas grandes las dos barras están montadas a la
 * vez, así que todo se pedía por duplicado.
 *
 * Con el estado compartido, cualquier pantalla que resuelva un pendiente
 * llama a `refrescarPendientes()` y los dos menús se enteran.
 */
const usePendientesStore = create<EstadoPendientes>((set) => ({
  resumen: null,
  refrescar: async () => {
    try {
      set({ resumen: await getPendientesResumen() });
    } catch {
      // Es un adorno del menú: si falla, se queda con lo último que sabía.
    }
  },
  limpiar: () => set({ resumen: null }),
}));

/** Para llamar desde una pantalla después de resolver un pendiente. */
export const refrescarPendientes = (): void => {
  void usePendientesStore.getState().refrescar();
};

// Un solo reloj para todos los suscriptores: las dos barras conviven
// montadas en desktop y no tiene sentido que consulten dos veces.
let suscriptores = 0;
let reloj: number | null = null;

/**
 * Devuelve los pendientes y mantiene la suscripción viva mientras el
 * componente esté montado. `activo` en false (sin sesión) no consulta.
 */
export const usePendientes = (
  activo: boolean,
  usuarioId?: string
): PendientesResumen | null => {
  const resumen = usePendientesStore((e) => e.resumen);

  useEffect(() => {
    if (!activo) {
      // Cambió de usuario o cerró sesión: los números del anterior no
      // valen para el que entra.
      usePendientesStore.getState().limpiar();
      return;
    }
    refrescarPendientes();
    suscriptores += 1;
    if (reloj === null) {
      reloj = window.setInterval(refrescarPendientes, 60_000);
    }
    return () => {
      suscriptores -= 1;
      if (suscriptores === 0 && reloj !== null) {
        window.clearInterval(reloj);
        reloj = null;
      }
    };
  }, [activo, usuarioId]);

  return resumen;
};
