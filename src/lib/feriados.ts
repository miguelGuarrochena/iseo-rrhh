import { Feriado, NuevoFeriado } from '@/types/rrhh';
import { anioEmpresa, diaSemanaEmpresa, sumarDiasEmpresa } from '@/lib/fechas';

/**
 * Domingo de Pascua para un año dado (algoritmo de Meeus/Jones/Butcher).
 * De acá salen Carnaval y Viernes Santo, que se mueven todos los años.
 */
export const domingoDePascua = (anio: number): string => {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  // Fecha civil, no instante: un feriado es un día del calendario.
  //
  // Antes esto devolvía un `Date` local y `iso()`/`sumarDias()` locales lo
  // paseaban con `setDate`. En Argentina daba bien porque no hay horario
  // de verano, pero en un huso que sí lo tiene, sumar días sobre una
  // medianoche local puede caer a las 23:00 del día anterior y correr el
  // feriado un día. Un feriado no puede depender de dónde esté la
  // computadora que lo calcula.
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

/**
 * Feriados nacionales de fecha fija (inamovibles) en Argentina.
 * Los puentes turísticos se anuncian por decreto cada año: esos se
 * cargan a mano.
 */
const FIJOS: { mmdd: string; nombre: string }[] = [
  { mmdd: '01-01', nombre: 'Año Nuevo' },
  { mmdd: '03-24', nombre: 'Día de la Memoria' },
  { mmdd: '04-02', nombre: 'Día del Veterano y de los Caídos en Malvinas' },
  { mmdd: '05-01', nombre: 'Día del Trabajador' },
  { mmdd: '05-25', nombre: 'Día de la Revolución de Mayo' },
  { mmdd: '06-20', nombre: 'Paso a la Inmortalidad del Gral. Belgrano' },
  { mmdd: '07-09', nombre: 'Día de la Independencia' },
  { mmdd: '12-08', nombre: 'Inmaculada Concepción de María' },
  { mmdd: '12-25', nombre: 'Navidad' },
];

/**
 * Feriados trasladables (Ley 27.399). Si caen martes/miércoles van al
 * lunes anterior; jueves/viernes al lunes siguiente; el resto queda.
 */
const TRASLADABLES: { mmdd: string; nombre: string }[] = [
  {
    mmdd: '06-17',
    nombre: 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes',
  },
  {
    mmdd: '08-17',
    nombre: 'Paso a la Inmortalidad del Gral. Don José de San Martín',
  },
  { mmdd: '10-12', nombre: 'Día del Respeto a la Diversidad Cultural' },
  { mmdd: '11-20', nombre: 'Día de la Soberanía Nacional' },
];

/** Aplica el traslado de Ley 27.399 a una fecha conmemorativa. */
export const fechaTrasladable = (anio: number, mmdd: string): string => {
  const [mes, dia] = mmdd.split('-').map(Number);
  const original = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const diaSemana = diaSemanaEmpresa(original); // 0=dom … 6=sáb
  if (diaSemana === 2) return sumarDiasEmpresa(original, -1); // mar → lun ant.
  if (diaSemana === 3) return sumarDiasEmpresa(original, -2); // mié → lun ant.
  if (diaSemana === 4) return sumarDiasEmpresa(original, 4); // jue → lun sig.
  if (diaSemana === 5) return sumarDiasEmpresa(original, 3); // vie → lun sig.
  return original;
};

/**
 * Años cuyos nacionales hay que asegurar al leer feriados.
 * Con año explícito, ese; si no, el actual y el siguiente (agenda).
 */
export const aniosFeriadosAsegurar = (anio?: number): number[] => {
  if (anio) return [anio];
  // Año de negocio: el 31/12 a la noche, con el reloj del dispositivo, se
  // aseguraban los feriados del año siguiente y del subsiguiente, y los
  // del año en curso quedaban sin cargar.
  const actual = anioEmpresa();
  return [actual, actual + 1];
};

/**
 * Nacionales de un año (fijos, trasladables Ley 27.399, Carnaval y
 * Viernes Santo). Se aseguran solos al abrir agenda/config. Los puentes
 * turísticos salen por decreto y RRHH los suma a mano.
 */
export const feriadosSugeridos = (anio: number): NuevoFeriado[] => {
  const pascua = domingoDePascua(anio);
  const movibles: NuevoFeriado[] = [
    {
      fecha: sumarDiasEmpresa(pascua, -48),
      nombre: 'Carnaval',
      tipo: 'nacional',
      noLaborable: true,
    },
    {
      fecha: sumarDiasEmpresa(pascua, -47),
      nombre: 'Carnaval',
      tipo: 'nacional',
      noLaborable: true,
    },
    {
      fecha: sumarDiasEmpresa(pascua, -2),
      nombre: 'Viernes Santo',
      tipo: 'nacional',
      noLaborable: true,
    },
  ];

  const fijos: NuevoFeriado[] = FIJOS.map(({ mmdd, nombre }) => ({
    fecha: `${anio}-${mmdd}`,
    nombre,
    tipo: 'nacional' as const,
    noLaborable: true,
  }));

  const trasladables: NuevoFeriado[] = TRASLADABLES.map(({ mmdd, nombre }) => ({
    fecha: fechaTrasladable(anio, mmdd),
    nombre,
    tipo: 'nacional' as const,
    noLaborable: true,
  }));

  return [...fijos, ...movibles, ...trasladables].sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0
  );
};

/** Set de fechas ISO no laborables, para las cuentas de días. */
export const fechasNoLaborables = (feriados: Feriado[]): Set<string> =>
  new Set(feriados.filter((f) => f.noLaborable).map((f) => f.fecha));

/** ¿Cae sábado o domingo? */
export const esFinDeSemana = (fechaISO: string): boolean => {
  const dia = diaSemanaEmpresa(fechaISO);
  return dia === 0 || dia === 6;
};

/**
 * ¿Ese día se trabaja? Sirve para dos cosas distintas: no descontar el
 * día de las vacaciones, y saber que lo trabajado ahí va con recargo.
 */
export const esNoLaborable = (
  fechaISO: string,
  noLaborables: Set<string>
): boolean => esFinDeSemana(fechaISO) || noLaborables.has(fechaISO);

/** El feriado que cae ese día, si hay alguno. */
export const feriadoDe = (
  fechaISO: string,
  feriados: Feriado[]
): Feriado | undefined => feriados.find((f) => f.fecha === fechaISO);
