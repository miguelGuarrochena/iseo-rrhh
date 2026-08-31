import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DetalleAusenciaModal } from '@/components/app/ausencias/DetalleAusenciaModal';
import { advertenciasDeAusencia } from '@/lib/advertencias';
import { Ausencia, SaldoVacaciones } from '@/types/rrhh';

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

const dibujar = (
  a: Ausencia,
  contextoLegal: typeof CONTEXTO | undefined = CONTEXTO,
  extra: {
    onCerrar?: () => void;
    acciones?: (a: Ausencia, cerrar: () => void) => React.ReactNode;
  } = {}
) =>
  render(
    <MantineProvider>
      <DetalleAusenciaModal
        ausencia={a}
        nombreEmpleado={() => 'Juan Pérez'}
        onCerrar={extra.onCerrar ?? jest.fn()}
        contextoLegal={contextoLegal}
        acciones={extra.acciones}
      />
    </MantineProvider>
  );

/** Saldo como lo devuelve `getSaldoVacaciones`, sin recalcular nada. */
const saldoDe = (
  diasCorresponden: number,
  diasAjuste: number
): SaldoVacaciones => ({
  empleadoId: 'e1',
  anio: 2026,
  diasCorresponden,
  diasAjuste,
  diasUtilizados: 0,
  diasPendientesAprobacion: 0,
  diasDisponibles: diasCorresponden + diasAjuste,
});

/** Contexto con saldo, como el que arma la pantalla para RRHH. */
const conSaldo = (saldo: SaldoVacaciones | null) => ({
  ...CONTEXTO,
  saldoVacaciones: jest.fn(async () => saldo),
});

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

  describe('acumulación de vacaciones (art. 164)', () => {
    // Ausencia "limpia": lunes, en época y con anticipación. Todo lo que
    // aparezca acá viene del saldo, no del período.
    const limpia = () => ausencia();

    it('sin días arrastrados no aparece la advertencia', async () => {
      const ctx = conSaldo(saldoDe(14, 0));
      dibujar(limpia(), ctx);

      await waitFor(() => expect(ctx.saldoVacaciones).toHaveBeenCalled());
      // El saldo se pide para el año en que empiezan las vacaciones.
      expect(ctx.saldoVacaciones).toHaveBeenCalledWith('e1', 2026);
      expect(screen.queryByText(/^Advertencia/)).toBeNull();
    });

    it('con acumulación dentro del tercio avisa, sin marcarlo como grave', async () => {
      const a = limpia();
      const ctx = conSaldo(saldoDe(14, 4)); // tope del art. 164: 4 días
      const esperadas = advertenciasDeAusencia(a, {
        ...CONTEXTO,
        diasDelPeriodo: 14,
        diasArrastrados: 4,
      });
      expect(esperadas.map((x) => x.clave)).toEqual(['vac_acumulacion']);

      dibujar(a, ctx);
      expect(await screen.findByText('Advertencia')).toBeInTheDocument();
      expect(titulosEnPantalla()).toEqual(esperadas.map((x) => x.titulo));
      expect(
        screen.getByText(/dentro del tercio que permite el art. 164/)
      ).toBeInTheDocument();
    });

    it('cuando supera el tope lo dice y el cartel pasa a nivel alto', async () => {
      const a = limpia();
      const ctx = conSaldo(saldoDe(14, 6)); // 6 > 4
      const esperadas = advertenciasDeAusencia(a, {
        ...CONTEXTO,
        diasDelPeriodo: 14,
        diasArrastrados: 6,
      });
      expect(esperadas.map((x) => x.clave)).toEqual([
        'vac_acumulacion_excedida',
      ]);

      dibujar(a, ctx);
      expect(await screen.findByText('Advertencia')).toBeInTheDocument();
      expect(titulosEnPantalla()).toEqual(esperadas.map((x) => x.titulo));
      // Nivel alto = el mismo cartel ámbar que usa el modal de carga.
      // El modal vive en un portal, así que se busca en todo el body.
      expect(document.body.querySelector('.border-amber-300')).not.toBeNull();
    });

    it('se suma a las advertencias del período, en el orden de la librería', async () => {
      const a = ausencia({
        fechaDesde: '2026-07-15',
        fechaHasta: '2026-07-20',
        dias: 6,
        creadaEn: '2026-07-10T09:00:00.000Z',
      });
      const esperadas = advertenciasDeAusencia(a, {
        ...CONTEXTO,
        diasDelPeriodo: 14,
        diasArrastrados: 6,
      });

      dibujar(a, conSaldo(saldoDe(14, 6)));
      await screen.findByText(`Advertencias (${esperadas.length})`);
      expect(titulosEnPantalla()).toEqual(esperadas.map((x) => x.titulo));
    });

    it('si el saldo no se puede leer, no se inventa la advertencia', async () => {
      const ctx = {
        ...CONTEXTO,
        saldoVacaciones: jest.fn(async () => {
          throw new Error('sin permiso');
        }),
      };
      dibujar(ausencia({ fechaDesde: '2026-01-06' }), ctx);

      await waitFor(() => expect(ctx.saldoVacaciones).toHaveBeenCalled());
      // Queda la del art. 151 y ninguna de acumulación.
      expect(titulosEnPantalla()).toEqual(['No empieza un lunes']);
    });

    it('no pide el saldo si la ausencia no es de vacaciones', async () => {
      const ctx = conSaldo(saldoDe(14, 6));
      dibujar(
        ausencia({
          tipo: 'enfermedad',
          fechaDesde: '2026-01-09',
          fechaHasta: '2026-01-12',
        }),
        ctx
      );
      await waitFor(() =>
        expect(titulosEnPantalla()).toEqual(['Incluye días no laborables'])
      );
      expect(ctx.saldoVacaciones).not.toHaveBeenCalled();
    });

    it('aprobar y rechazar siguen funcionando con advertencias a la vista', async () => {
      const a = ausencia({ estado: 'pendiente' });
      const aprobar = jest.fn();
      const cerrar = jest.fn();
      const antes = JSON.stringify(a);

      dibujar(a, conSaldo(saldoDe(14, 6)), {
        onCerrar: cerrar,
        acciones: (ausenciaDelDetalle, cerrarDetalle) => (
          <button
            type="button"
            onClick={() => {
              aprobar(ausenciaDelDetalle);
              cerrarDetalle();
            }}
          >
            Aprobar
          </button>
        ),
      });

      await screen.findByText('Advertencia');
      fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
      expect(aprobar).toHaveBeenCalledWith(a);
      expect(cerrar).toHaveBeenCalled();
      // Ni la advertencia ni el botón tocan el dato guardado.
      expect(JSON.stringify(a)).toBe(antes);
    });

    it('mirar la acumulación no modifica la ausencia ni el saldo', async () => {
      const a = ausencia();
      const saldo = saldoDe(14, 6);
      const antesAusencia = JSON.stringify(a);
      const antesSaldo = JSON.stringify(saldo);

      dibujar(a, conSaldo(saldo));
      await screen.findByText('Advertencia');

      expect(JSON.stringify(a)).toBe(antesAusencia);
      expect(JSON.stringify(saldo)).toBe(antesSaldo);
      expect(screen.getByText('5 días')).toBeInTheDocument();
    });
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
