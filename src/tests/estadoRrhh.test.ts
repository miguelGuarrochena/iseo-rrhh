import {
  AREAS,
  areaDeFalta,
  calcularEstadoRrhh,
  situacionesPrioritarias,
} from '@/lib/estadoRrhh';
import { ambitosDeFalta, faltasDeEmpleado } from '@/lib/requisitos';
import { VERSION_PLANTILLA } from '@/lib/facial/plantilla';
import type { Empleado, Empresa } from '@/types/rrhh';

/**
 * El Estado de RRHH no tiene reglas propias: es `requisitos.ts` agrupado.
 *
 * Lo que estos casos cuidan es justamente eso — que no aparezca una
 * segunda implementación del catálogo — y las tres cuentas que la
 * pantalla afirma: el porcentaje, el conteo sin duplicar personas y qué
 * es urgente.
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
  domicilio: 'Calle 1',
  telefono: '11',
  email: 'ana@empresa.com',
  contactoEmergencia: { nombreCompleto: '', vinculo: '', telefono: '' },
  grupoFamiliar: [],
  fechaIngreso: '2020-01-01',
  puesto: 'Operaria',
  sector: 'Producción',
  supervisorId: 'ple-9',
  modalidadContratacion: 'indeterminado',
  modalidadPago: 'mensual',
  banco: 'Nación',
  cbu: '0110000000000000000001',
  obraSocial: 'OSDE',
  art: 'Prevención',
  activo: true,
  checklistAlta: [],
  ...over,
});

const empresa = (over: Partial<Empresa> = {}): Empresa => ({
  id: 'emp-1',
  nombre: 'Bombas del Sur',
  cuit: '30-11111111-1',
  estado: 'activa',
  contactoNombre: 'Juan',
  contactoEmail: 'juan@empresa.com',
  config: {
    metodosFichaje: ['celular'],
    toleranciaLlegadaTardeMin: 10,
    horaEntrada: '08:00',
    horaSalida: '17:00',
    diasAvisoVencimiento: 30,
  },
  creadaEn: '2024-01-01',
  ...over,
});

/** Sin cuenta y sin sueldo consultados: el estado más "completo" posible. */
const todoSabido = (ids: string[]) => ({
  empleadosConCuenta: new Set(ids),
  empleadosConSueldo: new Set(ids),
});

describe('areaDeFalta', () => {
  it('cada falta del catálogo cae en exactamente un área', () => {
    // Si mañana se agrega una regla con un ámbito nuevo que ningún área
    // cubre, sus pendientes desaparecerían de la pantalla sin que nadie
    // se entere. Este caso lo hace fallar en vez de esconderlo.
    const claves = [
      'sin_cuenta',
      'sin_email',
      'sin_cuil',
      'sin_cbu',
      'sin_sueldo',
      'plazo_fijo_sin_fin',
      'facial_sin_rostro',
      'facial_plantilla_vieja',
      'facial_sin_consentimiento',
      'celular_sin_geocerca',
      'sin_supervisor',
    ];
    claves.forEach((clave) => {
      expect(ambitosDeFalta(clave).length).toBeGreaterThan(0);
      expect(areaDeFalta(clave)).toBeDefined();
    });
  });

  it('"sin cuenta" cuenta una sola vez, en Accesos', () => {
    // Pega en cuenta, recibos, firma y comunicaciones a la vez. El
    // problema de fondo es el acceso: contarla también en Liquidación
    // diría que hay dos pendientes donde hay uno.
    expect(ambitosDeFalta('sin_cuenta')).toContain('recibos');
    expect(areaDeFalta('sin_cuenta')).toBe('accesos');
  });

  it('el CUIL es un problema de liquidación, no de acceso', () => {
    expect(areaDeFalta('sin_cuil')).toBe('liquidacion');
  });

  it('una falta que no existe no tiene área', () => {
    expect(areaDeFalta('inventada')).toBeUndefined();
  });
});

