import { actualizarConfigEmpresa } from '@/lib/services/supabase/real';
import { supabase } from '@/lib/supabase/cliente';
import type { ConfigEmpresa } from '@/types/rrhh';

/**
 * Las secciones activas son el alcance contratado, no una preferencia del
 * cliente. La pantalla de Configuración las muestra de sólo lectura y los
 * interruptores viven en Empresas → Módulos, que sólo abre el superadmin.
 *
 * Esconder el control no alcanzaba: `empresas_update_admin` es una policy
 * de FILA, así que con la clave publishable —que viaja en el bundle— un
 * admin_rrhh podía mandar un PATCH a PostgREST con
 * `{"config": {..., "modulos": {...}}}` y prenderse una sección apagada.
 *
 * Quien lo impide de verdad es el trigger `columnas_de_iseo` (migración
 * 111), y eso se prueba contra Postgres en
 * `supabase/tests/columnas_de_iseo.test.sql`.
 *
 * Acá se cuida el otro lado del mismo problema: que el único camino por el
 * que el cliente escribe `config` no mande módulos propios. Si lo mandara,
 * la base lo rechazaría —bien— pero el admin se quedaría sin poder guardar
 * sus horarios, con un error que no explica nada.
 */

jest.mock('@/lib/supabase/cliente', () => ({
  supabase: jest.fn(),
  supabaseConfigurado: () => true,
}));

jest.mock('@/lib/auth/store', () => ({
  empresaOperativaId: () => 'emp-1',
  haySesionReal: () => true,
  useAuthStore: { getState: () => ({ usuario: null }) },
}));

/** Lo que quedó guardado en la fila de `empresas`. */
const CONFIG_GUARDADA = {
  horaEntrada: '08:00',
  horaSalida: '17:00',
  toleranciaLlegadaTardeMin: 10,
  diasAvisoVencimiento: 30,
  // ISEO le apagó Reportes: no está en lo que contrató.
  modulos: { reportes: false },
} as unknown as ConfigEmpresa;

/** Payload que efectivamente sale hacia PostgREST. */
let enviado: Record<string, unknown> | null = null;

const clienteFalso = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: { id: 'emp-1', config: CONFIG_GUARDADA },
          error: null,
        }),
      }),
    }),
    update: (valores: Record<string, unknown>) => {
      // Lo mismo que hace supabase-js antes de mandarlo: las claves con
      // `undefined` no viajan.
      enviado = JSON.parse(JSON.stringify(valores)) as Record<string, unknown>;
      return {
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: {
                id: 'emp-1',
                nombre: 'Cliente SA',
                cuit: '30-1',
                estado: 'activa',
                contacto_nombre: 'Ana',
                contacto_email: 'a@a.com',
                config: valores.config,
                servicios: {},
                creada_en: '2026-01-01',
              },
              error: null,
            }),
          }),
        }),
      };
    },
  }),
});

const modulosEnviados = () =>
  (enviado?.config as { modulos?: Record<string, boolean> } | undefined)
    ?.modulos;

beforeEach(() => {
  enviado = null;
  (supabase as jest.Mock).mockReturnValue(clienteFalso());
});

describe('el cliente no escribe sus propias secciones activas', () => {
  it('un formulario manipulado no logra prenderse una sección', async () => {
    // El escenario del ataque: el estado del form llega con Reportes en
    // true, sea por un PATCH a mano o por un bundle modificado.
    await actualizarConfigEmpresa({
      ...CONFIG_GUARDADA,
      modulos: { reportes: true },
    } as ConfigEmpresa);

    expect(modulosEnviados()).toEqual({ reportes: false });
    expect(modulosEnviados()?.reportes).toBe(false);
  });

  it('tampoco apagando una sección que sí tiene', async () => {
    await actualizarConfigEmpresa({
      ...CONFIG_GUARDADA,
      modulos: { reportes: false, recibos: false },
    } as ConfigEmpresa);

    expect(modulosEnviados()).toEqual({ reportes: false });
  });

  it('ni borrando la clave para caer al default "todo encendido"', async () => {
    const sinModulos = { ...CONFIG_GUARDADA } as Record<string, unknown>;
    delete sinModulos.modulos;

    await actualizarConfigEmpresa(sinModulos as unknown as ConfigEmpresa);

    expect(modulosEnviados()).toEqual({ reportes: false });
  });
});

describe('lo que el admin_rrhh sí administra sigue funcionando', () => {
  it('guarda horarios, tolerancia y avisos', async () => {
    await actualizarConfigEmpresa({
      ...CONFIG_GUARDADA,
      horaEntrada: '09:00',
      horaSalida: '18:00',
      toleranciaLlegadaTardeMin: 15,
      diasAvisoVencimiento: 45,
    } as ConfigEmpresa);

    const config = enviado?.config as Record<string, unknown>;
    expect(config.horaEntrada).toBe('09:00');
    expect(config.horaSalida).toBe('18:00');
    expect(config.toleranciaLlegadaTardeMin).toBe(15);
    expect(config.diasAvisoVencimiento).toBe(45);
  });

  it('guarda el resumen semanal y la escala de vacaciones', async () => {
    await actualizarConfigEmpresa({
      ...CONFIG_GUARDADA,
      resumenSemanal: false,
      vacacionesDiasHabiles: true,
    } as unknown as ConfigEmpresa);

    const config = enviado?.config as Record<string, unknown>;
    expect(config.resumenSemanal).toBe(false);
    expect(config.vacacionesDiasHabiles).toBe(true);
    // Y sin arrastrar módulos ajenos en el mismo update.
    expect(modulosEnviados()).toEqual({ reportes: false });
  });

  it('una empresa sin la clave `modulos` no la estrena de la nada', async () => {
    // Ausente y `{}` son el mismo estado (todo encendido). Mandar `{}`
    // donde no había nada haría fallar el update entero contra el trigger.
    (supabase as jest.Mock).mockReturnValue({
      ...clienteFalso(),
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'emp-1', config: { horaEntrada: '08:00' } },
              error: null,
            }),
          }),
        }),
        update: (valores: Record<string, unknown>) => {
          enviado = JSON.parse(JSON.stringify(valores)) as Record<
            string,
            unknown
          >;
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'emp-1',
                    nombre: 'X',
                    cuit: '1',
                    estado: 'activa',
                    contacto_nombre: 'A',
                    contacto_email: 'a@a.com',
                    config: valores.config,
                    servicios: {},
                    creada_en: '2026-01-01',
                  },
                  error: null,
                }),
              }),
            }),
          };
        },
      }),
    });

    await actualizarConfigEmpresa({
      horaEntrada: '09:00',
    } as unknown as ConfigEmpresa);

    expect(enviado?.config).not.toHaveProperty('modulos');
  });
});
