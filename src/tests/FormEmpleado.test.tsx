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

  it('con Fichaje encendido pide el modo de fichaje', () => {
    modulosMock.mockReturnValue({ fichaje: true });
    render(<FormEmpleado {...props} />);
    expect(screen.getByText('Fichaje')).toBeInTheDocument();
    // `CampoSelect` no asocia el label por `htmlFor`, así que se busca
    // el texto: lo que importa es que el campo esté a la vista.
    expect(screen.getByText('Modo de fichaje')).toBeInTheDocument();
  });

  it('con Fichaje apagado no pregunta nada de fichaje', () => {
    // Es el pedido del cliente: en una empresa administrativa, ver
    // campos de control horario da la impresión de que la app viene a
    // controlar horarios.
    modulosMock.mockReturnValue({ fichaje: false });
    render(<FormEmpleado {...props} />);
    expect(screen.queryByText('Modo de fichaje')).not.toBeInTheDocument();
    expect(screen.queryByText('Fichaje')).not.toBeInTheDocument();
  });

  it('ofrece marcar a quien no registra asistencia', () => {
    modulosMock.mockReturnValue({ fichaje: true });
    render(<FormEmpleado {...props} />);
    expect(screen.getByText('No registra asistencia')).toBeInTheDocument();
  });

  it('con Fichaje apagado no ofrece la marca: no hay asistencia que registrar', () => {
    modulosMock.mockReturnValue({ fichaje: false });
    render(<FormEmpleado {...props} />);
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

  it('un legajo ya marcado abre con la marca puesta', () => {
    modulosMock.mockReturnValue({ fichaje: true });
    render(
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

  it('pero el acceso a la app se sigue pudiendo definir', () => {
    // `sinUsuario` no es de fichaje: decide si la persona tiene cuenta.
    // Esconderlo junto con lo demás sería perder una decisión que la
    // empresa igual necesita tomar.
    modulosMock.mockReturnValue({ fichaje: false });
    render(<FormEmpleado {...props} />);
    expect(screen.getByText('Acceso a la app')).toBeInTheDocument();
    expect(
      screen.getByText(/no le vamos a dar cuenta en la app/i)
    ).toBeInTheDocument();
  });
});
