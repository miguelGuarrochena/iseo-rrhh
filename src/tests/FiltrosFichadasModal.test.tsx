import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import {
  FiltrosFichadas,
  FiltrosFichadasModal,
} from '@/components/app/fichaje/FiltrosFichadasModal';

const colaboradores = [
  { id: 'ple-ana', nombre: 'Ana', apellido: 'Ruiz' },
  { id: 'ple-bruno', nombre: 'Bruno', apellido: 'López' },
];

const vacios: FiltrosFichadas = {
  desde: '2026-09-01',
  hasta: '2026-09-07',
  empleadoId: '',
  sector: '',
  soloIncompletos: false,
};

const Caso = ({
  inicial = vacios,
  onAplicar,
}: {
  inicial?: FiltrosFichadas;
  onAplicar?: (v: FiltrosFichadas) => void;
}) => {
  const [valores, setValores] = useState(inicial);
  return (
    <MantineProvider>
      <FiltrosFichadasModal
        abierto
        valores={valores}
        sectores={['Producción', 'Administración']}
        colaboradores={colaboradores}
        onCerrar={() => undefined}
        onAplicar={(v) => {
          setValores(v);
          onAplicar?.(v);
        }}
        onRestablecer={() => setValores(vacios)}
      />
    </MantineProvider>
  );
};

const abrirColaborador = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: /todos los colaboradores/i })
  );
  return screen.getByRole('listbox');
};

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe('FiltrosFichadasModal: selector de colaboradores', () => {
  it('abre el selector y lista a los colaboradores', async () => {
    render(<Caso />);
    const listbox = await abrirColaborador();
    expect(listbox).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Ruiz, Ana/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /López, Bruno/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Todos los colaboradores/ })
    ).toBeInTheDocument();
  });

  it('al elegir un colaborador y confirmar, aplica ese id', async () => {
    const onAplicar = jest.fn();
    render(<Caso onAplicar={onAplicar} />);
    await abrirColaborador();
    await userEvent.click(screen.getByRole('option', { name: /Ruiz, Ana/ }));
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onAplicar).toHaveBeenCalledWith(
      expect.objectContaining({ empleadoId: 'ple-ana' })
    );
  });

  it('Todos vuelve a dejar el filtro sin colaborador', async () => {
    const onAplicar = jest.fn();
    render(
      <Caso
        inicial={{ ...vacios, empleadoId: 'ple-ana' }}
        onAplicar={onAplicar}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Ruiz, Ana/ }));
    await userEvent.click(
      screen.getByRole('option', { name: /Todos los colaboradores/ })
    );
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onAplicar).toHaveBeenCalledWith(
      expect.objectContaining({ empleadoId: '' })
    );
  });
});
