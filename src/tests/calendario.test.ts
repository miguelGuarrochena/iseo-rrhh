import {
  agruparPorEmpleado,
  agruparPorTipo,
  anclaAlCambiarVista,
  anclaNormalizada,
  ausenciasDelDia,
  desbordePorDia,
  esDelPeriodo,
  esFinDeSemana,
  filasDeVista,
  moverAncla,
  rangoVisible,
  segmentosDeFila,
  tituloDeVista,
  tocaRango,
} from '@/lib/calendario';
import { Ausencia } from '@/types/rrhh';

/**
 * Armado visual del calendario. No hay negocio acá: lo que se prueba es
 * que una ausencia de varios días se dibuje como UN bloque continuo, que
 * la que cruza de mes o de semana no se pierda ni se duplique mal, y que
 * cuando hay más gente que carriles nadie quede afuera en silencio.
 */

const a = (
  id: string,
  fechaDesde: string,
  fechaHasta: string,
  extra: Partial<Ausencia> = {}
): Ausencia => ({
  id,
  empleadoId: extra.empleadoId ?? `e-${id}`,
  tipo: extra.tipo ?? 'vacaciones',
  fechaDesde,
  fechaHasta,
  dias: extra.dias ?? 1,
  estado: extra.estado ?? 'aprobada',
  adjuntos: [],
  creadaEn: '2026-01-01T00:00:00.000Z',
  ...extra,
});

// Semana de referencia: lunes 24 a domingo 30 de agosto de 2026.
const SEMANA = [
  '2026-08-24',
  '2026-08-25',
  '2026-08-26',
  '2026-08-27',
  '2026-08-28',
  '2026-08-29',
  '2026-08-30',
];

describe('navegación entre períodos', () => {
  it('normaliza el ancla al día 1 en mes y al lunes en semana', () => {
    expect(anclaNormalizada('mes', '2026-08-31')).toBe('2026-08-01');
    expect(anclaNormalizada('semana', '2026-08-31')).toBe('2026-08-31');
    expect(anclaNormalizada('semana', '2026-09-02')).toBe('2026-08-31');
    expect(anclaNormalizada('dia', '2026-08-31')).toBe('2026-08-31');
  });

  it('mueve un mes, una semana o un día según la vista', () => {
    expect(moverAncla('mes', '2026-08-01', 1)).toBe('2026-09-01');
    expect(moverAncla('mes', '2026-01-01', -1)).toBe('2025-12-01');
    expect(moverAncla('semana', '2026-08-24', 1)).toBe('2026-08-31');
    expect(moverAncla('semana', '2026-08-24', -1)).toBe('2026-08-17');
    expect(moverAncla('dia', '2026-08-31', 1)).toBe('2026-09-01');
  });

  it('al cambiar de vista abre en hoy si hoy está en el período', () => {
    // Mirando agosto, con hoy dentro: semana y día caen en hoy.
    expect(
      anclaAlCambiarVista('mes', '2026-08-01', 'semana', '2026-08-13')
    ).toBe('2026-08-10');
    expect(anclaAlCambiarVista('mes', '2026-08-01', 'dia', '2026-08-13')).toBe(
      '2026-08-13'
    );
    // Mirando otro mes: se queda en ese mes, no salta a hoy.
    expect(
      anclaAlCambiarVista('mes', '2026-11-01', 'semana', '2026-08-13')
    ).toBe('2026-10-26');
    expect(
      anclaAlCambiarVista('semana', '2026-10-26', 'mes', '2026-08-13')
    ).toBe('2026-10-01');
  });

  it('la grilla del mes arranca un lunes y cierra un domingo', () => {
    const { desde, hasta } = rangoVisible('mes', '2026-08-01');
    // El 1/8/2026 cae sábado: la fila empieza el lunes 27 de julio.
    expect(desde).toBe('2026-07-27');
    expect(hasta).toBe('2026-09-06');
    const filas = filasDeVista('mes', '2026-08-01');
    expect(filas).toHaveLength(6);
    filas.forEach((f) => expect(f).toHaveLength(7));
  });

  it('la vista semana y la vista día devuelven una sola fila', () => {
    expect(filasDeVista('semana', '2026-08-26')).toEqual([SEMANA]);
    expect(filasDeVista('dia', '2026-08-26')).toEqual([['2026-08-26']]);
  });

  it('sabe qué días son del mes mirado y cuáles son relleno', () => {
    expect(esDelPeriodo('2026-08-31', '2026-08-01')).toBe(true);
    expect(esDelPeriodo('2026-09-01', '2026-08-01')).toBe(false);
  });

  it('marca sábado y domingo', () => {
    expect(esFinDeSemana('2026-08-28')).toBe(false); // viernes
    expect(esFinDeSemana('2026-08-29')).toBe(true); // sábado
    expect(esFinDeSemana('2026-08-30')).toBe(true); // domingo
  });

  it('titula cada vista', () => {
    expect(tituloDeVista('mes', '2026-08-01')).toBe('Agosto 2026');
    expect(tituloDeVista('semana', '2026-08-26')).toBe(
      '24 – 30 de agosto 2026'
    );
    expect(tituloDeVista('semana', '2026-09-02')).toBe('31 ago – 6 sep 2026');
    expect(tituloDeVista('dia', '2026-08-24')).toBe('Lunes 24 de agosto 2026');
  });
});

