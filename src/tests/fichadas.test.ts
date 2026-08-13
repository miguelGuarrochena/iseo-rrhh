import {
  agruparMarcas,
  armarJornadas,
  armarResumen,
  CORTE_JORNADA_MS,
  diasDelRango,
  encabezadoDia,
  minutosAHhMm,
} from '@/lib/fichadas';
import { Ausencia, Empleado, Feriado, Fichaje } from '@/types/rrhh';

/** Fichaje mínimo: solo lo que mira el cálculo. */
const marca = (
  empleadoId: string,
  timestamp: string,
  tipo: 'ingreso' | 'egreso'
): Fichaje =>
  ({
    id: `${empleadoId}-${timestamp}-${tipo}`,
    empleadoId,
    tipo,
    timestamp,
    metodo: 'facial_tablet',
  }) as Fichaje;

const empleado = (id: string, apellido: string, nombre: string): Empleado =>
  ({
    id,
    nombre,
    apellido,
    dni: '30000000',
    sector: 'Planta',
    fechaIngreso: '2020-01-01',
  }) as Empleado;

/** Reloj fijo, lejos de los casos, para que nada quede "en curso". */
const DESPUES = new Date('2026-08-15T12:00:00').getTime();

describe('armarJornadas: agrupado por sesión', () => {
  it('el corte de almuerzo no parte la jornada', () => {
    // Caso real de planta: ficha al entrar, al salir a almorzar, al
    // volver y al irse. La jornada es de 7 a 16, no de 7 a 12.
    const jornadas = armarJornadas(
      [
        marca('e1', '2026-07-27T07:04:00', 'ingreso'),
        marca('e1', '2026-07-27T12:00:00', 'egreso'),
        marca('e1', '2026-07-27T12:45:00', 'ingreso'),
        marca('e1', '2026-07-27T16:02:00', 'egreso'),
      ],
      DESPUES
    );
    expect(jornadas).toHaveLength(1);
    expect(jornadas[0].horas).toBeCloseTo(9, 1);
    expect(jornadas[0].cerrada).toBe(true);
    expect(jornadas[0].marcas).toBe(4);
  });

  it('el turno nocturno es UNA jornada, fechada el día que entró', () => {
    // Antes se partía en dos: el lunes con entrada sin salida y el
    // martes con salida sin entrada, los dos con cero horas.
    const jornadas = armarJornadas(
      [
        marca('e1', '2026-07-27T22:00:00', 'ingreso'),
        marca('e1', '2026-07-28T06:00:00', 'egreso'),
      ],
      DESPUES
    );
    expect(jornadas).toHaveLength(1);
    expect(jornadas[0].fecha).toBe('2026-07-27');
    expect(jornadas[0].horas).toBeCloseTo(8, 1);
    expect(jornadas[0].cerrada).toBe(true);
  });

  it('la salida que falta deja UNA jornada abierta, no dos', () => {
    const jornadas = armarJornadas(
      [
        marca('e1', '2026-07-27T07:00:00', 'ingreso'),
        marca('e1', '2026-07-28T07:00:00', 'ingreso'),
        marca('e1', '2026-07-28T16:00:00', 'egreso'),
      ],
      DESPUES
    );
    expect(jornadas.map((j) => [j.fecha, j.cerrada])).toEqual([
      ['2026-07-27', false],
      ['2026-07-28', true],
    ]);
  });

  it('volver del almuerzo y no fichar la salida NO cierra la jornada', () => {
    // Tiene un ingreso y un egreso, así que "hay entrada y hay salida"
    // daría cerrada. Pero la última marca es el regreso del almuerzo:
    // la persona volvió y nunca se fue. La jornada quedó abierta.
    const [j] = armarJornadas(
      [
        marca('e1', '2026-07-27T07:00:00', 'ingreso'),
        marca('e1', '2026-07-27T12:00:00', 'egreso'),
        marca('e1', '2026-07-27T12:30:00', 'ingreso'),
      ],
      DESPUES
    );
    expect(j.cerrada).toBe(false);
    expect(j.incompleta).toBe(true);
    expect(j.marcas).toBe(3);
  });

  it('la salida sin entrada queda como jornada abierta', () => {
    const [j] = armarJornadas(
      [marca('e1', '2026-07-27T16:00:00', 'egreso')],
      DESPUES
    );
    expect(j.entrada).toBeUndefined();
    expect(j.cerrada).toBe(false);
    expect(j.incompleta).toBe(true);
    expect(j.fecha).toBe('2026-07-27');
  });

  it('un hueco justo por debajo del corte no abre jornada nueva', () => {
    const entrada = new Date('2026-07-27T07:00:00');
    const vuelta = new Date(entrada.getTime() + CORTE_JORNADA_MS - 60_000);
    const jornadas = armarJornadas(
      [
        marca('e1', entrada.toISOString(), 'ingreso'),
        marca('e1', vuelta.toISOString(), 'ingreso'),
        marca('e1', '2026-07-27T20:00:00', 'egreso'),
      ],
      DESPUES
    );
    expect(jornadas).toHaveLength(1);
  });

  it('un hueco de exactamente el corte sí abre jornada nueva', () => {
    const entrada = new Date('2026-07-27T07:00:00');
    const otra = new Date(entrada.getTime() + CORTE_JORNADA_MS);
    const jornadas = armarJornadas(
      [
        marca('e1', entrada.toISOString(), 'ingreso'),
        marca('e1', otra.toISOString(), 'ingreso'),
      ],
      DESPUES
    );
    expect(jornadas).toHaveLength(2);
  });

  it('separa por empleado', () => {
    const jornadas = armarJornadas(
      [
        marca('e1', '2026-07-27T07:00:00', 'ingreso'),
        marca('e1', '2026-07-27T16:00:00', 'egreso'),
        marca('e2', '2026-07-27T07:00:00', 'ingreso'),
        marca('e2', '2026-07-27T16:00:00', 'egreso'),
      ],
      DESPUES
    );
    expect(jornadas).toHaveLength(2);
  });
});

