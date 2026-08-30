import {
  armarReporteMensual,
  compararCon,
  DatosReporte,
  enActividad,
  filasDeReporte,
  resumenEjecutivo,
} from '@/lib/reporteMensual';
import { calcularAusentismo } from '@/lib/ausentismo';
import type { Ausencia, Empleado, Empresa, Remuneracion } from '@/types/rrhh';

/**
 * La regla que atraviesa el reporte: un indicador que no se puede
 * calcular bien no se muestra. `undefined` es "no se sabe", nunca cero.
 *
 * Un cero es una afirmación —"nadie hizo horas extras"— y en una empresa
 * que no cargó sueldos la verdad es otra. Estos casos existen para que
 * ese `undefined` no se convierta nunca en un 0 por comodidad.
 */

const empleado = (over: Partial<Empleado> = {}): Empleado => ({
  id: 'ple-1',
  empresaId: 'emp-1',
  nombre: 'Ana',
  apellido: 'Pérez',
  dni: '1',
  cuil: '',
  fechaNacimiento: '1990-01-01',
  estadoCivil: 'soltero',
  nivelEstudios: 'secundario',
  domicilio: '',
  telefono: '',
  email: '',
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

const empresa = (over: Partial<Empresa> = {}): Empresa => ({
  id: 'emp-1',
  nombre: 'Bombas del Sur',
  cuit: '30-1-1',
  estado: 'activa',
  contactoNombre: '',
  contactoEmail: '',
  config: {
    metodosFichaje: ['celular'],
    toleranciaLlegadaTardeMin: 10,
    horaEntrada: '08:00',
    horaSalida: '17:00',
    diasAvisoVencimiento: 30,
  },
  creadaEn: '2020-01-01',
  ...over,
});

const base = (over: Partial<DatosReporte> = {}): DatosReporte => ({
  periodo: '2026-06',
  empresa: empresa(),
  empleados: [empleado()],
  ausencias: [],
  remuneraciones: [],
  jornadas: [],
  ...over,
});

describe('enActividad', () => {
  it('cuenta a quien ya había ingresado y todavía no se fue', () => {
    const e = empleado({ fechaIngreso: '2026-03-01' });
    expect(enActividad(e, '2026-06-30')).toBe(true);
    expect(enActividad(e, '2026-02-28')).toBe(false);
  });

  it('el día de la baja todavía estaba', () => {
    const e = empleado({ fechaIngreso: '2020-01-01', fechaBaja: '2026-06-15' });
    expect(enActividad(e, '2026-06-15')).toBe(true);
    expect(enActividad(e, '2026-06-16')).toBe(false);
  });

  it('mira las fechas, no el flag `activo`', () => {
    // `activo` es el estado de HOY. Un reporte de marzo tiene que contar
    // a quien se fue en mayo: en marzo estaba trabajando.
    const e = empleado({ activo: false, fechaBaja: '2026-05-10' });
    expect(enActividad(e, '2026-03-31')).toBe(true);
  });
});

describe('compararCon', () => {
  it('calcula variación absoluta y porcentual', () => {
    const i = compararCon(120, 100);
    expect(i.variacion).toBe(20);
    expect(i.variacionPct).toBe(20);
  });

  it('sin mes anterior no inventa una variación', () => {
    const i = compararCon(120, undefined);
    expect(i.valor).toBe(120);
    expect(i.variacion).toBeUndefined();
    expect(i.variacionPct).toBeUndefined();
  });

  it('un anterior en cero no genera un porcentaje infinito', () => {
    const i = compararCon(50, 0);
    expect(i.variacion).toBe(50);
    expect(i.variacionPct).toBeUndefined();
  });

  it('sin valor no hay indicador, aunque haya anterior', () => {
    expect(compararCon(undefined, 100).valor).toBeUndefined();
  });
});

describe('dotación, altas, bajas y rotación', () => {
  const datos = base({
    empleados: [
      // Venían de antes.
      empleado({ id: 'p1' }),
      empleado({ id: 'p2' }),
      empleado({ id: 'p3' }),
      // Ingresó en el mes.
      empleado({ id: 'p4', fechaIngreso: '2026-06-10' }),
      // Se fue en el mes.
      empleado({
        id: 'p5',
        activo: false,
        fechaBaja: '2026-06-20',
      }),
      // Se había ido antes: no cuenta en ningún lado del mes.
      empleado({ id: 'p6', activo: false, fechaBaja: '2026-04-01' }),
    ],
  });

  it('la dotación del cierre no incluye a quien se fue en el mes', () => {
    const r = armarReporteMensual(datos);
    // p1, p2, p3 y p4 al 30/06.
    expect(r.dotacion.valor).toBe(4);
    // p1, p2, p3 y p5 al 01/06 (p4 todavía no había entrado).
    expect(r.dotacionInicio).toBe(4);
  });

  it('cuenta altas y bajas del período', () => {
    const r = armarReporteMensual(datos);
    expect(r.altas).toBe(1);
    expect(r.bajas).toBe(1);
  });

  it('la rotación son las bajas sobre la dotación promedio', () => {
    const r = armarReporteMensual(datos);
    // 1 baja / ((4 + 4) / 2) = 25%
    expect(r.rotacionPct).toBe(25);
  });

  it('sin dotación no se afirma una rotación', () => {
    const r = armarReporteMensual(base({ empleados: [] }));
    expect(r.rotacionPct).toBeUndefined();
    expect(r.dotacion.valor).toBe(0);
  });

  it('compara la dotación contra el cierre del mes anterior', () => {
    const r = armarReporteMensual(datos);
    // Al 31/05: p1, p2, p3 y p5.
    expect(r.dotacion.anterior).toBe(4);
    expect(r.dotacion.variacion).toBe(0);
  });
});

describe('ausentismo', () => {
  const ausencia = (over: Partial<Ausencia> = {}): Ausencia => ({
    id: 'a1',
    empleadoId: 'ple-1',
    tipo: 'vacaciones',
    fechaDesde: '2026-06-01',
    fechaHasta: '2026-06-05',
    dias: 5,
    estado: 'aprobada',
    adjuntos: [],
    creadaEn: '2026-05-01',
    ...over,
  });

  it('usa la misma cuenta que el panel de control', () => {
    // No hay una segunda implementación: si divergieran, la misma empresa
    // vería dos ausentismos distintos en dos pantallas.
    const datos = base({ ausencias: [ausencia()] });
    const r = armarReporteMensual(datos);
    const directo = calcularAusentismo([ausencia()], 1, '2026-06');
    expect(r.ausentismoPct?.valor).toBe(directo.pct);
    expect(r.diasAusencia).toBe(directo.diasAusencia);
  });

  it('con el módulo de Ausencias apagado no se muestra un 0%', () => {
    // Un 0% diría "nadie faltó". La verdad es que la empresa no lleva ese
    // registro acá.
    const r = armarReporteMensual(base({ modulos: { ausencias: false } }));
    expect(r.ausentismoPct).toBeUndefined();
    expect(r.diasAusencia).toBeUndefined();
    expect(r.sinAusencias).toBe(true);
  });

  it('sin dotación tampoco se calcula', () => {
    const r = armarReporteMensual(base({ empleados: [] }));
    expect(r.ausentismoPct).toBeUndefined();
  });
});

describe('horas extras y su costo', () => {
  const conExtras = (horas: number) => [
    {
      empleadoId: 'ple-1',
      fecha: '2026-06-02',
      horasExtrasAprobadas: horas,
      incompleta: false,
    },
  ];

  it('suma sólo las aprobadas', () => {
    const r = armarReporteMensual(
      base({
        jornadas: [
          ...conExtras(2),
          {
            empleadoId: 'ple-1',
            fecha: '2026-06-03',
            horasExtrasAprobadas: 0,
            incompleta: false,
          },
        ],
      })
    );
    expect(r.horasExtras?.valor).toBe(2);
  });

  it('sin sueldo cargado no se estima el costo: se dice cuántos faltan', () => {
    const r = armarReporteMensual(base({ jornadas: conExtras(3) }));
    expect(r.horasExtras?.valor).toBe(3);
    // Cero porque a nadie se le pudo poner precio, y el contador de
    // parciales es el que avisa que ese cero es un piso, no el total.
    expect(r.costoExtras).toBe(0);
    expect(r.costoExtrasParcial).toBe(1);
  });

  it('sin extras aprobadas el costo es cero de verdad, no "no se sabe"', () => {
    // Acá sí se puede afirmar: no hay nada que pagar por este concepto.
    const r = armarReporteMensual(base({ jornadas: conExtras(0) }));
    expect(r.horasExtras?.valor).toBe(0);
    expect(r.costoExtras).toBe(0);
    expect(r.costoExtrasParcial).toBe(0);
  });

  it('con sueldo cargado sí, al 50% de recargo (art. 201 LCT)', () => {
    const r = armarReporteMensual(
      base({
        jornadas: conExtras(10),
        remuneraciones: [
          {
            id: 'r1',
            empleadoId: 'ple-1',
            periodo: '2026-06',
            tipo: 'mensual',
            montoBruto: 192_000,
            montoNeto: 160_000,
          },
        ],
      })
    );
    // 192.000 / 192 hs = 1.000 la hora; × 1,5 × 10 hs = 15.000.
    expect(r.costoExtras).toBe(15_000);
    expect(r.costoExtrasParcial).toBe(0);
  });

  it('con Fichaje apagado no hay horas extras que mostrar', () => {
    const r = armarReporteMensual(
      base({ modulos: { fichaje: false }, jornadas: conExtras(5) })
    );
    expect(r.horasExtras).toBeUndefined();
    expect(r.costoExtras).toBeUndefined();
    expect(r.sinFichaje).toBe(true);
  });
});

describe('masa salarial', () => {
  const rem = (over: Partial<Remuneracion> = {}): Remuneracion => ({
    id: 'r1',
    empleadoId: 'ple-1',
    periodo: '2026-06',
    tipo: 'mensual',
    montoBruto: 1_000_000,
    montoNeto: 830_000,
    ...over,
  });

  it('suma los brutos mensuales del período y compara con el anterior', () => {
    const r = armarReporteMensual(
      base({
        remuneraciones: [
          rem({ id: 'r0', periodo: '2026-05', montoBruto: 800_000 }),
          rem(),
        ],
      })
    );
    expect(r.masaSalarial?.valor).toBe(1_000_000);
    expect(r.masaSalarial?.anterior).toBe(800_000);
    expect(r.masaSalarial?.variacionPct).toBe(25);
  });

  it('el aguinaldo no infla la masa del mes', () => {
    // Junio y diciembre parecerían meses con 50% más de nómina todos los
    // años si el SAC entrara acá.
    const r = armarReporteMensual(
      base({
        remuneraciones: [
          rem(),
          rem({ id: 'r2', tipo: 'sac', montoBruto: 500_000 }),
        ],
      })
    );
    expect(r.masaSalarial?.valor).toBe(1_000_000);
  });

  it('dice cuántos de la dotación tienen sueldo cargado', () => {
    const r = armarReporteMensual(
      base({
        empleados: [empleado({ id: 'ple-1' }), empleado({ id: 'ple-2' })],
        remuneraciones: [rem()],
      })
    );
    expect(r.conSueldoCargado).toBe(1);
    expect(r.dotacion.valor).toBe(2);
  });

  it('sin ningún sueldo cargado no se muestra una masa de cero', () => {
    const r = armarReporteMensual(base());
    expect(r.masaSalarial).toBeUndefined();
    expect(r.costoLaboralTotal).toBeUndefined();
  });

  it('el costo laboral suma las cargas patronales configuradas', () => {
    const r = armarReporteMensual(
      base({
        empresa: empresa({
          config: { ...empresa().config, cargasPatronalesPct: 0.3 },
        }),
        remuneraciones: [rem()],
      })
    );
    expect(r.costoLaboralTotal).toBe(1_300_000);
  });

  it('en régimen simplificado no hay cargas que sumar', () => {
    const r = armarReporteMensual(
      base({
        empresa: empresa({ regimen: 'simplificado' }),
        remuneraciones: [rem()],
      })
    );
    expect(r.costoLaboralTotal).toBe(1_000_000);
  });

  it('con Remuneraciones apagado no se calcula nada de esto', () => {
    const r = armarReporteMensual(
      base({ modulos: { remuneraciones: false }, remuneraciones: [rem()] })
    );
    expect(r.masaSalarial).toBeUndefined();
    expect(r.sinRemuneraciones).toBe(true);
  });
});

describe('resumen ejecutivo', () => {
  it('cuenta el movimiento de dotación del mes', () => {
    const frases = resumenEjecutivo(
      armarReporteMensual(
        base({
          empleados: [
            empleado({ id: 'p1' }),
            empleado({ id: 'p2', fechaIngreso: '2026-06-05' }),
          ],
        })
      )
    );
    expect(frases[0]).toContain('1 alta');
  });

  it('dice explícitamente cuando no hubo movimiento', () => {
    const frases = resumenEjecutivo(armarReporteMensual(base()));
    expect(frases[0]).toContain('no se movió');
  });

  it('no escribe una frase sobre un indicador que no se pudo calcular', () => {
    // Empresa sin Ausencias ni Remuneraciones: el resumen habla sólo de
    // la dotación, no rellena con ceros.
    const frases = resumenEjecutivo(
      armarReporteMensual(
        base({ modulos: { ausencias: false, remuneraciones: false } })
      )
    );
    expect(frases).toHaveLength(1);
    expect(frases.join(' ')).not.toContain('ausentismo');
    expect(frases.join(' ')).not.toContain('masa salarial');
  });
});

describe('exportación del reporte', () => {
  it('no exporta los indicadores que no se pudieron calcular', () => {
    const filas = filasDeReporte(
      armarReporteMensual(
        base({
          modulos: { ausencias: false, remuneraciones: false, fichaje: false },
        })
      ),
      'Bombas del Sur'
    );
    const etiquetas = filas.map((f) => f[0]);
    expect(etiquetas).toContain('Dotación al cierre');
    expect(etiquetas).not.toContain('Ausentismo');
    expect(etiquetas).not.toContain('Masa salarial');
  });

  it('lleva empresa y período en el encabezado', () => {
    const filas = filasDeReporte(armarReporteMensual(base()), 'Bombas del Sur');
    expect(filas[0]).toEqual(['Empresa', 'Bombas del Sur']);
    expect(filas[1]).toEqual(['Período', '2026-06']);
  });
});

describe('acotar las remuneraciones por período no cambia ningún número', () => {
  /**
   * El servicio pasó de traer TODO el histórico y filtrarlo en memoria a
   * pedirle al servidor sólo el mes y el anterior.
   *
   * Estos casos son el seguro de ese cambio: le dan a la misma función
   * el histórico completo y el recorte, y exigen que el reporte salga
   * idéntico. Si algún indicador empezara a mirar un período viejo, acá
   * se rompe en vez de aparecer como un número raro en la visita.
   */
  const rem = (
    empleadoId: string,
    periodo: string,
    montoBruto: number,
    tipo: Remuneracion['tipo'] = 'mensual'
  ): Remuneracion => ({
    id: `${empleadoId}-${periodo}-${tipo}`,
    empleadoId,
    periodo,
    tipo,
    montoBruto,
    montoNeto: Math.round(montoBruto * 0.83),
  });

  const historico: Remuneracion[] = [
    // Años anteriores: nada de esto debería influir.
    rem('ple-1', '2024-11', 300_000),
    rem('ple-1', '2025-03', 500_000),
    rem('ple-1', '2025-12', 700_000, 'sac'),
    rem('ple-1', '2026-01', 750_000),
    rem('ple-1', '2026-04', 900_000),
    // Los dos que sí se usan.
    rem('ple-1', '2026-05', 1_000_000),
    rem('ple-1', '2026-06', 1_200_000),
    // Y uno posterior, que tampoco debería contar.
    rem('ple-1', '2026-07', 1_500_000),
  ];
  const recorte = historico.filter(
    (r) => r.periodo === '2026-06' || r.periodo === '2026-05'
  );

  const conJornadas = (rs: Remuneracion[]) =>
    base({
      remuneraciones: rs,
      jornadas: [
        {
          empleadoId: 'ple-1',
          fecha: '2026-06-02',
          horasExtrasAprobadas: 4,
          incompleta: false,
        },
      ],
    });

  it('el reporte entero sale idéntico', () => {
    expect(armarReporteMensual(conJornadas(recorte))).toEqual(
      armarReporteMensual(conJornadas(historico))
    );
  });

  it('la masa salarial es la del mes, no la de la historia', () => {
    const r = armarReporteMensual(conJornadas(recorte));
    expect(r.masaSalarial?.valor).toBe(1_200_000);
    expect(r.masaSalarial?.anterior).toBe(1_000_000);
  });

  it('el costo de las extras usa el bruto del período, no uno viejo', () => {
    const r = armarReporteMensual(conJornadas(recorte));
    // 1.200.000 / 192 = 6.250 la hora; × 1,5 × 4 hs = 37.500.
    expect(r.costoExtras).toBe(37_500);
  });

  it('la exportación también sale igual', () => {
    expect(
      filasDeReporte(armarReporteMensual(conJornadas(recorte)), 'X')
    ).toEqual(filasDeReporte(armarReporteMensual(conJornadas(historico)), 'X'));
  });
});
