import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import ColaboradoresPage from '@/app/app/colaboradores/page';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  getEmpleadosConCuenta,
  getEmpleadosConSueldo,
  getEmpleadosTodos,
  getSolicitudesDeLegajo,
  reactivarEmpleado,
} from '@/lib/services/rrhh';
import type { Empleado, Rol } from '@/types/rrhh';

/**
 * Reactivar desde Colaboradores → Dados de baja.
 *
 * La baja es lógica: el legajo sigue existiendo. Lo que faltaba era
 * una acción en esa lista para volver a ponerlo activo, con confirmación
 * y sin inventar un alta nueva.
 */

const usuarioMock = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => usuarioMock(),
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
  getEmpleadosTodos: jest.fn(),
  getEmpleadosConCuenta: jest.fn(),
  getEmpleadosConSueldo: jest.fn(),
  getSolicitudesDeLegajo: jest.fn(),
  reactivarEmpleado: jest.fn(),
}));

const mock = (f: unknown) => f as jest.Mock;

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

const deBaja: Empleado = {
  id: 'ple-baja',
  empresaId: 'emp-1',
  nombre: 'Dueño',
  apellido: 'Poster',
  dni: '20111222',
  puesto: 'Socio',
  sector: 'Dirección',
  fechaIngreso: '2024-01-15',
  activo: false,
  fechaBaja: '2026-09-01',
  motivoBaja: 'Alta de prueba',
  checklistAlta: [],
  modalidadContratacion: 'indeterminado',
} as unknown as Empleado;

const activo: Empleado = {
  ...deBaja,
  id: 'ple-ok',
  nombre: 'Ana',
  apellido: 'Ruiz',
  dni: '30111222',
  activo: true,
  fechaBaja: undefined,
  motivoBaja: undefined,
};

const sesion = (rol: Rol) => ({
  usuario: {
    id: 'u-1',
    email: 'a@a.com',
    rol,
    empresaId: 'emp-1',
    empleadoId: null,
    nombreCompleto: 'Ana RRHH',
  },
  rolEfectivo: rol,
  empresaVista: null,
});

const dibujar = async (empleados: Empleado[]) => {
  mock(getEmpleadosTodos).mockResolvedValue(empleados);
  mock(getEmpleadosConCuenta).mockResolvedValue([]);
  mock(getEmpleadosConSueldo).mockResolvedValue([]);
  mock(getSolicitudesDeLegajo).mockResolvedValue([]);

  render(
    <MantineProvider>
      <ColaboradoresPage />
    </MantineProvider>
  );

  await userEvent.click(
    await screen.findByRole('button', { name: /filtros/i })
  );
  await userEvent.click(screen.getByRole('button', { name: /^activos$/i }));
  await userEvent.click(
    await screen.findByRole('option', { name: /dados de baja/i })
  );
};

beforeEach(() => {
  usuarioMock.mockReturnValue(sesion('admin_rrhh'));
  mock(reactivarEmpleado).mockReset();
  mock(avisoExito).mockReset();
  mock(avisoError).mockReset();
});

