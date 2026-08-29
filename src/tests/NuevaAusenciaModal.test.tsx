import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { NuevaAusenciaModal } from '@/components/app/ausencias/NuevaAusenciaModal';
import {
  getAusenciasDeEmpleado,
  getEmpresa,
  getFeriadosParaCalculo,
  getSaldoVacaciones,
  getSaldosLicencia,
} from '@/lib/services/rrhh';
import type { Ausencia, Empresa, SaldoVacaciones } from '@/types/rrhh';

jest.mock('@/lib/services/rrhh', () => ({
  getAusenciasDeEmpleado: jest.fn(),
  getEmpresa: jest.fn(),
  getFeriadosParaCalculo: jest.fn(),
  getSaldoVacaciones: jest.fn(),
  getSaldosLicencia: jest.fn(),
}));

const mAusencias = getAusenciasDeEmpleado as jest.MockedFunction<
  typeof getAusenciasDeEmpleado
>;
const mEmpresa = getEmpresa as jest.MockedFunction<typeof getEmpresa>;
const mFeriados = getFeriadosParaCalculo as jest.MockedFunction<
  typeof getFeriadosParaCalculo
>;
const mSaldo = getSaldoVacaciones as jest.MockedFunction<
  typeof getSaldoVacaciones
>;
const mSaldosLic = getSaldosLicencia as jest.MockedFunction<
  typeof getSaldosLicencia
>;

const saldo = (anio: number, disponibles: number): SaldoVacaciones => ({
  empleadoId: 'e1',
  anio,
  diasCorresponden: 14,
  diasAjuste: 0,
  diasUtilizados: 14 - disponibles,
  diasPendientesAprobacion: 0,
  diasDisponibles: disponibles,
});

const abrir = async (onCrear = jest.fn()) => {
  render(
    <MantineProvider>
      <NuevaAusenciaModal
        abierto
        onCerrar={jest.fn()}
        onCrear={onCrear}
        empleadoIdActual="e1"
      />
    </MantineProvider>
  );
  await screen.findByRole('button', { name: /enviar solicitud/i });
  return onCrear;
};

const fecha = (etiqueta: RegExp) =>
  screen.getByRole('textbox', { name: etiqueta });

/** Escribe una fecha en un `CampoFecha`, que acepta texto tipeado. */
const escribirFecha = async (etiqueta: RegExp, valor: string) => {
  const campo = fecha(etiqueta);
  await userEvent.clear(campo);
  await userEvent.type(campo, valor);
};

beforeEach(() => {
  jest.clearAllMocks();
  mEmpresa.mockResolvedValue({
    config: { vacacionesDiasHabiles: false },
  } as unknown as Empresa);
  mFeriados.mockResolvedValue(new Set<string>());
  mAusencias.mockResolvedValue([]);
  mSaldosLic.mockResolvedValue([]);
  mSaldo.mockImplementation(async (_id, anio) => saldo(anio, 14));
});

/**
 * F-05 — La pantalla pedía el saldo del año en que EMPEZABA el rango y lo
 * comparaba contra el total de días. El trigger de la base, en cambio,
 * verifica año por año (migración 68), así que la UI rechazaba pedidos
 * que la base habría aceptado.
 */
describe('F-05: vacaciones que cruzan el 31/12', () => {
  it('pide el saldo de cada año que el rango toca', async () => {
    await abrir();
    await escribirFecha(/desde/i, '29/12/2026');
    await escribirFecha(/hasta/i, '08/01/2027');
    await waitFor(() => expect(mSaldo).toHaveBeenCalledWith('e1', 2026));
    await waitFor(() => expect(mSaldo).toHaveBeenCalledWith('e1', 2027));
  });

  it('compara cada tramo contra el saldo de SU año, no el total', async () => {
    // 3 días disponibles en 2026 y 14 en 2027. El rango son 11 días: 3 de
    // 2026 y 8 de 2027, así que entra. Antes se comparaba 11 contra 3.
    mSaldo.mockImplementation(async (_id, anio) =>
      anio === 2026 ? saldo(2026, 3) : saldo(2027, 14)
    );
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '29/12/2026');
    await escribirFecha(/hasta/i, '08/01/2027');
    await waitFor(() => expect(mSaldo).toHaveBeenCalledWith('e1', 2027));

    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    await waitFor(() => expect(onCrear).toHaveBeenCalled());
    expect(onCrear).toHaveBeenCalledWith(
      expect.objectContaining({
        fechaDesde: '2026-12-29',
        fechaHasta: '2027-01-08',
      })
    );
  });

  it('frena cuando el tramo de un año no entra, y dice cuál', async () => {
    // Sólo 1 día en 2026: los 3 que caen ahí no entran.
    mSaldo.mockImplementation(async (_id, anio) =>
      anio === 2026 ? saldo(2026, 1) : saldo(2027, 14)
    );
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '29/12/2026');
    await escribirFecha(/hasta/i, '08/01/2027');
    await waitFor(() => expect(mSaldo).toHaveBeenCalledWith('e1', 2027));

    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    expect(
      await screen.findByText(/En 2026 te quedan 1 días.*pidiendo 3/i)
    ).toBeInTheDocument();
    expect(onCrear).not.toHaveBeenCalled();
  });
});

