import { controlarTurno, resumirControlTurnos, aMinutos } from '@/lib/turnos';
import { Fichaje, Turno } from '@/types/rrhh';

const turno = (fecha: string, entrada: string, salida: string): Turno => ({
  id: `t-${fecha}`,
  empleadoId: 'e1',
  fecha,
  horaEntrada: entrada,
  horaSalida: salida,
});

const fichaje = (
  fecha: string,
  hora: string,
  tipo: Fichaje['tipo']
): Fichaje => ({
  id: `f-${fecha}-${hora}`,
  empleadoId: 'e1',
  tipo,
  timestamp: `${fecha}T${hora}:00`,
  metodo: 'celular',
});

describe('controlarTurno', () => {
  it('marca ausente si no fichó ingreso', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), []);
    expect(c.ausente).toBe(true);
    expect(c.tardeMin).toBe(0);
  });

  it('calcula llegada tarde', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-06', '08:15', 'ingreso'),
      fichaje('2026-07-06', '17:00', 'egreso'),
    ]);
    expect(c.tardeMin).toBe(15);
    expect(c.antesMin).toBe(0);
    expect(c.ausente).toBe(false);
  });

  it('calcula salida antes', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-06', '08:00', 'ingreso'),
      fichaje('2026-07-06', '16:30', 'egreso'),
    ]);
    expect(c.antesMin).toBe(30);
  });

  it('cuenta horas extras (se quedó después y entró antes)', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-06', '07:45', 'ingreso'),
      fichaje('2026-07-06', '18:00', 'egreso'),
    ]);
    // 15 min antes + 60 min después
    expect(c.extrasMin).toBe(75);
    expect(c.tardeMin).toBe(0);
  });

  it('ignora fichajes de otro día', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-07', '08:00', 'ingreso'),
    ]);
    expect(c.ausente).toBe(true);
  });
});

describe('resumirControlTurnos', () => {
  it('agrega el control de varios turnos', () => {
    const turnos = [
      turno('2026-07-06', '08:00', '17:00'),
      turno('2026-07-07', '08:00', '17:00'),
    ];
    const fichajes = [
      fichaje('2026-07-06', '08:10', 'ingreso'),
      fichaje('2026-07-06', '17:00', 'egreso'),
      // 07 sin fichaje → ausente
    ];
    const r = resumirControlTurnos(turnos, fichajes);
    expect(r.ausencias).toBe(1);
    expect(r.llegadasTarde).toBe(1);
    expect(r.minutosTarde).toBe(10);
  });
});

describe('aMinutos', () => {
  it('convierte HH:MM a minutos', () => {
    expect(aMinutos('08:30')).toBe(510);
  });
});
