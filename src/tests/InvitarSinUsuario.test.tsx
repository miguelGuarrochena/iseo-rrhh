import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import PermisosPage from '@/app/app/permisos/page';
import {
  getAuditoria,
  getEmpleados,
  getEstadoDeCuentas,
  getUsuariosDeEmpresa,
} from '@/lib/services/rrhh';
import type { Empleado } from '@/types/rrhh';

/**
 * A quién se puede invitar desde Permisos.
 *
 * "No le vamos a dar cuenta en la app" es una decisión que se toma en la
 * ficha, pero su único efecto era silenciar avisos: el desplegable de
 * invitación seguía ofreciendo a esa persona, así que se la podía invitar
 * en dos clics sin que nada dijera que eso contradice su legajo. Para
 * darle acceso hay que destildar la opción primero, que es donde la
 * decisión está escrita.
 */

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    usuario: {
      id: 'u-admin',
      rol: 'admin_rrhh',
      empresaId: 'emp-1',
      email: 'admin@empresa.com',
      empleadoId: null,
      nombreCompleto: 'Ana RRHH',
    },
    rolEfectivo: 'admin_rrhh',
    empresaVista: null,
  }),
}));

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
  getUsuariosDeEmpresa: jest.fn(),
  getEmpleados: jest.fn(),
  getEstadoDeCuentas: jest.fn(),
  getAuditoria: jest.fn(),
  invitarUsuario: jest.fn(),
  cambiarRolUsuario: jest.fn(),
  completarAlta: jest.fn(),
  quitarAcceso: jest.fn(),
  reenviarInvitacion: jest.fn(),
  vincularUsuarioAEmpleado: jest.fn(),
}));

const legajo = (id: string, apellido: string, sinUsuario: boolean): Empleado =>
  ({
    id,
    empresaId: 'emp-1',
    nombre: 'Ana',
    apellido,
    dni: id,
    email: `${apellido.toLowerCase()}@empresa.com`,
    puesto: 'Operaria',
    sector: 'Producción',
    fechaIngreso: '2020-01-01',
    activo: true,
    sinUsuario,
  }) as unknown as Empleado;

const mock = (f: unknown) => f as jest.Mock;

// jsdom no implementa `scrollIntoView`, y el Selector lo llama al abrir
// el panel para dejar a la vista la opción resaltada.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

const abrirInvitacion = async (empleados: Empleado[]) => {
  mock(getUsuariosDeEmpresa).mockResolvedValue([]);
  mock(getEstadoDeCuentas).mockResolvedValue([]);
  mock(getAuditoria).mockResolvedValue([]);
  mock(getEmpleados).mockResolvedValue(empleados);

  render(
    <MantineProvider>
      <PermisosPage />
    </MantineProvider>
  );

  await userEvent.click(
    await screen.findByRole('button', { name: /invitar usuario/i })
  );
  // El desplegable de vínculo, dentro del modal de invitación.
  await userEvent.click(
    await screen.findByRole('button', { name: /sin vincular/i })
  );
  return screen.findByRole('listbox');
};

describe('el desplegable de invitación respeta la decisión del legajo', () => {
  it('no ofrece a quien está marcado "no le vamos a dar cuenta"', async () => {
    const lista = await abrirInvitacion([
      legajo('ple-1', 'Disponible', false),
      legajo('ple-2', 'Excluida', true),
    ]);

    expect(within(lista).getByText(/Disponible/)).toBeInTheDocument();
    expect(within(lista).queryByText(/Excluida/)).not.toBeInTheDocument();
  });

  it('destildar la opción vuelve a ofrecerla', async () => {
    // Mismo legajo, con la decisión dada de baja en su ficha.
    const lista = await abrirInvitacion([legajo('ple-2', 'Excluida', false)]);

    expect(within(lista).getByText(/Excluida/)).toBeInTheDocument();
  });

  it('explica por qué alguien puede no estar en la lista', async () => {
    // Sin decirlo, la exclusión genera la pregunta "¿por qué no aparece?".
    await abrirInvitacion([legajo('ple-1', 'Disponible', false)]);

    expect(
      screen.getByText(/destildá esa opción en su ficha/i)
    ).toBeInTheDocument();
  });
});
