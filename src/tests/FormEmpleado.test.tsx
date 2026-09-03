import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormEmpleado } from '@/components/app/colaboradores/FormEmpleado';
import { getEmpleados } from '@/lib/services/rrhh';
import type { Empleado } from '@/types/rrhh';

jest.mock('@/lib/services/rrhh', () => ({
  getEmpleados: jest.fn(),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

/**
 * El módulo Fichaje es el interruptor del control horario. Se mockea
 * para poder ver el formulario con y sin él: una empresa administrativa
 * no tiene que ver campos de fichaje.
 */
const modulosMock = jest.fn(() => ({}) as Record<string, boolean>);
jest.mock('@/lib/auth/useModulos', () => ({
  useModulos: () => modulosMock(),
}));

(getEmpleados as jest.MockedFunction<typeof getEmpleados>).mockResolvedValue(
  []
);

/** Un legajo real de los que hoy tienen puesto y sector en blanco. */
const enBlanco = {
  id: 'e1',
  empresaId: 'emp1',
  nombre: 'Rita',
  apellido: 'Sinsector',
  dni: '30111222',
  cuil: '',
  fechaNacimiento: undefined,
  estadoCivil: 'soltero',
  nivelEstudios: 'secundario',
  domicilio: '',
  telefono: '',
  email: '',
  contactoEmergencia: {},
  grupoFamiliar: [],
  fechaIngreso: '2020-01-01',
  puesto: '',
  sector: '',
  modalidadContratacion: 'indeterminado',
  modalidadPago: 'mensual',
  banco: '',
  cbu: '',
  obraSocial: '',
  art: '',
  activo: true,
  checklistAlta: [],
} as unknown as Empleado;

const abrir = async (inicial?: Empleado) => {
  const onGuardar = jest.fn().mockResolvedValue(undefined);
  render(
    <FormEmpleado
      inicial={inicial}
      textoGuardar="Guardar"
      onGuardar={onGuardar}
      onCancelar={jest.fn()}
    />
  );
  await screen.findByRole('button', { name: /guardar/i });
  return onGuardar;
};

/**
 * Para los casos que sólo miran lo que se ve al montar.
 *
 * Al montarse, el formulario pide la lista de supervisores (`useCarga` +
 * `getEmpleados`). Esa promesa resuelve *después* del cuerpo síncrono
 * del test, así que el `setState` que trae cae fuera de `act(...)` y
 * React avisa —y el test termina mirando un componente que todavía se
 * estaba acomodando—. Esperar al botón deja la carga cerrada antes de
 * cualquier assert.
 */
const montar = async (ui: React.ReactElement) => {
  render(ui);
  await screen.findByRole('button', { name: /guardar/i });
};

const guardar = () =>
  userEvent.click(screen.getByRole('button', { name: /^guardar$/i }));

/**
 * F-09 — La fecha de ingreso vacía se mandaba como `null` a una columna
 * `not null`: el guardado fallaba entero, con el texto crudo de Postgres,
 * y no se guardaba tampoco lo que estaba bien.
 */
describe('F-09: la fecha de ingreso es obligatoria', () => {
  it('sin fecha de ingreso no se envía nada y se explica por qué', async () => {
    const onGuardar = await abrir(enBlanco);
    const campo = screen.getByRole('textbox', { name: /fecha de ingreso/i });
    await userEvent.clear(campo);
    await guardar();

    // El mensaje aparece dos veces: en el campo y en el resumen de abajo.
    expect(
      (await screen.findAllByText(/La fecha de ingreso es obligatorio/i)).length
    ).toBeGreaterThan(0);
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('con fecha de ingreso guarda normalmente', async () => {
    const onGuardar = await abrir(enBlanco);
    await guardar();
    await waitFor(() => expect(onGuardar).toHaveBeenCalled());
  });
});

/**
 * Y sólo ella.
 *
 * Puesto y sector son opcionales a propósito (el alta lo dice, y la
 * importación por Excel los deja en blanco). Exigirlos dejaría sin poder
 * editar a los legajos que hoy los tienen vacíos —21 en la base real—
 * aunque sólo se les quiera corregir el teléfono.
 */
describe('F-09: puesto y sector siguen siendo opcionales', () => {
  it('un legajo sin puesto ni sector se puede seguir editando', async () => {
    const onGuardar = await abrir(enBlanco);
    expect(screen.getByRole('textbox', { name: /puesto/i })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /sector/i })).toHaveValue('');

    // Hay dos "Teléfono": el del legajo y el del contacto de emergencia.
    const [telefono] = screen.getAllByRole('textbox', { name: /teléfono/i });
    await userEvent.type(telefono, '1122334455');
    await guardar();

    await waitFor(() => expect(onGuardar).toHaveBeenCalled());
    expect(onGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ telefono: '1122334455' })
    );
  });
});

describe('control horario en el formulario del legajo', () => {
  const props = {
    textoGuardar: 'Guardar',
    onGuardar: jest.fn(),
    onCancelar: jest.fn(),
  };

  afterEach(() => modulosMock.mockReturnValue({}));

  it('con Fichaje encendido pide el modo de fichaje', async () => {
    modulosMock.mockReturnValue({ fichaje: true });
    await montar(<FormEmpleado {...props} />);
    expect(screen.getByText('Fichaje')).toBeInTheDocument();
    // `CampoSelect` no asocia el label por `htmlFor`, así que se busca
    // el texto: lo que importa es que el campo esté a la vista.
    expect(screen.getByText('Modo de fichaje')).toBeInTheDocument();
  });

  it('con Fichaje apagado no pregunta nada de fichaje', async () => {
    // Es el pedido del cliente: en una empresa administrativa, ver
    // campos de control horario da la impresión de que la app viene a
    // controlar horarios.
    modulosMock.mockReturnValue({ fichaje: false });
    await montar(<FormEmpleado {...props} />);
    expect(screen.queryByText('Modo de fichaje')).not.toBeInTheDocument();
    expect(screen.queryByText('Fichaje')).not.toBeInTheDocument();
  });

  it('ofrece marcar a quien no registra asistencia', async () => {
    modulosMock.mockReturnValue({ fichaje: true });
    await montar(<FormEmpleado {...props} />);
    expect(screen.getByText('No registra asistencia')).toBeInTheDocument();
  });

  it('con Fichaje apagado no ofrece la marca: no hay asistencia que registrar', async () => {
    modulosMock.mockReturnValue({ fichaje: false });
    await montar(<FormEmpleado {...props} />);
    expect(
      screen.queryByText('No registra asistencia')
    ).not.toBeInTheDocument();
  });

  it('al marcarla deja de preguntar cómo ficha y guarda la decisión', async () => {
    modulosMock.mockReturnValue({ fichaje: true });
    const onGuardar = await abrir(enBlanco);

    await userEvent.click(screen.getByText('No registra asistencia'));
    expect(screen.queryByText('Modo de fichaje')).not.toBeInTheDocument();

    await guardar();
    await waitFor(() => expect(onGuardar).toHaveBeenCalled());
    expect(onGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ sinFichaje: true })
    );
  });

  it('un legajo ya marcado abre con la marca puesta', async () => {
    modulosMock.mockReturnValue({ fichaje: true });
    await montar(
      <FormEmpleado
        {...props}
        inicial={{ ...enBlanco, sinFichaje: true } as Empleado}
      />
    );
    expect(
      screen.getByRole('checkbox', { name: /no registra asistencia/i })
    ).toBeChecked();
    expect(screen.queryByText('Modo de fichaje')).not.toBeInTheDocument();
  });

  it('pero el acceso a la app se sigue pudiendo definir', async () => {
    // `sinUsuario` no es de fichaje: decide si la persona tiene cuenta.
    // Esconderlo junto con lo demás sería perder una decisión que la
    // empresa igual necesita tomar.
    modulosMock.mockReturnValue({ fichaje: false });
    await montar(<FormEmpleado {...props} />);
    expect(screen.getByText('Acceso a la app')).toBeInTheDocument();
    expect(
      screen.getByText(/no le vamos a dar cuenta en la app/i)
    ).toBeInTheDocument();
  });
});