/**
 * F-07 — Sólo se miraban las vacaciones de los compañeros del sector.
 * Nada advertía si la propia persona ya tenía otra ausencia en esas
 * fechas, y dos ausencias solapadas consumen saldo dos veces.
 */
describe('F-07: ausencias solapadas del mismo empleado', () => {
  const vacaciones: Ausencia = {
    id: 'a1',
    empleadoId: 'e1',
    tipo: 'vacaciones',
    estado: 'aprobada',
    fechaDesde: '2026-03-10',
    fechaHasta: '2026-03-20',
    dias: 11,
  } as Ausencia;

  it('avisa cuando el rango pisa otra ausencia propia', async () => {
    mAusencias.mockResolvedValue([vacaciones]);
    await abrir();
    await escribirFecha(/desde/i, '12/03/2026');
    await escribirFecha(/hasta/i, '15/03/2026');
    expect(
      await screen.findByText(/Ya hay otra ausencia cargada en esas fechas/i)
    ).toBeInTheDocument();
  });

  it('no deja enviar la solicitud solapada', async () => {
    mAusencias.mockResolvedValue([vacaciones]);
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '12/03/2026');
    await escribirFecha(/hasta/i, '15/03/2026');
    await screen.findByText(/Ya hay otra ausencia cargada/i);

    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    expect(
      await screen.findByText(/Ya tenés otra ausencia cargada en esas fechas/i)
    ).toBeInTheDocument();
    expect(onCrear).not.toHaveBeenCalled();
  });

  it('una ausencia rechazada no cuenta como solapamiento', async () => {
    mAusencias.mockResolvedValue([{ ...vacaciones, estado: 'rechazada' }]);
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '12/03/2026');
    await escribirFecha(/hasta/i, '15/03/2026');
    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    await waitFor(() => expect(onCrear).toHaveBeenCalled());
  });

  it('el home office convive con un día trabajado', async () => {
    mAusencias.mockResolvedValue([{ ...vacaciones, tipo: 'home_office' }]);
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '12/03/2026');
    await escribirFecha(/hasta/i, '15/03/2026');
    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    await waitFor(() => expect(onCrear).toHaveBeenCalled());
  });

  it('un rango que no pisa nada pasa sin advertencia', async () => {
    mAusencias.mockResolvedValue([vacaciones]);
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '01/04/2026');
    await escribirFecha(/hasta/i, '03/04/2026');
    expect(
      screen.queryByText(/Ya hay otra ausencia cargada/i)
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    await waitFor(() => expect(onCrear).toHaveBeenCalled());
  });
});

/**
 * F-03 — Si los feriados no se pueden sincronizar, la pantalla contaba
 * días con feriados que sólo existían en memoria y la base guardaba otro
 * número.
 */
describe('F-03: feriados que la base no conoce', () => {
  it('en días hábiles, si los feriados fallan no deja guardar', async () => {
    mEmpresa.mockResolvedValue({
      config: { vacacionesDiasHabiles: true },
    } as unknown as Empresa);
    mFeriados.mockRejectedValue(new Error('sin sincronizar'));
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '01/06/2026');
    await escribirFecha(/hasta/i, '05/06/2026');
    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    expect(
      await screen.findByText(/No pudimos leer los feriados/i)
    ).toBeInTheDocument();
    expect(onCrear).not.toHaveBeenCalled();
  });

  it('en días corridos los feriados no entran en la cuenta', async () => {
    // Régimen legal: no se piden feriados y el pedido sale igual.
    const onCrear = await abrir();
    await escribirFecha(/desde/i, '01/06/2026');
    await escribirFecha(/hasta/i, '05/06/2026');
    await userEvent.click(
      screen.getByRole('button', { name: /enviar solicitud/i })
    );
    await waitFor(() => expect(onCrear).toHaveBeenCalled());
    expect(mFeriados).not.toHaveBeenCalled();
  });
});
