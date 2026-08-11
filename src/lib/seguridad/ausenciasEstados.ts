/**
 * Contrato de máquina de estados de ausencias (BUG-007).
 * La autoridad real es el trigger SQL; esto documenta el espejo.
 */

export type EstadoAusencia = 'pendiente' | 'aprobada' | 'rechazada';

export const transicionAusenciaPermitida = (
  desde: EstadoAusencia,
  hacia: EstadoAusencia
): boolean =>
  desde === 'pendiente' && (hacia === 'aprobada' || hacia === 'rechazada');

export const ausenciaResueltaEsInmutable = (estado: EstadoAusencia): boolean =>
  estado === 'aprobada' || estado === 'rechazada';
