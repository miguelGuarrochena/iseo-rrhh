/**
 * Advertencias: lo que no coincide con la regla legal general pero
 * **no impide registrar**.
 *
 * La diferencia con `requisitos.ts` y con `errores.ts` es el momento y
 * el sujeto. `errores.ts` dice "la acción falló". `requisitos.ts` dice
 * "falta un dato para que esto sirva". Acá la acción sale bien, el dato
 * está, y lo que se señala es que **el caso se aparta de la regla
 * general** — y esa decisión es de RRHH, no del sistema.
 *
 * Por qué avisar y no bloquear: la ley de vacaciones está escrita para
 * favorecer al trabajador, y en una PyME hay flexibilidad práctica real
 * (empezar un miércoles porque conviene, otorgar fuera de temporada de
 * común acuerdo). Bloquear convertiría un derecho del empleado en un
 * impedimento operativo. Informar deja el criterio donde corresponde.
 *
 * Es lógica pura: entra el caso, sale la lista. Sin base y sin React.
 */
import { Ausencia, TipoAusencia } from '@/types/rrhh';
import { diaSemanaEmpresa, diasEntre, sumarDiasEmpresa } from '@/lib/fechas';
import { esNoLaborable } from '@/lib/feriados';
import { TIPOS_AUSENCIA_JORNADA } from '@/lib/etiquetas';

/**
 * Qué tan fuerte es el aviso. Ninguno bloquea: los dos dejan guardar.
 *
 * - `alta`: se aparta de una regla legal expresa. Conviene dejar
 *   asentado por qué se resolvió así.
 * - `media`: conviene mirarlo antes de confirmar, pero la ley admite el
 *   caso o la práctica lo tiene asumido.
 */
export type NivelAdvertencia = 'alta' | 'media';

export interface Advertencia {
  /** Identificador estable, para agrupar y para los tests. */
  clave: string;
  nivel: NivelAdvertencia;
  /** Qué pasa, en una línea. */
  titulo: string;
  /** Por qué se avisa, con el artículo cuando lo hay. */
  detalle: string;
  /**
   * Qué se espera de RRHH. Nunca es "no se puede": siempre es una
   * decisión que la persona puede tomar.
   */
  queHacer: string;
}

// ---------------------------------------------------------------
// Vacaciones
// ---------------------------------------------------------------

/**
 * Ventana legal de otorgamiento (art. 154 LCT): entre el 1 de octubre y
 * el 30 de abril del año siguiente.
 */
export const EPOCA_DESDE_MMDD = '10-01';
export const EPOCA_HASTA_MMDD = '04-30';

/** Anticipación mínima con que hay que comunicar las vacaciones (art. 154). */
export const DIAS_AVISO_VACACIONES = 45;

/**
 * Fracción del período anterior que la ley deja acumular al siguiente
 * (art. 164 LCT): hasta un tercio.
 */
export const FRACCION_ACUMULABLE_ART_164 = 1 / 3;

/** ¿La fecha cae dentro de la época de otorgamiento del art. 154? */
export const enEpocaDeOtorgamiento = (fechaISO: string): boolean => {
  const mmdd = fechaISO.slice(5, 10);
  // La ventana cruza el año nuevo, así que es "desde octubre" O
  // "hasta abril", no un rango cerrado.
  return mmdd >= EPOCA_DESDE_MMDD || mmdd <= EPOCA_HASTA_MMDD;
};

export interface CasoVacaciones {
  /** YYYY-MM-DD */
  fechaDesde: string;
  fechaHasta: string;
  /**
   * Cuándo se está registrando la solicitud. Se pasa explícito para que
   * la función sea pura y los tests no dependan del reloj.
   */
  hoy: string;
  /**
   * Fechas no laborables de la empresa (`YYYY-MM-DD`), para no marcar un
   * lunes feriado como error. Es el mismo `Set` que ya arman el modal de
   * ausencias y `getFeriadosParaCalculo`: se pasa tal cual para no tener
   * dos formas de decir lo mismo.
   */
  feriados?: Set<string>;
}

/**
 * Advertencias de un pedido de vacaciones.
 *
 * Las tres son del art. 151 y 154 de la LCT. Ninguna impide guardar.
 */