describe('armarJornadas: estado en curso', () => {
  it('quien entró hace dos horas está en curso, no "sin cerrar"', () => {
    const ahora = new Date('2026-07-27T10:00:00').getTime();
    const [j] = armarJornadas(
      [marca('e1', '2026-07-27T08:00:00', 'ingreso')],
      ahora
    );
    expect(j.cerrada).toBe(false);
    expect(j.enCurso).toBe(true);
    // Lo importante: NO aparece en el filtro de "hay que corregir".
    expect(j.incompleta).toBe(false);
  });

  it('una entrada de hace tres días es un error, no alguien trabajando', () => {
    const ahora = new Date('2026-07-30T10:00:00').getTime();
    const [j] = armarJornadas(
      [marca('e1', '2026-07-27T08:00:00', 'ingreso')],
      ahora
    );
    expect(j.enCurso).toBe(false);
    expect(j.incompleta).toBe(true);
  });
});

describe('agruparMarcas', () => {
  it('devuelve qué marcas componen cada jornada', () => {
    // Es lo que permite responder "esta marca, ¿pertenece a una
    // jornada sin cerrar?" sin volver a agrupar.
    const marcas = [
      marca('e1', '2026-07-27T07:00:00', 'ingreso'),
      marca('e1', '2026-07-27T12:00:00', 'egreso'),
      marca('e1', '2026-07-27T12:30:00', 'ingreso'),
      marca('e1', '2026-07-28T07:00:00', 'ingreso'),
    ];
    const grupos = agruparMarcas(marcas, DESPUES);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].marcas).toHaveLength(3);
    expect(grupos[1].marcas).toHaveLength(1);
    expect(grupos[0].jornada.incompleta).toBe(true);
    expect(grupos[1].jornada.incompleta).toBe(true);
  });
});

describe('diasDelRango', () => {
  it('incluye los dos extremos', () => {
    expect(diasDelRango('2026-07-27', '2026-07-30')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
    ]);
  });

  it('un solo día devuelve un solo día', () => {
    expect(diasDelRango('2026-07-27', '2026-07-27')).toEqual(['2026-07-27']);
  });

  it('el rango al revés no devuelve nada', () => {
    expect(diasDelRango('2026-08-01', '2026-07-27')).toEqual([]);
  });
});

