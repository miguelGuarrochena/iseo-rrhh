import { Feriado, NuevoFeriado } from '@/types/rrhh';

/**
 * Domingo de Pascua para un año dado (algoritmo de Meeus/Jones/Butcher).
 * De acá salen Carnaval y Viernes Santo, que se mueven todos los años.
 */
export const domingoDePascua = (anio: number): Date => {
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
  return new Date(anio, mes - 1, dia);
};

const iso = (d: Date): string => {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const sumarDias = (d: Date, dias: number): Date => {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + dias);
  return copia;
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
  const original = new Date(anio, mes - 1, dia);
  const diaSemana = original.getDay(); // 0=dom … 6=sáb
  if (diaSemana === 2) return iso(sumarDias(original, -1)); // mar → lun ant.
  if (diaSemana === 3) return iso(sumarDias(original, -2)); // mié → lun ant.
  if (diaSemana === 4) return iso(sumarDias(original, 4)); // jue → lun sig.
  if (diaSemana === 5) return iso(sumarDias(original, 3)); // vie → lun sig.
  return iso(original);
};

/**
 * Propuesta de feriados para cargar de un año. Es un punto de partida
 * editable: RRHH revisa y suma los puentes turísticos cuando salen en
 * el Boletín Oficial.
 */
export const feriadosSugeridos = (anio: number): NuevoFeriado[] => {
  const pascua = domingoDePascua(anio);
  const movibles: NuevoFeriado[] = [
    {
      fecha: iso(sumarDias(pascua, -48)),
      nombre: 'Carnaval',
      tipo: 'nacional',
      noLaborable: true,
    },
    {
      fecha: iso(sumarDias(pascua, -47)),
      nombre: 'Carnaval',
      tipo: 'nacional',
      noLaborable: true,
    },
    {
      fecha: iso(sumarDias(pascua, -2)),
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
  const dia = new Date(`${fechaISO}T00:00:00`).getDay();
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
