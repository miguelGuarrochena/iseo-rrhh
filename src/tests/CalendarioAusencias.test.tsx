import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { CalendarioAusencias } from '@/components/app/ausencias/CalendarioAusencias';
import { Ausencia } from '@/types/rrhh';

/**
 * El calendario dibujando: que una ausencia de varios días se vea como un
 * bloque, que cambiar de vista no cambie lo que hay, y que cuando no
 * entran todas en un día quede el "+N más" para llegar al resto.
 *
 * La fecha se congela: si el mes de apertura dependiera del día en que se
 * corre el test, la mitad de estas afirmaciones serían distintas mañana.
 */

const NOMBRES: Record<string, string> = {
  e1: 'Juan Pérez',
  e2: 'María Gómez',
  e3: 'Pedro López',
  e4: 'Ana Rodríguez',
};
const nombreEmpleado = (id: string) => NOMBRES[id] ?? 'Compañero';

const a = (
  id: string,
  empleadoId: string,
  fechaDesde: string,
  fechaHasta: string,
  extra: Partial<Ausencia> = {}
): Ausencia => ({
  id,
  empleadoId,
  tipo: 'vacaciones',
  fechaDesde,
  fechaHasta,
  dias: 1,
  estado: 'aprobada',
  adjuntos: [],
  creadaEn: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const dibujar = (ausencias: Ausencia[]) =>
  render(
    <MantineProvider>
      <CalendarioAusencias
        ausencias={ausencias}
        nombreEmpleado={nombreEmpleado}
      />
    </MantineProvider>
  );

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-08-13T15:00:00.000Z') });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('CalendarioAusencias', () => {
  it('abre en el mes de hoy y navega mes a mes, con vuelta a Hoy', () => {
    dibujar([]);
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Período siguiente'));
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Período anterior'));
    fireEvent.click(screen.getByLabelText('Período anterior'));
    expect(screen.getByText('Julio 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument();
  });

  it('dibuja una ausencia de varios días como un solo bloque', () => {
    dibujar([a('1', 'e1', '2026-08-11', '2026-08-14', { dias: 4 })]);
    const bloques = screen.getAllByTitle(/Juan Pérez/);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toHaveAttribute(
      'title',
      expect.stringContaining('Vacaciones')
    );
    expect(bloques[0]).toHaveAttribute(
      'title',
      expect.stringContaining('4 días')
    );
  });

  it('parte en dos filas la que cruza de semana, sin duplicar el evento', () => {
    // Del jueves 13 al martes 18: dos filas de la grilla, un solo id.
    dibujar([a('1', 'e1', '2026-08-13', '2026-08-18', { dias: 6 })]);
    expect(screen.getAllByTitle(/Juan Pérez/)).toHaveLength(2);
  });

  it('muestra la ausencia que viene del mes anterior', () => {
    dibujar([a('1', 'e1', '2026-07-29', '2026-08-04', { dias: 7 })]);
    expect(screen.getAllByTitle(/Juan Pérez/).length).toBeGreaterThan(0);
  });

  it('distingue lo pendiente de lo aprobado', () => {
    dibujar([
      a('1', 'e1', '2026-08-11', '2026-08-12', { estado: 'pendiente' }),
      a('2', 'e2', '2026-08-11', '2026-08-12', { estado: 'aprobada' }),
    ]);
    expect(screen.getByTitle(/Juan Pérez.*Pendiente de aprobar/)).toBeTruthy();
    expect(screen.getByTitle(/María Gómez/).getAttribute('title')).not.toMatch(
      /Pendiente/
    );
  });

  it('no dibuja las rechazadas', () => {
    dibujar([
      a('1', 'e1', '2026-08-11', '2026-08-12', { estado: 'rechazada' }),
    ]);
    expect(screen.queryByTitle(/Juan Pérez/)).toBeNull();
  });

  it('cuando no entran todas ofrece "+N más" y ahí están las que faltan', async () => {
    dibujar([
      a('1', 'e1', '2026-08-12', '2026-08-12'),
      a('2', 'e2', '2026-08-12', '2026-08-12'),
      a('3', 'e3', '2026-08-12', '2026-08-12'),
      a('4', 'e4', '2026-08-12', '2026-08-12', { estado: 'pendiente' }),
    ]);
    // El chip dice "+N" en pantalla angosta y "+N más" en escritorio.
    const mas = screen.getByRole('button', { name: /^\+\d+( más)?$/ });
    fireEvent.click(mas);
    const dialogo = await screen.findByRole('dialog');
    expect(
      within(dialogo).getByText(/4 personas ausentes/)
    ).toBeInTheDocument();
    ['Juan Pérez', 'María Gómez', 'Pedro López', 'Ana Rodríguez'].forEach((n) =>
      expect(within(dialogo).getByText(n)).toBeInTheDocument()
    );
  });

  it('al tocar un bloque abre el detalle con los datos de esa ausencia', async () => {
    dibujar([
      a('1', 'e1', '2026-08-11', '2026-08-14', {
        dias: 4,
        tipo: 'enfermedad',
        estado: 'pendiente',
        comentarioEmpleado: 'Reposo indicado',
      }),
    ]);
    fireEvent.click(screen.getByTitle(/Juan Pérez/));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Juan Pérez')).toBeInTheDocument();
    expect(within(dialogo).getByText('Enfermedad')).toBeInTheDocument();
    expect(within(dialogo).getByText('Pendiente')).toBeInTheDocument();
    expect(within(dialogo).getByText('4 días')).toBeInTheDocument();
    expect(within(dialogo).getByText('Reposo indicado')).toBeInTheDocument();
  });

  it('cambiar de vista no cambia los datos, sólo cómo se ven', () => {
    const ausencias = [
      a('1', 'e1', '2026-08-10', '2026-08-14', { dias: 5 }),
      a('2', 'e2', '2026-08-13', '2026-08-13', { tipo: 'enfermedad' }),
    ];
    const { rerender } = dibujar(ausencias);

    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(screen.getByText('10 – 16 de agosto 2026')).toBeInTheDocument();
    // En semana el nombre va en la columna de la izquierda, una fila por persona.
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('María Gómez')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Día' }));
    expect(screen.getByText('Jueves 13 de agosto 2026')).toBeInTheDocument();
    // Los tipos también están en la leyenda: alcanza con que aparezcan.
    expect(screen.getAllByText('Vacaciones').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Enfermedad').length).toBeGreaterThan(0);
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('María Gómez')).toBeInTheDocument();

    // Los datos de entrada siguen intactos después de pasear por las vistas.
    expect(ausencias).toHaveLength(2);
    rerender(
      <MantineProvider>
        <CalendarioAusencias
          ausencias={ausencias}
          nombreEmpleado={nombreEmpleado}
        />
      </MantineProvider>
    );
    expect(screen.getByText('Jueves 13 de agosto 2026')).toBeInTheDocument();
  });

  it('en la vista de sector sólo muestra aprobadas', () => {
    render(
      <MantineProvider>
        <CalendarioAusencias
          ausencias={[
            a('1', 'e1', '2026-08-11', '2026-08-12', { estado: 'pendiente' }),
            a('2', 'e2', '2026-08-11', '2026-08-12', { estado: 'aprobada' }),
          ]}
          nombreEmpleado={nombreEmpleado}
          soloAprobadas
        />
      </MantineProvider>
    );
    expect(screen.queryByTitle(/Juan Pérez/)).toBeNull();
    expect(screen.getByTitle(/María Gómez/)).toBeTruthy();
  });
});
