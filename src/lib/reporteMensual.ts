/**
 * Reporte mensual: la foto cerrada de un mes, para la visita de ISEO.
 *
 * Regla que atraviesa todo el módulo: **un indicador que no se puede
 * calcular bien no se muestra**. Cada uno viaja como `number |
 * undefined`, y `undefined` significa "los datos que hay no alcanzan
 * para afirmarlo", no cero. Un cero es una afirmación —"nadie hizo horas
 * extras"— y muchas veces la verdad es otra: nadie cargó los sueldos.
 *
 * Lógica pura. Todo lo que necesita se lo pasa el servicio, y ningún
 * cálculo se inventa acá: el ausentismo sale de `ausentismo.ts`, el
 * costo de las extras y las cargas patronales de `remuneraciones.ts`.
 */
import { Ausencia, Empleado, Empresa, Remuneracion } from '@/types/rrhh';
import { calcularAusentismo } from '@/lib/ausentismo';
import {
  CARGAS_PATRONALES,
  costoLaboral,
  HORAS_MENSUALES,
  valorHorasExtras,
} from '@/lib/remuneraciones';
import { finDeMesEmpresa, sumarMesesEmpresa } from '@/lib/fechas';
import { JornadaDelPeriodo } from '@/lib/novedades';
import { moduloActivo } from '@/components/app/navItems';

export interface DatosReporte {
  /** YYYY-MM */
  periodo: string;
  empresa: Empresa;
  /** Toda la dotación histórica: la del mes se resuelve por fechas. */
  empleados: Empleado[];
  /** Las que tocan el período. */
  ausencias: Ausencia[];
  /** Las del período y las del anterior. */
  remuneraciones: Remuneracion[];
  jornadas: JornadaDelPeriodo[];
  modulos?: Record<string, boolean>;
}

/** Un número del mes con su comparación contra el anterior. */
export interface Indicador {
  /** `undefined` = no se puede calcular con los datos que hay. */
  valor?: number;
  anterior?: number;
  /** valor − anterior. Sólo cuando los dos existen. */
  variacion?: number;
  /** Variación porcentual. Sólo cuando el anterior existe y no es cero. */
  variacionPct?: number;
}

export interface ReporteMensual {
  periodo: string;
  periodoAnterior: string;

  // ---- Dotación ----
  /** Personas en actividad el último día del mes. */
  dotacion: Indicador;
  dotacionInicio: number;
  altas: number;
  bajas: number;
  /**
   * Bajas sobre la dotación promedio del mes, en porcentaje.
   *
   * Se dice "bajas" y no "movimientos" a propósito: hay más de una
   * definición dando vueltas y mezclarlas es cómo dos informes de la
   * misma empresa dan distinto. Las altas se muestran al lado, sueltas.
   */
  rotacionPct?: number;

  // ---- Ausentismo ----
  ausentismoPct?: Indicador;
  diasAusencia?: number;

  // ---- Fichaje ----
  horasExtras?: Indicador;
  /** Valor estimado de las extras del mes. Ver `costoExtrasParcial`. */
  costoExtras?: number;
  /**
   * Cuántas personas con extras quedaron afuera del costo por no tener
   * sueldo cargado. Si es > 0, el costo es un piso, no el total.
   */
  costoExtrasParcial: number;

  // ---- Remuneraciones ----
  masaSalarial?: Indicador;
  /** Masa + cargas patronales estimadas (o + nada, en simplificado). */
  costoLaboralTotal?: number;
  /** Cuántos de la dotación tienen bruto cargado en el período. */
  conSueldoCargado: number;

  /** Secciones apagadas: sus indicadores no se calculan ni se muestran. */
  sinFichaje: boolean;
  sinRemuneraciones: boolean;
  sinAusencias: boolean;
}

/** ¿Estaba en actividad en esa fecha civil? */
export const enActividad = (e: Empleado, fecha: string): boolean =>
  e.fechaIngreso <= fecha && (!e.fechaBaja || e.fechaBaja >= fecha);

const dotacionA = (empleados: Empleado[], fecha: string): number =>
  empleados.filter((e) => enActividad(e, fecha)).length;

const enPeriodo = (fecha: string | undefined, periodo: string): boolean =>
  Boolean(fecha) && (fecha as string).slice(0, 7) === periodo;

const redondear1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Arma el indicador con su comparación.
 *
 * Sin período anterior no hay variación, y no se rellena con cero: "no
 * subió" y "no sabemos contra qué" son cosas distintas.
 */
export const compararCon = (
  valor: number | undefined,
  anterior: number | undefined
): Indicador => {
  if (valor === undefined) return { valor: undefined, anterior };
  if (anterior === undefined) return { valor, anterior: undefined };
  const variacion = redondear1(valor - anterior);
  return {
    valor,
    anterior,
    variacion,
    variacionPct:
      anterior !== 0
        ? redondear1(((valor - anterior) / anterior) * 100)
        : undefined,
  };
};

