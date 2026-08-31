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

/**
 * Base sobre la que se aportan los 17%.
 *
 * El art. 9 de la Ley 24.241 fija un tope: por encima de esa base no se
 * aporta. Sin él, un sueldo alto quedaba con una retención mayor que la
 * legal, y el neto que la app le mostraba al empleado era más bajo que el
 * que iba a cobrar.
 *
 * El tope no se cablea: ANSES lo actualiza cada trimestre y una constante
 * en el código queda vieja sola. Viene de `config.topeImponibleAportes`,
 * y mientras nadie lo cargue no se aplica tope — que es exactamente lo
 * que la app hacía antes, así que ninguna empresa cambia de número por
 * este cambio.
 */
export const baseImponibleAportes = (
  remunerativo: number,
  topeImponible?: number
): number => {
  const base = Math.max(0, remunerativo);
  if (!topeImponible || topeImponible <= 0) return base;
  return Math.min(base, topeImponible);
};

/** Aportes personales estimados sobre el sueldo remunerativo. */
export const calcularAportes = (
  remunerativo: number,
  topeImponible?: number
): number =>
  Math.round(baseImponibleAportes(remunerativo, topeImponible) * APORTES_TOTAL);

/**
 * Tope de las deducciones sobre la remuneración en dinero (art. 133 LCT).
 *
 * "Las deducciones, retenciones o compensaciones no podrán insumir en
 * conjunto más del veinte por ciento (20%) del monto total de la
 * remuneración en dinero". No incluye los aportes de ley, que son
 * retenciones de la seguridad social y no deducciones del empleador.
 */
export const LIMITE_DESCUENTOS_PCT = 0.2;

/**
 * Tope del adelanto de remuneraciones (art. 130 LCT): hasta el 50% de las
 * remuneraciones correspondientes a no más de un período de pago.
 */
export const LIMITE_ADELANTO_PCT = 0.5;

/** La remuneración en dinero del período, que es la base del art. 133. */
const remuneracionEnDinero = (montoBruto: number, noRemunerativo = 0): number =>
  Math.max(0, montoBruto) + Math.max(0, noRemunerativo);

/**
 * Qué límite rompe una liquidación, si rompe alguno.
 *
 * Devuelve el mensaje listo para mostrar, o `null` si está todo bien. La
 * app no tenía ningún control: se podía guardar un descuento mayor al
 * sueldo y el único freno era la constraint de Postgres, que aparecía
 * como "violates check constraint" y no le decía nada a quien cargaba.
 */
export const errorDeLimitesLiquidacion = (d: {
  montoBruto: number;
  noRemunerativo?: number;
  otrosDescuentos?: number;
  aportes?: number;
  /**
   * El colaborador tiene un embargo judicial u otra deducción
   * autorizada cargada.
   *
   * Cambia el tope del art. 133 de bloqueo a advertencia. No lo elimina:
   * `advertenciaDeLimiteDescuentos` lo sigue informando, y el neto
   * negativo se sigue frenando porque eso no es un tope legal sino una
   * cuenta que no cierra.
   */
  conEmbargo?: boolean;
}): string | null => {
  const enDinero = remuneracionEnDinero(d.montoBruto, d.noRemunerativo);
  const descuentos = Math.max(0, d.otrosDescuentos ?? 0);
  if (descuentos === 0) return null;

  const neto = enDinero - (d.aportes ?? 0) - descuentos;
  if (neto < 0) {
    return 'Los descuentos superan lo que se le paga en el período: el neto quedaría negativo.';
  }

  /*
   * Con embargo, pasar el 20% deja de ser un error.
   *
   * El art. 120 de la LCT y el decreto 484/87 le dan al embargo judicial
   * su propia escala sobre el salario mínimo, así que el tope general
   * del art. 133 no es la regla que manda en ese caso. Bloquear ahí
   * dejaba a RRHH sin poder cargar la liquidación de una persona
   * embargada, que es exactamente el caso donde más importa cargarla
   * bien.
   */
  if (d.conEmbargo) return null;

  const tope = enDinero * LIMITE_DESCUENTOS_PCT;
  if (descuentos > tope) {
    const pct = enDinero > 0 ? Math.round((descuentos / enDinero) * 100) : 100;
    return `Los descuentos son el ${pct}% de la remuneración del período y el art. 133 de la LCT permite hasta el 20%.`;
  }
  return null;
};

/**
 * El aviso que acompaña a la liquidación: qué mirar sin que nada frene.
 *
 * Existe aparte de `errorDeLimitesLiquidacion` porque son dos preguntas
 * distintas: aquélla responde "¿puedo guardar?", ésta "¿hay algo que
 * conviene que sepas?". Con embargo, la segunda dice que sí y la primera
 * deja pasar.
 */
export const advertenciaDeLimiteDescuentos = (d: {
  montoBruto: number;
  noRemunerativo?: number;
  otrosDescuentos?: number;
  conEmbargo?: boolean;
}): string | null => {
  const enDinero = remuneracionEnDinero(d.montoBruto, d.noRemunerativo);
  const descuentos = Math.max(0, d.otrosDescuentos ?? 0);
  if (descuentos === 0 || enDinero <= 0) return null;

  const tope = enDinero * LIMITE_DESCUENTOS_PCT;
  if (descuentos <= tope) return null;

  const pct = Math.round((descuentos / enDinero) * 100);
  if (d.conEmbargo) {
    return `Este colaborador tiene un embargo judicial registrado. Los descuentos son el ${pct}% de la remuneración del período, por encima del 20% del art. 133 de la LCT: podés guardar igual porque el embargo tiene su propia escala (decreto 484/87), pero revisá que el importe coincida con el oficio judicial.`;
  }
  return `Los descuentos son el ${pct}% de la remuneración del período y el art. 133 de la LCT permite hasta el 20%.`;
};

