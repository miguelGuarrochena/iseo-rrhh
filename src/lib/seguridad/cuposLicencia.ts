/**
 * Contrato de cupos de licencia (BUG-010).
 * Autoridad real: trigger SQL `exigir_cupo_licencia_aprobada`.
 * Espejo de `getSaldosLicencia`: solo `aprobada` consume; sin fila = libre.
 */

import type { Ausencia, CupoLicencia, TipoAusencia } from '@/types/rrhh';

/** NULL = sin cupo configurado (sin límite). */
export const cupoAnualDe = (
  cupos: Pick<CupoLicencia, 'tipo' | 'diasAnuales'>[],
  tipo: TipoAusencia
): number | null => {
  if (tipo === 'vacaciones') return null;
  const fila = cupos.find((c) => c.tipo === tipo);
  return fila ? fila.diasAnuales : null;
};

export const diasLicenciaAprobadosEnAnio = (
  ausencias: Pick<Ausencia, 'tipo' | 'estado' | 'fechaDesde' | 'dias'>[],
  tipo: TipoAusencia,
  anio: number
): number =>
  ausencias
    .filter(
      (a) =>
        a.tipo === tipo &&
        a.estado === 'aprobada' &&
        a.fechaDesde.startsWith(String(anio))
    )
    .reduce((acc, a) => acc + a.dias, 0);

/** Disponible; null si no hay cupo configurado. */
export const saldoLicenciaDisponibleDe = (
  cupos: Pick<CupoLicencia, 'tipo' | 'diasAnuales'>[],
  ausencias: Pick<Ausencia, 'tipo' | 'estado' | 'fechaDesde' | 'dias'>[],
  tipo: TipoAusencia,
  anio: number
): number | null => {
  const cupo = cupoAnualDe(cupos, tipo);
  if (cupo === null) return null;
  return cupo - diasLicenciaAprobadosEnAnio(ausencias, tipo, anio);
};

/**
 * ¿Puede quedar `aprobada` esta solicitud sin romper el cupo?
 * Pendiente/rechazada no consultan esto en DB; la UI puede usarlo
 * para avisar antes de pedir.
 */
export const puedeAprobarLicenciaContraCupo = (
  cupos: Pick<CupoLicencia, 'tipo' | 'diasAnuales'>[],
  ausencias: Pick<Ausencia, 'tipo' | 'estado' | 'fechaDesde' | 'dias'>[],
  tipo: TipoAusencia,
  anio: number,
  diasSolicitados: number
): boolean => {
  const disponible = saldoLicenciaDisponibleDe(cupos, ausencias, tipo, anio);
  if (disponible === null) return true;
  return diasSolicitados <= disponible;
};
