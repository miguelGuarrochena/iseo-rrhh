import {
  armarJornadas,
  armarResumen,
  diasDelRango,
  encabezadoDia,
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

describe('armarJornadas', () => {
  it('toma la primera entrada y la última salida del día', () => {
    // Caso real de planta: ficha al entrar, al salir a almorzar, al
    // volver y al irse. La jornada es de 7 a 16, no de 7 a 12.
    const jornadas = armarJornadas([
      marca('e1', '2026-07-27T07:04:00', 'ingreso'),
      marca('e1', '2026-07-27T12:00:00', 'egreso'),
      marca('e1', '2026-07-27T12:45:00', 'ingreso'),
      marca('e1', '2026-07-27T16:02:00', 'egreso'),
    ]);
    expect(jornadas).toHaveLength(1);
    expect(jornadas[0].horas).toBeCloseTo(9, 1);
    expect(jornadas[0].incompleta).toBe(false);
    expect(jornadas[0].marcas).toBe(4);
  });

  it('marca incompleta la jornada sin salida', () => {
    const [j] = armarJornadas([marca('e1', '2026-07-27T07:04:00', 'ingreso')]);
    expect(j.incompleta).toBe(true);
    expect(j.horas).toBe(0);
  });

  it('separa por empleado y por día', () => {
    const jornadas = armarJornadas([
      marca('e1', '2026-07-27T07:00:00', 'ingreso'),
      marca('e1', '2026-07-27T16:00:00', 'egreso'),
      marca('e1', '2026-07-28T07:00:00', 'ingreso'),
      marca('e1', '2026-07-28T16:00:00', 'egreso'),
      marca('e2', '2026-07-27T07:00:00', 'ingreso'),
      marca('e2', '2026-07-27T16:00:00', 'egreso'),
    ]);
    expect(jornadas).toHaveLength(3);
  });
});

describe('diasDelRango', () => {
  it('incluye los dos extremos', () => {
    expect(diasDelRango('2026-07-27', '2026-08-01')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
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
      armarJornadas([
        marca('e1', '2026-07-27T07:00:00', 'ingreso'),
        marca('e1', '2026-07-27T16:00:00', 'egreso'),
        marca('e1', '2026-07-28T07:00:00', 'ingreso'),
        marca('e1', '2026-07-28T16:00:00', 'egreso'),
      ])
    );
    expect(r.filas[0].diasTrabajados).toBe(2);
    expect(r.filas[0].horasTotales).toBeCloseTo(18, 1);
  });

  it('la jornada sin cerrar no cuenta como día trabajado', () => {
    const r = armarResumen(
      '2026-07-27',
      '2026-07-27',
      empleados,
      armarJornadas([marca('e1', '2026-07-27T07:00:00', 'ingreso')])
    );
    expect(r.filas[0].diasTrabajados).toBe(0);
    expect(r.filas[0].dias[0].incompleta).toBe(true);
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
      armarJornadas([
        marca('e1', '2026-07-27T07:00:00', 'ingreso'),
        marca('e1', '2026-07-27T16:00:00', 'egreso'),
      ]),
      [],
      feriados
    );
    expect(r.filas[0].feriadosTrabajados).toBe(1);
  });

  it('el total no arrastra el redondeo de cada día', () => {
    // Cinco jornadas de 8h58. Cada una se muestra como 9,0 hs, pero el
    // total real es 44h50, no 45. Sumar las horas ya redondeadas de cada
    // día inflaba la planilla con la que se paga.
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
      armarJornadas(marcas)
    );
    expect(r.filas[0].dias[0].horas).toBe(9);
    expect(r.filas[0].minutosTotales).toBe(5 * 538);
    expect(r.filas[0].horasTotales).toBeCloseTo(44.8, 1);
  });

  it('el empleado sin ninguna fichada aparece igual, en cero', () => {
    // Si no apareciera, un ausente sin justificar sería invisible justo
    // en la planilla que se usa para liquidar.
    const r = armarResumen('2026-07-27', '2026-07-28', empleados, []);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].diasTrabajados).toBe(0);
    expect(r.filas[0].dias).toHaveLength(2);
  });
});
