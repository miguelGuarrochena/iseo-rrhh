import {
  armarNovedades,
  ClaveNovedad,
  DatosNovedades,
  diasEnPeriodo,
  filasDeExportacion,
  goceDeAusencia,
} from '@/lib/novedades';
import type {
  Adelanto,
  Ausencia,
  DescuentoRecurrente,
  Empleado,
  Remuneracion,
} from '@/types/rrhh';

/**
 * El cierre no inventa nada: junta lo que ya está cargado y lo reparte.
 *
 * Lo que cuidan estos casos es el borde: que una licencia a caballo de
 * dos meses aporte sólo los días que caen adentro, que un descuento que
 * viene de antes no se cuente como novedad del mes, y que las
 * categorías de secciones apagadas no aparezcan.
 */

const empleado = (over: Partial<Empleado> = {}): Empleado => ({
  id: 'ple-1',
  empresaId: 'emp-1',
  nombre: 'Ana',
  apellido: 'Pérez',
  dni: '30111222',
  cuil: '27-30111222-4',
  fechaNacimiento: '1990-01-01',
  estadoCivil: 'soltero',
  nivelEstudios: 'secundario',
  domicilio: '',
  telefono: '',
  email: 'ana@empresa.com',
  contactoEmergencia: { nombreCompleto: '', vinculo: '', telefono: '' },
  grupoFamiliar: [],
  fechaIngreso: '2020-01-01',
  puesto: 'Operaria',
  sector: 'Producción',
  supervisorId: null,
  modalidadContratacion: 'indeterminado',
  modalidadPago: 'mensual',
  banco: '',
  cbu: '',
  obraSocial: '',
  art: '',
  activo: true,
  checklistAlta: [],
  ...over,
});

const ausencia = (over: Partial<Ausencia> = {}): Ausencia => ({
  id: 'aus-1',
  empleadoId: 'ple-1',
  tipo: 'vacaciones',
  fechaDesde: '2026-06-05',
  fechaHasta: '2026-06-09',
  dias: 5,
  estado: 'aprobada',
  adjuntos: [],
  creadaEn: '2026-05-20',
  ...over,
});

const remuneracion = (over: Partial<Remuneracion> = {}): Remuneracion => ({
  id: 'rem-1',
  empleadoId: 'ple-1',
  periodo: '2026-06',
  tipo: 'mensual',
  montoBruto: 1_000_000,
  montoNeto: 830_000,
  ...over,
});

const base = (over: Partial<DatosNovedades> = {}): DatosNovedades => ({
  periodo: '2026-06',
  empleados: [empleado()],
  ausencias: [],
  remuneraciones: [],
  adelantos: [],
  descuentos: [],
  jornadas: [],
  ...over,
});

const cat = (datos: DatosNovedades, clave: ClaveNovedad) =>
  armarNovedades(datos).categorias.find((c) => c.clave === clave)!;

describe('diasEnPeriodo', () => {
  it('una licencia entera adentro del mes aporta todos sus días', () => {
    expect(
      diasEnPeriodo(
        { fechaDesde: '2026-06-05', fechaHasta: '2026-06-09' },
        '2026-06'
      )
    ).toBe(5);
  });

  it('a caballo de dos meses aporta sólo la parte que cae adentro', () => {
    // Del 28/05 al 03/06: mayo se lleva 4 días, junio 3. Sumar los 7 a
    // los dos meses sería contar la misma licencia dos veces.
    const a = { fechaDesde: '2026-05-28', fechaHasta: '2026-06-03' };
    expect(diasEnPeriodo(a, '2026-05')).toBe(4);
    expect(diasEnPeriodo(a, '2026-06')).toBe(3);
  });

  it('una licencia de otro mes no aporta nada', () => {
    expect(
      diasEnPeriodo(
        { fechaDesde: '2026-04-01', fechaHasta: '2026-04-10' },
        '2026-06'
      )
    ).toBe(0);
  });
});

describe('goceDeAusencia', () => {
  it('la excedencia es sin goce (art. 183 inc. c)', () => {
    expect(goceDeAusencia('excedencia')).toBe('sin_goce');
  });

  it('la maternidad no la paga la empresa: la paga ANSES', () => {
    // Ni "con goce" ni "sin goce": mezclarla con cualquiera de las dos
    // en la planilla del contador es exactamente el error a evitar.
    expect(goceDeAusencia('maternidad')).toBe('anses');
  });

  it('el resto de las licencias son con goce, que es el default de la LCT', () => {
    [
      'vacaciones',
      'enfermedad',
      'casamiento',
      'fallecimiento',
      'examenes',
    ].forEach((t) =>
      expect(goceDeAusencia(t as Ausencia['tipo'])).toBe('con_goce')
    );
  });
});

