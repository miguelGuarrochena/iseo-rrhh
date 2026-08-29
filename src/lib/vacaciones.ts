/**
 * Cálculo de días de vacaciones según LCT art. 150 (Argentina).
 * La antigüedad se computa al 31/12 del año en cuestión.
 */

import {
  aniosCumplidos,
  aniversarioDe,
  diaSemanaEmpresa,
  diasEntre,
  diasHabilesEntre,
  diferenciaEnDias,
  sumarDiasEmpresa,
} from '@/lib/fechas';
import type { Ausencia, Empresa } from '@/types/rrhh';

/**
 * En qué unidad cuenta las vacaciones una empresa.
 *
 * `corridos` es el default y es lo que dice la LCT (art. 150): los días
 * de vacaciones son corridos, fines de semana incluidos. Algunas
 * empresas otorgan **hábiles**, que es más generoso —14 hábiles son unos
 * 20 corridos de ausencia real— y por eso es legal: la ley fija un piso,
 * no un techo.
 *
 * La unidad afecta dos cosas distintas y conviene no confundirlas:
 *
 *  - **El cupo y el consumo.** Los dos van en la misma unidad, así que
 *    la resta cierra sola: quien tiene 14 hábiles y se toma dos semanas
 *    consume 10 y le quedan 4.
 *  - **La plata.** El art. 155 calcula la retribución como
 *    `sueldo ÷ 25 × días`, y esos días son **corridos**. Multiplicar
 *    días hábiles por ese valor paga de menos, porque la persona está
 *    ausente más días de los que se le descontaron del cupo.
 */
export type UnidadVacaciones = 'corridos' | 'habiles';

/** La unidad que usa una empresa. Sin configurar, corridos (LCT). */
export const unidadVacacionesDe = (
  config?: Pick<Empresa['config'], 'vacacionesDiasHabiles'> | null
): UnidadVacaciones => (config?.vacacionesDiasHabiles ? 'habiles' : 'corridos');

export const UNIDAD_VACACIONES_LABELS: Record<UnidadVacaciones, string> = {
  corridos: 'días corridos',
  habiles: 'días hábiles',
};

/**
 * Pasa una cantidad de días a **corridos**, que es la unidad en la que
 * el art. 155 calcula la plata.
 *
 * Cinco días hábiles cubren una semana corrida, de ahí el 7/5. Es una
 * aproximación —no mira qué día de la semana arranca ni los feriados—
 * pero es la que corresponde para estimar un monto sobre días que
 * todavía no se tomaron y por lo tanto no tienen fechas.
 */
export const aDiasCorridos = (
  dias: number,
  unidad: UnidadVacaciones
): number => (unidad === 'habiles' ? (dias * 7) / 5 : dias);

/**
 * Tramos de antigüedad del art. 150. Los nombres son los cortes de la
 * ley: menos de 5 años, de 5 a 10, de 10 a 20, más de 20.
 */
export interface EscalaVacaciones {
  hasta5: number;
  hasta10: number;
  hasta20: number;
  masDe20: number;
}

/** El mínimo legal, en días corridos (LCT art. 150). */
export const ESCALA_LCT: EscalaVacaciones = {
  hasta5: 14,
  hasta10: 21,
  hasta20: 28,
  masDe20: 35,
};

export const TRAMOS_VACACIONES: {
  clave: keyof EscalaVacaciones;
  etiqueta: string;
}[] = [
  { clave: 'hasta5', etiqueta: 'Menos de 5 años' },
  { clave: 'hasta10', etiqueta: 'De 5 a 10 años' },
  { clave: 'hasta20', etiqueta: 'De 10 a 20 años' },
  { clave: 'masDe20', etiqueta: 'Más de 20 años' },
];

/**
 * El piso legal expresado en la unidad que usa la empresa.
 *
 * En hábiles el mínimo baja a 10/15/20/25, que **no** es dar menos: 10
 * hábiles cubren los mismos 14 días corridos de ausencia. Por eso se
 * redondea hacia arriba — quedarse corto sí sería dar menos que la ley.
 */
export const escalaMinima = (unidad: UnidadVacaciones): EscalaVacaciones => {
  if (unidad === 'corridos') return ESCALA_LCT;
  const aHabiles = (corridos: number) => Math.ceil((corridos * 5) / 7);
  return {
    hasta5: aHabiles(ESCALA_LCT.hasta5),
    hasta10: aHabiles(ESCALA_LCT.hasta10),
    hasta20: aHabiles(ESCALA_LCT.hasta20),
    masDe20: aHabiles(ESCALA_LCT.masDe20),
  };
};

