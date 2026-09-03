import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import userEvent from '@testing-library/user-event';
import EditarColaboradorPage from '@/app/app/colaboradores/[id]/editar/page';
import { ErrorDeCambioDeEmail } from '@/lib/api/cambioDeEmail';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  actualizarEmpleado,
  cambiarEmailDeEmpleado,
  getEmpleado,
  getEstadoDeCuentaDeEmpleado,
} from '@/lib/services/rrhh';
import type { Empleado } from '@/types/rrhh';

/**
 * Qué ve y qué confirma el admin al cambiarle el email a un colaborador.
 *
 * El campo vive en el segundo de seis paneles y "Guardar cambios" está al
 * final: cuando se guarda, el aviso del campo hace rato que salió de
 * pantalla. Y ese click, según el estado, anula una invitación viva o mueve
 * la identidad con la que esa persona entra. Por eso se pregunta antes,
 * igual que en Permisos para estas mismas operaciones.
 *
 * Lo otro que se fija acá son los mensajes de fallo. El legajo y el email se
 * guardan en dos pasos, así que "no pudimos guardar los cambios" puede ser
 * literalmente falso: el legajo ya está guardado y lo único que falló es el
 * email. Y hay un caso donde el cambio SÍ se hizo y lo que falta es una
 * acción del admin.
 */

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ple-1' }),
  useRouter: () => ({ push: (...a: unknown[]) => push(...a) }),
}));

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    usuario: { id: 'u-admin', rol: 'admin_rrhh', empresaId: 'emp-1' },
    rolEfectivo: 'admin_rrhh',
  }),
}));

jest.mock('@/lib/auth/useModulos', () => ({ useModulos: () => ({}) }));