describe('calcularEstadoRrhh — empresa sin problemas', () => {
  const entrada = {
    empleados: [empleado(), empleado({ id: 'ple-2', dni: '30111223' })],
    empresa: empresa(),
    ...todoSabido(['ple-1', 'ple-2']),
  };

  it('el nivel es "bien" y el cumplimiento 100%', () => {
    const estado = calcularEstadoRrhh(entrada);
    expect(estado.nivel).toBe('bien');
    expect(estado.cumplimientoPct).toBe(100);
    expect(estado.pendientes).toBe(0);
    expect(estado.bloqueantes).toBe(0);
    expect(estado.personasConPendientes).toBe(0);
  });

  it('todas las áreas quedan en 100% y sin detalle que mostrar', () => {
    const estado = calcularEstadoRrhh(entrada);
    estado.areas
      .filter((a) => a.clave !== 'empresa')
      .forEach((a) => {
        expect(a.cumplimientoPct).toBe(100);
        expect(a.items).toHaveLength(0);
      });
  });

  it('no hay nada que resolver primero', () => {
    expect(situacionesPrioritarias(calcularEstadoRrhh(entrada))).toHaveLength(
      0
    );
  });
});

describe('calcularEstadoRrhh — empresa con problemas', () => {
  const empleados = [
    // Le faltan dos cosas de áreas distintas: CBU (liquidación) y
    // supervisor (organigrama).
    empleado({ id: 'ple-1', cbu: '', supervisorId: null }),
    // Sin email: accesos.
    empleado({ id: 'ple-2', dni: '2', email: '' }),
    // Sin nada que le falte.
    empleado({ id: 'ple-3', dni: '3' }),
  ];
  const entrada = {
    empleados,
    empresa: empresa(),
    ...todoSabido(['ple-1', 'ple-2', 'ple-3']),
  };

  it('cuenta personas, no faltas, para el cumplimiento global', () => {
    const estado = calcularEstadoRrhh(entrada);
    // Dos personas con algo pendiente sobre tres: 33% al día.
    expect(estado.personasConPendientes).toBe(2);
    expect(estado.cumplimientoPct).toBe(33);
    // Pero tres pendientes en total: una persona aporta dos.
    expect(estado.pendientes).toBe(3);
  });

  it('sin nada que frene, el nivel es "atencion"', () => {
    expect(calcularEstadoRrhh(entrada).nivel).toBe('atencion');
  });

  it('reparte cada pendiente en su área', () => {
    const estado = calcularEstadoRrhh(entrada);
    const area = (clave: string) =>
      estado.areas.find((a) => a.clave === clave)!;
    expect(area('liquidacion').pendientes).toBe(1);
    expect(area('organigrama').pendientes).toBe(1);
    expect(area('accesos').pendientes).toBe(1);
    expect(area('contratos').pendientes).toBe(0);
  });

  it('el porcentaje de un área mira sólo a esa área', () => {
    const estado = calcularEstadoRrhh(entrada);
    // Una de tres personas tiene pendiente de organigrama: 67% al día.
    expect(
      estado.areas.find((a) => a.clave === 'organigrama')!.cumplimientoPct
    ).toBe(67);
  });

  it('el detalle trae el nombre y la ruta donde se arregla', () => {
    const estado = calcularEstadoRrhh(entrada);
    const area = estado.areas.find((a) => a.clave === 'organigrama')!;
    expect(area.items).toHaveLength(1);
    expect(area.items[0].nombre).toBe('Ana Pérez');
    expect(area.items[0].faltas[0].ruta).toBe('/colaboradores/ple-1/editar');
  });

  it('las bajas no se evalúan', () => {
    const conBaja = calcularEstadoRrhh({
      ...entrada,
      empleados: [
        ...empleados,
        empleado({ id: 'ple-4', dni: '4', activo: false, cbu: '' }),
      ],
    });
    expect(conBaja.evaluados).toBe(3);
    expect(conBaja.pendientes).toBe(3);
  });
});

