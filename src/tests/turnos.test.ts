import {
  aMinutos,
  claveTurno,
  controlarJornada,
  controlarTurno,
  ficho,
  indexarTurnos,
  resumirControlTurnos,
} from '@/lib/turnos';
import { Fichaje, Turno } from '@/types/rrhh';

const turno = (fecha: string, entrada: string, salida: string): Turno => ({
  id: `t-${fecha}`,
  empleadoId: 'e1',
  fecha,
  horaEntrada: entrada,
  horaSalida: salida,
});

/**
 * Timestamp realista como los que entrega PostgREST: UTC con zona.
 * Los tests viejos usaban `2026-07-06T08:00:00` sin zona y ocultaban
 * el bug de leer la hora con `slice` sobre el string UTC.
 */
const fichaje = (
  isoUtc: string,
  tipo: Fichaje['tipo'],
  empleadoId = 'e1'
): Fichaje => ({
  id: `f-${isoUtc}-${tipo}`,
  empleadoId,
  tipo,
  timestamp: isoUtc,
  metodo: 'celular',
});

describe('controlarTurno', () => {
  it('marca ausente si no fichó ingreso', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), []);
    expect(c.ausente).toBe(true);
    expect(c.tardeMin).toBe(0);
  });

  it('ingreso 08:00 ART (=11:00Z) no es llegada tarde', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-06T11:00:00+00:00', 'ingreso'),
      fichaje('2026-07-06T20:00:00+00:00', 'egreso'),
    ]);
    expect(c.tardeMin).toBe(0);
    expect(c.extrasMin).toBe(0);
    expect(c.ausente).toBe(false);
    expect(c.ingreso).toBe('08:00');
    expect(c.egreso).toBe('17:00');
  });

  it('calcula llegada tarde en hora local', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-06T11:15:00+00:00', 'ingreso'),
      fichaje('2026-07-06T20:00:00+00:00', 'egreso'),
    ]);
    expect(c.tardeMin).toBe(15);
    expect(c.antesMin).toBe(0);
  });

  it('calcula salida antes en hora local', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-06T11:00:00+00:00', 'ingreso'),
      fichaje('2026-07-06T19:30:00+00:00', 'egreso'),
    ]);
    expect(c.antesMin).toBe(30);
  });

  it('cuenta como extra la salida tardía, no la entrada anticipada', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-06T10:45:00+00:00', 'ingreso'), // 07:45 ART
      fichaje('2026-07-06T21:00:00+00:00', 'egreso'), // 18:00 ART
    ]);
    /**
     * Antes esta pantalla sumaba también los 15 minutos de entrada
     * anticipada y daba 75. Era su propia cuenta: `controlarJornada` —la
     * que alimenta Reportes, "Mi mes" y las extras que se ofrecen sumar
     * al bruto— sólo cuenta la salida tardía, porque llegar antes suele
     * ser el colectivo y no trabajo pedido.
     *
     * O sea que el mismo día mostraba 75 minutos en Turnos y 60 en la
     * liquidación. Ahora las dos usan la misma regla y da 60.
     */
    expect(c.extrasMin).toBe(60);
    expect(c.tardeMin).toBe(0);
  });

  it('un egreso después de las 21:00 locales sigue contando ese día', () => {
    // 21:30 ART = 00:30Z del día siguiente. El filtro por prefijo UTC
    // lo perdía; la fecha local del turno es el 6.
    const c = controlarTurno(turno('2026-07-06', '13:00', '21:00'), [
      fichaje('2026-07-06T16:00:00+00:00', 'ingreso'),
      fichaje('2026-07-07T00:30:00+00:00', 'egreso'),
    ]);
    expect(c.egreso).toBe('21:30');
    expect(c.extrasMin).toBe(30);
    expect(c.ausente).toBe(false);
  });

  it('ignora fichajes de otro día (en hora local)', () => {
    const c = controlarTurno(turno('2026-07-06', '08:00', '17:00'), [
      fichaje('2026-07-07T11:00:00+00:00', 'ingreso'),
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
      fichaje('2026-07-06T11:10:00+00:00', 'ingreso'),
      fichaje('2026-07-06T20:00:00+00:00', 'egreso'),
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

describe('controlarJornada', () => {
  /** Los timestamps van sin zona para que se lean como hora local. */
  const jornada = (entrada?: string, salida?: string) => ({
    entrada: entrada ? `2026-07-06T${entrada}:00` : null,
    salida: salida ? `2026-07-06T${salida}:00` : null,
  });

  const diurno = { horaEntrada: '08:00', horaSalida: '17:00' };

  it('sin llegada tarde ni extras cuando entra y sale en horario', () => {
    const c = controlarJornada(jornada('08:00', '17:00'), diurno);
    expect(c.llegadaTardeMin).toBe(0);
    expect(c.extrasMin).toBe(0);
  });

  it('cuenta la llegada tarde completa, no la que excede la tolerancia', () => {
    const c = controlarJornada(jornada('08:20', '17:00'), diurno, 10);
    expect(c.llegadaTardeMin).toBe(20);
  });

  it('dentro de la tolerancia no es llegada tarde', () => {
    const c = controlarJornada(jornada('08:08', '17:00'), diurno, 10);
    expect(c.llegadaTardeMin).toBe(0);
  });

  it('cuenta como extra sólo lo que se queda después de la salida', () => {
    const c = controlarJornada(jornada('08:00', '19:30'), diurno);
    expect(c.extrasMin).toBe(150);
  });

  /** Decisión de negocio: entrar antes no se paga como extra. */
  it('entrar antes de hora NO cuenta como extra', () => {
    const c = controlarJornada(jornada('06:00', '17:00'), diurno);
    expect(c.extrasMin).toBe(0);
    expect(c.llegadaTardeMin).toBe(0);
  });

  it('una jornada sin cerrar no genera extras', () => {
    const c = controlarJornada(jornada('08:00', undefined), diurno);
    expect(c.extrasMin).toBe(0);
    expect(c.llegadaTardeMin).toBe(0);
  });

  describe('turno noche (cruza medianoche)', () => {
    const noche = { horaEntrada: '22:00', horaSalida: '06:00' };

    /**
     * El bug que motivó todo esto: con el horario general de la empresa
     * (08:00) un turno noche daba 840 minutos de llegada tarde por día.
     * Contra su propio turno, entrar 22:00 es puntual.
     */
    it('entrar 22:00 en un turno 22-06 no es llegar tarde', () => {
      const c = controlarJornada(
        { entrada: '2026-07-06T22:00:00', salida: '2026-07-07T06:00:00' },
        noche
      );
      expect(c.llegadaTardeMin).toBe(0);
      expect(c.extrasMin).toBe(0);
    });

    it('salir 07:30 en un turno 22-06 son 90 minutos de extra', () => {
      const c = controlarJornada(
        { entrada: '2026-07-06T22:00:00', salida: '2026-07-07T07:30:00' },
        noche
      );
      expect(c.extrasMin).toBe(90);
    });

    it('llegar 22:45 a un turno 22-06 son 45 minutos tarde', () => {
      const c = controlarJornada(
        { entrada: '2026-07-06T22:45:00', salida: '2026-07-07T06:00:00' },
        noche
      );
      expect(c.llegadaTardeMin).toBe(45);
    });
  });
});

describe('indexarTurnos', () => {
  it('encuentra el turno de una persona en un día', () => {
    const t = turno('2026-07-06', '08:00', '17:00');
    const indice = indexarTurnos([t]);
    expect(indice.get(claveTurno('e1', '2026-07-06'))).toBe(t);
    expect(indice.get(claveTurno('e1', '2026-07-07'))).toBeUndefined();
    expect(indice.get(claveTurno('e2', '2026-07-06'))).toBeUndefined();
  });
});

/**
 * `ficho` decide si un día sin turno asignado se controla igual contra
 * el horario general. Si dijera que sí donde no hubo marcas, cada
 * sábado aparecería como ausencia; si dijera que no donde sí las hubo,
 * las extras de ese día volverían a no poder aprobarse.
 */
describe('ficho', () => {
  it('es falso si esa persona no tiene marcas ese día', () => {
    expect(
      ficho(
        [fichaje('2026-07-06T11:00:00+00:00', 'ingreso')],
        'e1',
        '2026-07-07'
      )
    ).toBe(false);
  });

  it('es verdadero con una sola marca, aunque la jornada no haya cerrado', () => {
    expect(
      ficho(
        [fichaje('2026-07-06T11:00:00+00:00', 'ingreso')],
        'e1',
        '2026-07-06'
      )
    ).toBe(true);
  });

  it('no confunde a dos personas', () => {
    const marcas = [fichaje('2026-07-06T11:00:00+00:00', 'ingreso', 'e2')];
    expect(ficho(marcas, 'e1', '2026-07-06')).toBe(false);
    expect(ficho(marcas, 'e2', '2026-07-06')).toBe(true);
  });

  // 21:30 ART es 00:30Z del día siguiente: con el prefijo del string UTC
  // el egreso caería en otro día y el día quedaría sin controlar.
  it('usa la fecha local, no el prefijo UTC', () => {
    const marcas = [fichaje('2026-07-07T00:30:00+00:00', 'egreso')];
    expect(ficho(marcas, 'e1', '2026-07-06')).toBe(true);
    expect(ficho(marcas, 'e1', '2026-07-07')).toBe(false);
  });
});