/**
 * Qué límite rompe un adelanto, si rompe alguno (art. 130 LCT).
 *
 * `remuneracionDelPeriodo` es el último bruto conocido de esa persona. Sin
 * él —alguien sin ninguna remuneración cargada— no se puede afirmar nada
 * y no se frena: inventar un tope sobre un sueldo que no conocemos sería
 * peor que no controlarlo.
 */
export const errorDeLimiteAdelanto = (
  monto: number,
  remuneracionDelPeriodo?: number
): string | null => {
  if (monto <= 0) return 'El monto del adelanto tiene que ser mayor a cero.';
  if (!remuneracionDelPeriodo || remuneracionDelPeriodo <= 0) return null;
  const tope = remuneracionDelPeriodo * LIMITE_ADELANTO_PCT;
  if (monto > tope) {
    const pct = Math.round((monto / remuneracionDelPeriodo) * 100);
    return `El adelanto es el ${pct}% del sueldo del período y el art. 130 de la LCT permite hasta el 50%.`;
  }
  return null;
};

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
 *
 * **Es un neto estimado, no una liquidación.** Los aportes son los tres de
 * ley con su tope, pero acá no hay retención de Ganancias ni aportes
 * convencionales: la app no tiene los datos para calcularlos y no los
 * inventa. Quien muestre este número tiene que decir que es estimado.
 */
export const calcularLiquidacion = (d: {
  montoBruto: number;
  noRemunerativo?: number;
  otrosDescuentos?: number;
  regimen?: RegimenLaboral;
  /** Tope de la base imponible del período (art. 9 Ley 24.241). */
  topeImponible?: number;
}): { aportes: number; neto: number } => {
  const aportes = tieneAportesDeLey(d.regimen)
    ? calcularAportes(d.montoBruto, d.topeImponible)
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

/**
 * Los dos recargos del art. 201 de la LCT.
 *
 * El 50% es el de los días comunes; el 100% el de sábado después de las
 * 13, domingos y feriados.
 *
 * **Cuál de los dos aplica no lo decide el sistema.** Trabajar un sábado
 * no implica por sí mismo recargo: hay actividades —gastronomía, por
 * ejemplo— donde el sábado es jornada normal. Quién carga las horas dice
 * cuántas van a cada recargo; acá sólo se multiplica.
 */
export const RECARGO_EXTRA_50 = 1.5;
export const RECARGO_EXTRA_100 = 2;

/**
 * Alias histórico del recargo del 50%. Se conserva porque lo importan
 * pantallas y tests; `RECARGO_EXTRA_50` es el nombre que dice cuál es.
 */
export const RECARGO_HORA_EXTRA = RECARGO_EXTRA_50;

/**
 * Valor de la hora normal: el bruto dividido por las horas del mes.
 *
 * `horasMensuales` sale de la configuración de la empresa porque no toda
 * jornada son 192 horas: hay convenios con otra base.
 */
export const valorHora = (
  montoBruto: number,
  horasMensuales: number = HORAS_MENSUALES
): number =>
  montoBruto > 0 && horasMensuales > 0 ? montoBruto / horasMensuales : 0;

/**
 * Valor a pagar por las horas extras del período, al 50%.
 *
 * Es una sugerencia, no una liquidación: no contempla los adicionales
 * del convenio, que cambian la base de cálculo. Para separar las del
 * 100% está `valorHorasExtrasPorRecargo`.
 */
export const valorHorasExtras = (
  montoBruto: number,
  horasExtras: number,
  horasMensuales: number = HORAS_MENSUALES
): number => {
  if (montoBruto <= 0 || horasExtras <= 0 || horasMensuales <= 0) return 0;
  return Math.round(
    valorHora(montoBruto, horasMensuales) * RECARGO_EXTRA_50 * horasExtras
  );
};

export interface ExtrasPorRecargo {
  /** Horas al 50%, en pesos. */
  al50: number;
  /** Horas al 100%, en pesos. */
  al100: number;
  total: number;
}

/**
 * Las extras separadas por recargo.
 *
 * Las horas de cada bucket las declara quien liquida. El sistema no
 * clasifica por día de la semana a propósito: ver el comentario de
 * `RECARGO_EXTRA_100`.
 */
export const valorHorasExtrasPorRecargo = (d: {
  montoBruto: number;
  horas50?: number;
  horas100?: number;
  horasMensuales?: number;
}): ExtrasPorRecargo => {
  const hora = valorHora(d.montoBruto, d.horasMensuales ?? HORAS_MENSUALES);
  const h50 = Math.max(0, d.horas50 ?? 0);
  const h100 = Math.max(0, d.horas100 ?? 0);
  const al50 = Math.round(hora * RECARGO_EXTRA_50 * h50);
  const al100 = Math.round(hora * RECARGO_EXTRA_100 * h100);
  return { al50, al100, total: al50 + al100 };
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
