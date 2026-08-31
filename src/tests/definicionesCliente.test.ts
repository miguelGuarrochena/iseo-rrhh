import {
  MODALIDADES_CON_AGUINALDO,
  RECARGO_EXTRA_100,
  RECARGO_EXTRA_50,
  advertenciaDeLimiteDescuentos,
  costoLaboral,
  errorDeLimitesLiquidacion,
  valorHora,
  valorHorasExtras,
  valorHorasExtrasPorRecargo,
} from '@/lib/remuneraciones';
import { controlarJornada } from '@/lib/turnos';
import {
  TIPOS_LICENCIA_CON_CUPO,
  TIPOS_LICENCIA_POR_EVENTO,
} from '@/types/rrhh';
import {
  tipoAusenciaColores,
  tipoAusenciaIconos,
  tipoAusenciaLabels,
} from '@/lib/etiquetas';
import { moduloActivo } from '@/components/app/navItems';
import { calcularEstadoRrhh } from '@/lib/estadoRrhh';
import { armarReporteMensual } from '@/lib/reporteMensual';
import { armarNovedades } from '@/lib/novedades';
import type { Empleado, Empresa, TipoAusencia } from '@/types/rrhh';

/**
 * Las definiciones que respondió el cliente el 30/08, fijadas como
 * casos.
 *
 * Varias comprueban que algo **no** pasa: que el sábado no invente una
 * hora extra, que no aparezca la modalidad quincenal, que una empresa
 * sin control horario no vea horas. Son las que más fácil se rompen sin
 * que nadie lo note, porque nadie mira lo que no está.
 */

// ---------------------------------------------------------------
// 1. Modalidad de remuneración
// ---------------------------------------------------------------

describe('modalidad de remuneración: mensual, sin quincenal', () => {
  it('el cálculo del período no depende de la modalidad de pago', () => {
    // `modalidadPago` es un dato del legajo y no entra en ninguna cuenta:
    // el bruto del período es el bruto del período. Por eso sumar
    // jornalizados algún día no obliga a tocar la liquidación mensual.
    const conBruto = {
      montoBruto: 1_000_000,
      regimen: 'relacion_dependencia' as const,
    };
    expect(costoLaboral(conBruto).total).toBe(1_270_000);
  });

  it('el valor hora ya se deriva del bruto y las horas del mes', () => {
    // Es la pieza que el cliente pidió dejar preparada: "puede ser en el
    // futuro que por cantidad de horas se multiplique por el valor hora".
    // No hace falta un modelo nuevo, la función ya existe.
    expect(valorHora(192_000, 192)).toBe(1000);
    expect(valorHora(240_000, 160)).toBe(1500);
  });

  it('sin bruto o sin horas no inventa un valor hora', () => {
    expect(valorHora(0, 192)).toBe(0);
    expect(valorHora(100_000, 0)).toBe(0);
  });

  it('el aguinaldo sigue atado a la modalidad de contratación, no a la de pago', () => {
    expect([...MODALIDADES_CON_AGUINALDO]).toEqual([
      'indeterminado',
      'plazo_fijo',
      'eventual',
    ]);
  });
});

// ---------------------------------------------------------------
// 2. El sábado es jornada normal
// ---------------------------------------------------------------

