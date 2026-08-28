/**
 * Cálculos del módulo de remuneraciones: evolución salarial, aguinaldo
 * (SAC) y masa salarial. Las cargas patronales son una estimación.
 */
import { RegimenLaboral, Remuneracion } from '@/types/rrhh';
import { diasEntre, hoyISO } from '@/lib/fechas';

/** Contribuciones patronales estimadas sobre el bruto (aprox.). */
export const CARGAS_PATRONALES = 0.27;

/** Aportes personales del empleado sobre el remunerativo. */
export const APORTES = {
  jubilacion: 0.11, // SIPA
  ley19032: 0.03, // PAMI
  obraSocial: 0.03, // obra social
} as const;

/** Total de aportes personales sobre el remunerativo (17%). */
export const APORTES_TOTAL =
  APORTES.jubilacion + APORTES.ley19032 + APORTES.obraSocial;

/** Aportes personales estimados sobre el sueldo remunerativo. */
export const calcularAportes = (remunerativo: number): number =>
  Math.round(Math.max(0, remunerativo) * APORTES_TOTAL);

/**
 * ¿A esta empresa se le descuentan aportes de ley?
 *
 * En el régimen simplificado (monotributo / pago directo) no hay
 * jubilación, PAMI ni obra social que retener: descontarlos igual daba
 * un "neto a cobrar" que no era la plata que la persona recibía, que es
 * exactamente lo que hacía inservible la pantalla para esos clientes.
 */
export const tieneAportesDeLey = (regimen?: RegimenLaboral): boolean =>
  (regimen ?? 'relacion_dependencia') === 'relacion_dependencia';

/**
 * Calcula aportes y neto. Neto = remunerativo + no remunerativo − aportes −
 * otros descuentos.
 *
 * En régimen simplificado los aportes son 0 y el neto es bruto + no
 * remunerativo − descuentos: lo que efectivamente se paga.
 */
export const calcularLiquidacion = (d: {
  montoBruto: number;
  noRemunerativo?: number;
  otrosDescuentos?: number;
  regimen?: RegimenLaboral;
}): { aportes: number; neto: number } => {
  const aportes = tieneAportesDeLey(d.regimen)
    ? calcularAportes(d.montoBruto)
    : 0;
  const neto = Math.round(
    d.montoBruto + (d.noRemunerativo ?? 0) - aportes - (d.otrosDescuentos ?? 0)
  );
  return { aportes, neto };
};

/**
 * Costo del período para la empresa.
 *
 * En relación de dependencia es el bruto más las cargas patronales
 * estimadas. En el régimen simplificado no hay cargas: el costo es lo
 * que se paga, más la cuota de monotributo si la empresa se la hace
 * cargo. Es el ejemplo textual del cliente: sueldo $100 + monotributo
 * $23 = $123 de costo, no $100.
 */
export const costoLaboral = (d: {
  montoBruto: number;
  noRemunerativo?: number;
  regimen?: RegimenLaboral;
  cargasPatronalesPct?: number;
  /** Cuota de monotributo del período que paga la empresa. */
  monotributoAcargoEmpresa?: number;
}): { cargas: number; monotributo: number; total: number } => {
  const base = d.montoBruto + (d.noRemunerativo ?? 0);
  const cargas = tieneAportesDeLey(d.regimen)
    ? Math.round(d.montoBruto * (d.cargasPatronalesPct ?? CARGAS_PATRONALES))
    : 0;
  const monotributo = Math.round(d.monotributoAcargoEmpresa ?? 0);
  return {
    cargas,
    monotributo,
    total: Math.round(base) + cargas + monotributo,
  };
};

/** Jornada legal: 48 hs semanales ≈ 192 mensuales (LCT art. 1 ley 11.544). */
export const HORAS_MENSUALES = 192;

/** Recargo de la hora extra común: 50% sobre la hora normal (LCT art. 201). */
export const RECARGO_HORA_EXTRA = 1.5;

/**
 * Valor a pagar por las horas extras del período.
 *
 * Es una sugerencia, no una liquidación: toma el recargo del 50% (el de
 * los días hábiles) y no distingue las del 100% (sábado después de las 13,
 * domingos y feriados), que hay que cargar aparte. Tampoco contempla los
 * adicionales del convenio, que cambian la base de cálculo.
 */