/**
 * El campo Email era, para el admin, un dato de contacto más. En realidad
 * es —o no es— la llave con la que esa persona entra a la app, y qué pasa
 * al cambiarlo depende de en qué anda su cuenta. Sin decirlo, el caso que
 * se repetía era el peor: cambiar el email creyendo que se corregía un
 * dato y que la invitación siguiera saliendo a la dirección anterior.
 */
describe('el campo Email dice qué va a pasar según el estado de la cuenta', () => {
  const props = {
    inicial: enBlanco,
    textoGuardar: 'Guardar',
    onGuardar: jest.fn(),
    onCancelar: jest.fn(),
  };

  const escribirEmail = async (valor: string) => {
    const campo = screen.getByRole('textbox', { name: /^email/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, valor);
  };

  it('sin cuenta: avisa que sólo se actualiza el contacto', async () => {
    await montar(
      <FormEmpleado
        {...props}
        cuenta={{
          estado: 'sin_cuenta',
          emailDeLaCuenta: null,
          emailDeLaFicha: 'viejo@ejemplo.com',
        }}
      />
    );
    await escribirEmail('nuevo@empresa.com');

    expect(
      screen.getByText('Se actualizará el email de contacto.')
    ).toBeInTheDocument();
  });

  it('invitación pendiente: avisa que la anterior se invalida', async () => {
    await montar(
      <FormEmpleado
        {...props}
        cuenta={{
          estado: 'invitacion_pendiente',
          emailDeLaCuenta: 'test@example.com',
          emailDeLaFicha: 'test@example.com',
        }}
      />
    );
    await escribirEmail('nuevo@empresa.com');

    expect(
      screen.getByText(
        'La invitación anterior será invalidada y se enviará una nueva al nuevo email.'
      )
    ).toBeInTheDocument();
  });

  it('cuenta activa: avisa que se actualiza la que ya existe', async () => {
    await montar(
      <FormEmpleado
        {...props}
        cuenta={{
          estado: 'cuenta_activa',
          emailDeLaCuenta: 'test@example.com',
          emailDeLaFicha: 'test@example.com',
        }}
      />
    );
    await escribirEmail('nuevo@empresa.com');

    expect(
      screen.getByText(
        'Se actualizará el email de acceso de la cuenta existente. La cuenta y sus datos históricos se conservarán.'
      )
    ).toBeInTheDocument();
  });

  it('con cuenta activa nunca sugiere que se crea una cuenta nueva', async () => {
    await montar(
      <FormEmpleado
        {...props}
        cuenta={{
          estado: 'cuenta_activa',
          emailDeLaCuenta: 'test@example.com',
          emailDeLaFicha: 'test@example.com',
        }}
      />
    );

    // El campo se llama distinto y dice con qué entra hoy, antes incluso
    // de que el admin toque nada.
    expect(screen.getByText('Email de acceso')).toBeInTheDocument();
    expect(
      screen.getByText(/No se crea una cuenta nueva/i)
    ).toBeInTheDocument();
  });

  it('mientras el email no cambie no hay aviso que distraiga', async () => {
    await montar(
      <FormEmpleado
        {...props}
        inicial={{ ...enBlanco, email: 'test@example.com' } as Empleado}
        cuenta={{
          estado: 'cuenta_activa',
          emailDeLaCuenta: 'test@example.com',
          emailDeLaFicha: 'test@example.com',
        }}
      />
    );

    expect(
      screen.queryByText(/Se actualizará el email de acceso/)
    ).not.toBeInTheDocument();
  });

  it('sin poder consultar la cuenta, el campo se comporta como antes', async () => {
    await montar(<FormEmpleado {...props} />);
    await escribirEmail('nuevo@empresa.com');

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(
      screen.queryByText(/Se actualizará el email/)
    ).not.toBeInTheDocument();
  });
});
