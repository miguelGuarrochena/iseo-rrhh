import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { HistorialFichadas } from '@/components/app/fichaje/HistorialFichadas';
import { descargarResumenFichadas } from '@/lib/exportarFichadas';
import { getJornadas } from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

// Veinte personas: más que una página, que es la situación que importa.
const empleados = Array.from({ length: 20 }, (_, i) => ({
  id: `ple-${i}`,
  nombre: 'Nombre',
  apellido: `Apellido${String(i).padStart(2, '0')}`,
  dni: `3000000${i}`,
  sector: 'Producción',
  activo: true,
})) as Empleado[];

jest.mock('@/lib/services/rrhh', () => ({
  getJornadas: jest.fn(async () => []),
  getFichajesPagina: jest.fn(async () => ({ fichajes: [], total: 0 })),
  getEmpleados: jest.fn(async () => empleados),
  getEmpleado: jest.fn(async () => null),
  getAusenciasEntre: jest.fn(async () => []),
  getFeriados: jest.fn(async () => []),
  getEmpresa: jest.fn(async () => ({ nombre: 'Demo', razonSocial: 'Demo SA' })),
}));

jest.mock('@/lib/exportarFichadas', () => ({
  descargarResumenFichadas: jest.fn(async () => 'resumen.xlsx'),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ rolEfectivo: 'admin_rrhh' }),
}));

const abrirResumen = async () => {
  render(
    <MantineProvider>
      <HistorialFichadas />
    </MantineProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: /resumen/i }));
};

/**
 * La pantalla muestra de a quince y por eso le pide a la base sólo las
 * jornadas de esas quince personas. El Excel del contador NO puede
 * heredar ese recorte: una planilla a la que le faltan filas se ve igual
 * de bien que una completa y el error aparece cuando alguien reclama su
 * sueldo.
 */
describe('HistorialFichadas: resumen paginado', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sólo pide las jornadas de la página que muestra', async () => {
    await abrirResumen();

    await waitFor(() => {
      const pedidos = (getJornadas as jest.Mock).mock.calls
        .map((c) => c[2]?.empleadoIds)
        .filter((ids): ids is string[] => Array.isArray(ids) && ids.length > 0);
      expect(pedidos.length).toBeGreaterThan(0);
      expect(pedidos[pedidos.length - 1]).toHaveLength(15);
    });
  });

  it('muestra una página de filas, no las veinte', async () => {
    const { container } = render(
      <MantineProvider>
        <HistorialFichadas />
      </MantineProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /resumen/i }));
    await waitFor(() => expect(container.textContent).toContain('Apellido00'));
    // La página 1 llega hasta la decimoquinta: la última no está.
    expect(container.textContent).toContain('Apellido14');
    expect(container.textContent).not.toContain('Apellido15');
    expect(container.textContent).not.toContain('Apellido19');
  });

  it('el encabezado cuenta el total, no la página', async () => {
    await abrirResumen();
    expect(await screen.findByText(/20 colaboradores/)).toBeInTheDocument();
  });

  it('el Excel se arma con TODOS los colaboradores del filtro', async () => {
    await abrirResumen();
    await userEvent.click(screen.getByRole('button', { name: /excel/i }));

    await waitFor(() => {
      expect(descargarResumenFichadas).toHaveBeenCalled();
    });
    const { resumen } = (descargarResumenFichadas as jest.Mock).mock
      .calls[0][0];
    expect(resumen.filas).toHaveLength(20);
    expect(resumen.filas[19].empleado.apellido).toBe('Apellido19');
  });
});
