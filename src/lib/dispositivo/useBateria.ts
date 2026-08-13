'use client';

import { useEffect, useState } from 'react';
import { AlertaBateria, clasificarBateria } from '@/lib/dispositivo/bateria';

interface BateriaNavegador {
  charging: boolean;
  level: number;
  addEventListener(tipo: string, fn: () => void): void;
  removeEventListener(tipo: string, fn: () => void): void;
}

interface NavigatorConBateria extends Navigator {
  getBattery?: () => Promise<BateriaNavegador>;
}

export interface EstadoBateria {
  disponible: boolean;
  nivel: number | null;
  cargando: boolean;
  alerta: AlertaBateria;
}

const INICIAL: EstadoBateria = {
  disponible: false,
  nivel: null,
  cargando: false,
  alerta: 'ok',
};

/**
 * Lee el nivel de batería cuando el navegador lo expone. Si no hay API,
 * `alerta` queda en `ok` para no inventar un aviso.
 */
export const useBateria = (): EstadoBateria => {
  const [estado, setEstado] = useState<EstadoBateria>(INICIAL);

  useEffect(() => {
    const nav = navigator as NavigatorConBateria;
    if (typeof nav.getBattery !== 'function') return;

    let viva = true;
    let bateria: BateriaNavegador | null = null;

    const sincronizar = () => {
      if (!viva || !bateria) return;
      setEstado({
        disponible: true,
        nivel: bateria.level,
        cargando: bateria.charging,
        alerta: clasificarBateria(bateria.level, bateria.charging),
      });
    };

    void nav.getBattery().then((b) => {
      if (!viva) return;
      bateria = b;
      b.addEventListener('levelchange', sincronizar);
      b.addEventListener('chargingchange', sincronizar);
      sincronizar();
    });

    return () => {
      viva = false;
      bateria?.removeEventListener('levelchange', sincronizar);
      bateria?.removeEventListener('chargingchange', sincronizar);
    };
  }, []);

  return estado;
};
