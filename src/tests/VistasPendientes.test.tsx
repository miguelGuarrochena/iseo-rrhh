import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { VistasPendientes } from '@/components/app/estado/VistasPendientes';
import type {
  AreaEstado,
  EstadoRrhh,
  SituacionAgrupada,
} from '@/lib/estadoRrhh';

/**
 * Cómo se organizan las dos miradas del Estado de RRHH.
 *
 * Lo que se cuida acá no es qué falta —eso lo arma `estadoRrhh.ts`—
 * sino que el mapa por área esté siempre a la vista y que los atajos
 * para ir a resolver no lo reemplacen. Si no hay nada que resolver,
 * el índice no aparece y el mapa sigue en el mismo lugar.
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
        estado={estado([area()])}
        prioritarias={[situacion()]}
        {...props}
      />
    </MantineProvider>
  );

describe('VistasPendientes', () => {
  it('con pendientes muestra el mapa y los atajos a la vez', () => {
    dibujar({
      estado: estado([
        area(),
        area({
          clave: 'liquidacion',
          etiqueta: 'Liquidación y pagos',
          descripcion: 'Datos para liquidar.',
          pendientes: 0,
          conPendientes: 0,
          bloquea: false,
          cumplimientoPct: 100,
        }),
      ]),
    });

    expect(
      screen.getByRole('heading', { name: 'Por área' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Qué resolver primero' })
    ).toBeInTheDocument();
    expect(screen.getByText('Accesos')).toBeInTheDocument();
    expect(screen.getByText('Liquidación y pagos')).toBeInTheDocument();
    expect(screen.getByText('Sin cuenta')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /invitalo desde colaboradores/i })
    ).toHaveAttribute('href', '/colaboradores');
  });

  it('si no hay nada que resolver, el mapa queda y el índice no aparece', () => {
    dibujar({ prioritarias: [] });
    expect(
      screen.queryByRole('heading', { name: 'Qué resolver primero' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Por área' })
    ).toBeInTheDocument();
    expect(screen.getByText('Accesos')).toBeInTheDocument();
  });
});
