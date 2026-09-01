import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CuposLicenciaPanel } from '@/components/app/configuracion/CuposLicenciaPanel';
import { getCuposLicencia, guardarCupoLicencia } from '@/lib/services/rrhh';
import type { CupoLicencia } from '@/types/rrhh';

jest.mock('@/lib/services/rrhh', () => ({
  getCuposLicencia: jest.fn(),
  guardarCupoLicencia: jest.fn(),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

const getCupos = getCuposLicencia as jest.MockedFunction<
  typeof getCuposLicencia
>;
const guardar = guardarCupoLicencia as jest.MockedFunction<
  typeof guardarCupoLicencia
>;

const abrir = async () => {
  render(<CuposLicenciaPanel />);
  await screen.findByRole('button', { name: /guardar cupos/i });
};

const boton = () => screen.getByRole('button', { name: /guardar cupos/i });
const campo = (etiqueta: RegExp) =>
  screen.getByRole('spinbutton', { name: etiqueta });

/**
 * L-01 — El panel arrancaba en `0` para los siete tipos y guardaba todos
 * de una. Entrar a Configuración y apretar Guardar sin tocar nada
 * escribía un tope estricto de cero días en cada uno, y como la base
 * trata "fila con 0" como tope y el trigger de licencias no tiene
 * override de gestor, la empresa quedaba sin ninguna licencia legal.
 */
describe('L-01: guardar sin tocar nada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCupos.mockResolvedValue([]);
    guardar.mockResolvedValue(null);
  });

  it('no escribe ningún cupo si el admin no cambió nada', async () => {
    await abrir();
    // Con nada configurado, el botón ni siquiera está habilitado.
    expect(boton()).toBeDisabled();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('los campos arrancan vacíos, no en cero', async () => {
    await abrir();
    expect(campo(/mudanza/i)).toHaveValue(null);
    expect(campo(/exámenes/i)).toHaveValue(null);
  });

  it('el vacío se muestra como "sin límite"', async () => {
    await abrir();
    expect(campo(/mudanza/i)).toHaveAttribute('placeholder', 'Sin límite');
    expect(
      screen.getByText(/es un tope real y bloquea el pedido/i)
    ).toBeInTheDocument();
  });

  it('sólo se guarda el tipo que se tocó', async () => {
    await abrir();
    await userEvent.type(campo(/exámenes/i), '10');
    await userEvent.click(boton());
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    expect(guardar).toHaveBeenCalledWith('examenes', 10);
  });

  it('un 0 escrito a propósito sí se guarda como tope', async () => {
    await abrir();
    await userEvent.type(campo(/mudanza/i), '0');
    await userEvent.click(boton());
    await waitFor(() => expect(guardar).toHaveBeenCalledWith('mudanza', 0));
  });
});

/**
 * F-11 — Una vez puesto un cupo en 0 no había forma de volver a "sin
 * límite": el input tenía `min=0` y el servicio siempre hacía upsert.
 */
describe('F-11: volver a "sin límite"', () => {
  const conCero: CupoLicencia[] = [
    { id: '1', empresaId: 'e', tipo: 'mudanza', diasAnuales: 0 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    getCupos.mockResolvedValue(conCero);
    guardar.mockResolvedValue(null);
  });

  it('vaciar el campo borra el cupo', async () => {
    await abrir();
    // El botón aparece antes de que `useCarga` copie los cupos al form:
    // sin esperar el 0, este caso ve el vacío inicial y no prueba F-11.
    await waitFor(() => expect(campo(/mudanza/i)).toHaveValue(0));
    await userEvent.clear(campo(/mudanza/i));
    await userEvent.click(boton());
    // `null` es como el servicio expresa "sin límite": borra la fila.
    await waitFor(() => expect(guardar).toHaveBeenCalledWith('mudanza', null));
    expect(guardar).toHaveBeenCalledTimes(1);
  });
});

/**
 * L-02 — Las licencias que la ley otorga por hecho generador no se
 * configuran: no tienen cupo que fijar.
 */
describe('L-02: licencias por evento fuera del panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCupos.mockResolvedValue([]);
    guardar.mockResolvedValue(null);
  });

  it('no hay campo para fallecimiento, casamiento ni nacimiento', async () => {
    await abrir();
    expect(
      screen.queryByRole('spinbutton', { name: /fallecimiento/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: /casamiento/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: /nacimiento/i })
    ).not.toBeInTheDocument();
  });

  it('el panel explica por qué no están', async () => {
    await abrir();
    expect(
      screen.getByText(/la ley las otorga por cada hecho que las genera/i)
    ).toBeInTheDocument();
  });

  it('exámenes sí se configura: el art. 158 inc. e tiene tope anual', async () => {
    await abrir();
    expect(campo(/exámenes/i)).toBeInTheDocument();
  });
});