describe('calcularEstadoRrhh — severidad', () => {
  it('una falta que frena vuelve el estado urgente', () => {
    const estado = calcularEstadoRrhh({
      empleados: [
        empleado({
          modoFichaje: 'planta',
          tieneRostro: true,
          descriptorVersion: VERSION_PLANTILLA - 1,
          consentimientoBiometrico: {
            aceptado: true,
            fecha: '2024-01-01',
            otorgadoPor: 'u1',
          },
        }),
      ],
      empresa: empresa(),
      ...todoSabido(['ple-1']),
    });
    expect(estado.nivel).toBe('urgente');
    expect(estado.bloqueantes).toBe(1);
    expect(estado.areas.find((a) => a.clave === 'fichaje')!.bloquea).toBe(true);
  });

  it('lo que frena va primero aunque afecte a menos gente', () => {
    const estado = calcularEstadoRrhh({
      empleados: [
        // Tres sin CBU: el pendiente más repetido.
        empleado({ id: 'ple-1', cbu: '' }),
        empleado({ id: 'ple-2', dni: '2', cbu: '' }),
        empleado({ id: 'ple-3', dni: '3', cbu: '' }),
        // Una sola con el rostro sin re-enrolar: pero no puede fichar.
        empleado({
          id: 'ple-4',
          dni: '4',
          modoFichaje: 'planta',
          tieneRostro: true,
          descriptorVersion: VERSION_PLANTILLA - 1,
          consentimientoBiometrico: {
            aceptado: true,
            fecha: '2024-01-01',
            otorgadoPor: 'u1',
          },
        }),
      ],
      empresa: empresa(),
      ...todoSabido(['ple-1', 'ple-2', 'ple-3', 'ple-4']),
    });
    const orden = situacionesPrioritarias(estado);
    expect(orden[0].falta.clave).toBe('facial_plantilla_vieja');
    expect(orden[0].falta.severidad).toBe('bloquea');
    expect(orden[1].falta.clave).toBe('sin_cbu');
    expect(orden[1].nombres).toHaveLength(3);
  });
});

describe('calcularEstadoRrhh — lo que todavía no se sabe', () => {
  it('sin consultar las cuentas no se inventa "sin cuenta"', () => {
    // `undefined` es "no se consultó", no "no tiene". Un Set vacío diría
    // que nadie tiene cuenta y llenaría la pantalla de falsos pendientes.
    const estado = calcularEstadoRrhh({
      empleados: [empleado()],
      empresa: empresa(),
    });
    expect(estado.pendientes).toBe(0);
    expect(estado.nivel).toBe('bien');
  });

  it('con el conjunto vacío sí falta la cuenta', () => {
    const estado = calcularEstadoRrhh({
      empleados: [empleado()],
      empresa: empresa(),
      empleadosConCuenta: new Set<string>(),
      empleadosConSueldo: new Set<string>(),
    });
    expect(estado.pendientes).toBe(2); // sin cuenta + sin sueldo
  });

  it('sin empleados no se afirma un 100%', () => {
    const estado = calcularEstadoRrhh({ empleados: [], empresa: empresa() });
    expect(estado.evaluados).toBe(0);
    expect(estado.cumplimientoPct).toBeUndefined();
  });
});

