/**
 * Contrato de cupos de licencia (BUG-010).
 * Autoridad real: trigger SQL `exigir_cupo_licencia_aprobada`.
 * Espejo de `getSaldosLicencia`: solo `aprobada` consume; sin fila = libre.
 */

import { diasCorridosEnAnio } from '@/lib/fechas';
import {
  TIPOS_LICENCIA_POR_EVENTO,
  type Ausencia,
  type CupoLicencia,
  type TipoAusencia,
} from '@/types/rrhh';

/**
 * ¿Esta licencia la otorga la ley por hecho generador?
 *
 * Si lo es, no hay cupo que consultar: un segundo fallecimiento en el año
 * genera su propia licencia. Es el espejo de
 * `tipos_licencia_por_evento()` en la base.
 */
export const esLicenciaPorEvento = (tipo: TipoAusencia): boolean =>
  TIPOS_LICENCIA_POR_EVENTO.includes(tipo);

/** NULL = sin cupo configurado (sin límite) o licencia por evento. */
export const cupoAnualDe = (
  cupos: Pick<CupoLicencia, 'tipo' | 'diasAnuales'>[],
  tipo: TipoAusencia
): number | null => {
  if (tipo === 'vacaciones') return null;
  if (esLicenciaPorEvento(tipo)) return null;
  const fila = cupos.find((c) => c.tipo === tipo);
  return fila ? fila.diasAnuales : null;
};

/**
 * Días de licencia aprobados que caen dentro del año.
 *
 * Se cuentan los días del rango que pertenecen a ese año calendario, no
 * todos los del rango porque empezó ahí: una licencia del 28/12 al 06/01
 * consume seis días del año siguiente, no diez del que termina.
 */
export const diasLicenciaAprobadosEnAnio = (
  ausencias: Pick<
    Ausencia,
    'tipo' | 'estado' | 'fechaDesde' | 'fechaHasta' | 'dias'
  >[],
  tipo: TipoAusencia,
  anio: number
): number =>
  ausencias
    .filter((a) => a.tipo === tipo && a.estado === 'aprobada')
    .reduce(
      (acc, a) => acc + diasCorridosEnAnio(a.fechaDesde, a.fechaHasta, anio),
      0
    );

/** Disponible; null si no hay cupo configurado. */
export const saldoLicenciaDisponibleDe = (
  cupos: Pick<CupoLicencia, 'tipo' | 'diasAnuales'>[],
  ausencias: Pick<
    Ausencia,
    'tipo' | 'estado' | 'fechaDesde' | 'fechaHasta' | 'dias'
  >[],
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
  ausencias: Pick<
    Ausencia,
    'tipo' | 'estado' | 'fechaDesde' | 'fechaHasta' | 'dias'
  >[],
  tipo: TipoAusencia,
  anio: number,
  diasSolicitados: number
): boolean => {
  const disponible = saldoLicenciaDisponibleDe(cupos, ausencias, tipo, anio);
  if (disponible === null) return true;
  return diasSolicitados <= disponible;
};
