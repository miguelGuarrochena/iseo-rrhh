import { Ausencia } from '@/types/rrhh';
import {
  diferenciaEnDias,
  finDeMesEmpresa,
  lunesDeSemanaEmpresa,
  partesDeFecha,
  sumarDiasEmpresa,
  sumarMesesEmpresa,
} from '@/lib/fechas';

/**
 * Armado del calendario de ausencias: qué días entran en cada vista y
 * cómo se acomodan las barras de varios días sin pisarse.
 *
 * Es SÓLO presentación. Acá no se cuentan días de licencia ni se decide
 * nada de negocio: los rangos y los `dias` llegan calculados de la base
 * (`diasAusencia`, migración 58) y este módulo únicamente los recorta al
 * pedazo de calendario que se está mirando.
 *
 * Vive fuera del componente porque es lo único del calendario que se
 * puede probar sin renderizar: la aritmética de semanas y el reparto en
 * carriles son justo donde se rompe una ausencia que cruza de mes.
 */

export type VistaCalendario = 'mes' | 'semana' | 'dia';

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** Nombres de los días, siempre arrancando en lunes. */
export const DIAS_LARGOS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DIAS_INICIAL = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const capitalizar = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La fecha que representa el período mirado, en su forma canónica: el
 * día 1 en la vista mes y el lunes en la vista semana.
 *
 * Sin esto, pasar de "semana del 31 de agosto" a la vista mes dejaba el
 * ancla en el 31 y el mes siguiente empezaba a contar desde ahí.
 */
export const anclaNormalizada = (
  vista: VistaCalendario,
  fecha: string
): string => {
  if (vista === 'mes') return `${fecha.slice(0, 7)}-01`;
  if (vista === 'semana') return lunesDeSemanaEmpresa(fecha);
  return fecha;
};

/**
 * Ancla al cambiar de vista.
 *
 * Se conserva el período que se estaba mirando, con una preferencia: si
 * "hoy" cae adentro, la nueva vista abre en hoy. Sin esto, pasar de mes a
 * semana llevaba a la primera semana de la grilla —que arranca en el mes
 * anterior— y parecía que el botón te había movido de fecha.
 */
export const anclaAlCambiarVista = (
  vista: VistaCalendario,
  ancla: string,
  siguiente: VistaCalendario,
  hoy: string
): string => {
  const { desde, hasta } = rangoVisible(vista, ancla);
  const dentro = hoy >= desde && hoy <= hasta;
  const base = dentro
    ? hoy
    : vista === 'mes'
      ? `${ancla.slice(0, 7)}-01`
      : ancla;
  return anclaNormalizada(siguiente, base);
};

/** Anterior (delta -1) o siguiente (delta +1) período de la vista. */
export const moverAncla = (
  vista: VistaCalendario,
  ancla: string,
  delta: number
): string => {
  if (vista === 'mes')
    return `${sumarMesesEmpresa(ancla.slice(0, 7), delta)}-01`;
  if (vista === 'semana') return sumarDiasEmpresa(ancla, 7 * delta);
  return sumarDiasEmpresa(ancla, delta);
};

/** Rango de días que se dibujan (en mes incluye el relleno de semanas). */
export const rangoVisible = (
  vista: VistaCalendario,
  ancla: string
): { desde: string; hasta: string } => {
  if (vista === 'dia') return { desde: ancla, hasta: ancla };
  if (vista === 'semana') {
    const lunes = lunesDeSemanaEmpresa(ancla);
    return { desde: lunes, hasta: sumarDiasEmpresa(lunes, 6) };
  }
  const primero = `${ancla.slice(0, 7)}-01`;
  const ultimo = finDeMesEmpresa(ancla.slice(0, 7));
  return {
    desde: lunesDeSemanaEmpresa(primero),
    hasta: sumarDiasEmpresa(lunesDeSemanaEmpresa(ultimo), 6),
  };
};

