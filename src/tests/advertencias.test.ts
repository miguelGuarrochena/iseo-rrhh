import {
  advertenciasDeAcumulacion,
  advertenciasDeAusencia,
  advertenciasDeLicencia,
  advertenciasDeSolicitud,
  advertenciasDeVacaciones,
  enEpocaDeOtorgamiento,
  hayAdvertenciaAlta,
} from '@/lib/advertencias';
/**
 * La regla que atraviesa todo el módulo: **advertir no es bloquear**.
 *
 * Cada caso de acá comprueba que la situación se detecta y se explica.
 * Ninguno comprueba que algo se impida, porque nada se impide: la
 * decisión queda en RRHH. Si alguna vez una de estas funciones empieza a
 * devolver un error en vez de una advertencia, se rompe el contrato que
 * el cliente pidió expresamente.
 */

/** Los feriados viajan como el mismo `Set` que usa el resto de la app. */
const feriados = (...fechas: string[]) => new Set(fechas);

const claves = (avisos: { clave: string }[]) => avisos.map((a) => a.clave);

describe('enEpocaDeOtorgamiento (art. 154)', () => {
  it('la ventana cruza el año nuevo: octubre a abril', () => {
    expect(enEpocaDeOtorgamiento('2026-10-01')).toBe(true);
    expect(enEpocaDeOtorgamiento('2026-12-15')).toBe(true);
    expect(enEpocaDeOtorgamiento('2027-01-10')).toBe(true);
    expect(enEpocaDeOtorgamiento('2027-04-30')).toBe(true);
  });

  it('mayo a septiembre queda afuera', () => {
    expect(enEpocaDeOtorgamiento('2026-05-01')).toBe(false);
    expect(enEpocaDeOtorgamiento('2026-07-15')).toBe(false);
    expect(enEpocaDeOtorgamiento('2026-09-30')).toBe(false);
  });
});

describe('vacaciones: no empieza un lunes (art. 151)', () => {
  // 2027-01-11 es lunes; el 12 martes, el 13 miércoles.
  it('un lunes no genera advertencia', () => {
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-01-11',
      fechaHasta: '2027-01-24',
      hoy: '2026-10-01',
    });
    expect(claves(a)).not.toContain('vac_no_empieza_lunes');
  });

  it('un miércoles sí', () => {
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-01-13',
      fechaHasta: '2027-01-26',
      hoy: '2026-10-01',
    });
    expect(claves(a)).toContain('vac_no_empieza_lunes');
  });

  it('el martes siguiente a un lunes feriado NO se marca', () => {
    // Es literalmente lo que dice el art. 151: lunes, o el día hábil
    // siguiente si ese lunes es feriado.
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-01-12',
      fechaHasta: '2027-01-25',
      hoy: '2026-10-01',
      feriados: feriados('2027-01-11'),
    });
    expect(claves(a)).not.toContain('vac_no_empieza_lunes');
  });

  it('pero un martes sin lunes feriado sí se marca', () => {
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-01-12',
      fechaHasta: '2027-01-25',
      hoy: '2026-10-01',
    });
    expect(claves(a)).toContain('vac_no_empieza_lunes');
  });
});

describe('vacaciones: fuera del período legal (art. 154)', () => {
  it('julio está fuera de la época', () => {
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-07-05',
      fechaHasta: '2027-07-18',
      hoy: '2027-01-01',
    });
    expect(claves(a)).toContain('vac_fuera_de_epoca');
    expect(a.find((x) => x.clave === 'vac_fuera_de_epoca')?.nivel).toBe('alta');
  });

  it('enero está dentro', () => {
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-01-11',
      fechaHasta: '2027-01-24',
      hoy: '2026-10-01',
    });
    expect(claves(a)).not.toContain('vac_fuera_de_epoca');
  });
});

