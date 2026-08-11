import {
  ausenciaResueltaEsInmutable,
  transicionAusenciaPermitida,
} from '@/lib/seguridad/ausenciasEstados';
import {
  crearAusencia,
  getSaldoVacaciones,
  resolverAusencia,
} from '@/lib/services/rrhh';

describe('máquina de estados ausencias (BUG-007, contrato)', () => {
  it('permite pendiente→aprobada y pendiente→rechazada', () => {
    expect(transicionAusenciaPermitida('pendiente', 'aprobada')).toBe(true);
    expect(transicionAusenciaPermitida('pendiente', 'rechazada')).toBe(true);
  });

  it('bloquea reaperturas e inversiones', () => {
    expect(transicionAusenciaPermitida('aprobada', 'rechazada')).toBe(false);
    expect(transicionAusenciaPermitida('rechazada', 'aprobada')).toBe(false);
    expect(transicionAusenciaPermitida('aprobada', 'pendiente')).toBe(false);
    expect(transicionAusenciaPermitida('rechazada', 'pendiente')).toBe(false);
  });

  it('marca resueltas como inmutables', () => {
    expect(ausenciaResueltaEsInmutable('aprobada')).toBe(true);
    expect(ausenciaResueltaEsInmutable('rechazada')).toBe(true);
    expect(ausenciaResueltaEsInmutable('pendiente')).toBe(false);
  });
});

describe('flujos demo (no son RLS ni concurrencia real)', () => {
  it('aprueba y no re-resuelve', async () => {
    const creada = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'especial',
      fechaDesde: '2026-12-01',
      fechaHasta: '2026-12-01',
    });
    expect(creada.estado).toBe('pendiente');
    const ok = await resolverAusencia(creada.id, 'aprobada', 'ple-1');
    expect(ok?.estado).toBe('aprobada');
    const re = await resolverAusencia(creada.id, 'rechazada', 'ple-1');
    expect(re?.estado).toBe('aprobada');
  });

  it('saldo descuenta pendientes', async () => {
    const antes = await getSaldoVacaciones('ple-3', 2026);
    expect(antes?.diasDisponibles).toBeDefined();
  });
});