export const advertenciasDeVacaciones = (
  caso: CasoVacaciones
): Advertencia[] => {
  const avisos: Advertencia[] = [];
  const { fechaDesde, hoy, feriados = new Set<string>() } = caso;

  /*
   * Art. 151: las vacaciones deben comenzar un día lunes o el siguiente
   * hábil si ése fuera feriado. Por eso un lunes feriado no se marca:
   * arrancar el martes es exactamente lo que dice la ley.
   */
  const dia = diaSemanaEmpresa(fechaDesde);
  const lunesPrevio = sumarDiasEmpresa(fechaDesde, dia === 0 ? -6 : 1 - dia);
  const empiezaLunes = dia === 1;
  const esElHabilSiguienteAUnLunesFeriado =
    !empiezaLunes && esNoLaborable(lunesPrevio, feriados) && dia === 2;

  if (!empiezaLunes && !esElHabilSiguienteAUnLunesFeriado) {
    avisos.push({
      clave: 'vac_no_empieza_lunes',
      nivel: 'media',
      titulo: 'No empieza un lunes',
      detalle:
        'El art. 151 de la LCT dice que las vacaciones tienen que empezar un lunes, o el día hábil siguiente si ese lunes es feriado.',
      queHacer:
        'Podés registrarla igual. En la práctica muchas PyMEs acuerdan otra fecha con el colaborador; si es el caso, dejalo asentado en el comentario.',
    });
  }

  /*
   * Art. 154: la época de otorgamiento va del 1 de octubre al 30 de
   * abril. Fuera de eso hace falta autorización administrativa, que es
   * un trámite y no algo que la app pueda dar por hecho.
   */
  if (!enEpocaDeOtorgamiento(fechaDesde)) {
    avisos.push({
      clave: 'vac_fuera_de_epoca',
      nivel: 'alta',
      titulo: 'Fuera del período legal',
      detalle:
        'El art. 154 de la LCT fija la época de otorgamiento entre el 1 de octubre y el 30 de abril. Otorgarlas fuera de esa ventana requiere autorización administrativa.',
      queHacer:
        'Podés registrarla igual. Si el otorgamiento fuera de época está acordado o autorizado, conviene que quede escrito.',
    });
  }

  /*
   * Art. 154: hay que comunicar el otorgamiento con 45 días de
   * anticipación. Se mide contra el día en que se registra, que es lo
   * único que la app puede saber.
   */
  const anticipacion = diasEntre(hoy, fechaDesde) - 1;
  if (fechaDesde >= hoy && anticipacion < DIAS_AVISO_VACACIONES) {
    avisos.push({
      clave: 'vac_sin_anticipacion',
      nivel: 'media',
      titulo: `Menos de ${DIAS_AVISO_VACACIONES} días de anticipación`,
      detalle: `Se está registrando con ${anticipacion} ${anticipacion === 1 ? 'día' : 'días'} de anticipación y el art. 154 de la LCT pide comunicarlo con ${DIAS_AVISO_VACACIONES}.`,
      queHacer:
        'Podés registrarla igual. Si la comunicación al colaborador ya se hizo antes por otro medio, no hay nada que corregir.',
    });
  }

  return avisos;
};

// ---------------------------------------------------------------
// Vacaciones acumuladas de períodos anteriores
// ---------------------------------------------------------------

export interface CasoAcumulacion {
  /** Días que le corresponden por el período que se está cargando. */
  diasDelPeriodo: number;
  /** Días arrastrados de períodos anteriores que se le suman. */
  diasArrastrados: number;
}

/**
 * Advertencia por acumulación de vacaciones de años anteriores.
 *
 * El art. 164 de la LCT deja acumular a un período de vacaciones **la
 * tercera parte de un período inmediatamente anterior**, y sólo por
 * acuerdo de partes. Nada más: lo que exceda ese tercio, o venga de un
 * período que no es el inmediatamente anterior, ya no es acumulable.
 *
 * El sistema lo detecta y lo dice. No lo bloquea ni recorta los días
 * solo: qué se arrastra y qué caduca lo decide la empresa con el
 * colaborador, y borrarle días a alguien por una regla automática sería
 * peor que avisar.
 */
export const advertenciasDeAcumulacion = (
  caso: CasoAcumulacion
): Advertencia[] => {
  const { diasDelPeriodo, diasArrastrados } = caso;
  if (diasArrastrados <= 0 || diasDelPeriodo <= 0) return [];

  const tope = Math.floor(diasDelPeriodo * FRACCION_ACUMULABLE_ART_164);

  if (diasArrastrados > tope) {
    return [
      {
        clave: 'vac_acumulacion_excedida',
        nivel: 'alta',
        titulo: 'Acumulación por encima del tope legal',
        detalle: `Se están arrastrando ${diasArrastrados} días de períodos anteriores y el art. 164 de la LCT permite acumular hasta un tercio del período inmediatamente anterior — ${tope} ${tope === 1 ? 'día' : 'días'} en este caso.`,
        queHacer:
          'Podés guardarlo igual. Revisá con el colaborador qué parte se acumula por acuerdo y qué parte corresponde gozar antes de que caduque.',
      },
    ];
  }

  return [
    {
      clave: 'vac_acumulacion',
      nivel: 'media',
      titulo: 'Tiene vacaciones de años anteriores',
      detalle: `Arrastra ${diasArrastrados} ${diasArrastrados === 1 ? 'día' : 'días'} de períodos anteriores, dentro del tercio que permite el art. 164.`,
      queHacer:
        'Conviene planificar cuándo se gozan: acumular no las hace caducar, pero se van juntando.',
    },
  ];
};

// ---------------------------------------------------------------
// Licencias que caen en días no laborables
// ---------------------------------------------------------------

/**
 * Licencias que la ley cuenta en días CORRIDOS.
 *
 * Es la lista de tipos que ISEO RH ya cuenta en corridos: todo lo que no
 * son vacaciones (que pueden ir en hábiles si la empresa lo configuró
 * así) ni una parcial de jornada. Se deriva y no se escribe a mano para
 * que agregar un tipo nuevo al enum no deje esta lista vieja.
 */