export const valorHorasExtras = (
  montoBruto: number,
  horasExtras: number,
  horasMensuales: number = HORAS_MENSUALES
): number => {
  if (montoBruto <= 0 || horasExtras <= 0 || horasMensuales <= 0) return 0;
  const valorHora = montoBruto / horasMensuales;
  return Math.round(valorHora * RECARGO_HORA_EXTRA * horasExtras);
};

const semestreDe = (mes: number): 1 | 2 => (mes <= 6 ? 1 : 2);

/** Primer y último día (inclusive) del semestre `sem` de `anio`. */
/** Bordes del semestre como fechas civiles. No son instantes. */
const rangoSemestre = (
  anio: number,
  sem: 1 | 2
): { desde: string; hasta: string } =>
  sem === 1
    ? { desde: `${anio}-01-01`, hasta: `${anio}-06-30` }
    : { desde: `${anio}-07-01`, hasta: `${anio}-12-31` };

/**
 * Fracción del semestre trabajada (Art. 121 LCT: el SAC se calcula
 * proporcional al tiempo trabajado si no se estuvo todo el semestre).
 * Si no hay fecha de ingreso o es anterior al semestre, se asume completo.
 */
const fraccionSemestreTrabajada = (
  fechaIngresoISO: string | undefined,
  anio: number,
  sem: 1 | 2
): number => {
  if (!fechaIngresoISO) return 1;
  // Comparación de fechas civiles como strings: "YYYY-MM-DD" ordena
  // lexicográficamente igual que cronológicamente, y no hay ningún huso
  // de por medio. Antes esto construía `Date` locales y restaba
  // milisegundos.
  const { desde, hasta } = rangoSemestre(anio, sem);
  if (fechaIngresoISO <= desde) return 1;
  if (fechaIngresoISO > hasta) return 0;
  const diasSemestre = diasEntre(desde, hasta);
  const diasTrabajados = diasEntre(fechaIngresoISO, hasta);
  return Math.max(0, Math.min(1, diasTrabajados / diasSemestre));
};

export interface Aumento {
  periodo: string;
  desde: number;
  hasta: number;
  pct: number;
}

export interface AnalisisSalarial {
  /** Ordenadas ascendente por período. */
  ordenadas: Remuneracion[];
  ultima?: Remuneracion;
  /** Variación % del último bruto contra el anterior. */
  variacionPct?: number;
  /** Mejor remuneración bruta del semestre en curso. */
  mejorSemestreBruto: number;
  /** SAC estimado = mejor bruto del semestre / 2. */
  aguinaldoEstimado: number;
  /** Aumentos detectados (bruto que sube), más recientes primero. */
  aumentos: Aumento[];
}

export const analizarSalario = (
  remuneraciones: Remuneracion[],
  /**
   * Día de negocio sobre el que se mira el semestre, como "YYYY-MM-DD".
   *
   * Era un `Date` que por defecto salía del reloj del dispositivo, y el
   * semestre se leía con `getMonth()`: el 30 de junio a las 21:00 de
   * Buenos Aires una máquina en otro huso ya estaba en julio y el mejor
   * bruto se buscaba en el semestre equivocado.
   */
  hoy: string = hoyISO(),
  /** Para prorratear el aguinaldo si ingresó a mitad de semestre. */
  fechaIngreso?: string
): AnalisisSalarial => {
  // El SAC y otros conceptos puntuales no son "sueldo mes a mes": si se
  // los deja adentro, un aguinaldo generado aparece como un aumento (o una
  // baja) enorme en la evolución salarial. Solo lo mensual cuenta acá.
  const mensuales = remuneraciones.filter(
    (r) => (r.tipo ?? 'mensual') === 'mensual'
  );
  const ordenadas = [...mensuales].sort((a, b) =>
    a.periodo.localeCompare(b.periodo)
  );
  const ultima = ordenadas[ordenadas.length - 1];
  const anterior = ordenadas[ordenadas.length - 2];
  const variacionPct =
    ultima && anterior && anterior.montoBruto > 0
      ? ((ultima.montoBruto - anterior.montoBruto) / anterior.montoBruto) * 100
      : undefined;

  const anio = Number(hoy.slice(0, 4));
  const sem = semestreDe(Number(hoy.slice(5, 7)));
  const mejorSemestreBruto = ordenadas
    .filter((r) => {
      const [a, m] = r.periodo.split('-').map(Number);
      return a === anio && semestreDe(m) === sem;
    })
    .reduce((max, r) => Math.max(max, r.montoBruto), 0);

  const aumentos: Aumento[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const desde = ordenadas[i - 1].montoBruto;
    const hasta = ordenadas[i].montoBruto;
    if (hasta > desde && desde > 0) {
      aumentos.push({
        periodo: ordenadas[i].periodo,
        desde,
        hasta,
        pct: ((hasta - desde) / desde) * 100,
      });
    }
  }

  const fraccion = fraccionSemestreTrabajada(fechaIngreso, anio, sem);

  return {
    ordenadas,
    ultima,
    variacionPct,
    mejorSemestreBruto,
    aguinaldoEstimado: Math.round((mejorSemestreBruto / 2) * fraccion),
    aumentos: aumentos.reverse(),
  };
};