describe('Colaboradores → Dados de baja → Reactivar', () => {
  it('reactiva, avisa y saca a la persona de la lista de baja', async () => {
    const reactivado = { ...deBaja, activo: true, fechaBaja: undefined };
    mock(reactivarEmpleado).mockResolvedValue(reactivado);

    await dibujar([deBaja, activo]);

    expect(await screen.findByText('Dueño Poster')).toBeInTheDocument();
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^reactivar$/i }));
    const dialogo = await screen.findByRole('dialog');
    expect(
      within(dialogo).getByText(
        /volverá a aparecer entre los colaboradores activos/i
      )
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByText(/biometría, deberá registrarla nuevamente/i)
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialogo).getByRole('button', { name: /^reactivar$/i })
    );

    await waitFor(() =>
      expect(reactivarEmpleado).toHaveBeenCalledWith('ple-baja')
    );
    await waitFor(() =>
      expect(avisoExito).toHaveBeenCalledWith(
        'Colaborador reactivado',
        expect.stringMatching(/dueño poster/i)
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Dueño Poster')).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    await userEvent.click(
      screen.getByRole('button', { name: /dados de baja/i })
    );
    await userEvent.click(
      await screen.findByRole('option', { name: /^activos$/i })
    );
    expect(await screen.findByText('Dueño Poster')).toBeInTheDocument();
  });

  it('si falla, avisa y la persona sigue en dados de baja', async () => {
    mock(reactivarEmpleado).mockRejectedValue(
      new Error('No tenés permiso para reactivar colaboradores.')
    );

    await dibujar([deBaja]);
    await userEvent.click(
      await screen.findByRole('button', { name: /^reactivar$/i })
    );
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialogo).getByRole('button', { name: /^reactivar$/i })
    );

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(
        'No pudimos reactivar al colaborador',
        'No tenés permiso para reactivar colaboradores.'
      )
    );
    expect(screen.getByText('Dueño Poster')).toBeInTheDocument();
    expect(reactivarEmpleado).toHaveBeenCalledTimes(1);
  });

  it('si se cancela, no llama al servicio', async () => {
    mock(reactivarEmpleado).mockResolvedValue({
      ...deBaja,
      activo: true,
    });
    await dibujar([deBaja]);
    await userEvent.click(
      await screen.findByRole('button', { name: /^reactivar$/i })
    );
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialogo).getByRole('button', { name: /cancelar/i })
    );
    expect(reactivarEmpleado).not.toHaveBeenCalled();
    expect(screen.getByText('Dueño Poster')).toBeInTheDocument();
  });

  it('un supervisor no ve la acción', async () => {
    usuarioMock.mockReturnValue(sesion('supervisor'));
    await dibujar([deBaja]);
    expect(await screen.findByText('Dueño Poster')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^reactivar$/i })
    ).not.toBeInTheDocument();
  });
});

describe('el filtro de sectores nombra a quien no tiene sector', () => {
  const renderCon = async (empleados: Empleado[]) => {
    mock(getEmpleadosTodos).mockResolvedValue(empleados);
    mock(getEmpleadosConCuenta).mockResolvedValue([]);
    mock(getEmpleadosConSueldo).mockResolvedValue([]);
    mock(getSolicitudesDeLegajo).mockResolvedValue([]);
    render(
      <MantineProvider>
        <ColaboradoresPage />
      </MantineProvider>
    );
  };

  it('si hay gente sin sector, la opción se llama “Sin sector” y no queda en blanco', async () => {
    await renderCon([
      { ...activo, sector: 'General' },
      { ...activo, id: 'ple-sin', apellido: 'SinSector', sector: '' },
    ]);

    await screen.findByText('Ana Ruiz');
    expect(screen.getByText(/sin sector/i)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /todos los sectores/i })
    );
    const lista = await screen.findByRole('listbox');
    const opciones = within(lista)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim());
    expect(opciones).toEqual(['Todos los sectores', 'General', 'Sin sector']);
  });

  it('elegir “Sin sector” deja sólo a quien no lo tiene', async () => {
    await renderCon([
      { ...activo, sector: 'General' },
      { ...activo, id: 'ple-sin', apellido: 'SinSector', sector: '' },
    ]);

    await screen.findByText('Ana Ruiz');
    await userEvent.click(
      screen.getByRole('button', { name: /todos los sectores/i })
    );
    await userEvent.click(
      await screen.findByRole('option', { name: /^sin sector$/i })
    );

    expect(await screen.findByText('Ana SinSector')).toBeInTheDocument();
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
  });

  it('si todos tienen sector, esa opción no aparece', async () => {
    await renderCon([{ ...activo, sector: 'General' }]);

    await screen.findByText('Ana Ruiz');
    await userEvent.click(
      screen.getByRole('button', { name: /todos los sectores/i })
    );
    const lista = await screen.findByRole('listbox');
    const opciones = within(lista)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim());
    expect(opciones).toEqual(['Todos los sectores', 'General']);
  });
});