/** Los días (YYYY-MM-DD) de un rango, inclusive. */
export const diasDelRango = (desde: string, hasta: string): string[] => {
  const total = diferenciaEnDias(desde, hasta);
  if (total < 0) return [];
  return Array.from({ length: total + 1 }, (_, i) =>
    sumarDiasEmpresa(desde, i)
  );
};

/**
 * Las filas de la grilla: en mes, una por semana (lunes a domingo, con
 * los días de los meses vecinos que completan la fila); en semana, una
 * sola fila de 7; en día, una fila de 1.
 */
export const filasDeVista = (
  vista: VistaCalendario,
  ancla: string
): string[][] => {
  const { desde, hasta } = rangoVisible(vista, ancla);
  const dias = diasDelRango(desde, hasta);
  if (vista === 'dia') return [dias];
  const filas: string[][] = [];
  for (let i = 0; i < dias.length; i += 7) filas.push(dias.slice(i, i + 7));
  return filas;
};

/** ¿La fecha pertenece al mes que se está mirando? */
export const esDelPeriodo = (fecha: string, ancla: string): boolean =>
  fecha.slice(0, 7) === ancla.slice(0, 7);

/** Título del encabezado, según la vista. */
export const tituloDeVista = (
  vista: VistaCalendario,
  ancla: string
): string => {
  const p = partesDeFecha(ancla);
  if (vista === 'mes') return `${MESES[p.mes - 1]} ${p.anio}`;
  if (vista === 'dia') {
    const diaSemana = DIAS_LARGOS[indiceDeSemana(ancla)];
    return `${diaSemana} ${p.dia} de ${MESES[p.mes - 1].toLowerCase()} ${p.anio}`;
  }
  const lunes = lunesDeSemanaEmpresa(ancla);
  const domingo = sumarDiasEmpresa(lunes, 6);
  const l = partesDeFecha(lunes);
  const d = partesDeFecha(domingo);
  if (l.anio === d.anio && l.mes === d.mes) {
    return `${l.dia} – ${d.dia} de ${MESES[l.mes - 1].toLowerCase()} ${l.anio}`;
  }
  if (l.anio === d.anio) {
    return `${l.dia} ${MESES_CORTOS[l.mes - 1]} – ${d.dia} ${MESES_CORTOS[d.mes - 1]} ${l.anio}`;
  }
  return `${l.dia} ${MESES_CORTOS[l.mes - 1]} ${l.anio} – ${d.dia} ${MESES_CORTOS[d.mes - 1]} ${d.anio}`;
};

/** Posición del día dentro de una semana que arranca en lunes (0..6). */
export const indiceDeSemana = (fecha: string): number =>
  diferenciaEnDias(lunesDeSemanaEmpresa(fecha), fecha);

/** Sábado o domingo. */
export const esFinDeSemana = (fecha: string): boolean =>
  indiceDeSemana(fecha) >= 5;

/** ¿La ausencia toca algún día del rango? Extremos incluidos. */
export const tocaRango = (
  a: Pick<Ausencia, 'fechaDesde' | 'fechaHasta'>,
  desde: string,
  hasta: string
): boolean => a.fechaDesde <= hasta && a.fechaHasta >= desde;

/** Las ausencias vigentes ese día. Mismo criterio que usaba la grilla. */
export const ausenciasDelDia = <T extends Ausencia>(
  ausencias: T[],
  fecha: string
): T[] =>
  ausencias.filter((a) => a.fechaDesde <= fecha && fecha <= a.fechaHasta);

/**
 * El pedazo de una ausencia que entra en una fila del calendario.
 *
 * `continuaAntes` / `continuaDespues` son lo que permite dibujar una
 * licencia de tres semanas como una barra que sigue de una fila a la
 * otra en vez de tres bloques sueltos: la punta se redondea sólo del
 * lado donde la ausencia realmente empieza o termina.
 */
export interface SegmentoAusencia<T extends Ausencia = Ausencia> {
  ausencia: T;
  /** Estable entre renders: id de la ausencia + primer día de la fila. */
  clave: string;
  /** Columna donde arranca dentro de la fila (0 = primer día). */
  inicio: number;
  /** Última columna que ocupa, inclusive. */
  fin: number;
  /** Cuántas columnas ocupa. */
  largo: number;
  continuaAntes: boolean;
  continuaDespues: boolean;
  /** Fila interna (0 = la de más arriba) para que no se pisen. */
  carril: number;
}

