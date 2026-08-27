import { hoyISO, inicioDelDiaEmpresa, ZONA_EMPRESA } from '@/lib/fechas';

/**
 * "Hoy" no puede salir del reloj del dispositivo. Antes sí salía de
 * ahí, y una consulta hecha desde otro huso —o con la hora mal puesta—
 * traía las marcas de otro día sin ninguna señal de que algo andaba mal.
 *
 * Estos tests no dependen del TZ con el que corra jest: le pasan el
 * instante y comprueban qué día es ESE instante para la empresa.
 */
describe('el día de la empresa', () => {
  it('usa la misma zona que zona_empresa() en la base', () => {
    expect(ZONA_EMPRESA).toBe('America/Argentina/Buenos_Aires');
  });

  // 02:00Z del 28 son las 23:00 del 27 en Argentina: todavía es el 27.
  it('la madrugada UTC sigue siendo el día anterior acá', () => {
    expect(hoyISO(new Date('2026-08-28T02:00:00Z'))).toBe('2026-08-27');
  });

  it('a las 03:00Z ya cambió el día', () => {
    expect(hoyISO(new Date('2026-08-28T03:00:00Z'))).toBe('2026-08-28');
  });

  it('el mediodía UTC es el mismo día', () => {
    expect(hoyISO(new Date('2026-08-27T12:00:00Z'))).toBe('2026-08-27');
  });

  it('el corte del día es la medianoche argentina, no la UTC', () => {
    // 00:00 ART del 27 = 03:00Z del 27.
    expect(inicioDelDiaEmpresa(new Date('2026-08-27T12:00:00Z'))).toBe(
      '2026-08-27T03:00:00.000Z'
    );
  });

  it('a las 23:00 locales el corte sigue siendo el de ese mismo día', () => {
    expect(inicioDelDiaEmpresa(new Date('2026-08-28T02:00:00Z'))).toBe(
      '2026-08-27T03:00:00.000Z'
    );
  });

  // Justo pasada la medianoche local, el corte tiene que saltar al día
  // nuevo: si se quedara en el anterior, el tablero mostraría las marcas
  // de ayer mezcladas con las de hoy.
  it('salta al día nuevo apenas pasa la medianoche local', () => {
    expect(inicioDelDiaEmpresa(new Date('2026-08-28T03:00:01Z'))).toBe(
      '2026-08-28T03:00:00.000Z'
    );
  });

  it('cruza el cambio de mes', () => {
    expect(hoyISO(new Date('2026-09-01T02:30:00Z'))).toBe('2026-08-31');
    expect(inicioDelDiaEmpresa(new Date('2026-09-01T02:30:00Z'))).toBe(
      '2026-08-31T03:00:00.000Z'
    );
  });

  it('cruza el cambio de año', () => {
    expect(hoyISO(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
  });

  it('el corte siempre cae en la medianoche local del día que informa', () => {
    const instantes = [
      '2026-01-15T05:00:00Z',
      '2026-03-10T23:59:59Z',
      '2026-07-04T00:00:00Z',
      '2026-11-30T15:22:33Z',
    ];
    instantes.forEach((iso) => {
      const corte = inicioDelDiaEmpresa(new Date(iso));
      // El corte pertenece al día que informa `hoyISO`…
      expect(hoyISO(new Date(corte))).toBe(hoyISO(new Date(iso)));
      // …y un milisegundo antes ya es el día anterior.
      const previo = new Date(new Date(corte).getTime() - 1);
      expect(hoyISO(previo)).not.toBe(hoyISO(new Date(iso)));
    });
  });
});