/**
 * La escala que usa una empresa.
 *
 * En **días corridos** siempre es la de la ley y no se puede tocar: es el
 * régimen por defecto y la LCT ya define exactamente cuántos días
 * corresponden por antigüedad. No hay nada que acordar.
 *
 * En **días hábiles** la empresa está saliendo del esquema legal para dar
 * algo mejor, y ahí sí elige la cantidad: arranca en el equivalente al
 * mínimo (10/15/20/25) y puede subirla a lo que haya arreglado.
 */
export const escalaDe = (
  config?: Pick<
    Empresa['config'],
    'vacacionesDiasHabiles' | 'vacacionesEscala'
  > | null
): EscalaVacaciones => {
  const unidad = unidadVacacionesDe(config);
  if (unidad === 'corridos') return ESCALA_LCT;
  return { ...escalaMinima('habiles'), ...(config?.vacacionesEscala ?? {}) };
};

/**
 * Valida una escala contra el piso legal.
 *
 * Devuelve un mensaje por tramo que esté por debajo. En régimen
 * simplificado no valida nada: un monotributista no está en relación de
 * dependencia y la LCT no le fija vacaciones, así que lo que se cargue
 * es lo que se haya acordado.
 */
export const erroresDeEscala = (
  escala: EscalaVacaciones,
  unidad: UnidadVacaciones,
  regimen?: string
): Partial<Record<keyof EscalaVacaciones, string>> => {
  if (regimen === 'simplificado') return {};
  const minima = escalaMinima(unidad);
  const errores: Partial<Record<keyof EscalaVacaciones, string>> = {};
  for (const { clave, etiqueta } of TRAMOS_VACACIONES) {
    const valor = escala[clave];
    if (!Number.isFinite(valor) || valor < minima[clave]) {
      errores[clave] =
        `${etiqueta}: la ley exige al menos ${minima[clave]} ${UNIDAD_VACACIONES_LABELS[unidad]} (art. 150 LCT).`;
    }
  }
  return errores;
};

// ============================================================
// RÉGIMEN LEGAL — LCT arts. 150 a 153, en DÍAS CORRIDOS
//
// Todo lo que sigue hasta el próximo bloque es el régimen legal y sólo
// se usa cuando la empresa cuenta en días corridos. La modalidad de días
// hábiles de ISEO RH es otra cosa y vive más abajo, sin tocar.
//
// Sobre una confusión que este archivo tenía incorporada: el art. 151
// mide el REQUISITO en días hábiles, y el art. 150 mide la DURACIÓN en
// días corridos. Que el requisito se cuente en hábiles no convierte a
// las vacaciones legales en "vacaciones por días hábiles".
// ============================================================

/**
 * Ausencias que NO se computan como tiempo trabajado para el art. 151.
 *
 * Hoy está vacía, y no por olvido.
 *
 * El art. 152 manda computar como trabajados los días de licencia legal o
 * convencional, enfermedad inculpable, infortunio de trabajo "y otras
 * causas no imputables al trabajador". O sea que lo que hay que enumerar
 * son las EXCEPCIONES, no lo que cuenta. Y repasando los tipos que ISEO
 * RH modela hoy —vacaciones, enfermedad, estudio, mudanza, fallecimiento,
 * especial, casamiento, donación de sangre, exámenes, home office y las
 * tres parciales de entrada/salida— todos son licencia legal o
 * convencional, o directamente días trabajados. Ninguno le es imputable
 * al trabajador.
 *
 * La excepción típica sería la licencia sin goce de sueldo, que se otorga
 * a pedido de la persona. ISEO RH no la modela: no existe en
 * `TipoAusencia` ni en el enum `tipo_ausencia` de la base. Si algún día
 * se agrega, éste es el único lugar donde hay que nombrarla.
 *
 * Esta lista existe SÓLO para el cálculo legal de vacaciones. No cambia
 * cómo ISEO RH trata las ausencias en ningún otro lado.
 */
export const AUSENCIAS_NO_COMPUTABLES_ART_152 = new Set<string>();

