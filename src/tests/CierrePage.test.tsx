import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import CierrePage from '@/app/app/cierre/page';
import {
  cerrarPeriodo,
  getCierrePeriodo,
  getDatosNovedades,
  getEmpresa,
  getUsuariosDeEmpresa,
  marcarCategoriaRevisada,
} from '@/lib/services/rrhh';
import { avisoError } from '@/lib/avisos';
import type { CierrePeriodo, Empleado } from '@/types/rrhh';

/**
 * El cierre del mes como pantalla.
 *
 * Lo que se prueba no es qué junta el cierre —de eso se ocupa
 * `novedades.test.ts`— sino que RRHH pueda contestar de un vistazo "¿está
 * listo?" y que cerrar sea un acto deliberado: la confirmación dice qué
 * mes y qué cambia, cancelar no cierra nada, y un doble clic no cierra
 * dos veces.
 */

jest.mock('@/lib/services/rrhh', () => ({
  getEmpresa: jest.fn(),
  getDatosNovedades: jest.fn(),
  getCierrePeriodo: jest.fn(),
  getUsuariosDeEmpresa: jest.fn(),
  cerrarPeriodo: jest.fn(),
  reabrirPeriodo: jest.fn(),
  marcarCategoriaRevisada: jest.fn(),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

const rolMock = jest.fn(() => 'admin_rrhh' as string | null);
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    usuario: { id: 'u1', empresaId: 'emp-1' },
    empresaVista: null,
    rolEfectivo: rolMock(),
  }),
}));

jest.mock('@/lib/auth/useModulos', () => ({
  useModulos: () => ({}),
}));

const mEmpresa = getEmpresa as jest.Mock;
const mDatos = getDatosNovedades as jest.Mock;
const mCierre = getCierrePeriodo as jest.Mock;
const mUsuarios = getUsuariosDeEmpresa as jest.Mock;
const mCerrar = cerrarPeriodo as jest.Mock;
const mRevisada = marcarCategoriaRevisada as jest.Mock;

/** Hoy es el 10 de septiembre de 2026: el período abierto es 2026-09. */
const PERIODO = '2026-09';

const empleado = (over: Partial<Empleado> = {}): Empleado =>
  ({
    id: 'ple-1',
    empresaId: 'emp-1',
    nombre: 'Ana',
    apellido: 'Pérez',
    fechaIngreso: '2026-09-01',
    puesto: 'Operaria',
    modalidadContratacion: 'indeterminado',
    activo: true,
    checklistAlta: [],
    ...over,
  }) as Empleado;

/** Datos del período: un alta y, si se pide, una jornada sin cerrar. */
const datos = (conPendiente = false) => ({
  periodo: PERIODO,
  empleados: [empleado()],
  ausencias: [],
  remuneraciones: [],
  adelantos: [],
  descuentos: [],
  jornadas: conPendiente
    ? [
        {
          empleadoId: 'ple-1',
          fecha: '2026-09-03',
          horasExtrasAprobadas: 0,
          incompleta: true,
        },
      ]
    : [],
});

const cierreCerrado: CierrePeriodo = {
  id: 'c1',
  empresaId: 'emp-1',
  periodo: PERIODO,
  estado: 'cerrado',
  categoriasRevisadas: [],
  notas: 'Extras de agosto van en septiembre.',
  cerradoPor: 'u1',
  cerradoEn: '2026-09-10T13:00:00.000Z',
};

const dibujar = () =>
  render(
    <MantineProvider>
      <CierrePage />
    </MantineProvider>
  );

/**
 * Los botones de cerrar de la PANTALLA (no el de la confirmación): hay
 * dos, el del encabezado y el del panel de notas, y son el mismo acto.
 */
const botonesCerrar = (mes = 'septiembre 2026') =>
  screen.queryAllByRole('button', { name: new RegExp(`^cerrar ${mes}$`, 'i') });

/** Dibuja la pantalla y espera a que las novedades estén en pantalla. */
const esperarPantalla = async (mes = 'septiembre 2026') => {
  dibujar();
  await screen.findByRole('heading', {
    name: new RegExp(`novedades de ${mes}`, 'i'),
  });
};

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-09-10T12:00:00.000Z') });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  rolMock.mockReturnValue('admin_rrhh');
  mEmpresa.mockResolvedValue({ id: 'emp-1', nombre: 'Bombas del Sur' });
  mDatos.mockResolvedValue(datos());
  mCierre.mockResolvedValue(null);
  mUsuarios.mockResolvedValue([
    { id: 'u1', nombreCompleto: 'Carolina Méndez' },
  ]);
  mCerrar.mockResolvedValue({ ...cierreCerrado, notas: undefined });
  mRevisada.mockResolvedValue({
    ...cierreCerrado,
    estado: 'abierto',
    categoriasRevisadas: ['altas'],
  });
});