jest.mock('@/components/app/RequireEmpresa', () => ({
  RequireEmpresa: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

jest.mock('@/lib/services/rrhh', () => ({
  getEmpleado: jest.fn(),
  getEmpleados: jest.fn(),
  getEstadoDeCuentaDeEmpleado: jest.fn(),
  actualizarEmpleado: jest.fn(),
  cambiarEmailDeEmpleado: jest.fn(),
}));

const VIEJO = 'test@example.com';
const NUEVO = 'empleado@empresa.com';

const empleado = {
  id: 'ple-1',
  empresaId: 'emp-1',
  nombre: 'Ana',
  apellido: 'Pérez',
  dni: '30111222',
  cuil: '',
  estadoCivil: 'soltero',
  nivelEstudios: 'secundario',
  domicilio: '',
  telefono: '',
  email: VIEJO,
  contactoEmergencia: {},
  grupoFamiliar: [],
  fechaIngreso: '2020-01-01',
  puesto: 'Operaria',
  sector: 'Producción',
  modalidadContratacion: 'indeterminado',
  modalidadPago: 'mensual',
  banco: '',
  cbu: '',
  obraSocial: '',
  art: '',
  activo: true,
  checklistAlta: [],
} as unknown as Empleado;

/** Los servicios están mockeados: esto es sólo para tipar la llamada. */
const mock = (f: unknown) => f as jest.Mock;

/** Monta la pantalla con el estado de cuenta que se le indique. */
const abrir = async (
  estadoCuenta: { estado: string; emailDeLaCuenta: string | null } | 'falla' = {
    estado: 'sin_cuenta',
    emailDeLaCuenta: null,
  }
) => {
  mock(getEmpleado).mockResolvedValue(empleado);
  mock(getEmpleados).mockResolvedValue([]);
  if (estadoCuenta === 'falla') {
    mock(getEstadoDeCuentaDeEmpleado).mockRejectedValue(new Error('sin red'));
  } else {
    mock(getEstadoDeCuentaDeEmpleado).mockResolvedValue({
      ...estadoCuenta,
      emailDeLaFicha: VIEJO,
    });
  }
  render(
    <MantineProvider>
      <EditarColaboradorPage />
    </MantineProvider>
  );
  await screen.findByRole('button', { name: /guardar cambios/i });
};

const escribirEmail = async (valor: string) => {
  const campo = screen.getByRole('textbox', { name: /^email/i });
  await userEvent.clear(campo);
  await userEvent.type(campo, valor);
};

const guardar = () =>
  userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

// `getEmpleados` lo usa el formulario para el desplegable de supervisor.
const { getEmpleados } = jest.requireMock('@/lib/services/rrhh') as {
  getEmpleados: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mock(actualizarEmpleado).mockResolvedValue(empleado);
  mock(cambiarEmailDeEmpleado).mockResolvedValue(undefined);
});

// =====================================================================
// Confirmación
// =====================================================================

describe('confirmación antes de tocar una cuenta', () => {
  it('cuenta activa: pregunta y explica que la cuenta se conserva', async () => {
    await abrir({ estado: 'cuenta_activa', emailDeLaCuenta: VIEJO });
    await escribirEmail(NUEVO);
    await guardar();

    expect(
      await screen.findByText(
        'Se va a cambiar el email con el que entra a la app'
      )
    ).toBeInTheDocument();
    // Acotado al diálogo: "no se crea una cuenta nueva" también está en la
    // ayuda del campo, cuatro paneles más arriba.
    const dialogo = within(screen.getByRole('dialog'));
    expect(
      dialogo.getByText(/no se crea una cuenta nueva/i)
    ).toBeInTheDocument();
    expect(
      dialogo.getByText(/con el email anterior no va a poder entrar/i)
    ).toBeInTheDocument();
    // Nada se guardó todavía: primero decide la persona.
    expect(actualizarEmpleado).not.toHaveBeenCalled();
    expect(cambiarEmailDeEmpleado).not.toHaveBeenCalled();
  });

  it('invitación pendiente: pregunta y avisa que el link anterior muere', async () => {
    await abrir({ estado: 'invitacion_pendiente', emailDeLaCuenta: VIEJO });
    await escribirEmail(NUEVO);
    await guardar();

    expect(
      await screen.findByText('Se va a anular la invitación anterior')
    ).toBeInTheDocument();
    expect(screen.getByText(/ese link deja de servir/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /guardar y reinvitar/i })
    ).toBeInTheDocument();
    expect(cambiarEmailDeEmpleado).not.toHaveBeenCalled();
  });

  it('al confirmar sí se guarda', async () => {
    await abrir({ estado: 'cuenta_activa', emailDeLaCuenta: VIEJO });
    await escribirEmail(NUEVO);
    await guardar();
    await userEvent.click(
      await screen.findByRole('button', { name: /cambiar el email de acceso/i })
    );

    await waitFor(() =>
      expect(cambiarEmailDeEmpleado).toHaveBeenCalledWith('ple-1', NUEVO)
    );
    expect(avisoExito).toHaveBeenCalledWith(
      'Email de acceso actualizado',
      expect.stringContaining(NUEVO)
    );
  });

  it('al cancelar no se toca nada', async () => {
    await abrir({ estado: 'invitacion_pendiente', emailDeLaCuenta: VIEJO });
    await escribirEmail(NUEVO);
    await guardar();
    // El formulario también tiene un "Cancelar": hay que apretar el del
    // diálogo, no el que abandona la edición.
    await screen.findByRole('dialog');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /^cancelar$/i,
      })
    );

    // Lo que importa no es que el cuadro desaparezca del DOM —Mantine lo
    // deja montado mientras dura la animación de salida— sino que no se
    // haya tocado nada.
    expect(actualizarEmpleado).not.toHaveBeenCalled();
    expect(cambiarEmailDeEmpleado).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('sin cuenta: no pregunta nada', async () => {
    await abrir({ estado: 'sin_cuenta', emailDeLaCuenta: null });
    await escribirEmail(NUEVO);
    await guardar();

    await waitFor(() => expect(actualizarEmpleado).toHaveBeenCalled());
    expect(
      screen.queryByText(/Se va a (anular|cambiar)/i)
    ).not.toBeInTheDocument();
    expect(cambiarEmailDeEmpleado).toHaveBeenCalledWith('ple-1', NUEVO);
  });

  it('sin tocar el email tampoco pregunta, aunque tenga cuenta', async () => {
    await abrir({ estado: 'cuenta_activa', emailDeLaCuenta: VIEJO });
    await guardar();

    await waitFor(() => expect(actualizarEmpleado).toHaveBeenCalled());
    expect(screen.queryByText(/Se va a cambiar/i)).not.toBeInTheDocument();
    expect(cambiarEmailDeEmpleado).not.toHaveBeenCalled();
    expect(avisoExito).toHaveBeenCalledWith('Cambios guardados');
  });
});