/**
 * Días hábiles a los efectos del art. 151.
 *
 * Son los días en que la persona debía prestar servicios: de lunes a
 * viernes. **Los feriados cuentan**, porque en un feriado el trabajador
 * normalmente debería trabajar y es la ley la que lo libera — no es un
 * día que él no haya prestado servicios.
 *
 * Es deliberadamente distinta de `diasHabilesEntre`, que sí descuenta
 * feriados: esa se usa para contar días de vacaciones en la modalidad de
 * días hábiles, y ahí un feriado adentro del período efectivamente no se
 * consume. Dos preguntas distintas, dos funciones distintas.
 *
 * Lunes a viernes, fijo. Hubo un parámetro `sinPrestacion` para excluir
 * los días que esa persona en particular no trabajaba, pero no lo usaba
 * ningún llamador y la función SQL espejo, `dias_habiles_art151`, ni
 * siquiera lo tenía: el primero que lo hubiera usado habría hecho que la
 * pantalla y la base calcularan cupos distintos. Las jornadas de seis
 * días son una decisión de negocio pendiente y se resuelve en los dos
 * lados a la vez, no con un parámetro suelto de un solo lado.
 */
export const diasHabilesArt151 = (desde: string, hasta: string): number => {
  if (hasta < desde) return 0;
  let n = 0;
  let cur = desde;
  // Cota de seguridad: un rango mal armado no puede colgar el cálculo.
  for (let i = 0; cur <= hasta && i < 800; i += 1) {
    const dia = diaSemanaEmpresa(cur);
    if (dia !== 0 && dia !== 6) n += 1;
    cur = sumarDiasEmpresa(cur, 1);
  }
  return n;
};

/** Datos con los que se resuelve el derecho legal de un año. */
export interface DatosVacacionesLegales {
  /**
   * El período de prestación de servicios, completo.
   *
   * Los dos extremos van juntos y `fechaBaja` NO es opcional: hay que
   * escribir `undefined` a propósito. Es incómodo aposta.
   *
   * El bug D-01 fue exactamente esto: la baja era opcional, un caller la
   * omitió, y durante un tiempo la base y la pantalla calcularon cupos
   * distintos para el mismo legajo. Con la propiedad obligatoria, olvidarla
   * no compila — quien no la tenga a mano escribe `undefined` y queda a la
   * vista en el diff que se tomó esa decisión.
   *
   * Del lado de la base el mismo problema se resolvió al revés y por la
   * misma razón: `vacaciones_legales_corridas` dejó de recibir campos
   * sueltos del legajo y los lee ella misma.
   */
  fechaIngreso: string;
  /** Baja, o `undefined` si sigue trabajando. */
  fechaBaja: string | undefined;
  /** Año calendario cuyo derecho se calcula. */
  anio: number;
  /**
   * Ausencias de la persona. Sólo se miran para descontar las que el
   * art. 152 NO manda computar; el resto cuenta como trabajado.
   */
  ausencias?: Pick<Ausencia, 'tipo' | 'estado' | 'fechaDesde' | 'fechaHasta'>[];
  /**
   * Tipos de ausencia que no se computan como trabajados. Por defecto,
   * los de `AUSENCIAS_NO_COMPUTABLES_ART_152` — hoy, ninguno.
   *
   * A diferencia del `sinPrestacion` que se sacó de acá, esto SÍ tiene
   * espejo en la base: `tipos_ausencia_no_computables_art152()`. Se deja
   * inyectable para poder probar la maquinaria sin inventar un tipo que
   * no existe en el producto.
   */
  noComputables?: Set<string>;
}

/**
 * Días hábiles del año en los que la persona prestó servicios, computados
 * según los arts. 151 y 152.
 *
 * Es el numerador del requisito del art. 151 y también la base del
 * proporcional del art. 153, que manda contar "según la forma prevista en
 * el artículo 151".
 */