describe('encabezadoDia', () => {
  it('usa el formato de la planilla del cliente', () => {
    expect(encabezadoDia('2026-07-27')).toBe('27-JUL LUNES');
    expect(encabezadoDia('2026-08-01')).toBe('1-AGO SÁBADO');
  });
});

describe('armarResumen', () => {
  const empleados = [empleado('e1', 'Avalos', 'Andres')];

  it('suma horas y días trabajados del rango', () => {
    const r = armarResumen(
      '2026-07-27',
      '2026-07-28',
      empleados,
      armarJornadas(
        [
          marca('e1', '2026-07-27T07:00:00', 'ingreso'),
          marca('e1', '2026-07-27T16:00:00', 'egreso'),
          marca('e1', '2026-07-28T07:00:00', 'ingreso'),
          marca('e1', '2026-07-28T16:00:00', 'egreso'),
        ],
        DESPUES
      )
    );
    expect(r.filas[0].diasTrabajados).toBe(2);
    expect(r.filas[0].horasTotales).toBeCloseTo(18, 1);
  });

  it('la jornada sin cerrar no cuenta como día trabajado', () => {
    const r = armarResumen(
      '2026-07-27',
      '2026-07-27',
      empleados,
      armarJornadas([marca('e1', '2026-07-27T07:00:00', 'ingreso')], DESPUES)
    );
    expect(r.filas[0].diasTrabajados).toBe(0);
    expect(r.filas[0].dias[0].incompleta).toBe(true);
  });

  it('el total no arrastra el redondeo de cada día', () => {
    // Cinco jornadas de 8h58. Cada una se muestra como 9,0 hs, pero el
    // total real es 44h50, no 45. Sumar las horas ya redondeadas de
    // cada día inflaba la planilla con la que se paga.
    const marcas = [0, 1, 2, 3, 4].flatMap((i) => {
      const dia = `2026-07-${String(20 + i).padStart(2, '0')}`;
      return [
        marca('e1', `${dia}T07:04:00`, 'ingreso'),
        marca('e1', `${dia}T16:02:00`, 'egreso'),
      ];
    });
    const r = armarResumen(
      '2026-07-20',
      '2026-07-24',
      empleados,
      armarJornadas(marcas, DESPUES)
    );
    expect(r.filas[0].dias[0].horas).toBe(9);
    expect(r.filas[0].minutosTotales).toBe(5 * 538);
    expect(minutosAHhMm(r.filas[0].minutosTotales)).toBe('44:50');
  });

  it('solo toma las ausencias aprobadas', () => {
    const ausencias: Ausencia[] = [
      {
        id: 'a1',
        empleadoId: 'e1',
        tipo: 'vacaciones',
        fechaDesde: '2026-07-27',
        fechaHasta: '2026-07-27',
        dias: 1,
        estado: 'aprobada',
      } as Ausencia,
      {
        id: 'a2',
        empleadoId: 'e1',
        tipo: 'enfermedad',
        fechaDesde: '2026-07-28',
        fechaHasta: '2026-07-28',
        dias: 1,
        estado: 'pendiente',
      } as Ausencia,
    ];
    const r = armarResumen(
      '2026-07-27',
      '2026-07-28',
      empleados,
      [],
      ausencias
    );
    expect(r.filas[0].dias[0].ausencia).toBe('Vacaciones');
    expect(r.filas[0].dias[1].ausencia).toBeUndefined();
  });

  it('cuenta los feriados en los que igual se fichó', () => {
    const feriados: Feriado[] = [
      {
        id: 'f1',
        empresaId: 'emp-1',
        fecha: '2026-07-27',
        nombre: 'Feriado de prueba',
        tipo: 'nacional',
        noLaborable: true,
      } as Feriado,
    ];
    const r = armarResumen(
      '2026-07-27',
      '2026-07-28',
      empleados,
      armarJornadas(
        [
          marca('e1', '2026-07-27T07:00:00', 'ingreso'),
          marca('e1', '2026-07-27T16:00:00', 'egreso'),
        ],
        DESPUES
      ),
      [],
      feriados
    );
    expect(r.filas[0].feriadosTrabajados).toBe(1);
  });

  it('el empleado sin ninguna fichada aparece igual, en cero', () => {
    // Si no apareciera, un ausente sin justificar sería invisible justo
    // en la planilla que se usa para liquidar.
    const r = armarResumen('2026-07-27', '2026-07-28', empleados, []);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].diasTrabajados).toBe(0);
    expect(r.filas[0].dias).toHaveLength(2);
  });

  it('suma las horas de dos sesiones el mismo día', () => {
    // Turno partido: 08–12 y 19–23. Antes el Map por fecha dejaba sólo
    // la segunda y el Excel exportaba 4 h en vez de 8.
    const r = armarResumen(
      '2026-07-06',
      '2026-07-06',
      empleados,
      armarJornadas(
        [
          marca('e1', '2026-07-06T08:00:00', 'ingreso'),
          marca('e1', '2026-07-06T12:00:00', 'egreso'),
          marca('e1', '2026-07-06T19:00:00', 'ingreso'),
          marca('e1', '2026-07-06T23:00:00', 'egreso'),
        ],
        DESPUES
      )
    );
    expect(r.filas[0].horasTotales).toBe(8);
    expect(r.filas[0].minutosTotales).toBe(480);
    expect(r.filas[0].diasTrabajados).toBe(1);
    expect(r.filas[0].dias[0].entrada).toBe('2026-07-06T08:00:00');
    expect(r.filas[0].dias[0].salida).toBe('2026-07-06T23:00:00');
  });

  it('marca incompleta si una de las sesiones del día quedó abierta', () => {
    const r = armarResumen(
      '2026-07-06',
      '2026-07-06',
      empleados,
      armarJornadas(
        [
          marca('e1', '2026-07-06T08:00:00', 'ingreso'),
          marca('e1', '2026-07-06T12:00:00', 'egreso'),
          // Segunda sesión: entró y no salió (hueco > 6 h → jornada nueva).
          marca('e1', '2026-07-06T19:00:00', 'ingreso'),
        ],
        DESPUES
      )
    );
    expect(r.filas[0].dias[0].incompleta).toBe(true);
    expect(r.filas[0].dias[0].minutos).toBe(240);
    expect(r.filas[0].diasTrabajados).toBe(1);
  });

  it('la jornada nocturna cuenta en el día del ingreso', () => {
    const r = armarResumen(
      '2026-07-06',
      '2026-07-07',
      empleados,
      armarJornadas(
        [
          marca('e1', '2026-07-06T22:00:00', 'ingreso'),
          marca('e1', '2026-07-07T06:00:00', 'egreso'),
        ],
        DESPUES
      )
    );
    expect(r.filas[0].dias[0].horas).toBe(8);
    expect(r.filas[0].dias[0].diaTrabajado).toBe(1);
    expect(r.filas[0].dias[1].horas).toBe(0);
    expect(r.filas[0].horasTotales).toBe(8);
  });

  it('no mezcla sesiones de dos empleados', () => {
    const equipo = [
      empleado('e1', 'Avalos', 'Andres'),
      empleado('e2', 'Benítez', 'Beto'),
    ];
    const r = armarResumen(
      '2026-07-06',
      '2026-07-06',
      equipo,
      armarJornadas(
        [
          marca('e1', '2026-07-06T08:00:00', 'ingreso'),
          marca('e1', '2026-07-06T12:00:00', 'egreso'),
          marca('e2', '2026-07-06T09:00:00', 'ingreso'),
          marca('e2', '2026-07-06T17:00:00', 'egreso'),
        ],
        DESPUES
      )
    );
    const andres = r.filas.find((f) => f.empleado.id === 'e1')!;
    const beto = r.filas.find((f) => f.empleado.id === 'e2')!;
    expect(andres.horasTotales).toBe(4);
    expect(beto.horasTotales).toBe(8);
  });
});