describe('vacaciones: anticipación de 45 días (art. 154)', () => {
  it('con menos de 45 días avisa y dice cuántos hay', () => {
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-01-11',
      fechaHasta: '2027-01-24',
      hoy: '2027-01-04', // 7 días antes
    });
    const aviso = a.find((x) => x.clave === 'vac_sin_anticipacion');
    expect(aviso).toBeDefined();
    expect(aviso?.detalle).toContain('7 días');
  });

  it('con 45 días o más no avisa', () => {
    const a = advertenciasDeVacaciones({
      fechaDesde: '2027-01-11',
      fechaHasta: '2027-01-24',
      hoy: '2026-11-01',
    });
    expect(claves(a)).not.toContain('vac_sin_anticipacion');
  });

  it('una licencia que ya empezó no arrastra el aviso de anticipación', () => {
    // Cargar hoy unas vacaciones de la semana pasada es una regularización,
    // no una comunicación tardía: pedir 45 días de anticipación sobre algo
    // que ya pasó sería ruido garantizado.
    const a = advertenciasDeVacaciones({
      fechaDesde: '2026-12-07',
      fechaHasta: '2026-12-20',
      hoy: '2026-12-15',
    });
    expect(claves(a)).not.toContain('vac_sin_anticipacion');
  });
});

describe('vacaciones acumuladas (art. 164)', () => {
  it('sin días arrastrados no hay nada que decir', () => {
    expect(
      advertenciasDeAcumulacion({ diasDelPeriodo: 14, diasArrastrados: 0 })
    ).toHaveLength(0);
  });

  it('dentro del tercio avisa, pero suave', () => {
    // 14 días de período → tope 4. Arrastrar 4 está permitido.
    const a = advertenciasDeAcumulacion({
      diasDelPeriodo: 14,
      diasArrastrados: 4,
    });
    expect(claves(a)).toEqual(['vac_acumulacion']);
    expect(a[0].nivel).toBe('media');
  });

  it('por encima del tercio avisa fuerte y dice cuál es el tope', () => {
    const a = advertenciasDeAcumulacion({
      diasDelPeriodo: 14,
      diasArrastrados: 9,
    });
    expect(claves(a)).toEqual(['vac_acumulacion_excedida']);
    expect(a[0].nivel).toBe('alta');
    expect(a[0].detalle).toContain('4 días');
  });

  it('el tope se calcula sobre el período que corresponde, no sobre un fijo', () => {
    // 35 días (más de 20 años de antigüedad) → tope 11.
    const a = advertenciasDeAcumulacion({
      diasDelPeriodo: 35,
      diasArrastrados: 11,
    });
    expect(claves(a)).toEqual(['vac_acumulacion']);
    expect(
      advertenciasDeAcumulacion({ diasDelPeriodo: 35, diasArrastrados: 12 })[0]
        .clave
    ).toBe('vac_acumulacion_excedida');
  });

  it('nunca devuelve algo que impida guardar', () => {
    const a = advertenciasDeAcumulacion({
      diasDelPeriodo: 14,
      diasArrastrados: 60,
    });
    expect(a).toHaveLength(1);
    expect(a[0].queHacer).toMatch(/podés guardarlo igual/i);
  });
});

describe('licencias en días no laborables', () => {
  it('una licencia que abarca un fin de semana avisa', () => {
    // Viernes 2027-01-15 a lunes 2027-01-18: sábado y domingo adentro.
    const a = advertenciasDeLicencia({
      tipo: 'fallecimiento',
      fechaDesde: '2027-01-15',
      fechaHasta: '2027-01-18',
    });
    expect(claves(a)).toEqual(['lic_incluye_no_laborables']);
    expect(a[0].detalle).toContain('2 días no laborables');
  });

  it('no modifica las fechas: sólo avisa', () => {
    const a = advertenciasDeLicencia({
      tipo: 'fallecimiento',
      fechaDesde: '2027-01-15',
      fechaHasta: '2027-01-18',
    });
    expect(a[0].queHacer).toMatch(/no lo extiende solo/i);
  });

  it('cuenta también los feriados de la empresa', () => {
    const a = advertenciasDeLicencia({
      tipo: 'casamiento',
      fechaDesde: '2027-01-11', // lunes
      fechaHasta: '2027-01-13', // miércoles
      feriados: feriados('2027-01-12'),
    });
    expect(a[0].detalle).toContain('1 día no laborable');
  });

  it('una licencia enteramente en días hábiles no avisa', () => {
    expect(
      advertenciasDeLicencia({
        tipo: 'examenes',
        fechaDesde: '2027-01-11',
        fechaHasta: '2027-01-13',
      })
    ).toHaveLength(0);
  });

  it('las parciales de jornada no aplican: son de un día', () => {
    expect(
      advertenciasDeLicencia({
        tipo: 'home_office',
        fechaDesde: '2027-01-16',
        fechaHasta: '2027-01-16',
      })
    ).toHaveLength(0);
  });

  it('en modalidad hábiles las vacaciones no avisan: el sistema ya las saltea', () => {
    expect(
      advertenciasDeLicencia({
        tipo: 'vacaciones',
        fechaDesde: '2027-01-11',
        fechaHasta: '2027-01-24',
        vacacionesEnHabiles: true,
      })
    ).toHaveLength(0);
    // Pero en corridos sí, porque esos días se consumen.
    expect(
      advertenciasDeLicencia({
        tipo: 'vacaciones',
        fechaDesde: '2027-01-11',
        fechaHasta: '2027-01-24',
      })
    ).toHaveLength(1);
  });
});