/**
 * Reparte las ausencias que tocan una fila de días en carriles.
 *
 * El orden importa y no es alfabético: primero la que empieza antes y,
 * a igual comienzo, la más larga. Es lo que hace que las barras largas
 * queden arriba y las de un día se acomoden debajo, en vez de partir
 * una licencia de una semana con un permiso de una tarde.
 */
export const segmentosDeFila = <T extends Ausencia>(
  ausencias: T[],
  dias: string[]
): SegmentoAusencia<T>[] => {
  if (dias.length === 0) return [];
  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  const enFila = ausencias
    .filter((a) => tocaRango(a, desde, hasta))
    .sort((a, b) => {
      if (a.fechaDesde !== b.fechaDesde)
        return a.fechaDesde.localeCompare(b.fechaDesde);
      if (a.fechaHasta !== b.fechaHasta)
        return b.fechaHasta.localeCompare(a.fechaHasta);
      return a.id.localeCompare(b.id);
    });

  // Cada carril recuerda hasta qué columna está ocupado.
  const ocupadoHasta: number[] = [];
  return enFila.map((a) => {
    const inicio =
      a.fechaDesde <= desde ? 0 : diferenciaEnDias(desde, a.fechaDesde);
    const fin =
      a.fechaHasta >= hasta
        ? dias.length - 1
        : diferenciaEnDias(desde, a.fechaHasta);
    let carril = ocupadoHasta.findIndex((libreDesde) => libreDesde <= inicio);
    if (carril === -1) carril = ocupadoHasta.length;
    ocupadoHasta[carril] = fin + 1;
    return {
      ausencia: a,
      clave: `${a.id}-${desde}`,
      inicio,
      fin,
      largo: fin - inicio + 1,
      continuaAntes: a.fechaDesde < desde,
      continuaDespues: a.fechaHasta > hasta,
      carril,
    };
  });
};

/**
 * Cuántas ausencias quedan fuera de la vista en cada día por falta de
 * carriles. Es el número del "+N más": el resto se ve igual, tocando el
 * día, nunca se descarta en silencio.
 */
export const desbordePorDia = <T extends Ausencia>(
  segmentos: SegmentoAusencia<T>[],
  dias: string[],
  maxCarriles: number
): Record<string, number> => {
  const conteo: Record<string, number> = {};
  segmentos
    .filter((s) => s.carril >= maxCarriles)
    .forEach((s) => {
      for (let i = s.inicio; i <= s.fin; i += 1) {
        conteo[dias[i]] = (conteo[dias[i]] ?? 0) + 1;
      }
    });
  return conteo;
};

/** Ausencias agrupadas por empleado, para la vista semana. */
export const agruparPorEmpleado = <T extends Ausencia>(
  ausencias: T[],
  nombre: (empleadoId: string) => string
): { empleadoId: string; nombre: string; ausencias: T[] }[] => {
  const grupos = new Map<string, T[]>();
  ausencias.forEach((a) => {
    const actual = grupos.get(a.empleadoId);
    if (actual) actual.push(a);
    else grupos.set(a.empleadoId, [a]);
  });
  return Array.from(grupos.entries())
    .map(([empleadoId, lista]) => ({
      empleadoId,
      nombre: nombre(empleadoId),
      ausencias: lista,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
};

/** Ausencias de un día agrupadas por tipo, para la vista día. */
export const agruparPorTipo = <T extends Ausencia>(
  ausencias: T[]
): { tipo: T['tipo']; ausencias: T[] }[] => {
  const grupos = new Map<T['tipo'], T[]>();
  ausencias.forEach((a) => {
    const actual = grupos.get(a.tipo);
    if (actual) actual.push(a);
    else grupos.set(a.tipo, [a]);
  });
  return Array.from(grupos.entries()).map(([tipo, lista]) => ({
    tipo,
    ausencias: lista,
  }));
};