describe('altas y bajas del período', () => {
  it('detecta a quien ingresó ese mes', () => {
    const datos = base({
      empleados: [
        empleado({ id: 'ple-1', fechaIngreso: '2026-06-15' }),
        empleado({ id: 'ple-2', fechaIngreso: '2026-05-01' }),
      ],
    });
    const altas = cat(datos, 'altas');
    expect(altas.items).toHaveLength(1);
    expect(altas.items[0].empleadoId).toBe('ple-1');
  });

  it('detecta la baja aunque el legajo ya esté inactivo', () => {
    const datos = base({
      empleados: [
        empleado({ id: 'ple-1', activo: false, fechaBaja: '2026-06-20' }),
      ],
    });
    expect(cat(datos, 'bajas').items).toHaveLength(1);
  });

  it('una baja de otro mes no entra', () => {
    const datos = base({
      empleados: [
        empleado({ id: 'ple-1', activo: false, fechaBaja: '2026-07-02' }),
      ],
    });
    expect(cat(datos, 'bajas').items).toHaveLength(0);
  });
});

describe('licencias y cambios de jornada', () => {
  it('sólo cuenta las aprobadas', () => {
    const datos = base({
      ausencias: [
        ausencia({ id: 'a1', estado: 'aprobada' }),
        ausencia({ id: 'a2', estado: 'pendiente' }),
        ausencia({ id: 'a3', estado: 'rechazada' }),
      ],
    });
    expect(cat(datos, 'ausencias').items).toHaveLength(1);
  });

  it('el total son los días que caen en el mes, no los de la licencia', () => {
    const datos = base({
      ausencias: [
        ausencia({ fechaDesde: '2026-05-28', fechaHasta: '2026-06-03' }),
      ],
    });
    const c = cat(datos, 'ausencias');
    expect(c.items[0].valor).toBe(3);
    expect(c.total).toBe(3);
  });

  it('etiqueta el goce de cada licencia', () => {
    const datos = base({
      ausencias: [ausencia({ tipo: 'excedencia' })],
    });
    expect(cat(datos, 'ausencias').items[0].nota).toBe('Sin goce de sueldo');
  });

  it('las parciales de jornada no son licencias: van a su categoría', () => {
    // Mismo corte que ya usa el ausentismo de Reportes, con la misma
    // constante: home office es trabajo, no ausencia.
    const datos = base({
      ausencias: [
        ausencia({ id: 'a1', tipo: 'home_office' }),
        ausencia({ id: 'a2', tipo: 'entrada_tarde' }),
        ausencia({ id: 'a3', tipo: 'vacaciones' }),
      ],
    });
    expect(cat(datos, 'ausencias').items).toHaveLength(1);
    expect(cat(datos, 'jornada').items).toHaveLength(2);
  });
});

describe('fichaje', () => {
  it('suma sólo las horas extras aprobadas, agrupadas por persona', () => {
    const datos = base({
      empleados: [
        empleado({ id: 'ple-1' }),
        empleado({ id: 'ple-2', nombre: 'Beto', apellido: 'Gómez' }),
      ],
      jornadas: [
        {
          empleadoId: 'ple-1',
          fecha: '2026-06-02',
          horasExtrasAprobadas: 2,
          incompleta: false,
        },
        {
          empleadoId: 'ple-1',
          fecha: '2026-06-03',
          horasExtrasAprobadas: 1.5,
          incompleta: false,
        },
        // Detectadas pero sin aprobar: no se pagan, no son novedad.
        {
          empleadoId: 'ple-2',
          fecha: '2026-06-03',
          horasExtrasAprobadas: 0,
          incompleta: false,
        },
      ],
    });
    const c = cat(datos, 'extras');
    expect(c.items).toHaveLength(1);
    expect(c.items[0].valor).toBe(3.5);
    expect(c.total).toBe(3.5);
  });

  it('las jornadas sin cerrar son lo único que pide atención', () => {
    const datos = base({
      jornadas: [
        {
          empleadoId: 'ple-1',
          fecha: '2026-06-04',
          horasExtrasAprobadas: 0,
          incompleta: true,
        },
      ],
    });
    const novedades = armarNovedades(datos);
    expect(cat(datos, 'sin_cerrar').requiereAtencion).toBe(true);
    expect(novedades.requierenAtencion).toBe(1);
    expect(
      novedades.categorias.filter((c) => c.requiereAtencion).map((c) => c.clave)
    ).toEqual(['sin_cerrar']);
  });

  it('sin jornadas incompletas no hay nada que pida atención', () => {
    expect(armarNovedades(base()).requierenAtencion).toBe(0);
  });
});

