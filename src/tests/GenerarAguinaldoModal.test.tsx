import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { GenerarAguinaldoModal } from '@/components/app/remuneraciones/GenerarAguinaldoModal';
import { getRemuneracionesDePeriodos } from '@/lib/services/rrhh';
import { periodosDelSemestre } from '@/lib/remuneraciones';
import { Empleado, Remuneracion } from '@/types/rrhh';

jest.mock('@/lib/services/rrhh', () => ({
  getRemuneracionesDePeriodos: jest.fn(),
  cargarRemuneracion: jest.fn(),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

jest.mock('@/lib/fechas', () => {
  const actual = jest.requireActual('@/lib/fechas');
  return {
    ...actual,
    anioEmpresa: () => 2026,
    mesEmpresa: () => '2026-09',
  };
});

const rem = (
  periodo: string,
  montoBruto: number,
  tipo: Remuneracion['tipo'] = 'mensual'
): Remuneracion => ({
  id: `e1-${periodo}-${tipo}`,
  empleadoId: 'e1',
  periodo,
  tipo,
  montoBruto,
  montoNeto: Math.round(montoBruto * 0.83),
});

const empleado = {
  id: 'e1',
  nombre: 'Ana',
  apellido: 'Ruiz',
  activo: true,
  puesto: 'Vendedora',
  fechaIngreso: '2024-01-10',
  modalidadContratacion: 'indeterminado',
} as Empleado;

const dibujar = () =>
  render(
    <MantineProvider>
      <GenerarAguinaldoModal
        abierto
        empleados={[empleado]}
        onCerrar={() => undefined}
        onGenerado={() => undefined}
      />
    </MantineProvider>
  );

describe('GenerarAguinaldoModal: semestre completo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pide los seis meses del semestre, no el mes de la vista de masa', async () => {
    (getRemuneracionesDePeriodos as jest.Mock).mockResolvedValue([]);
    dibujar();

    await waitFor(() => {
      expect(getRemuneracionesDePeriodos).toHaveBeenCalledWith(
        periodosDelSemestre(2026, 2)
      );
    });
  });

  it('sugiere el SAC con el mejor bruto del semestre, no con el mes seleccionado', async () => {
    (getRemuneracionesDePeriodos as jest.Mock).mockImplementation(
      async (periodos: string[]) =>
        [
          rem('2026-07', 800000),
          rem('2026-08', 1200000),
          rem('2026-09', 900000),
        ].filter((r) => periodos.includes(r.periodo))
    );
    dibujar();

    const monto = await screen.findByLabelText(
      /Monto del aguinaldo de Ana Ruiz/
    );
    expect(monto).toHaveValue(600000);
  });

  it('detecta un SAC ya cargado en el semestre', async () => {
    (getRemuneracionesDePeriodos as jest.Mock).mockImplementation(
      async (periodos: string[]) =>
        [
          rem('2026-07', 800000),
          rem('2026-08', 1200000),
          rem('2026-09', 900000),
          rem('2026-12', 600000, 'sac'),
        ].filter((r) => periodos.includes(r.periodo))
    );
    dibujar();

    expect(
      await screen.findByText(/Ya tiene SAC generado este semestre/)
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