describe('segmentos de una fila', () => {
  it('una ausencia de varios días es un solo bloque continuo', () => {
    const segmentos = segmentosDeFila(
      [a('1', '2026-08-25', '2026-08-27')],
      SEMANA
    );
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0]).toMatchObject({
      inicio: 1,
      fin: 3,
      largo: 3,
      continuaAntes: false,
      continuaDespues: false,
      carril: 0,
    });
  });

  it('la que viene de antes o sigue después se recorta y avisa', () => {
    const larga = a('1', '2026-07-29', '2026-09-02');
    const anterior = segmentosDeFila(
      [larga],
      [
        '2026-07-27',
        '2026-07-28',
        '2026-07-29',
        '2026-07-30',
        '2026-07-31',
        '2026-08-01',
        '2026-08-02',
      ]
    );
    expect(anterior[0]).toMatchObject({
      inicio: 2,
      fin: 6,
      continuaAntes: false,
      continuaDespues: true,
    });

    const delMedio = segmentosDeFila([larga], SEMANA);
    expect(delMedio[0]).toMatchObject({
      inicio: 0,
      fin: 6,
      largo: 7,
      continuaAntes: true,
      continuaDespues: true,
    });
  });

  it('una ausencia que cruza de mes aparece en las dos grillas', () => {
    const cruzada = a('1', '2026-07-29', '2026-08-05');
    const enJulio = filasDeVista('mes', '2026-07-01').flatMap((f) =>
      segmentosDeFila([cruzada], f)
    ).length;
    const enAgosto = filasDeVista('mes', '2026-08-01').flatMap((f) =>
      segmentosDeFila([cruzada], f)
    ).length;
    expect(enJulio).toBeGreaterThan(0);
    expect(enAgosto).toBeGreaterThan(0);
  });

  it('las que se solapan van en carriles distintos y las que no, reusan el de arriba', () => {
    const segmentos = segmentosDeFila(
      [
        a('1', '2026-08-24', '2026-08-26'),
        a('2', '2026-08-25', '2026-08-28'),
        a('3', '2026-08-28', '2026-08-30'),
      ],
      SEMANA
    );
    const porId = Object.fromEntries(
      segmentos.map((s) => [s.ausencia.id, s.carril])
    );
    expect(porId['1']).toBe(0);
    expect(porId['2']).toBe(1);
    // La 3 empieza cuando la 1 ya terminó: vuelve al primer carril.
    expect(porId['3']).toBe(0);
  });

  it('no pierde ninguna ausencia del mismo día: las que no entran se cuentan', () => {
    const mismoDia = [
      a('1', '2026-08-26', '2026-08-26'),
      a('2', '2026-08-26', '2026-08-26'),
      a('3', '2026-08-26', '2026-08-26'),
      a('4', '2026-08-26', '2026-08-26'),
    ];
    const segmentos = segmentosDeFila(mismoDia, SEMANA);
    expect(segmentos).toHaveLength(4);
    expect(segmentos.map((s) => s.carril)).toEqual([0, 1, 2, 3]);
    expect(desbordePorDia(segmentos, SEMANA, 2)).toEqual({ '2026-08-26': 2 });
    expect(desbordePorDia(segmentos, SEMANA, 4)).toEqual({});
  });

  it('deja fuera de la fila lo que no la toca', () => {
    expect(
      segmentosDeFila([a('1', '2026-09-01', '2026-09-03')], SEMANA)
    ).toEqual([]);
    expect(
      tocaRango(a('1', '2026-08-30', '2026-09-03'), SEMANA[0], SEMANA[6])
    ).toBe(true);
  });
});

describe('agrupaciones', () => {
  const lista = [
    a('1', '2026-08-24', '2026-08-26', {
      empleadoId: 'e2',
      tipo: 'vacaciones',
    }),
    a('2', '2026-08-26', '2026-08-26', {
      empleadoId: 'e1',
      tipo: 'enfermedad',
    }),
    a('3', '2026-08-26', '2026-08-27', {
      empleadoId: 'e1',
      tipo: 'vacaciones',
    }),
  ];

  it('lista los ausentes de un día', () => {
    expect(ausenciasDelDia(lista, '2026-08-24').map((x) => x.id)).toEqual([
      '1',
    ]);
    expect(ausenciasDelDia(lista, '2026-08-26').map((x) => x.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(ausenciasDelDia(lista, '2026-08-31')).toEqual([]);
  });

  it('agrupa por empleado, ordenado por nombre', () => {
    const grupos = agruparPorEmpleado(lista, (id) =>
      id === 'e1' ? 'Ana Ruiz' : 'Zoe Paz'
    );
    expect(grupos.map((g) => g.nombre)).toEqual(['Ana Ruiz', 'Zoe Paz']);
    expect(grupos[0].ausencias.map((x) => x.id)).toEqual(['2', '3']);
  });

  it('agrupa por tipo sin perder ninguna', () => {
    const grupos = agruparPorTipo(lista);
    expect(grupos.map((g) => g.tipo).sort()).toEqual([
      'enfermedad',
      'vacaciones',
    ]);
    expect(grupos.flatMap((g) => g.ausencias)).toHaveLength(3);
  });
});