describe('adelantos y descuentos', () => {
  const adelanto = (over: Partial<Adelanto> = {}): Adelanto => ({
    id: 'ade-1',
    empleadoId: 'ple-1',
    monto: 50_000,
    estado: 'aprobado',
    periodo: '2026-06',
    creadoEn: '2026-06-05',
    ...over,
  });

  it('sólo los aprobados y del período', () => {
    const datos = base({
      adelantos: [
        adelanto({ id: 'a1' }),
        adelanto({ id: 'a2', estado: 'pendiente', periodo: undefined }),
        adelanto({ id: 'a3', periodo: '2026-05' }),
      ],
    });
    const c = cat(datos, 'adelantos');
    expect(c.items).toHaveLength(1);
    expect(c.total).toBe(50_000);
  });

  it('un descuento que ya venía de antes no es novedad de este mes', () => {
    // Se arrastra todos los meses: repetirlo cada vez entrena a saltear
    // la categoría entera.
    const descuento = (over: Partial<DescuentoRecurrente> = {}) =>
      ({
        id: 'd1',
        empleadoId: 'ple-1',
        concepto: 'Comedor',
        monto: 20_000,
        modo: 'monto',
        creadoEn: '2026-06-10',
        ...over,
      }) as DescuentoRecurrente;

    const datos = base({
      descuentos: [
        descuento({ id: 'd1' }),
        descuento({ id: 'd2', creadoEn: '2025-11-01' }),
      ],
    });
    const c = cat(datos, 'descuentos');
    expect(c.items).toHaveLength(1);
    expect(c.items[0].id).toBe('des-d1');
  });

  it('un descuento sin fecha de alta no se puede afirmar como novedad', () => {
    const datos = base({
      descuentos: [
        {
          id: 'd1',
          empleadoId: 'ple-1',
          concepto: 'Sindicato',
          monto: 1,
          modo: 'monto',
        },
      ],
    });
    expect(cat(datos, 'descuentos').items).toHaveLength(0);
  });
});

describe('cambios de sueldo', () => {
  it('compara el bruto del mes contra el del anterior', () => {
    const datos = base({
      remuneraciones: [
        remuneracion({ periodo: '2026-05', montoBruto: 1_000_000 }),
        remuneracion({ id: 'r2', periodo: '2026-06', montoBruto: 1_200_000 }),
      ],
    });
    const c = cat(datos, 'sueldos');
    expect(c.items).toHaveLength(1);
    expect(c.items[0].valor).toBe(200_000);
    expect(c.items[0].nota).toBe('+20%');
  });

  it('sin cambio no hay novedad', () => {
    const datos = base({
      remuneraciones: [
        remuneracion({ periodo: '2026-05' }),
        remuneracion({ id: 'r2', periodo: '2026-06' }),
      ],
    });
    expect(cat(datos, 'sueldos').items).toHaveLength(0);
  });

  it('el primer sueldo de alguien no es un aumento', () => {
    // Sin período anterior no hay contra qué comparar. Mostrarlo como
    // "+100%" sería inventar un dato.
    const datos = base({
      remuneraciones: [remuneracion({ periodo: '2026-06' })],
    });
    expect(cat(datos, 'sueldos').items).toHaveLength(0);
  });

  it('el aguinaldo no se compara contra el sueldo', () => {
    // El SAC es un concepto aparte: compararlo con el mensual daría
    // "aumentos" y "bajas" que nunca existieron.
    const datos = base({
      remuneraciones: [
        remuneracion({ periodo: '2026-05', montoBruto: 1_000_000 }),
        remuneracion({
          id: 'r2',
          periodo: '2026-06',
          tipo: 'sac',
          montoBruto: 500_000,
        }),
      ],
    });
    expect(cat(datos, 'sueldos').items).toHaveLength(0);
  });
});

