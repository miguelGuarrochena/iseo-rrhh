/**
 * Avisos de batería para el fichaje facial.
 *
 * El reconocimiento corre en el dispositivo: con poca carga el sistema
 * apaga o recorta la cámara y los modelos van a los saltos. No hay forma
 * de fichar bien en ese estado; lo útil es decirlo antes y mandar a RRHH
 * a cargar la fichada a mano mientras se enchufa.
 *
 * La API de batería existe en Chrome/Android (tablets de planta y la
 * mayoría de los celulares del equipo). En Safari/iOS no está: ahí el
 * aviso sale igual si la cámara falla, no de forma preventiva.
 */

/** Por debajo de esto el reconocimiento suele fallar. */
export const UMBRAL_BATERIA_BAJA = 0.2;
/** Por debajo de esto el sistema a veces corta la cámara. */
export const UMBRAL_BATERIA_CRITICA = 0.1;

export type AlertaBateria = 'ok' | 'baja' | 'critica' | 'cargando';

export const clasificarBateria = (
  nivel: number,
  cargando: boolean
): AlertaBateria => {
  if (nivel > UMBRAL_BATERIA_BAJA) return 'ok';
  if (cargando) return 'cargando';
  if (nivel <= UMBRAL_BATERIA_CRITICA) return 'critica';
  return 'baja';
};

export const porcentajeBateria = (nivel: number): number =>
  Math.max(0, Math.min(100, Math.round(nivel * 100)));

export const textoAvisoBateria = (
  alerta: AlertaBateria,
  nivel: number
): { titulo: string; detalle: string } | null => {
  if (alerta === 'ok') return null;
  const pct = porcentajeBateria(nivel);
  if (alerta === 'cargando') {
    return {
      titulo: `Cargando · ${pct}%`,
      detalle:
        'Si la cámara no responde, pedile a RRHH que te fichen a mano. En unos minutos debería volver.',
    };
  }
  if (alerta === 'critica') {
    return {
      titulo: `Batería al ${pct}%`,
      detalle:
        'Enchufá el dispositivo. Mientras carga, avisale a RRHH para que te fichen a mano.',
    };
  }
  return {
    titulo: `Batería al ${pct}%`,
    detalle:
      'El reconocimiento puede fallar. Enchufalo y, si no te toma, pedile a RRHH la fichada a mano.',
  };
};