export const diasTrabajadosArt151 = (datos: DatosVacacionesLegales): number => {
  const inicioAnio = `${datos.anio}-01-01`;
  const cierre = `${datos.anio}-12-31`;
  const desde =
    datos.fechaIngreso > inicioAnio ? datos.fechaIngreso : inicioAnio;
  const hasta =
    datos.fechaBaja && datos.fechaBaja < cierre ? datos.fechaBaja : cierre;
  if (hasta < desde) return 0;

  const habiles = diasHabilesArt151(desde, hasta);

  // Art. 152: sólo se descuentan las ausencias que le son imputables.
  const excluidos = datos.noComputables ?? AUSENCIAS_NO_COMPUTABLES_ART_152;
  const noComputables = (datos.ausencias ?? []).filter(
    (a) => a.estado === 'aprobada' && excluidos.has(a.tipo)
  );
  const descontar = noComputables.reduce((acc, a) => {
    const ini = a.fechaDesde > desde ? a.fechaDesde : desde;
    const fin = a.fechaHasta < hasta ? a.fechaHasta : hasta;
    return acc + diasHabilesArt151(ini, fin);
  }, 0);

  return Math.max(0, habiles - descontar);
};

/**
 * Art. 151: ¿prestó servicios la mitad, como mínimo, de los días hábiles
 * del año?
 *
 * "Como mínimo" es literal: la mitad exacta alcanza. Se compara
 * duplicando en vez de dividiendo para no arrastrar un decimal en el
 * borde, que es justo donde se decide entre el período completo y el
 * proporcional.
 */
export const cumpleRequisitoArt151 = (
  datos: DatosVacacionesLegales
): boolean => {
  const delAnio = diasHabilesArt151(
    `${datos.anio}-01-01`,
    `${datos.anio}-12-31`
  );
  if (delAnio === 0) return false;
  return diasTrabajadosArt151(datos) * 2 >= delAnio;
};

/**
 * Art. 153: un día de descanso por cada veinte de trabajo efectivo.
 *
 * Sin regla de tres contra 14/21/28/35 y sin proporción sobre medio año:
 * el artículo fija una razón fija de 1 a 20 y se trunca, porque no hay
 * fracciones de día de descanso.
 */
export const diasProporcionalesArt153 = (diasTrabajoEfectivo: number): number =>
  Math.max(0, Math.floor(diasTrabajoEfectivo / 20));

/**
 * Art. 150: el tramo que corresponde según la antigüedad al 31/12.
 *
 *   hasta 5 años (inclusive)   → 14 días corridos
 *   más de 5 y hasta 10        → 21
 *   más de 10 y hasta 20       → 28
 *   más de 20                  → 35
 *
 * Los cortes son "más de N", no "N o más", y ahí estaba el error: quien
 * cumple exactamente cinco años el 31/12 todavía está en el primer
 * tramo. `aniosCumplidos` no alcanza para distinguirlo —da 5 tanto con
 * cinco años justos como con cinco años y un día— así que se mira si el
 * aniversario ya QUEDÓ ATRÁS al cierre.
 */
export const tramoLegalArt150 = (
  fechaIngreso: string,
  cierre: string
): number => {
  const superaAnios = (n: number) => aniversarioDe(fechaIngreso, n) < cierre;
  if (!superaAnios(5)) return ESCALA_LCT.hasta5;
  if (!superaAnios(10)) return ESCALA_LCT.hasta10;
  if (!superaAnios(20)) return ESCALA_LCT.hasta20;
  return ESCALA_LCT.masDe20;
};

/**
 * Días de vacaciones que le corresponden por LEY a una persona en un año,
 * en días corridos (LCT arts. 150 a 153).
 *
 * Qué cambió respecto de la implementación anterior
 * -------------------------------------------------
 * 1. El requisito del art. 151 se resolvía con `dias / 365,25 < 0,5`, o
 *    sea "medio año de calendario". La ley no dice eso: dice la mitad de
 *    los DÍAS HÁBILES del año. Para quien entra a mitad de año los dos
 *    criterios no coinciden.
 * 2. Los tramos del art. 150 usaban `< 5`, `< 10`, `< 20`, con lo que la
 *    antigüedad exacta caía en el tramo de arriba. La ley dice "hasta"
 *    cinco años, no "menos de".
 * 3. El proporcional del art. 153 se calculaba sobre días de calendario.
 *    El artículo manda contarlos "según la forma prevista en el artículo
 *    151", que son días hábiles computables.
 *
 * No decide nada sobre cómo se GOZAN las vacaciones —fechas, acuerdo,
 * fraccionamiento, acumulación— que es otro asunto y no se toca acá.
 */
export const calcularVacacionesLegalesCorridas = (
  datos: DatosVacacionesLegales
): number => {
  const cierre = `${datos.anio}-12-31`;
  if (datos.fechaIngreso > cierre) return 0;

  if (cumpleRequisitoArt151(datos)) {
    return tramoLegalArt150(datos.fechaIngreso, cierre);
  }
  return diasProporcionalesArt153(diasTrabajadosArt151(datos));
};