describe('módulos apagados', () => {
  it('una empresa sin Fichaje no ve extras ni jornadas sin cerrar', () => {
    const datos = base({
      modulos: { fichaje: false },
      jornadas: [
        {
          empleadoId: 'ple-1',
          fecha: '2026-06-04',
          horasExtrasAprobadas: 3,
          incompleta: true,
        },
      ],
    });
    const claves = armarNovedades(datos).categorias.map((c) => c.clave);
    expect(claves).not.toContain('extras');
    expect(claves).not.toContain('sin_cerrar');
    // Y no queda un "requiere atención" apuntando a una categoría que no
    // se muestra.
    expect(armarNovedades(datos).requierenAtencion).toBe(0);
    expect(armarNovedades(datos).total).toBe(0);
  });

  it('una empresa sin Remuneraciones no ve adelantos, descuentos ni sueldos', () => {
    const claves = armarNovedades(
      base({ modulos: { remuneraciones: false } })
    ).categorias.map((c) => c.clave);
    expect(claves).not.toContain('adelantos');
    expect(claves).not.toContain('sueldos');
  });

  it('altas y bajas se muestran siempre', () => {
    const claves = armarNovedades(
      base({
        modulos: {
          fichaje: false,
          ausencias: false,
          remuneraciones: false,
        },
      })
    ).categorias.map((c) => c.clave);
    expect(claves).toEqual(['altas', 'bajas']);
  });
});

describe('exportación para el contador', () => {
  it('lleva empresa, período y una fila por novedad', () => {
    const datos = base({
      empleados: [empleado({ fechaIngreso: '2026-06-10' })],
      ausencias: [ausencia()],
    });
    const filas = filasDeExportacion(armarNovedades(datos), 'Bombas del Sur');
    expect(filas[0]).toEqual(['Empresa', 'Bombas del Sur']);
    expect(filas[1]).toEqual(['Período', '2026-06']);
    expect(filas[3][0]).toBe('Categoría');
    // Un alta + una licencia.
    const cuerpo = filas.slice(4);
    expect(cuerpo).toHaveLength(2);
    expect(cuerpo.every((f) => f.length === 6)).toBe(true);
  });

  it('un período sin novedades exporta sólo el encabezado', () => {
    const filas = filasDeExportacion(armarNovedades(base()), 'Vacía SA');
    expect(filas).toHaveLength(4);
  });
});

describe('el nombre sale del legajo, no de la novedad', () => {
  it('una ausencia de alguien que ya no está igual muestra su nombre', () => {
    const datos = base({
      empleados: [
        empleado({
          id: 'ple-9',
          nombre: 'Carla',
          apellido: 'Díaz',
          activo: false,
        }),
      ],
      ausencias: [ausencia({ empleadoId: 'ple-9' })],
    });
    expect(cat(datos, 'ausencias').items[0].nombre).toBe('Carla Díaz');
  });

  it('si el legajo no vino, no se rompe', () => {
    const datos = base({
      empleados: [],
      ausencias: [ausencia({ empleadoId: 'fantasma' })],
    });
    expect(cat(datos, 'ausencias').items[0].nombre).toBe('—');
  });
});

describe('acotar las remuneraciones por período no cambia las novedades', () => {
  /**
   * Mismo seguro que en el reporte: el servicio ahora pide sólo el mes y
   * el anterior en vez de traer todo y filtrar en el navegador. Los
   * cambios de sueldo son lo único del cierre que mira remuneraciones, y
   * tienen que salir idénticos con el histórico completo o con el recorte.
   */
  const rem = (periodo: string, montoBruto: number): Remuneracion =>
    remuneracion({ id: `r-${periodo}`, periodo, montoBruto });

  const historico = [
    rem('2024-11', 300_000),
    rem('2025-06', 600_000),
    rem('2026-01', 800_000),
    rem('2026-05', 1_000_000),
    rem('2026-06', 1_200_000),
    rem('2026-07', 1_500_000),
  ];
  const recorte = historico.filter(
    (r) => r.periodo === '2026-06' || r.periodo === '2026-05'
  );

  it('las categorías salen idénticas', () => {
    expect(armarNovedades(base({ remuneraciones: recorte }))).toEqual(
      armarNovedades(base({ remuneraciones: historico }))
    );
  });

  it('el cambio de sueldo se mide contra el mes anterior, no contra el más viejo', () => {
    const c = cat(base({ remuneraciones: recorte }), 'sueldos');
    expect(c.items).toHaveLength(1);
    expect(c.items[0].valor).toBe(200_000);
    expect(c.items[0].nota).toBe('+20%');
  });
});
