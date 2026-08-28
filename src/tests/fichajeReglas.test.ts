/**
 * Las reglas nuevas del contrato de fichaje, del lado del cliente.
 *
 * La autoridad de las tres está en PostgreSQL —los tests que mandan son
 * `supabase/tests/fichaje_reglas.test.sql`— pero el modo demo tiene que
 * respetar el mismo contrato. Si divergen, la demo enseña un
 * comportamiento que producción no tiene, que es exactamente cómo se
 * colaron antes bugs de este módulo.
 */
import {
  actualizarEmpleado,
  anularFichaje,
  enrolarRostro,
  ficharAhora,
  ficharConRostro,
  getFichajesDeEmpleado,
} from '@/lib/services/rrhh';
import { interpretarError } from '@/lib/errores';

const consentimiento = {
  aceptado: true,
  texto: 'Autoriza el uso de su rostro para registrar asistencia.',
};

// ============================================================
// A04 — no se ficha en el futuro
// ============================================================

describe('A04: fichajes con fecha futura', () => {
  it('rechaza una marca del año que viene', async () => {
    await expect(
      ficharAhora('ple-5', {
        metodo: 'manual',
        tipo: 'ingreso',
        timestamp: new Date('2099-01-10T12:00:00Z').toISOString(),
        motivo: 'Prueba',
      })
    ).rejects.toThrow(/fecha futura/i);
  });

  it('rechaza aunque sea sólo una hora adelante', async () => {
    await expect(
      ficharAhora('ple-5', {
        metodo: 'manual',
        tipo: 'ingreso',
        timestamp: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        motivo: 'Prueba',
      })
    ).rejects.toThrow(/fecha futura/i);
  });

  it('tolera el margen de reloj: dos minutos adelante entra', async () => {
    // Las tablets de planta se desajustan. Rechazar una fichada real por
    // noventa segundos de deriva sería peor que el problema que esto
    // resuelve.
    const marca = await ficharAhora('ple-5', {
      metodo: 'manual',
      tipo: 'ingreso',
      timestamp: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      motivo: 'Reloj de la tablet adelantado',
    });
    expect(marca.id).toBeTruthy();
  });

  it('el mensaje le dice a la persona qué revisar', () => {
    const i = interpretarError(
      new Error('No se puede registrar un fichaje con fecha futura.')
    );
    expect(i.titulo).toMatch(/todavía no llegó/i);
    expect(i.reintentable).toBe(false);
  });
});

// ============================================================
// A06 — la geocerca rechaza, no anota
// ============================================================

describe('A06: geocerca', () => {
  const OFICINA = { lat: -34.7203, lng: -58.2542 };
  const LEJOS = { lat: -34.6037, lng: -58.3816 }; // ~18 km

  /** Deja al empleado con modo celular y una zona de 150 m. */
  const conGeocerca = async (id: string, descriptor: number[]) => {
    await actualizarEmpleado(id, {
      modoFichaje: 'celular',
      geocerca: { ...OFICINA, radioM: 150 },
    });
    await enrolarRostro(id, descriptor, consentimiento);
  };

  it('sin ubicación NO se ficha, aunque el rostro sea correcto', async () => {
    // El agujero que cerró A06: `obtenerUbicacion()` es best-effort y
    // devuelve undefined si la persona deniega el permiso. Antes la marca
    // se guardaba igual y quedaba indistinguible de una hecha en la zona.
    await conGeocerca('ple-2', [0.31, 0.31, 0.31]);
    await expect(
      ficharConRostro([0.31, 0.31, 0.31], { empleadoId: 'ple-2' })
    ).rejects.toThrow(/no podemos verificar tu ubicación/i);
  });

  it('fuera de la zona tampoco', async () => {
    await conGeocerca('ple-3', [0.32, 0.32, 0.32]);
    await expect(
      ficharConRostro([0.32, 0.32, 0.32], { empleadoId: 'ple-3', geo: LEJOS })
    ).rejects.toThrow(/fuera de tu zona/i);
  });

  it('dentro de la zona ficha normalmente', async () => {
    await conGeocerca('ple-4', [0.33, 0.33, 0.33]);
    const marca = await ficharConRostro([0.33, 0.33, 0.33], {
      empleadoId: 'ple-4',
      geo: OFICINA,
    });
    expect(marca.id).toBeTruthy();
    expect(marca.fueraDeZona).toBeFalsy();
  });

  it('sin geocerca configurada, la ubicación no hace falta', async () => {
    await actualizarEmpleado('ple-6', {
      modoFichaje: 'celular',
      geocerca: undefined,
    });
    await enrolarRostro('ple-6', [0.41, 0.41, 0.41], consentimiento);

    const marca = await ficharConRostro([0.41, 0.41, 0.41], {
      empleadoId: 'ple-6',
    });
    expect(marca.id).toBeTruthy();
  });

  it('los dos rechazos piden cosas distintas y ninguno reintenta la cámara', () => {
    // `FichajeFacialModal` reinicia la captura cuando el error es
    // reintentable. Acá volver a poner la cara no arregla nada: hay que
    // dar el permiso o moverse. Con `true` quedaba el bucle de "parpadeá".
    const sinUbicacion = interpretarError(
      new Error(
        'No podemos verificar tu ubicación. Activá el permiso de ubicación para fichar.'
      )
    );
    const fuera = interpretarError(
      new Error(
        'Estás fuera de tu zona de trabajo. Acercate al lugar donde te toca fichar.'
      )
    );
    expect(sinUbicacion.reintentable).toBe(false);
    expect(fuera.reintentable).toBe(false);
    expect(sinUbicacion.detalle).toMatch(/permiso de ubicación/i);
    expect(fuera.detalle).toMatch(/acercate/i);
    expect(sinUbicacion.titulo).not.toBe(fuera.titulo);
  });
});

// ============================================================
// A07 — el tipo no lo elige quien ficha por sí mismo
// ============================================================

describe('A07: el tipo lo decide el servidor en el fichaje propio', () => {
  it('pidiendo dos veces el mismo tipo, la base igual alterna', async () => {
    // Si `p_tipo` se respetara en el camino 1:1, las dos marcas saldrían
    // 'ingreso' y quedaría una secuencia imposible con la que estirar la
    // jornada propia. El tipo lo decide `tipo_de_marca_siguiente()`.
    await actualizarEmpleado('ple-1', {
      modoFichaje: 'celular',
      geocerca: undefined,
    });
    await enrolarRostro('ple-1', [0.52, 0.52, 0.52], consentimiento);

    const primera = await ficharConRostro([0.52, 0.52, 0.52], {
      empleadoId: 'ple-1',
      tipo: 'ingreso',
    });
    const segunda = await ficharConRostro([0.521, 0.52, 0.52], {
      empleadoId: 'ple-1',
      tipo: 'ingreso',
    });

    expect(segunda.tipo).not.toBe(primera.tipo);
  });
});

// ============================================================
// A01 — el lector que se olvidaba de filtrar anuladas
// ============================================================

describe('A01: getFichajesDeEmpleado no devuelve marcas anuladas', () => {
  it('la marca anulada desaparece del listado del colaborador', async () => {
    const marca = await ficharAhora('ple-5', {
      metodo: 'manual',
      tipo: 'ingreso',
      motivo: 'Prueba',
    });

    const antes = await getFichajesDeEmpleado('ple-5');
    expect(antes.some((f) => f.id === marca.id)).toBe(true);

    await anularFichaje(marca.id, 'Cargada en el legajo equivocado');

    const despues = await getFichajesDeEmpleado('ple-5');
    expect(despues.some((f) => f.id === marca.id)).toBe(false);
  });
});