// ============================================================
// MODALIDAD PROPIA — DÍAS HÁBILES
//
// Fuera del régimen legal: es un esquema más generoso que algunas
// empresas acuerdan. Su cálculo NO se toca.
// ============================================================

/**
 * Días que le corresponden a una persona en un año, en la modalidad de
 * DÍAS HÁBILES de ISEO RH.
 *
 * Es la implementación que había, sin un solo cambio de fórmula ni de
 * umbral. Antes esta misma función servía a las dos modalidades, y por
 * eso arreglar el régimen legal habría movido también los números de
 * ésta. Están separadas justamente para que eso no pase.
 *
 * El umbral de medio año por división (`/ 365,25 < 0,5`) y el
 * proporcional sobre días de calendario se conservan tal cual: son la
 * regla de esta modalidad, y cambiarla es una decisión del negocio, no
 * un arreglo.
 */
export const calcularVacacionesDiasHabiles = (
  fechaIngreso: string,
  anio: number,
  escala: EscalaVacaciones
): number => {
  const cierre = `${anio}-12-31`;
  if (fechaIngreso > cierre) return 0;

  const diasTrabajados = diferenciaEnDias(fechaIngreso, cierre);
  const antiguedadAnios = aniosCumplidos(fechaIngreso, cierre);

  if (diasTrabajados / 365.25 < 0.5) {
    return Math.floor(diasTrabajados / 20);
  }
  if (antiguedadAnios < 5) return escala.hasta5;
  if (antiguedadAnios < 10) return escala.hasta10;
  if (antiguedadAnios < 20) return escala.hasta20;
  return escala.masDe20;
};

/**
 * Punto de entrada único: resuelve el derecho del año según la modalidad
 * que tenga configurada la empresa.
 *
 * Existe para que ningún llamador tenga que acordarse de elegir el
 * camino. Antes había una sola función para las dos modalidades y la
 * diferencia se colaba por el parámetro `escala`, que no dice cuál es el
 * régimen: una escala de 14/21/28/35 podía ser legal o una empresa de
 * hábiles que acordó esos números.
 */
export const diasVacacionesCorresponden = (
  datos: DatosVacacionesLegales & {
    config?: Pick<
      Empresa['config'],
      'vacacionesDiasHabiles' | 'vacacionesEscala'
    > | null;
  }
): number =>
  unidadVacacionesDe(datos.config) === 'habiles'
    ? calcularVacacionesDiasHabiles(
        datos.fechaIngreso,
        datos.anio,
        escalaDe(datos.config)
      )
    : calcularVacacionesLegalesCorridas(datos);

/**
 * Días de vacaciones ya gozados en un año concreto.
 *
 * El año importa y no siempre es el corriente: la liquidación final
 * calcula lo que corresponde sobre el año de la **fecha de baja**, así
 * que los días ya tomados tienen que ser de ese mismo año.
 *
 * Rangos que cruzan año nuevo se parten por calendario (BUG-012 / mig 68),
 * no se imputan enteros al año de `fechaDesde`.
 */
export const diasVacacionesDeRangoEnAnio = (
  fechaDesde: string,
  fechaHasta: string,
  anio: number | string,
  opciones: { habiles?: boolean; feriados?: Set<string> } = {}
): number => {
  const y = Number(anio);
  const yearStart = `${y}-01-01`;
  const yearEnd = `${y}-12-31`;
  const ini = fechaDesde > yearStart ? fechaDesde : yearStart;
  const fin = fechaHasta < yearEnd ? fechaHasta : yearEnd;
  if (fin < ini) return 0;
  if (opciones.habiles) {
    return diasHabilesEntre(ini, fin, opciones.feriados);
  }
  return diasEntre(ini, fin);
};

export const diasVacacionesGozadosEn = (
  ausencias: Ausencia[],
  anio: number | string,
  opciones: { habiles?: boolean; feriados?: Set<string> } = {}
): number =>
  ausencias
    .filter((a) => a.tipo === 'vacaciones' && a.estado === 'aprobada')
    .reduce(
      (acc, a) =>
        acc +
        diasVacacionesDeRangoEnAnio(a.fechaDesde, a.fechaHasta, anio, opciones),
      0
    );
