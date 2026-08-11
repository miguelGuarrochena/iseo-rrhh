import { diasAusencia, diasEntre, diasHabilesEntre } from '@/lib/fechas';
import {
  actualizarConfigEmpresa,
  crearAusencia,
  eliminarFeriado,
  getEmpresa,
  guardarFeriados,
} from '@/lib/services/rrhh';

/**
 * Fuente de verdad: `diasAusencia` (UI, demo, real.ts y espejo SQL).
 * BUG-009: UI y persistencia deben coincidir para la misma config.
 */

describe('diasEntre (corridos)', () => {
  it('incluye ambos extremos', () => {
    expect(diasEntre('2026-07-20', '2026-07-24')).toBe(5);
  });

  it('un solo día', () => {
    expect(diasEntre('2026-07-20', '2026-07-20')).toBe(1);
  });

  it('viernes → lunes cuenta sábado y domingo', () => {
    // 2026-07-03 vie … 2026-07-06 lun
    expect(diasEntre('2026-07-03', '2026-07-06')).toBe(4);
  });

  it('rango invertido → 0', () => {
    expect(diasEntre('2026-07-24', '2026-07-20')).toBe(0);
  });

  it('cruza año nuevo', () => {
    expect(diasEntre('2025-12-28', '2026-01-10')).toBe(14);
  });
});

describe('diasHabilesEntre', () => {
  it('excluye fin de semana en viernes → lunes', () => {
    expect(diasHabilesEntre('2026-07-03', '2026-07-06')).toBe(2);
  });

  it('lunes → lunes = 1', () => {
    expect(diasHabilesEntre('2026-07-06', '2026-07-06')).toBe(1);
  });

  it('sábado → domingo = 0', () => {
    expect(diasHabilesEntre('2026-07-04', '2026-07-05')).toBe(0);
  });

  it('descuenta feriado no laborable', () => {
    const feriados = new Set(['2026-07-09']); // jueves
    // lun 6 → vie 10 sin feriado = 5; con jueves feriado = 4
    expect(diasHabilesEntre('2026-07-06', '2026-07-10')).toBe(5);
    expect(diasHabilesEntre('2026-07-06', '2026-07-10', feriados)).toBe(4);
  });

  it('rango largo (dos semanas hábiles)', () => {
    // lun 6 → vie 17 = 10 hábiles
    expect(diasHabilesEntre('2026-07-06', '2026-07-17')).toBe(10);
  });
});

describe('diasAusencia (única semántica)', () => {
  const vieLun = ['2026-07-03', '2026-07-06'] as const;

  it('no-vacaciones siempre corridos aunque la empresa use hábiles', () => {
    expect(diasAusencia(vieLun[0], vieLun[1], 'enfermedad', true)).toBe(4);
    expect(diasAusencia(vieLun[0], vieLun[1], 'especial', true)).toBe(4);
  });

  it('vacaciones + corridos → igual que diasEntre', () => {
    expect(diasAusencia(vieLun[0], vieLun[1], 'vacaciones', false)).toBe(4);
    expect(diasAusencia(vieLun[0], vieLun[1], 'vacaciones', false)).toBe(
      diasEntre(vieLun[0], vieLun[1])
    );
  });

  it('vacaciones + hábiles → excluye fin de semana', () => {
    expect(diasAusencia(vieLun[0], vieLun[1], 'vacaciones', true)).toBe(2);
  });

  it('misma fecha: corridos ≠ hábiles cuando hay fin de semana', () => {
    const corridos = diasAusencia(vieLun[0], vieLun[1], 'vacaciones', false);
    const habiles = diasAusencia(vieLun[0], vieLun[1], 'vacaciones', true);
    expect(corridos).toBe(4);
    expect(habiles).toBe(2);
    expect(corridos).not.toBe(habiles);
  });

  it('feriado dentro del rango (solo hábiles)', () => {
    const feriados = new Set(['2026-07-06']); // lunes
    expect(
      diasAusencia(vieLun[0], vieLun[1], 'vacaciones', true, feriados)
    ).toBe(1); // solo el viernes
    expect(
      diasAusencia(vieLun[0], vieLun[1], 'vacaciones', false, feriados)
    ).toBe(4); // corridos no miran feriados
  });

  it('año nuevo con hábiles', () => {
    // 28/12/2025 dom … 10/01/2026 sáb → 10 hábiles (29–31, 1–2, 5–9)
    expect(diasAusencia('2025-12-28', '2026-01-10', 'vacaciones', true)).toBe(
      10
    );
    expect(diasAusencia('2025-12-28', '2026-01-10', 'vacaciones', false)).toBe(
      14
    );
  });
});

describe('BUG-009: UI calculation === backend calculation', () => {
  it('preview (diasAusencia) === días persistidos por crearAusencia (demo)', async () => {
    const empresa = await getEmpresa();
    const prev = { ...empresa.config };
    const feriadosCreados = await guardarFeriados([
      {
        fecha: '2026-11-23',
        nombre: 'Feriado test BUG-009',
        tipo: 'empresa',
        noLaborable: true,
      },
    ]);

    try {
      await actualizarConfigEmpresa({
        ...prev,
        vacacionesDiasHabiles: true,
      });

      // lun 23 (feriado) → vie 27 → hábiles = 4 (24–27)
      const desde = '2026-11-23';
      const hasta = '2026-11-27';
      const previewUi = diasAusencia(
        desde,
        hasta,
        'vacaciones',
        true,
        new Set(['2026-11-23'])
      );
      expect(previewUi).toBe(4);

      const creada = await crearAusencia({
        empleadoId: 'ple-4',
        tipo: 'vacaciones',
        fechaDesde: desde,
        fechaHasta: hasta,
        comentario: 'BUG-009 parity',
      });
      expect(creada.dias).toBe(previewUi);
      expect(creada.dias).not.toBe(diasEntre(desde, hasta)); // 5 corridos
    } finally {
      await actualizarConfigEmpresa(prev);
      for (const f of feriadosCreados) {
        await eliminarFeriado(f.id);
      }
    }
  });

  it('con corridos, UI y demo coinciden e incluyen finde', async () => {
    const empresa = await getEmpresa();
    const prev = { ...empresa.config };
    try {
      await actualizarConfigEmpresa({
        ...prev,
        vacacionesDiasHabiles: false,
      });
      const desde = '2026-07-03';
      const hasta = '2026-07-06';
      const previewUi = diasAusencia(desde, hasta, 'vacaciones', false);
      const creada = await crearAusencia({
        empleadoId: 'ple-4',
        tipo: 'vacaciones',
        fechaDesde: desde,
        fechaHasta: hasta,
      });
      expect(previewUi).toBe(4);
      expect(creada.dias).toBe(previewUi);
    } finally {
      await actualizarConfigEmpresa(prev);
    }
  });
});
