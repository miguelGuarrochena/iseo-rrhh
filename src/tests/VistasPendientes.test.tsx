import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * sino que las dos vistas convivan sin que una esconda a la otra:
 * "Qué resolver" y "Por área" tienen que estar las dos a un click,
 * y si no hay nada que resolver el selector no aparece.
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
  it('con pendientes muestra las dos vistas en el selector, arranca en la lista', () => {
    dibujar();
    expect(
      screen.getByRole('button', { name: /qué resolver/i })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /por área/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByText('Sin cuenta')).toBeInTheDocument();
    expect(screen.queryByText('Quién puede entrar.')).not.toBeInTheDocument();
  });

  it('cambiar a Por área muestra las tarjetas y esconde la lista', async () => {
    const user = userEvent.setup();
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

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /por área/i }));
    });

    expect(await screen.findByText('Accesos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /por área/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Liquidación y pagos')).toBeInTheDocument();
    expect(screen.queryByText('Sin cuenta')).not.toBeInTheDocument();
  });

  it('si no hay nada que resolver, no arma el selector y va directo al mapa', () => {
    dibujar({ prioritarias: [] });
    expect(
      screen.queryByRole('button', { name: /qué resolver/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Por área' })
    ).toBeInTheDocument();
    expect(screen.getByText('Accesos')).toBeInTheDocument();
  });
});
