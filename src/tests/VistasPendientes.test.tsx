import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import {
  SelectorVistaEstado,
  VistasPendientes,
} from '@/components/app/estado/VistasPendientes';
import type {
  AreaEstado,
  EstadoRrhh,
  SituacionAgrupada,
} from '@/lib/estadoRrhh';

/**
 * Cómo se navega el Estado de RRHH.
 *
 * Lo que se cuida acá no es qué falta —eso lo arma `estadoRrhh.ts`—
 * sino que el mapa sea la entrada, que la lista de acciones no lo
 * reemplace a menos que uno la pida, y que el selector no desaparezca
 * cuando no hay nada que resolver.
 */

const area = (over: Partial<AreaEstado> = {}): AreaEstado => ({
  clave: 'accesos',
  etiqueta: 'Accesos',
  descripcion: 'Quién puede entrar.',
  ambitos: ['cuenta'],
  modulos: [],
  evaluados: 2,
  conPendientes: 1,
  pendientes: 1,
  bloquea: true,
  cumplimientoPct: 50,
  items: [],
  faltasEmpresa: [],
  ...over,
});

const estado = (areas: AreaEstado[]): EstadoRrhh => ({
  nivel: 'urgente',
  evaluados: 2,
  personasConPendientes: 1,
  pendientes: 1,
  bloqueantes: 1,
  cumplimientoPct: 50,
  areas,
});

const situacion = (
  over: Partial<SituacionAgrupada> = {}
): SituacionAgrupada => ({
  falta: {
    clave: 'sin_cuenta',
    severidad: 'bloquea',
    titulo: 'Sin cuenta',
    detalle: 'No puede entrar a la app.',
    comoSeArregla: 'Invitalo desde Colaboradores',
    ruta: '/colaboradores',
  },
  nombres: ['Ana Pérez'],
  area: 'accesos',
  ...over,
});

const dibujar = (
  props: Partial<React.ComponentProps<typeof VistasPendientes>> = {}
) =>
  render(
    <MantineProvider>
      <VistasPendientes
        vista="area"
        estado={estado([area()])}
        prioritarias={[situacion()]}
        {...props}
      />
    </MantineProvider>
  );

describe('VistasPendientes', () => {
  it('por área es la entrada: el mapa está, la lista no', () => {
    dibujar();
    expect(
      screen.getByRole('heading', { name: 'Por área' })
    ).toBeInTheDocument();
    expect(screen.getByText('Accesos')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Qué resolver primero' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Sin cuenta')).not.toBeInTheDocument();
  });

  it('en Qué resolver está la lista y no el mapa', () => {
    dibujar({ vista: 'resolver' });
    expect(screen.getByText('Sin cuenta')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /invitalo desde colaboradores/i })
    ).toHaveAttribute('href', '/colaboradores');
    expect(screen.queryByText('Accesos')).not.toBeInTheDocument();
  });

  it('si no hay nada que resolver, la vista sigue existiendo y lo dice', () => {
    dibujar({ vista: 'resolver', prioritarias: [] });
    expect(
      screen.getByRole('heading', { name: 'Qué resolver primero' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no hay nada que resolver primero/i)
    ).toBeInTheDocument();
  });
});

describe('SelectorVistaEstado', () => {
  it('siempre muestra las dos vistas, aunque no haya pendientes', async () => {
    const onElegir = jest.fn();
    const user = userEvent.setup();
    render(
      <SelectorVistaEstado vista="area" onElegir={onElegir} pendientes={0} />
    );

    expect(screen.getByRole('button', { name: 'Por área' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const resolver = screen.getByRole('button', { name: 'Qué resolver' });
    expect(resolver).toHaveAttribute('aria-pressed', 'false');
    await user.click(resolver);
    expect(onElegir).toHaveBeenCalledWith('resolver');
  });

  it('el número de pendientes va en Qué resolver, no esconde el botón', () => {
    render(
      <SelectorVistaEstado vista="area" onElegir={() => {}} pendientes={3} />
    );
    expect(
      screen.getByRole('button', { name: /qué resolver 3/i })
    ).toBeInTheDocument();
  });
});