const esParcialDeJornada = (tipo: TipoAusencia): boolean =>
  (TIPOS_AUSENCIA_JORNADA as TipoAusencia[]).includes(tipo);

export interface CasoLicencia {
  tipo: TipoAusencia;
  fechaDesde: string;
  fechaHasta: string;
  feriados?: Set<string>;
  /** La empresa cuenta las vacaciones en días hábiles. */
  vacacionesEnHabiles?: boolean;
}

/**
 * Advertencia cuando una licencia por días corridos incluye días no
 * laborables (fines de semana o feriados).
 *
 * **No se extiende el período automáticamente.** Contar en corridos es
 * lo que dice la ley, así que el sistema no toca las fechas; lo que hace
 * es avisar, porque a veces el caso concreto amerita revisarlo con el
 * colaborador antes de confirmar.
 */
export const advertenciasDeLicencia = (caso: CasoLicencia): Advertencia[] => {
  const { tipo, fechaDesde, fechaHasta, feriados = new Set<string>() } = caso;
  if (fechaHasta < fechaDesde) return [];
  // Las parciales de jornada son de un día y no se cuentan por corridos.
  if (esParcialDeJornada(tipo)) return [];
  // En modalidad hábiles las vacaciones ya saltean los no laborables:
  // avisar ahí sería avisar de algo que el sistema ya resolvió.
  if (tipo === 'vacaciones' && caso.vacacionesEnHabiles) return [];

  let cuantos = 0;
  let cur = fechaDesde;
  for (let i = 0; cur <= fechaHasta && i < 800; i += 1) {
    if (esNoLaborable(cur, feriados)) cuantos += 1;
    cur = sumarDiasEmpresa(cur, 1);
  }

  if (cuantos === 0) return [];

  return [
    {
      clave: 'lic_incluye_no_laborables',
      nivel: 'media',
      titulo: 'Incluye días no laborables',
      detalle: `El período abarca ${cuantos} ${cuantos === 1 ? 'día no laborable' : 'días no laborables'} (fines de semana o feriados) y esta licencia se cuenta en días corridos, así que esos días se consumen igual.`,
      queHacer:
        'Revisá el período antes de confirmar. El sistema no lo extiende solo: las fechas quedan como las cargaste.',
    },
  ];
};

// ---------------------------------------------------------------
// Todo junto, para una solicitud concreta
// ---------------------------------------------------------------

export interface CasoAusencia extends CasoLicencia {
  hoy: string;
  /** Sólo para vacaciones: días arrastrados de períodos anteriores. */
  diasArrastrados?: number;
  /** Sólo para vacaciones: días que le corresponden por el año. */
  diasDelPeriodo?: number;
}

/**
 * Todas las advertencias que aplican a una solicitud.
 *
 * Un solo punto de entrada para que la pantalla no tenga que saber qué
 * regla corresponde a qué tipo: se le pasa el caso y devuelve la lista.
 */
export const advertenciasDeSolicitud = (caso: CasoAusencia): Advertencia[] => {
  const avisos: Advertencia[] = [];

  if (caso.tipo === 'vacaciones') {
    avisos.push(
      ...advertenciasDeVacaciones({
        fechaDesde: caso.fechaDesde,
        fechaHasta: caso.fechaHasta,
        hoy: caso.hoy,
        feriados: caso.feriados,
      })
    );
    if (
      caso.diasArrastrados !== undefined &&
      caso.diasDelPeriodo !== undefined
    ) {
      avisos.push(
        ...advertenciasDeAcumulacion({
          diasArrastrados: caso.diasArrastrados,
          diasDelPeriodo: caso.diasDelPeriodo,
        })
      );
    }
  }

  avisos.push(...advertenciasDeLicencia(caso));
  return avisos;
};

/** ¿Alguna advertencia es de nivel alto? Sirve para el color del cartel. */
export const hayAdvertenciaAlta = (avisos: Advertencia[]): boolean =>
  avisos.some((a) => a.nivel === 'alta');

/**
 * Una ausencia ya guardada, para revisarla desde la pantalla de
 * Ausencias sin volver a armar el caso a mano.
 */
export const advertenciasDeAusencia = (
  ausencia: Pick<Ausencia, 'tipo' | 'fechaDesde' | 'fechaHasta' | 'creadaEn'>,
  opciones: {
    feriados?: Set<string>;
    vacacionesEnHabiles?: boolean;
    diasArrastrados?: number;
    diasDelPeriodo?: number;
  } = {}
): Advertencia[] =>
  advertenciasDeSolicitud({
    tipo: ausencia.tipo,
    fechaDesde: ausencia.fechaDesde,
    fechaHasta: ausencia.fechaHasta,
    // La anticipación se mide contra el día en que se pidió, no contra
    // hoy: una solicitud de hace tres meses no "pierde" anticipación
    // porque la estemos mirando ahora.
    hoy: ausencia.creadaEn.slice(0, 10),
    ...opciones,
  });
