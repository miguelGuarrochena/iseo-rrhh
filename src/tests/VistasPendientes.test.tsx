import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { VistasPendientes } from '@/components/app/estado/VistasPendientes';
import type {
  AreaEstado,
  EstadoRrhh,
  SituacionAgrupada,
} from '@/lib/estadoRrhh';

/**
 * Cómo se entra a resolver desde el Estado de RRHH.
 *
 * Lo que se cuida acá no es qué falta —eso lo arma `estadoRrhh.ts`—
 * sino que el mapa sea la pantalla, que el camino a la lista esté en
 * el mismo bloque (no arriba a la derecha) y que volver sea explícito.
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
) => {
  const onElegir = props.onElegir ?? jest.fn();
  return {
    onElegir,
    ...render(
      <MantineProvider>
        <VistasPendientes
          vista="area"
          onElegir={onElegir}
          estado={estado([area()])}
          prioritarias={[situacion()]}
          {...props}
        />
      </MantineProvider>
    ),
  };
};

describe('VistasPendientes', () => {
  it('el mapa trae el botón para ir a resolver, en el mismo bloque', async () => {
    const user = userEvent.setup();
    const { onElegir } = dibujar();
    expect(
      screen.getByRole('heading', { name: 'Por área' })
    ).toBeInTheDocument();
    expect(screen.getByText('Accesos')).toBeInTheDocument();
    const boton = screen.getByRole('button', { name: /qué resolver 1/i });
    await user.click(boton);
    expect(onElegir).toHaveBeenCalledWith('resolver');
  });

  it('la lista reemplaza el mapa y se vuelve con un botón explícito', async () => {
    const user = userEvent.setup();
    const { onElegir } = dibujar({ vista: 'resolver' });
    expect(screen.getByText('Sin cuenta')).toBeInTheDocument();
    expect(screen.queryByText('Accesos')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /volver a las áreas/i })
    );
    expect(onElegir).toHaveBeenCalledWith('area');
  });

  it('si no hay nada que resolver, el mapa no ofrece el botón', () => {
    dibujar({ prioritarias: [] });
    expect(
      screen.queryByRole('button', { name: /qué resolver/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Accesos')).toBeInTheDocument();
  });
});