describe('advertenciasDeSolicitud (todo junto)', () => {
  it('las de vacaciones sólo aplican a vacaciones', () => {
    const a = advertenciasDeSolicitud({
      tipo: 'enfermedad',
      fechaDesde: '2027-07-14', // miércoles, fuera de época
      fechaHasta: '2027-07-16',
      hoy: '2027-07-13',
    });
    expect(claves(a)).not.toContain('vac_no_empieza_lunes');
    expect(claves(a)).not.toContain('vac_fuera_de_epoca');
  });

  it('un caso malo junta varias advertencias', () => {
    const a = advertenciasDeSolicitud({
      tipo: 'vacaciones',
      fechaDesde: '2027-07-14', // miércoles, fuera de época, sin anticipación
      fechaHasta: '2027-07-27',
      hoy: '2027-07-01',
      diasDelPeriodo: 14,
      diasArrastrados: 9,
    });
    expect(claves(a)).toEqual(
      expect.arrayContaining([
        'vac_no_empieza_lunes',
        'vac_fuera_de_epoca',
        'vac_sin_anticipacion',
        'vac_acumulacion_excedida',
        'lic_incluye_no_laborables',
      ])
    );
    expect(hayAdvertenciaAlta(a)).toBe(true);
  });

  it('el caso ideal no genera ninguna', () => {
    const a = advertenciasDeSolicitud({
      tipo: 'vacaciones',
      fechaDesde: '2027-01-11', // lunes, en época
      fechaHasta: '2027-01-24',
      hoy: '2026-11-01', // con anticipación
      vacacionesEnHabiles: true,
    });
    expect(a).toHaveLength(0);
    expect(hayAdvertenciaAlta(a)).toBe(false);
  });

  it('sin datos de acumulación no se inventa una advertencia', () => {
    const a = advertenciasDeSolicitud({
      tipo: 'vacaciones',
      fechaDesde: '2027-01-11',
      fechaHasta: '2027-01-24',
      hoy: '2026-11-01',
      vacacionesEnHabiles: true,
    });
    expect(claves(a)).not.toContain('vac_acumulacion');
  });
});

describe('advertenciasDeAusencia (sobre una ya guardada)', () => {
  it('mide la anticipación contra el día en que se pidió, no contra hoy', () => {
    // Se pidió el 01/11 para el 11/01: había anticipación de sobra.
    // Mirarla en enero no puede convertirla en tardía.
    const a = advertenciasDeAusencia({
      tipo: 'vacaciones',
      fechaDesde: '2027-01-11',
      fechaHasta: '2027-01-24',
      creadaEn: '2026-11-01',
    });
    expect(claves(a)).not.toContain('vac_sin_anticipacion');
  });

  it('acepta el creadaEn con hora sin romperse', () => {
    const a = advertenciasDeAusencia({
      tipo: 'vacaciones',
      fechaDesde: '2027-01-11',
      fechaHasta: '2027-01-24',
      creadaEn: '2026-11-01T14:32:00.000Z',
    });
    expect(claves(a)).not.toContain('vac_sin_anticipacion');
  });
});