describe('calcularEstadoRrhh — módulos apagados', () => {
  const conRostroViejo = empleado({
    modoFichaje: 'planta',
    tieneRostro: true,
    descriptorVersion: VERSION_PLANTILLA - 1,
    consentimientoBiometrico: {
      aceptado: true,
      fecha: '2024-01-01',
      otorgadoPor: 'u1',
    },
  });

  it('una empresa sin Fichaje no ve el área de fichaje', () => {
    const estado = calcularEstadoRrhh({
      empleados: [conRostroViejo],
      empresa: empresa(),
      ...todoSabido(['ple-1']),
      modulos: { fichaje: false },
    });
    expect(estado.areas.some((a) => a.clave === 'fichaje')).toBe(false);
  });

  it('y tampoco cuenta sus pendientes en el total', () => {
    // Si se contaran, el resumen diría "1 situación urgente" y abajo no
    // habría dónde verla: el número de arriba tiene que coincidir con lo
    // que se muestra.
    const estado = calcularEstadoRrhh({
      empleados: [conRostroViejo],
      empresa: empresa(),
      ...todoSabido(['ple-1']),
      modulos: { fichaje: false },
    });
    expect(estado.pendientes).toBe(0);
    expect(estado.bloqueantes).toBe(0);
    expect(estado.nivel).toBe('bien');
    expect(estado.personasConPendientes).toBe(0);
  });

  it('con Fichaje encendido sí se cuenta', () => {
    const estado = calcularEstadoRrhh({
      empleados: [conRostroViejo],
      empresa: empresa(),
      ...todoSabido(['ple-1']),
      modulos: { fichaje: true },
    });
    expect(estado.nivel).toBe('urgente');
    expect(estado.pendientes).toBe(1);
  });

  it('Liquidación se muestra si queda encendida al menos una de las dos secciones', () => {
    const soloRecibos = calcularEstadoRrhh({
      empleados: [empleado()],
      empresa: empresa(),
      modulos: { remuneraciones: false },
    });
    expect(soloRecibos.areas.some((a) => a.clave === 'liquidacion')).toBe(true);

    const ninguna = calcularEstadoRrhh({
      empleados: [empleado()],
      empresa: empresa(),
      modulos: { remuneraciones: false, recibos: false },
    });
    expect(ninguna.areas.some((a) => a.clave === 'liquidacion')).toBe(false);
  });
});

describe('calcularEstadoRrhh — configuración de la empresa', () => {
  it('el CUIT vacío aparece como pendiente de la empresa', () => {
    const estado = calcularEstadoRrhh({
      empleados: [empleado()],
      empresa: empresa({ cuit: '' }),
      ...todoSabido(['ple-1']),
    });
    const area = estado.areas.find((a) => a.clave === 'empresa')!;
    expect(area.pendientes).toBe(1);
    expect(area.faltasEmpresa[0].ruta).toBe('/configuracion');
    // No es una persona: el área no tiene porcentaje.
    expect(area.cumplimientoPct).toBeUndefined();
    // Pero sí suma al total y cambia el nivel.
    expect(estado.pendientes).toBe(1);
    expect(estado.nivel).toBe('atencion');
    // Y no ensucia el porcentaje de legajos, que es de personas.
    expect(estado.cumplimientoPct).toBe(100);
  });

  it('sin empresa cargada no se inventan pendientes de configuración', () => {
    const estado = calcularEstadoRrhh({ empleados: [empleado()] });
    expect(estado.areas.find((a) => a.clave === 'empresa')!.pendientes).toBe(0);
  });
});

describe('la fuente de verdad sigue siendo requisitos.ts', () => {
  it('los pendientes de una persona son exactamente los que devuelve faltasDeEmpleado', () => {
    const e = empleado({ cbu: '', cuil: '', supervisorId: null });
    const esperadas = faltasDeEmpleado(e, {
      tieneCuenta: true,
      tieneSueldo: true,
    });
    const estado = calcularEstadoRrhh({
      empleados: [e],
      ...todoSabido(['ple-1']),
    });
    const enElEstado = estado.areas
      .flatMap((a) => a.items)
      .flatMap((i) => i.faltas)
      .map((f) => f.clave)
      .sort();
    expect(enElEstado).toEqual(esperadas.map((f) => f.clave).sort());
  });

  it('toda área de personas declara al menos un ámbito', () => {
    // Un área sin ámbitos nunca recibiría pendientes: quedaría siempre
    // en 100% sin que eso signifique nada.
    AREAS.filter((a) => a.clave !== 'empresa').forEach((a) => {
      expect(a.ambitos.length).toBeGreaterThan(0);
    });
  });
});