describe('el sábado no genera hora extra por sí mismo', () => {
  /** 2027-01-16 es sábado; 2027-01-13, miércoles. */
  const turnoGastronomia = { horaEntrada: '20:00', horaSalida: '02:00' };

  it('un sábado trabajado dentro de su turno no da extras', () => {
    const r = controlarJornada(
      {
        entrada: '2027-01-16T23:00:00.000Z', // 20:00 ART
        salida: '2027-01-17T05:00:00.000Z', // 02:00 ART
      },
      turnoGastronomia
    );
    expect(r.extrasMin).toBe(0);
    expect(r.llegadaTardeMin).toBe(0);
  });

  it('el mismo turno un miércoles da exactamente lo mismo', () => {
    // Si el día de la semana entrara en la cuenta, estos dos números
    // diferirían. La regla es el horario, no el calendario.
    const sabado = controlarJornada(
      {
        entrada: '2027-01-16T23:00:00.000Z',
        salida: '2027-01-17T05:00:00.000Z',
      },
      turnoGastronomia
    );
    const miercoles = controlarJornada(
      {
        entrada: '2027-01-13T23:00:00.000Z',
        salida: '2027-01-14T05:00:00.000Z',
      },
      turnoGastronomia
    );
    expect(sabado).toEqual(miercoles);
  });

  it('quedarse más allá del turno sí da extras, sea sábado o no', () => {
    const r = controlarJornada(
      {
        entrada: '2027-01-16T23:00:00.000Z',
        salida: '2027-01-17T07:00:00.000Z', // 04:00 ART, dos horas de más
      },
      turnoGastronomia
    );
    expect(r.extrasMin).toBe(120);
  });
});

// ---------------------------------------------------------------
// 8. Horas extras: 50% = ×1,5 y 100% = ×2
// ---------------------------------------------------------------

describe('recargos de hora extra (art. 201 LCT)', () => {
  it('los dos recargos son los que dijo el cliente', () => {
    expect(RECARGO_EXTRA_50).toBe(1.5);
    expect(RECARGO_EXTRA_100).toBe(2);
  });

  it('al 50% es valor hora × 1,5', () => {
    // 192.000 / 192 = 1.000 la hora → 10 hs × 1.000 × 1,5 = 15.000
    expect(valorHorasExtras(192_000, 10, 192)).toBe(15_000);
  });

  it('al 100% es valor hora × 2', () => {
    const r = valorHorasExtrasPorRecargo({
      montoBruto: 192_000,
      horas100: 10,
      horasMensuales: 192,
    });
    expect(r.al100).toBe(20_000);
    expect(r.al50).toBe(0);
  });

  it('separa los dos buckets y los suma', () => {
    const r = valorHorasExtrasPorRecargo({
      montoBruto: 192_000,
      horas50: 4,
      horas100: 2,
      horasMensuales: 192,
    });
    expect(r.al50).toBe(6_000);
    expect(r.al100).toBe(4_000);
    expect(r.total).toBe(10_000);
  });

  it('el sistema no clasifica las horas: se las declara quien liquida', () => {
    // No hay ninguna función que reciba una fecha y decida el recargo.
    // Es a propósito: trabajar sábado no implica recargo (punto 2).
    const r = valorHorasExtrasPorRecargo({
      montoBruto: 192_000,
      horas50: 8,
      horasMensuales: 192,
    });
    expect(r.al100).toBe(0);
  });

  it('horas negativas no restan', () => {
    const r = valorHorasExtrasPorRecargo({
      montoBruto: 192_000,
      horas50: -5,
      horas100: -5,
      horasMensuales: 192,
    });
    expect(r.total).toBe(0);
  });
});

// ---------------------------------------------------------------
// 12. Límite del 20% y embargos
// ---------------------------------------------------------------