/** Brutos mensuales de un período, por empleado. */
const brutosDe = (
  remuneraciones: Remuneracion[],
  periodo: string
): Map<string, number> => {
  const mapa = new Map<string, number>();
  for (const r of remuneraciones) {
    if (r.periodo !== periodo) continue;
    // El SAC y la liquidación final no son masa salarial del mes:
    // sumarlos haría que junio y diciembre parezcan meses con un 50% más
    // de nómina todos los años.
    if ((r.tipo ?? 'mensual') !== 'mensual') continue;
    mapa.set(r.empleadoId, (mapa.get(r.empleadoId) ?? 0) + r.montoBruto);
  }
  return mapa;
};

const sumar = (mapa: Map<string, number>): number =>
  [...mapa.values()].reduce((a, b) => a + b, 0);

export const armarReporteMensual = (datos: DatosReporte): ReporteMensual => {
  const { periodo, empresa, empleados, modulos } = datos;
  const periodoAnterior = sumarMesesEmpresa(periodo, -1);
  const finMes = finDeMesEmpresa(periodo);
  const inicioMes = `${periodo}-01`;
  const finMesAnterior = finDeMesEmpresa(periodoAnterior);

  const sinFichaje = !moduloActivo('fichaje', modulos);
  const sinRemuneraciones = !moduloActivo('remuneraciones', modulos);
  const sinAusencias = !moduloActivo('ausencias', modulos);

  // ---------- Dotación ----------
  const dotacionFin = dotacionA(empleados, finMes);
  const dotacionInicio = dotacionA(empleados, inicioMes);
  const dotacionAnterior = dotacionA(empleados, finMesAnterior);
  const altas = empleados.filter((e) =>
    enPeriodo(e.fechaIngreso, periodo)
  ).length;
  const bajas = empleados.filter((e) => enPeriodo(e.fechaBaja, periodo)).length;

  const promedio = (dotacionInicio + dotacionFin) / 2;
  const rotacionPct =
    promedio > 0 ? redondear1((bajas / promedio) * 100) : undefined;

  // ---------- Ausentismo ----------
  //
  // Con Ausencias apagado no hay licencias cargadas: un 0% diría "nadie
  // faltó" cuando la verdad es que la empresa no lleva ese registro acá.
  let ausentismoPct: Indicador | undefined;
  let diasAusencia: number | undefined;
  if (!sinAusencias && dotacionFin > 0) {
    const ahora = calcularAusentismo(datos.ausencias, dotacionFin, periodo);
    diasAusencia = ahora.diasAusencia;
    const antes =
      dotacionAnterior > 0
        ? calcularAusentismo(datos.ausencias, dotacionAnterior, periodoAnterior)
        : undefined;
    /*
     * El mes anterior sólo se compara si las ausencias que llegaron
     * alcanzan para calcularlo. El servicio trae el rango de los dos
     * meses justamente para esto; si algún día trajera sólo uno, acá se
     * vería un "bajó a cero" que nunca pasó.
     */
    ausentismoPct = compararCon(ahora.pct, antes?.pct);
  }

  // ---------- Horas extras ----------
  let horasExtras: Indicador | undefined;
  let costoExtras: number | undefined;
  let costoExtrasParcial = 0;
  const brutos = brutosDe(datos.remuneraciones, periodo);
  const brutosAnterior = brutosDe(datos.remuneraciones, periodoAnterior);

  if (!sinFichaje) {
    const porEmpleado = new Map<string, number>();
    for (const j of datos.jornadas) {
      if (j.horasExtrasAprobadas <= 0) continue;
      porEmpleado.set(
        j.empleadoId,
        (porEmpleado.get(j.empleadoId) ?? 0) + j.horasExtrasAprobadas
      );
    }
    horasExtras = compararCon(redondear1(sumar(porEmpleado)), undefined);

    /*
     * El costo depende de tener el sueldo cargado: el valor de la hora
     * sale del bruto. A quien no lo tenga no se le estima nada —se lo
     * cuenta aparte en `costoExtrasParcial`— para no dar un total que
     * parezca completo.
     *
     * Sin extras aprobadas el costo es cero de verdad, no "no se sabe":
     * ahí sí se puede afirmar que no hay nada que pagar por este
     * concepto.
     */
    if (!sinRemuneraciones) {
      let total = 0;
      for (const [empleadoId, horas] of porEmpleado) {
        const bruto = brutos.get(empleadoId) ?? brutosAnterior.get(empleadoId);
        if (!bruto) {
          costoExtrasParcial += 1;
          continue;
        }
        total += valorHorasExtras(
          bruto,
          horas,
          empresa.config.horasMensuales ?? HORAS_MENSUALES
        );
      }
      costoExtras = total;
    }
  }

  // ---------- Masa salarial ----------
  let masaSalarial: Indicador | undefined;
  let costoLaboralTotal: number | undefined;
  const conSueldoCargado = brutos.size;

  if (!sinRemuneraciones && conSueldoCargado > 0) {
    const masa = sumar(brutos);
    masaSalarial = compararCon(
      masa,
      brutosAnterior.size > 0 ? sumar(brutosAnterior) : undefined
    );
    costoLaboralTotal = costoLaboral({
      montoBruto: masa,
      regimen: empresa.regimen,
      cargasPatronalesPct:
        empresa.config.cargasPatronalesPct ?? CARGAS_PATRONALES,
    }).total;
  }

  return {
    periodo,
    periodoAnterior,
    dotacion: compararCon(dotacionFin, dotacionAnterior),
    dotacionInicio,
    altas,
    bajas,
    rotacionPct,
    ausentismoPct,
    diasAusencia,
    horasExtras,
    costoExtras,
    costoExtrasParcial,
    masaSalarial,
    costoLaboralTotal,
    conSueldoCargado,
    sinFichaje,
    sinRemuneraciones,
    sinAusencias,
  };
};

