import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DetalleAusenciaModal } from '@/components/app/ausencias/DetalleAusenciaModal';
import { advertenciasDeAusencia } from '@/lib/advertencias';
import { Ausencia } from '@/types/rrhh';

/**
 * El detalle mostrando las advertencias que ya calcula `lib/advertencias`.
 *
 * Lo que se prueba no es qué dice cada regla —de eso se ocupa
 * `advertencias.test.ts`— sino que la pantalla muestre EXACTAMENTE lo que
 * devuelve la librería para esa ausencia, ni una de más ni una de menos,
 * y que mirarlas no toque el dato.
 */

const CONTEXTO = { feriados: new Set<string>(), vacacionesEnHabiles: false };

const ausencia = (extra: Partial<Ausencia> = {}): Ausencia => ({
  id: 'a1',
  empleadoId: 'e1',
  tipo: 'vacaciones',
  fechaDesde: '2026-01-05',
  fechaHasta: '2026-01-09',
  dias: 5,
  estado: 'aprobada',
  adjuntos: [],
  creadaEn: '2025-10-01T10:00:00.000Z',
  ...extra,
});

const dibujar = (a: Ausencia, contextoLegal = CONTEXTO) =>
  render(
    <MantineProvider>
      <DetalleAusenciaModal
        ausencia={a}
        nombreEmpleado={() => 'Juan Pérez'}
        onCerrar={jest.fn()}
        contextoLegal={contextoLegal}
      />
    </MantineProvider>
  );

/** Los títulos de las advertencias que se ven en pantalla. */
const titulosEnPantalla = () => {
  const lista = screen.queryByRole('list');
  if (!lista) return [];
  return within(lista)
    .getAllByRole('listitem')
    .map((li) => li.textContent?.split('.')[0] ?? '');
};

describe('DetalleAusenciaModal · advertencias', () => {
  it('no muestra la sección cuando la ausencia no tiene advertencias', () => {
    // Lunes 5 al viernes 9 de enero, pedida con tres meses de anticipación:
    // empieza lunes, está en época y no toca ningún día no laborable.
    const a = ausencia();
    expect(advertenciasDeAusencia(a, CONTEXTO)).toHaveLength(0);

    dibujar(a);
    expect(screen.queryByText(/^Advertencia/)).toBeNull();
    expect(screen.queryByText(/impide registrar la solicitud/)).toBeNull();
  });

  it('muestra una advertencia, con el texto de la librería', () => {
    // Martes: sólo se aparta del art. 151.
    const a = ausencia({ fechaDesde: '2026-01-06' });
    const esperadas = advertenciasDeAusencia(a, CONTEXTO);
    expect(esperadas).toHaveLength(1);

    dibujar(a);
    expect(screen.getByText('Advertencia')).toBeInTheDocument();
    expect(titulosEnPantalla()).toEqual(esperadas.map((x) => x.titulo));
    expect(screen.getByText(/art. 151 de la LCT/)).toBeInTheDocument();
    expect(
      screen.getByText('Ninguna de estas impide registrar la solicitud.')
    ).toBeInTheDocument();
  });

  it('muestra todas cuando son varias, en el mismo orden', () => {
    // Miércoles 15 de julio: fuera de época, sin anticipación, no empieza
    // lunes y el período se come un sábado y un domingo.
    const a = ausencia({
      fechaDesde: '2026-07-15',
      fechaHasta: '2026-07-20',
      dias: 6,
      creadaEn: '2026-07-10T09:00:00.000Z',
    });
    const esperadas = advertenciasDeAusencia(a, CONTEXTO);
    expect(esperadas.length).toBeGreaterThan(1);

    dibujar(a);
    expect(
      screen.getByText(`Advertencias (${esperadas.length})`)
    ).toBeInTheDocument();
    expect(titulosEnPantalla()).toEqual(esperadas.map((x) => x.titulo));
  });

  it('también avisa en licencias que no son vacaciones', () => {
    const a = ausencia({
      tipo: 'enfermedad',
      fechaDesde: '2026-01-09',
      fechaHasta: '2026-01-12',
      dias: 4,
    });
    const esperadas = advertenciasDeAusencia(a, CONTEXTO);
    expect(esperadas.map((x) => x.clave)).toEqual([
      'lic_incluye_no_laborables',
    ]);

    dibujar(a);
    expect(titulosEnPantalla()).toEqual(['Incluye días no laborables']);
  });

  it('sin contexto legal no calcula ni muestra advertencias', () => {
    const a = ausencia({ fechaDesde: '2026-07-15', fechaHasta: '2026-07-20' });
    render(
      <MantineProvider>
        <DetalleAusenciaModal
          ausencia={a}
          nombreEmpleado={() => 'Juan Pérez'}
          onCerrar={jest.fn()}
        />
      </MantineProvider>
    );
    expect(screen.queryByText(/^Advertencia/)).toBeNull();
  });

  it('mostrarlas no modifica ningún dato de la ausencia', () => {
    const a = ausencia({
      fechaDesde: '2026-07-15',
      fechaHasta: '2026-07-20',
      dias: 6,
      estado: 'pendiente',
      creadaEn: '2026-07-10T09:00:00.000Z',
    });
    const antes = JSON.stringify(a);
    const feriados = new Set<string>();

    dibujar(a, { feriados, vacacionesEnHabiles: false });

    // El objeto queda igual y el set de feriados tampoco se toca.
    expect(JSON.stringify(a)).toBe(antes);
    expect(feriados.size).toBe(0);
    // Y lo que se muestra sigue siendo lo guardado: los días no se
    // recalculan por tener advertencias.
    expect(screen.getByText('6 días')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(titulosEnPantalla().length).toBeGreaterThan(1);
  });
});