describe('tope del 20% (art. 133) y embargo judicial', () => {
  const base = { montoBruto: 1_000_000, aportes: 170_000 };

  it('sin embargo, pasarse del 20% sigue frenando', () => {
    const e = errorDeLimitesLiquidacion({ ...base, otrosDescuentos: 300_000 });
    expect(e).toContain('art. 133');
  });

  it('con embargo, no frena', () => {
    expect(
      errorDeLimitesLiquidacion({
        ...base,
        otrosDescuentos: 300_000,
        conEmbargo: true,
      })
    ).toBeNull();
  });

  it('pero se sigue informando: no bloquear no es no avisar', () => {
    const a = advertenciaDeLimiteDescuentos({
      montoBruto: 1_000_000,
      otrosDescuentos: 300_000,
      conEmbargo: true,
    });
    expect(a).toContain('embargo judicial registrado');
    expect(a).toContain('30%');
  });

  it('sin embargo la advertencia también existe, con otro texto', () => {
    const a = advertenciaDeLimiteDescuentos({
      montoBruto: 1_000_000,
      otrosDescuentos: 300_000,
    });
    expect(a).toContain('art. 133');
    expect(a).not.toContain('embargo');
  });

  it('dentro del 20% no hay ni error ni advertencia', () => {
    expect(
      errorDeLimitesLiquidacion({ ...base, otrosDescuentos: 150_000 })
    ).toBeNull();
    expect(
      advertenciaDeLimiteDescuentos({
        montoBruto: 1_000_000,
        otrosDescuentos: 150_000,
      })
    ).toBeNull();
  });

  it('el embargo NO habilita un neto negativo', () => {
    // Que el tope del 133 no aplique no vuelve válida una cuenta que no
    // cierra: eso no es un límite legal, es una resta mal hecha.
    const e = errorDeLimitesLiquidacion({
      montoBruto: 100_000,
      aportes: 17_000,
      otrosDescuentos: 200_000,
      conEmbargo: true,
    });
    expect(e).toContain('negativo');
  });
});

// ---------------------------------------------------------------
// 10. Maternidad, nacimiento y excedencia
// ---------------------------------------------------------------

describe('maternidad, nacimiento y excedencia como tipos propios', () => {
  const nuevos: TipoAusencia[] = ['maternidad', 'nacimiento', 'excedencia'];

  it('existen como tipos, no como "licencia especial"', () => {
    nuevos.forEach((t) => {
      expect(tipoAusenciaLabels[t]).toBeTruthy();
      expect(tipoAusenciaLabels[t]).not.toBe(tipoAusenciaLabels.especial);
    });
  });

  it('tienen su propio ícono y color en el calendario', () => {
    nuevos.forEach((t) => {
      expect(tipoAusenciaIconos[t]).toBeDefined();
      expect(tipoAusenciaColores[t]).toBeTruthy();
      expect(tipoAusenciaColores[t]).not.toBe(tipoAusenciaColores.especial);
    });
  });

  it('son licencias por evento: no consumen un cupo anual', () => {
    // Maternidad (art. 177) y excedencia (art. 183) tienen duración legal
    // propia; nacimiento (art. 158) se da cada vez que ocurre el hecho.
    nuevos.forEach((t) => {
      expect(TIPOS_LICENCIA_POR_EVENTO).toContain(t);
      expect(TIPOS_LICENCIA_CON_CUPO).not.toContain(t);
    });
  });

  it('hay UNA sola excedencia: la duración la dan las fechas', () => {
    // El cliente pidió no multiplicar tipos por los 3 a 6 meses.
    const tipos = Object.keys(tipoAusenciaLabels);
    expect(tipos.filter((t) => t.includes('excedencia'))).toEqual([
      'excedencia',
    ]);
  });

  it('no son parciales de jornada: se cargan por rango de fechas', () => {
    const novedades = armarNovedades({
      periodo: '2026-06',
      empleados: [],
      ausencias: [
        {
          id: 'a1',
          empleadoId: 'ple-1',
          tipo: 'excedencia',
          fechaDesde: '2026-06-01',
          fechaHasta: '2026-08-31',
          dias: 92,
          estado: 'aprobada',
          adjuntos: [],
          creadaEn: '2026-05-01',
        },
      ],
      remuneraciones: [],
      adelantos: [],
      descuentos: [],
      jornadas: [],
    });
    const licencias = novedades.categorias.find((c) => c.clave === 'ausencias');
    expect(licencias?.items).toHaveLength(1);
    // Y se etiqueta como sin goce, que es lo que dice el art. 183.
    expect(licencias?.items[0].nota).toBe('Sin goce de sueldo');
  });
});

// ---------------------------------------------------------------
// 16. Empresas sin control horario
// ---------------------------------------------------------------