describe('Cierre del mes · estado del período', () => {
  it('dice qué mes es y que hay cosas para revisar', async () => {
    await esperarPantalla();
    expect(screen.getAllByText('Septiembre 2026').length).toBeGreaterThan(0);
    // Sin ninguna categoría tildada, no está listo.
    expect(screen.getByText('Hay cosas para revisar')).toBeInTheDocument();
    expect(
      screen.getByText(/0 de \d+ categorías revisadas/)
    ).toBeInTheDocument();
  });

  it('con todo revisado y sin datos incompletos dice que está listo', async () => {
    mCierre.mockResolvedValue({
      ...cierreCerrado,
      estado: 'abierto',
      cerradoEn: undefined,
      cerradoPor: undefined,
      // Todas las categorías que arma el período con los módulos activos.
      categoriasRevisadas: [
        'altas',
        'bajas',
        'ausencias',
        'jornada',
        'sin_cerrar',
        'extras',
        'adelantos',
        'descuentos',
        'sueldos',
      ],
    });
    await esperarPantalla();
    expect(await screen.findByText('Listo para cerrar')).toBeInTheDocument();
  });

  it('un mes sin ninguna novedad no pide revisar nada', async () => {
    mDatos.mockResolvedValue({ ...datos(), empleados: [] });
    await esperarPantalla();
    expect(screen.getByText('Sin novedades para revisar')).toBeInTheDocument();
    expect(
      screen.getByText(/no hay ninguna novedad cargada en este período/i)
    ).toBeInTheDocument();
    // Sin novedades no hay barra de avance que mirar…
    expect(screen.queryByRole('progressbar')).toBeNull();
    // …pero el mes se puede cerrar igual.
    expect(botonesCerrar()[0]).toBeEnabled();
  });

  it('lo que tiene datos incompletos se lista aparte, con su link, y no bloquea', async () => {
    mDatos.mockResolvedValue(datos(true));
    await esperarPantalla();

    const aviso = screen.getByRole('heading', {
      name: /conviene revisar antes de cerrar/i,
    }).parentElement as HTMLElement;
    expect(within(aviso).getByText('Jornadas sin cerrar')).toBeInTheDocument();
    expect(within(aviso).getByRole('link')).toHaveAttribute('href', '/fichaje');
    expect(
      screen.getByText(/no impiden cerrar el período/i)
    ).toBeInTheDocument();
    // El botón sigue disponible: nada de esto es un bloqueo.
    expect(botonesCerrar()[0]).toBeEnabled();

    // En la lista, lo que tiene datos faltantes va primero y ya abierto.
    const filas = screen.getAllByRole('checkbox');
    expect(filas[0]).toHaveAccessibleName(
      /marcar jornadas sin cerrar como revisada/i
    );
    expect(
      screen.getByRole('button', { name: /jornadas sin cerrar/i })
    ).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Cierre del mes · cerrar', () => {
  const abrirConfirmacion = async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await esperarPantalla();
    await user.click(botonesCerrar()[0]);
    return { user, dialogo: await screen.findByRole('dialog') };
  };

  it('la revisión se puede tildar y queda registrada', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await esperarPantalla();

    await user.click(
      screen.getByRole('checkbox', { name: /marcar altas como revisada/i })
    );
    await waitFor(() =>
      expect(mRevisada).toHaveBeenCalledWith(PERIODO, 'altas', true)
    );
    expect(
      await screen.findByRole('checkbox', { name: /altas: revisada/i })
    ).toBeChecked();
  });

  it('pide confirmación y explica qué implica, sin cerrar todavía', async () => {
    const { dialogo } = await abrirConfirmacion();
    expect(within(dialogo).getByText(/remuneraciones/i)).toBeInTheDocument();
    expect(within(dialogo).getByText(/adelantos/i)).toBeInTheDocument();
    expect(
      within(dialogo).getByText(/se puede reabrir después/i)
    ).toBeInTheDocument();
    expect(mCerrar).not.toHaveBeenCalled();
  });

  it('cancelar no cierra nada', async () => {
    const { user, dialogo } = await abrirConfirmacion();
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(mCerrar).not.toHaveBeenCalled();
    // El diálogo se va y el período sigue ofreciéndose para cerrar.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(botonesCerrar().length).toBeGreaterThan(0);
  });

  it('al confirmar cierra el período y la pantalla pasa a cerrado', async () => {
    const { user, dialogo } = await abrirConfirmacion();
    await user.click(
      within(dialogo).getByRole('button', { name: /^cerrar septiembre 2026$/i })
    );

    await waitFor(() => expect(mCerrar).toHaveBeenCalledTimes(1));
    expect(mCerrar).toHaveBeenCalledWith(PERIODO, '');
    expect(await screen.findByText('Período cerrado')).toBeInTheDocument();
    // Recién cuando el diálogo termina de irse queda sólo la pantalla, y
    // ahí ya no hay nada que cerrar.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(botonesCerrar()).toHaveLength(0);
  });

  it('un doble clic no cierra dos veces', async () => {
    let resolver: (v: CierrePeriodo) => void = () => {};
    mCerrar.mockImplementation(
      () =>
        new Promise<CierrePeriodo>((r) => {
          resolver = r;
        })
    );
    const { user, dialogo } = await abrirConfirmacion();
    const confirmar = within(dialogo).getByRole('button', {
      name: /^cerrar septiembre 2026$/i,
    });
    await user.click(confirmar);
    // El diálogo ya se fue; el botón de la pantalla queda deshabilitado
    // mientras la llamada está en vuelo.
    const enPantalla = (
      await screen.findAllByRole('button', { name: /cerrando…/i })
    )[0];
    expect(enPantalla).toBeDisabled();
    await user.click(enPantalla);
    resolver(cierreCerrado);

    await waitFor(() => expect(mCerrar).toHaveBeenCalledTimes(1));
  });

  it('si el cierre falla lo dice y el período sigue abierto', async () => {
    mCerrar.mockRejectedValue(new Error('El período 2026-09 ya está cerrado'));
    const { user, dialogo } = await abrirConfirmacion();
    await user.click(
      within(dialogo).getByRole('button', { name: /^cerrar septiembre 2026$/i })
    );

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(
        'No pudimos cerrar el período',
        'El período 2026-09 ya está cerrado'
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(botonesCerrar()[0]).toBeEnabled();
  });
});

describe('Cierre del mes · período ya cerrado', () => {
  beforeEach(() => mCierre.mockResolvedValue(cierreCerrado));

  it('muestra quién lo cerró, cuándo y qué queda bloqueado', async () => {
    await esperarPantalla();
    expect(screen.getByText('Período cerrado')).toBeInTheDocument();
    expect(
      await screen.findByText(/cerrado el .* por Carolina Méndez/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no se pueden cargar ni modificar remuneraciones/i)
    ).toBeInTheDocument();
    expect(screen.getByText(cierreCerrado.notas!)).toBeInTheDocument();
  });

  it('no ofrece cerrar de nuevo y sí reabrir', async () => {
    await esperarPantalla();
    expect(
      screen.queryByRole('button', { name: /^cerrar septiembre 2026$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reabrir/i })
    ).toBeInTheDocument();
  });

  it('las categorías no se pueden tildar', async () => {
    await esperarPantalla();
    const tildes = screen.getAllByRole('checkbox');
    expect(tildes[0]).toBeDisabled();
    expect(mRevisada).not.toHaveBeenCalled();
  });
});

describe('Cierre del mes · estados límite', () => {
  it('sin permisos no se muestra la pantalla', () => {
    rolMock.mockReturnValue('supervisor');
    dibujar();
    expect(
      screen.getByText(/lo hace quien administra Recursos Humanos/i)
    ).toBeInTheDocument();
    expect(mDatos).not.toHaveBeenCalled();
  });

  it('si no se pudo leer el estado del período no se ofrece cerrar', async () => {
    mCierre.mockRejectedValue(new Error('sin conexión'));
    await esperarPantalla();
    expect(
      await screen.findByText('No pudimos leer el estado')
    ).toBeInTheDocument();
    expect(botonesCerrar()).toHaveLength(0);
  });

  it('un mes que todavía no terminó no se cierra', async () => {
    jest.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
    mDatos.mockResolvedValue({ ...datos(), periodo: '2026-08' });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await esperarPantalla('agosto 2026');

    // Se elige septiembre, que todavía no terminó.
    await user.click(screen.getByRole('button', { name: /^agosto 2026$/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Sep',
      })
    );

    expect(
      await screen.findByText('El mes todavía no terminó')
    ).toBeInTheDocument();
    expect(botonesCerrar()).toHaveLength(0);
    jest.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
  });
});