/**
 * El resumen ejecutivo, en frases.
 *
 * Es lo primero que se lee en la visita y tiene que decir qué pasó, no
 * repetir los números que están en las tarjetas de al lado. Sólo se
 * escribe lo que los datos sostienen: si un indicador no se pudo
 * calcular, no aparece ninguna frase sobre él.
 */
export const resumenEjecutivo = (r: ReporteMensual): string[] => {
  const frases: string[] = [];

  if (r.altas > 0 || r.bajas > 0) {
    const partes: string[] = [];
    if (r.altas > 0) partes.push(`${r.altas} alta${r.altas === 1 ? '' : 's'}`);
    if (r.bajas > 0) partes.push(`${r.bajas} baja${r.bajas === 1 ? '' : 's'}`);
    frases.push(
      `El mes cerró con ${r.dotacion.valor} en actividad, después de ${partes.join(' y ')}.`
    );
  } else {
    frases.push(
      `La dotación no se movió: ${r.dotacion.valor} en actividad, sin altas ni bajas.`
    );
  }

  if (r.ausentismoPct?.valor !== undefined) {
    const v = r.ausentismoPct;
    if (v.variacion === undefined) {
      frases.push(`El ausentismo del mes fue del ${v.valor}%.`);
    } else if (Math.abs(v.variacion) < 0.5) {
      frases.push(`El ausentismo se mantuvo en ${v.valor}%.`);
    } else {
      frases.push(
        `El ausentismo ${v.variacion > 0 ? 'subió' : 'bajó'} de ${v.anterior}% a ${v.valor}%.`
      );
    }
  }

  if (r.horasExtras?.valor !== undefined && r.horasExtras.valor > 0) {
    frases.push(
      `Se aprobaron ${r.horasExtras.valor} horas extras${
        r.costoExtras !== undefined ? ' con su costo estimado' : ''
      }.`
    );
  }

  if (r.masaSalarial?.variacionPct !== undefined) {
    const pct = r.masaSalarial.variacionPct;
    if (Math.abs(pct) >= 0.5) {
      frases.push(
        `La masa salarial ${pct > 0 ? 'subió' : 'bajó'} ${Math.abs(pct)}% contra ${r.periodoAnterior}.`
      );
    }
  }

  return frases;
};

/** El reporte como filas, para exportarlo o imprimirlo aparte. */
export const filasDeReporte = (
  r: ReporteMensual,
  empresa: string
): string[][] => {
  const filas: string[][] = [
    ['Empresa', empresa],
    ['Período', r.periodo],
    [],
    ['Indicador', r.periodo, r.periodoAnterior],
  ];
  const fila = (
    etiqueta: string,
    valor?: number,
    anterior?: number,
    sufijo = ''
  ) => {
    if (valor === undefined) return;
    filas.push([
      etiqueta,
      `${valor}${sufijo}`,
      anterior !== undefined ? `${anterior}${sufijo}` : '',
    ]);
  };

  fila('Dotación al cierre', r.dotacion.valor, r.dotacion.anterior);
  fila('Altas', r.altas);
  fila('Bajas', r.bajas);
  fila('Rotación (bajas / dotación promedio)', r.rotacionPct, undefined, '%');
  fila('Ausentismo', r.ausentismoPct?.valor, r.ausentismoPct?.anterior, '%');
  fila('Días de ausencia', r.diasAusencia);
  fila('Horas extras aprobadas', r.horasExtras?.valor, undefined, ' hs');
  fila('Costo estimado de las extras', r.costoExtras);
  fila('Masa salarial', r.masaSalarial?.valor, r.masaSalarial?.anterior);
  fila('Costo laboral estimado', r.costoLaboralTotal);
  return filas;
};