// =====================================================================
// Mensajes de fallo
// =====================================================================

describe('los mensajes de fallo dicen qué quedó guardado', () => {
  it('si falla el legajo, no se guardó nada', async () => {
    mock(actualizarEmpleado).mockRejectedValue(new Error('DNI repetido'));
    await abrir({ estado: 'sin_cuenta', emailDeLaCuenta: null });
    await guardar();

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(
        'No pudimos guardar los cambios',
        'DNI repetido'
      )
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('si el legajo se guardó y falla el email, no dice que no se guardó nada', async () => {
    mock(cambiarEmailDeEmpleado).mockRejectedValue(
      new ErrorDeCambioDeEmail('Ese email ya tiene una cuenta.')
    );
    await abrir({ estado: 'cuenta_activa', emailDeLaCuenta: VIEJO });
    await escribirEmail(NUEVO);
    await guardar();
    await userEvent.click(
      await screen.findByRole('button', { name: /cambiar el email de acceso/i })
    );

    await waitFor(() => expect(avisoError).toHaveBeenCalled());
    const [titulo, detalle] = mock(avisoError).mock.calls[0];
    expect(titulo).toBe('Guardamos el legajo, pero no el email');
    expect(titulo).not.toMatch(/No pudimos guardar los cambios/);
    expect(detalle).toContain('quedaron guardados');
    expect(detalle).toContain(VIEJO);
    expect(detalle).toContain('Ese email ya tiene una cuenta.');
    // Se queda en el formulario: hay algo que corregir.
    expect(push).not.toHaveBeenCalled();
  });

  it('si el mail nuevo no salió, avisa que falta reinvitar y que el email ya está guardado', async () => {
    mock(cambiarEmailDeEmpleado).mockRejectedValue(
      new ErrorDeCambioDeEmail('… el mail no salió.', true)
    );
    await abrir({ estado: 'invitacion_pendiente', emailDeLaCuenta: VIEJO });
    await escribirEmail(NUEVO);
    await guardar();
    await userEvent.click(
      await screen.findByRole('button', { name: /guardar y reinvitar/i })
    );

    await waitFor(() => expect(avisoError).toHaveBeenCalled());
    const [titulo, detalle] = mock(avisoError).mock.calls[0];
    expect(titulo).toBe(
      'Anulamos la invitación anterior, pero el mail nuevo no salió'
    );
    expect(detalle).toContain(`Guardamos ${NUEVO} en la ficha`);
    expect(detalle).toContain('sin cuenta');
    expect(detalle).toMatch(/Invitalo de nuevo desde Permisos/);
    // El cambio SÍ ocurrió: vuelve a la ficha en vez de dejar el form como
    // si no hubiera pasado nada.
    expect(push).toHaveBeenCalledWith('/colaboradores/ple-1');
  });
});

// =====================================================================
// Sin poder leer el estado de la cuenta
// =====================================================================

describe('cuando no se puede averiguar si tiene cuenta', () => {
  it('bloquea el email y explica que hay que reintentar', async () => {
    await abrir('falla');

    const campo = screen.getByRole('textbox', { name: /^email/i });
    expect(campo).toBeDisabled();
    expect(screen.getByText(/no se puede cambiar ahora/i)).toBeInTheDocument();
    expect(screen.getByText(/reintentá en un momento/i)).toBeInTheDocument();
  });

  it('el resto del legajo se sigue editando y guardando', async () => {
    await abrir('falla');

    const [telefono] = screen.getAllByRole('textbox', { name: /teléfono/i });
    await userEvent.type(telefono, '1122334455');
    await guardar();

    await waitFor(() => expect(actualizarEmpleado).toHaveBeenCalled());
    expect(actualizarEmpleado).toHaveBeenCalledWith(
      'ple-1',
      expect.objectContaining({ telefono: '1122334455' })
    );
    // Y nunca se intenta mover una identidad que no se pudo verificar.
    expect(cambiarEmailDeEmpleado).not.toHaveBeenCalled();
  });
});
