import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { FichajeManualModal } from '@/components/app/facial/FichajeManualModal';
import { ficharAhora } from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

jest.mock('@/lib/services/rrhh', () => ({
  ficharAhora: jest.fn(),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

const empleado = {
  id: 'ple-1',
  nombre: 'Lucas',
  apellido: 'Pereyra',
  activo: true,
} as Empleado;

const abrir = (
  props: Partial<React.ComponentProps<typeof FichajeManualModal>> = {}
) =>
  render(
    <MantineProvider>
      <FichajeManualModal
        abierto
        onCerrar={jest.fn()}
        empleados={[empleado]}
        registradoPor="Carolina"
        onFichado={jest.fn()}
        empleadoIdInicial="ple-1"
        {...props}
      />
    </MantineProvider>
  );

/**
 * Anular una marca exige motivo desde F-12; crearla a mano no exigía
 * nada. Estos tests fijan el lado del formulario: la base lo vuelve a
 * exigir en `imponer_actor_fichaje`, porque un campo obligatorio en la
 * pantalla lo saltea cualquiera que hable PostgREST directo.
 */
describe('FichajeManualModal: motivo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pide el motivo', () => {
    abrir();
    expect(screen.getByText(/motivo/i)).toBeInTheDocument();
  });

  it('no carga la marca si el motivo está vacío', async () => {
    abrir();
    await userEvent.click(
      screen.getByRole('button', { name: /cargar fichaje/i })
    );
    expect(
      await screen.findByText(/contá por qué la cargás a mano/i)
    ).toBeInTheDocument();
    expect(ficharAhora).not.toHaveBeenCalled();
  });

  it('manda el motivo al servicio cuando está completo', async () => {
    (ficharAhora as jest.Mock).mockResolvedValue({
      id: 'f1',
      tipo: 'ingreso',
      timestamp: new Date().toISOString(),
    });
    abrir();
    const campo = screen.getByPlaceholderText(/se cayó la tablet/i);
    await userEvent.type(campo, 'Se cortó la luz en planta');
    await userEvent.click(
      screen.getByRole('button', { name: /cargar fichaje/i })
    );

    expect(ficharAhora).toHaveBeenCalledWith(
      'ple-1',
      expect.objectContaining({
        metodo: 'manual',
        motivo: 'Se cortó la luz en planta',
      })
    );
  });

  // Un motivo de espacios no es un motivo: si pasara, la base lo
  // rechazaría igual y la persona vería un error del servidor.
  it('no acepta un motivo en blanco', async () => {
    abrir();
    await userEvent.type(
      screen.getByPlaceholderText(/se cayó la tablet/i),
      '    '
    );
    await userEvent.click(
      screen.getByRole('button', { name: /cargar fichaje/i })
    );
    expect(ficharAhora).not.toHaveBeenCalled();
  });
});