const empleado = (over: Partial<Empleado> = {}): Empleado => ({
  id: 'ple-1',
  empresaId: 'emp-1',
  nombre: 'Ana',
  apellido: 'Pérez',
  dni: '1',
  cuil: '27-1-4',
  fechaNacimiento: '1990-01-01',
  estadoCivil: 'soltero',
  nivelEstudios: 'secundario',
  domicilio: '',
  telefono: '',
  email: 'a@a.com',
  contactoEmergencia: { nombreCompleto: '', vinculo: '', telefono: '' },
  grupoFamiliar: [],
  fechaIngreso: '2020-01-01',
  puesto: 'Administrativa',
  sector: 'Admin',
  supervisorId: 'ple-9',
  modalidadContratacion: 'indeterminado',
  modalidadPago: 'mensual',
  banco: '',
  cbu: '0110000000000000000001',
  obraSocial: '',
  art: '',
  activo: true,
  checklistAlta: [],
  ...over,
});

const empresa = (over: Partial<Empresa> = {}): Empresa => ({
  id: 'emp-1',
  nombre: 'Estudio Administrativo',
  cuit: '30-1-1',
  estado: 'activa',
  contactoNombre: 'X',
  contactoEmail: 'x@x.com',
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

describe('empresa sin control horario', () => {
  const sinFichaje = { fichaje: false, turnos: false };

  it('el módulo Fichaje es el interruptor del control horario', () => {
    expect(moduloActivo('fichaje', sinFichaje)).toBe(false);
    expect(moduloActivo('turnos', sinFichaje)).toBe(false);
    // Y encendido por defecto: apagarlo es una decisión explícita.
    expect(moduloActivo('fichaje', {})).toBe(true);
  });

  it('el Estado de RRHH no evalúa el área de fichaje', () => {
    const estado = calcularEstadoRrhh({
      empleados: [empleado({ modoFichaje: 'planta' })],
      empresa: empresa(),
      empleadosConCuenta: new Set(['ple-1']),
      empleadosConSueldo: new Set(['ple-1']),
      modulos: sinFichaje,
    });
    expect(estado.areas.some((a) => a.clave === 'fichaje')).toBe(false);
    // Y no le pide enrolar el rostro a nadie.
    expect(estado.pendientes).toBe(0);
  });

  it('el reporte mensual no muestra horas extras ni su costo', () => {
    const r = armarReporteMensual({
      periodo: '2026-06',
      empresa: empresa(),
      empleados: [empleado()],
      ausencias: [],
      remuneraciones: [],
      jornadas: [
        {
          empleadoId: 'ple-1',
          fecha: '2026-06-02',
          horasExtrasAprobadas: 5,
          incompleta: true,
        },
      ],
      modulos: sinFichaje,
    });
    expect(r.horasExtras).toBeUndefined();
    expect(r.costoExtras).toBeUndefined();
    expect(r.sinFichaje).toBe(true);
  });

  it('el cierre del mes no lista extras ni jornadas sin cerrar', () => {
    const novedades = armarNovedades({
      periodo: '2026-06',
      empleados: [empleado()],
      ausencias: [],
      remuneraciones: [],
      adelantos: [],
      descuentos: [],
      jornadas: [
        {
          empleadoId: 'ple-1',
          fecha: '2026-06-02',
          horasExtrasAprobadas: 5,
          incompleta: true,
        },
      ],
      modulos: sinFichaje,
    });
    const claves = novedades.categorias.map((c) => c.clave);
    expect(claves).not.toContain('extras');
    expect(claves).not.toContain('sin_cerrar');
  });

  it('con control horario encendido todo eso vuelve', () => {
    const conFichaje = { fichaje: true, turnos: true };
    const estado = calcularEstadoRrhh({
      empleados: [empleado({ modoFichaje: 'planta' })],
      empresa: empresa(),
      empleadosConCuenta: new Set(['ple-1']),
      empleadosConSueldo: new Set(['ple-1']),
      modulos: conFichaje,
    });
    expect(estado.areas.some((a) => a.clave === 'fichaje')).toBe(true);
    expect(estado.pendientes).toBeGreaterThan(0);
  });
});