export interface FilaMasa {
  empleadoId: string;
  bruto: number;
  neto: number;
  periodo: string;
}

export interface ResumenMasa {
  cantidad: number;
  masaSalarialBruta: number;
  cargasSociales: number;
  costoTotal: number;
  costoPromedio: number;
  porEmpleado: FilaMasa[];
}

/**
 * Resume la masa salarial tomando la última remuneración de cada empleado.
 * `cargasPatronalesPct` permite usar el % que cada empresa configuró
 * (Configuración → Remuneraciones); si no se pasa, usa la estimación
 * genérica.
 */
export const resumirMasa = (
  remuneraciones: Remuneracion[],
  cargasPatronalesPct: number = CARGAS_PATRONALES
): ResumenMasa => {
  // La masa salarial "recurrente" es el sueldo mensual; el SAC u otros
  // conceptos puntuales no deben quedar como "el último sueldo" de
  // alguien y disparar el costo mensual estimado para siempre.
  const mensuales = remuneraciones.filter(
    (r) => (r.tipo ?? 'mensual') === 'mensual'
  );
  const ultimaPorEmpleado = new Map<string, Remuneracion>();
  for (const r of mensuales) {
    const prev = ultimaPorEmpleado.get(r.empleadoId);
    if (!prev || r.periodo > prev.periodo)
      ultimaPorEmpleado.set(r.empleadoId, r);
  }
  const lista = [...ultimaPorEmpleado.values()];
  const masa = lista.reduce((a, r) => a + r.montoBruto, 0);
  const cargas = masa * cargasPatronalesPct;
  const costoTotal = masa + cargas;

  return {
    cantidad: lista.length,
    masaSalarialBruta: masa,
    cargasSociales: cargas,
    costoTotal,
    costoPromedio: lista.length ? costoTotal / lista.length : 0,
    porEmpleado: lista
      .map((r) => ({
        empleadoId: r.empleadoId,
        bruto: r.montoBruto,
        neto: r.montoNeto,
        periodo: r.periodo,
      }))
      .sort((a, b) => b.bruto - a.bruto),
  };
};

/** "YYYY-06" o "YYYY-12": el período en que se liquida el SAC de ese semestre. */
export const periodoDeSemestre = (anio: number, sem: 1 | 2): string =>
  sem === 1 ? `${anio}-06` : `${anio}-12`;

/**
 * Modalidades de contratación bajo relación de dependencia: cobran SAC.
 * Monotributistas y pasantes, por su régimen, habitualmente no.
 */
export const MODALIDADES_CON_AGUINALDO = [
  'indeterminado',
  'plazo_fijo',
  'eventual',
] as const;

/** Ya se generó el SAC de ese semestre para este empleado (evita duplicar sin querer). */
export const yaTieneSacDelSemestre = (
  remuneraciones: Remuneracion[],
  empleadoId: string,
  anio: number,
  sem: 1 | 2
): boolean =>
  remuneraciones.some(
    (r) =>
      r.empleadoId === empleadoId &&
      r.tipo === 'sac' &&
      r.periodo === periodoDeSemestre(anio, sem)
  );
