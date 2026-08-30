/**
 * Ausentismo de un mes: días de ausencia sobre días-persona.
 *
 * Vivía adentro de `getResumenControl` en la capa de servicios. Se sacó
 * acá cuando el Reporte mensual necesitó la misma cuenta para un período
 * cualquiera: tener dos implementaciones del ausentismo es tener dos
 * números distintos en dos pantallas de la misma app, que es peor que no
 * mostrarlo.
 *
 * Las tres decisiones de la cuenta, que ya estaban tomadas y se
 * conservan tal cual:
 *
 *  1. Sólo los días que caen DENTRO del mes. Una licencia del 20/07 al
 *     10/08 aporta su parte a julio y su parte a agosto, no los 22 días
 *     a julio.
 *  2. Las dos puntas de la fracción se miden en días hábiles. `dias` de
 *     la ausencia viene en hábiles para vacaciones cuando la empresa las
 *     cuenta así y en corridos para el resto, así que no sirve.
 *  3. Home office y las parciales de jornada no son ausencia. Home
 *     office es trabajo, y de una llegada tarde no sabemos los minutos:
 *     sumarla como día entero es peor que no contarla.
 */
import { Ausencia } from '@/types/rrhh';
import { TIPOS_AUSENCIA_JORNADA } from '@/lib/etiquetas';
import {
  diasHabilesEnMes,
  diasHabilesEntre,
  finDeMesEmpresa,
} from '@/lib/fechas';

export interface Ausentismo {
  /** Días hábiles de ausencia imputables al mes. */
  diasAusencia: number;
  /** Días hábiles del mes por la dotación. */
  diasPersona: number;
  /** diasAusencia / diasPersona, en porcentaje con un decimal. */
  pct: number;
}

const NO_SON_AUSENCIA: string[] = TIPOS_AUSENCIA_JORNADA;

export const calcularAusentismo = (
  ausencias: Ausencia[],
  /** Personas sobre las que se mide. Sin dotación no hay fracción. */
  dotacion: number,
  /** YYYY-MM */
  periodo: string
): Ausentismo => {
  const inicioMes = `${periodo}-01`;
  const finMes = finDeMesEmpresa(periodo);

  const diasAusencia = ausencias
    .filter((a) => a.estado === 'aprobada' && !NO_SON_AUSENCIA.includes(a.tipo))
    .reduce(
      (acc, a) => acc + diasHabilesEnMes(a.fechaDesde, a.fechaHasta, periodo),
      0
    );
  const diasPersona = dotacion * diasHabilesEntre(inicioMes, finMes);

  return {
    diasAusencia,
    diasPersona,
    pct:
      diasPersona > 0
        ? Math.round((diasAusencia / diasPersona) * 1000) / 10
        : 0,
  };
};
