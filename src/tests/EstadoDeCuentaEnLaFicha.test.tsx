import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { GestionCuentaModal } from '@/components/app/permisos/GestionCuentaModal';
import { textoDeEstadoDeCuenta } from '@/lib/api/cambioDeEmail';
import type { Empleado, Usuario } from '@/types/rrhh';

/**
 * Dónde se lee el estado de la cuenta, y dónde se aprende a cambiarlo.
 *
 * Antes el resultado de un cambio de email vivía tres segundos y medio en
 * un toast y después no quedaba en ningún lado: la ficha sólo sabía si
 * había cuenta o no, sin distinguir una invitación sin usar de alguien que
 * entra todos los días, y sin decir a qué dirección.
 *
 * Del otro lado, Permisos era un callejón sin salida: quien piensa que las
 * cuentas se administran ahí abre "Gestionar", no encuentra el email y
 * termina quitando el acceso para volver a invitar —el camino destructivo—
 * en vez de editar la ficha.
 */

describe('cómo se lee el estado de la cuenta', () => {
  it('la cuenta activa dice con qué dirección entra', () => {
    expect(
      textoDeEstadoDeCuenta({
        estado: 'cuenta_activa',
        emailDeLaCuenta: 'ana@empresa.com',
        emailDeLaFicha: 'ana@empresa.com',
      })
    ).toBe('Activa · entra con ana@empresa.com');
  });

  it('la invitación pendiente dice a dónde se mandó', () => {
    // Sin la dirección hay que ir a Permisos a averiguarla, que es
    // exactamente el viaje que este dato viene a ahorrar.
    expect(
      textoDeEstadoDeCuenta({
        estado: 'invitacion_pendiente',
        emailDeLaCuenta: 'ana@empresa.com',
        emailDeLaFicha: 'ana@empresa.com',
      })
    ).toBe('Invitación pendiente · enviada a ana@empresa.com');
  });

  it('sin cuenta lo dice y no inventa una dirección', () => {
    const texto = textoDeEstadoDeCuenta({
      estado: 'sin_cuenta',
      emailDeLaCuenta: null,
      emailDeLaFicha: 'ana@empresa.com',
    });
    expect(texto).toBe('Sin cuenta');
    expect(texto).not.toContain('ana@empresa.com');
  });

  it('los tres estados se distinguen entre sí', () => {
    const textos = (
      [
        ['cuenta_activa', 'a@a.com'],
        ['invitacion_pendiente', 'a@a.com'],
        ['sin_cuenta', null],
      ] as const
    ).map(([estado, email]) =>
      textoDeEstadoDeCuenta({
        estado,
        emailDeLaCuenta: email,
        emailDeLaFicha: 'a@a.com',
      })
    );
    expect(new Set(textos).size).toBe(3);
  });
});

// =====================================================================
// El puntero desde Permisos
// =====================================================================

jest.mock('@/lib/services/rrhh', () => ({
  quitarAcceso: jest.fn(),
  reenviarInvitacion: jest.fn(),
  vincularUsuarioAEmpleado: jest.fn(),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

const usuario = (empleadoId: string | null): Usuario => ({
  id: 'u-1',
  email: 'ana@empresa.com',
  rol: 'empleado',
  empresaId: 'emp-1',
  empleadoId,
  nombreCompleto: 'Ana Pérez',
});

const legajo = (id: string, apellido: string, sinUsuario: boolean): Empleado =>
  ({
    id,
    empresaId: 'emp-1',
    nombre: 'Ana',
    apellido,
    puesto: 'Operaria',
    sector: 'Producción',
    activo: true,
    sinUsuario,
  }) as unknown as Empleado;

// jsdom no implementa `scrollIntoView`, y el Selector lo llama al abrir.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

const abrirModal = async (
  empleadoId: string | null,
  empleados: Empleado[] = []
) => {
  render(
    <MantineProvider>
      <GestionCuentaModal
        usuario={usuario(empleadoId)}
        empleados={empleados}
        empleadosConCuenta={new Set()}
        onCerrar={jest.fn()}
        onCambio={jest.fn()}
      />
    </MantineProvider>
  );
  await screen.findByText('Ana Pérez');
};

/** Abre el desplegable de vínculo y devuelve su lista de opciones. */
const opcionesDeVinculo = async (etiquetaActual: string | RegExp) => {
  await userEvent.click(screen.getByRole('button', { name: etiquetaActual }));
  return screen.findByRole('listbox');
};

describe('Permisos señala dónde se cambia el email', () => {
  it('con legajo vinculado, enlaza a su ficha', async () => {
    await abrirModal('ple-7');

    expect(
      screen.getByText(/El email de acceso se cambia desde la/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/esta cuenta se actualiza sola/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /ficha del colaborador/i })
    ).toHaveAttribute('href', '/colaboradores/ple-7/editar');
  });

  it('no duplica el control: sigue sin haber campo de email acá', async () => {
    await abrirModal('ple-7');

    // Lo único editable del modal es el vínculo con el colaborador.
    expect(
      screen.queryByRole('textbox', { name: /email/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Colaborador vinculado')).toBeInTheDocument();
  });

  it('sin legajo vinculado no manda a ninguna ficha', async () => {
    // No hay ficha a la que ir: el aviso sería un enlace roto.
    await abrirModal(null);

    await waitFor(() =>
      expect(
        screen.queryByText(/El email de acceso se cambia desde la/i)
      ).not.toBeInTheDocument()
    );
  });
});

// =====================================================================
// Vincular una cuenta existente respeta la misma decisión
// =====================================================================

describe('el desplegable de vínculo respeta la decisión del legajo', () => {
  it('no ofrece a quien está marcado "no le vamos a dar cuenta"', async () => {
    // Vincularle una cuenta que ya existe llega al mismo estado
    // contradictorio que invitarlo, sólo que por otro camino.
    await abrirModal(null, [
      legajo('ple-1', 'Disponible', false),
      legajo('ple-2', 'Excluida', true),
    ]);
    const lista = await opcionesDeVinculo(/sin vincular/i);

    expect(within(lista).getByText(/Disponible/)).toBeInTheDocument();
    expect(within(lista).queryByText(/Excluida/)).not.toBeInTheDocument();
  });

  it('destildar la opción vuelve a ofrecerlo', async () => {
    await abrirModal(null, [legajo('ple-2', 'Excluida', false)]);
    const lista = await opcionesDeVinculo(/sin vincular/i);

    expect(within(lista).getByText(/Excluida/)).toBeInTheDocument();
  });

  it('el vínculo actual se sigue viendo aunque esté marcado', async () => {
    // Si se escondiera, el desplegable no podría mostrar lo que hay hoy
    // ni dejar deshacerlo: quedaría una cuenta atada sin forma de soltarla.
    await abrirModal('ple-2', [legajo('ple-2', 'Excluida', true)]);

    expect(
      screen.getByRole('button', { name: /Excluida/ })
    ).toBeInTheDocument();
  });

  it('explica por qué alguien puede no estar en la lista', async () => {
    await abrirModal(null, [legajo('ple-1', 'Disponible', false)]);

    expect(
      screen.getByText(/destildá esa opción en su ficha/i)
    ).toBeInTheDocument();
  });
});
