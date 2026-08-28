/**
 * Los casos que la auditoría de Fichajes encontró rotos.
 *
 * Cada `describe` corresponde a un hallazgo (A01–A08) y todos fallaban
 * con el código anterior. Van juntos y no repartidos en los archivos
 * existentes porque lo que tienen en común es más importante que el
 * módulo donde vive cada función: son las reglas que la base ya cumplía
 * y alguna capa de arriba no.
 *
 * Sobre el reloj: nada acá usa `Date.now()` sin fijarlo. La mitad de
 * estos bugs se sostenían justamente en que el resultado dependía de la
 * hora a la que corriera el test.
 */
import {
  agruparMarcas,
  armarJornadas,
  estadoJornadaVista,
  jornadasDelPeriodo,
  minutosFichados,
  tipoDeMarcaSiguiente,
} from '@/lib/fichadas';
import { controlarJornada, controlarTurno, ficho } from '@/lib/turnos';
import {
  diaEmpresa,
  finDeMesEmpresa,
  horaEmpresa,
  hoyISO,
  instanteEnZonaEmpresa,
  mesEmpresa,
  minutosDelDiaEmpresa,
  sumarDiasEmpresa,
} from '@/lib/fechas';
import { Fichaje, Turno } from '@/types/rrhh';

const marca = (
  iso: string,
  tipo: 'ingreso' | 'egreso',
  extra: Partial<Fichaje> = {}
): Fichaje =>
  ({
    id: `f-${iso}-${tipo}`,
    empleadoId: 'e1',
    tipo,
    timestamp: iso,
    metodo: 'celular',
    ...extra,
  }) as Fichaje;

const turno = (fecha: string, entrada: string, salida: string): Turno => ({
  id: `t-${fecha}`,
  empleadoId: 'e1',
  fecha,
  horaEntrada: entrada,
  horaSalida: salida,
});

/** Reloj fijo, bien después de todos los casos. */
const DESPUES = new Date('2026-08-20T12:00:00-03:00').getTime();

// ============================================================
// A01 — una marca anulada no ocurrió
// ============================================================

describe('A01: las marcas anuladas salen de todos los cálculos', () => {
  const anuladas = [
    marca('2026-07-06T11:30:00+00:00', 'ingreso', {
      anuladoEn: '2026-07-07T12:00:00+00:00',
      anuladoMotivo: 'Cargada en el legajo equivocado',
    }),
    marca('2026-07-06T20:00:00+00:00', 'egreso', {
      anuladoEn: '2026-07-07T12:00:00+00:00',
      anuladoMotivo: 'Cargada en el legajo equivocado',
    }),
  ];

  it('controlarTurno no cuenta una llegada tarde que fue anulada', () => {
    // 11:30Z = 08:30 ART contra un turno de 08:00 daban 30 minutos tarde
    // sobre una marca que RRHH ya había anulado.
    const c = controlarTurno(
      turno('2026-07-06', '08:00', '17:00'),
      anuladas,
      [],
      DESPUES
    );
    expect(c.tardeMin).toBe(0);
    expect(c.ingreso).toBeUndefined();
    // Sin marcas vigentes y sin licencia, el día es una ausencia.
    expect(c.ausente).toBe(true);
  });

  it('ficho() no da por trabajado un día cuyas marcas se anularon', () => {
    expect(ficho(anuladas, 'e1', '2026-07-06', DESPUES)).toBe(false);
  });

  it('agruparMarcas descarta las anuladas aunque el llamador se olvide', () => {
    // El filtro vive en el agrupador —como en `marcas_numeradas`— para
    // que ninguna consulta pueda saltearlo por olvido.
    const conVigente = [
      ...anuladas,
      marca('2026-07-06T13:00:00+00:00', 'ingreso'),
    ];
    const grupos = agruparMarcas(conVigente, DESPUES);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].marcas).toHaveLength(1);
    expect(grupos[0].jornada.entrada).toBe('2026-07-06T13:00:00+00:00');
  });

  it('armarJornadas no arma una jornada con marcas anuladas', () => {
    expect(armarJornadas(anuladas, DESPUES)).toHaveLength(0);
  });

  it('minutosFichados no suma tiempo de marcas anuladas', () => {
    expect(minutosFichados(anuladas, DESPUES)).toBe(0);
  });
});

// ============================================================
// A02 — el turno noche es una sesión, no dos medios días
// ============================================================

describe('A02: turno nocturno', () => {
  const noche = () => turno('2026-07-06', '22:00', '06:00');
  // 22:00 ART = 01:00Z del día siguiente. Con offset explícito para que
  // el caso no dependa del huso de la máquina que corre el test.
  const entra2200 = marca('2026-07-07T01:00:00+00:00', 'ingreso');

  it('22:00 → 06:00 es puntual y sin extras', () => {
    const c = controlarTurno(
      noche(),
      [entra2200, marca('2026-07-07T09:00:00+00:00', 'egreso')],
      [],
      DESPUES
    );
    expect(c.ausente).toBe(false);
    expect(c.ingreso).toBe('22:00');
    expect(c.egreso).toBe('06:00');
    expect(c.tardeMin).toBe(0);
    expect(c.extrasMin).toBe(0);
    expect(c.antesMin).toBe(0);
  });

  it('22:00 → 07:30 son 90 minutos de extra', () => {
    // Éste es el caso que daba 0: el egreso caía en el día siguiente y
    // el filtro por fecha de calendario lo dejaba fuera del turno.
    const c = controlarTurno(
      noche(),
      [entra2200, marca('2026-07-07T10:30:00+00:00', 'egreso')],
      [],
      DESPUES
    );
    expect(c.egreso).toBe('07:30');
    expect(c.extrasMin).toBe(90);
  });

  it('el día siguiente NO es una ausencia: esa persona estuvo trabajando', () => {
    // El otro lado del mismo bug: el turno del martes no encontraba su
    // ingreso (estaba el lunes) y reportaba "ausente" a quien había
    // trabajado toda la noche.
    const c = controlarTurno(
      turno('2026-07-07', '22:00', '06:00'),
      [entra2200, marca('2026-07-07T10:30:00+00:00', 'egreso')],
      [],
      DESPUES
    );
    expect(c.ausente).toBe(true);
    // Pero tampoco cuenta como día trabajado, que es lo que evita que se
    // sintetice un turno de control y salga el falso "Ausente".
    expect(
      ficho(
        [entra2200, marca('2026-07-07T10:30:00+00:00', 'egreso')],
        'e1',
        '2026-07-07',
        DESPUES
      )
    ).toBe(false);
    expect(
      ficho(
        [entra2200, marca('2026-07-07T10:30:00+00:00', 'egreso')],
        'e1',
        '2026-07-06',
        DESPUES
      )
    ).toBe(true);
  });

  it('una jornada nocturna sin egreso no inventa una salida anticipada', () => {
    const c = controlarTurno(noche(), [entra2200], [], DESPUES);
    expect(c.egreso).toBeUndefined();
    expect(c.antesMin).toBe(0);
    expect(c.extrasMin).toBe(0);
    expect(c.ausente).toBe(false);
  });

  it('la marca anulada de un turno noche tampoco cuenta', () => {
    const c = controlarTurno(
      noche(),
      [
        entra2200,
        marca('2026-07-07T10:30:00+00:00', 'egreso', {
          anuladoEn: '2026-07-08T00:00:00+00:00',
        }),
      ],
      [],
      DESPUES
    );
    // Queda la entrada, no la salida anulada: jornada abierta, sin extras.
    expect(c.ingreso).toBe('22:00');
    expect(c.egreso).toBeUndefined();
    expect(c.extrasMin).toBe(0);
  });
});

// ============================================================
// A03 — la jornada que cruza el borde del período es UNA sola
// ============================================================

describe('A03: jornadas en el límite del período', () => {
  /**
   * La misma función que usan `getMiMes` y `getHorasExtrasDelPeriodo`.
   * Se llama a la de producción y no a una copia: si el recorte se
   * rompiera allá, este test tiene que enterarse.
   */
  const delPeriodo = (marcas: Fichaje[], desde: string, hasta: string) =>
    jornadasDelPeriodo(marcas, desde, hasta, DESPUES);

  // 31/01 22:00 ART → 01/02 07:30 ART, con offset explícito.
  const cruzaElMes = [
    marca('2026-02-01T01:00:00+00:00', 'ingreso'),
    marca('2026-02-01T10:30:00+00:00', 'egreso'),
  ];

  it('con margen, sigue siendo una jornada de enero de 9,5 horas', () => {
    const enero = delPeriodo(cruzaElMes, '2026-01-01', '2026-01-31');
    expect(enero).toHaveLength(1);
    expect(enero[0].fecha).toBe('2026-01-31');
    expect(enero[0].horas).toBeCloseTo(9.5, 1);
    expect(enero[0].cerrada).toBe(true);
    expect(enero[0].incompleta).toBe(false);
  });

  it('febrero no se queda con la mitad: la jornada pertenece al mes que empezó', () => {
    const febrero = delPeriodo(cruzaElMes, '2026-02-01', '2026-02-28');
    expect(febrero).toHaveLength(0);
  });

  it('las extras del turno noche no se pierden en el corte de mes', () => {
    const [jornada] = delPeriodo(cruzaElMes, '2026-01-01', '2026-01-31');
    const c = controlarJornada(jornada, {
      horaEntrada: '22:00',
      horaSalida: '06:00',
    });
    // Antes daba 0 en los dos meses: enero se quedaba con el ingreso
    // suelto y febrero con el egreso huérfano.
    expect(c.extrasMin).toBe(90);
  });

  it('el mismo criterio aplica al borde de una semana', () => {
    const semana = delPeriodo(cruzaElMes, '2026-01-26', '2026-01-31');
    expect(semana).toHaveLength(1);
    expect(semana[0].horas).toBeCloseTo(9.5, 1);
  });
});

// ============================================================
// A04 — nada del futuro describe el presente
// ============================================================

describe('A04: fichajes con fecha futura', () => {
  const ahora = new Date('2026-08-20T12:00:00-03:00').getTime();
  const futura = marca('2027-01-10T11:00:00+00:00', 'ingreso');

  it('no congela la alternancia ingreso/egreso', () => {
    // Se ordenaba última por `ts` y dejaba el botón clavado en "egreso"
    // hasta que llegara esa fecha.
    expect(tipoDeMarcaSiguiente([futura], ahora)).toBe('ingreso');
  });

  it('una marca futura no tapa a la marca real más reciente', () => {
    const real = marca('2026-08-20T13:00:00+00:00', 'ingreso'); // 10:00 ART
    expect(tipoDeMarcaSiguiente([real, futura], ahora)).toBe('egreso');
  });

  it('no muestra una jornada activa que todavía no empezó', () => {
    const vista = estadoJornadaVista([futura], ahora);
    expect(vista.estado).not.toBe('activa');
    expect(vista.siguiente).toBe('ingreso');
  });

  it('la jornada futura no figura en curso', () => {
    const [j] = armarJornadas([futura], ahora);
    expect(j.enCurso).toBe(false);
  });

  it('tolera el desfasaje chico de un reloj de tablet', () => {
    // Dos minutos adelantado es una tablet mal puesta en hora, no un
    // fichaje del futuro: tiene que seguir contando como jornada activa.
    const apenasAdelantada = marca(
      new Date(ahora + 2 * 60 * 1000).toISOString(),
      'ingreso'
    );
    const [j] = armarJornadas([apenasAdelantada], ahora);
    expect(j.enCurso).toBe(true);
    expect(tipoDeMarcaSiguiente([apenasAdelantada], ahora)).toBe('egreso');
  });
});

// ============================================================
// A05 / A08 — la zona de negocio, no la del dispositivo
// ============================================================

describe('A05: el mes de negocio no es el de UTC', () => {
  it('el último día del mes a las 21:30 ART sigue siendo ese mes', () => {
    // 2026-08-31 21:30 ART = 2026-09-01 00:30 UTC.
    // `toISOString().slice(0, 7)` devolvía "2026-09" y el ausentismo se
    // calculaba sobre un mes que no había empezado.
    const instante = new Date('2026-09-01T00:30:00+00:00');
    expect(instante.toISOString().slice(0, 7)).toBe('2026-09');
    expect(mesEmpresa(instante)).toBe('2026-08');
    expect(hoyISO(instante)).toBe('2026-08-31');
  });

  it('a las 21:30 ART del 31 el mes todavía cierra el 31', () => {
    const instante = new Date('2026-09-01T00:30:00+00:00');
    expect(finDeMesEmpresa(mesEmpresa(instante))).toBe('2026-08-31');
  });

  it('finDeMesEmpresa resuelve febrero bisiesto', () => {
    expect(finDeMesEmpresa('2028-02')).toBe('2028-02-29');
    expect(finDeMesEmpresa('2026-02')).toBe('2026-02-28');
  });

  it('sumarDiasEmpresa cruza el fin de mes y el fin de año', () => {
    expect(sumarDiasEmpresa('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDiasEmpresa('2026-02-01', -1)).toBe('2026-01-31');
    expect(sumarDiasEmpresa('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('A08: el huso del dispositivo no cambia ningún resultado', () => {
  const original = process.env.TZ;
  // Instante inequívoco: 2026-07-06 21:30 ART.
  const iso = '2026-07-07T00:30:00+00:00';

  const enHuso = <T>(tz: string, fn: () => T): T => {
    process.env.TZ = tz;
    try {
      return fn();
    } finally {
      process.env.TZ = original;
    }
  };

  it('diaEmpresa da el mismo día desde Buenos Aires, UTC y Madrid', () => {
    // Éste es el caso concreto: a las 21:30 de Buenos Aires ya es el día
    // siguiente en UTC. Leído con el reloj del dispositivo, la marca se
    // agrupaba en otro día que el que calcula la base.
    const esperado = '2026-07-06';
    expect(
      enHuso('America/Argentina/Buenos_Aires', () => diaEmpresa(iso))
    ).toBe(esperado);
    expect(enHuso('UTC', () => diaEmpresa(iso))).toBe(esperado);
    expect(enHuso('Europe/Madrid', () => diaEmpresa(iso))).toBe(esperado);
    expect(enHuso('Asia/Tokyo', () => diaEmpresa(iso))).toBe(esperado);
  });

  it('horaEmpresa y minutosDelDiaEmpresa tampoco se mueven', () => {
    expect(enHuso('UTC', () => horaEmpresa(iso))).toBe('21:30');
    expect(enHuso('Europe/Madrid', () => horaEmpresa(iso))).toBe('21:30');
    expect(enHuso('UTC', () => minutosDelDiaEmpresa(iso))).toBe(21 * 60 + 30);
  });

  it('hoyISO no depende del huso del dispositivo', () => {
    const instante = new Date(iso);
    expect(enHuso('UTC', () => hoyISO(instante))).toBe('2026-07-06');
    expect(enHuso('Asia/Tokyo', () => hoyISO(instante))).toBe('2026-07-06');
  });

  it('instanteEnZonaEmpresa interpreta la hora escrita como argentina', () => {
    // Lo que RRHH tipea en la carga manual es una hora de pared local.
    const desdeUTC = enHuso('UTC', () =>
      instanteEnZonaEmpresa('2026-07-06', '21:30').toISOString()
    );
    const desdeMadrid = enHuso('Europe/Madrid', () =>
      instanteEnZonaEmpresa('2026-07-06', '21:30').toISOString()
    );
    expect(desdeUTC).toBe('2026-07-07T00:30:00.000Z');
    expect(desdeMadrid).toBe(desdeUTC);
  });

  it('el control de turno da lo mismo corrido desde otro huso', () => {
    const marcas = [
      marca('2026-07-06T11:15:00+00:00', 'ingreso'), // 08:15 ART
      marca('2026-07-06T21:00:00+00:00', 'egreso'), // 18:00 ART
    ];
    const correr = () =>
      controlarTurno(
        turno('2026-07-06', '08:00', '17:00'),
        marcas,
        [],
        DESPUES
      );
    const enBA = enHuso('America/Argentina/Buenos_Aires', correr);
    const enUTC = enHuso('UTC', correr);
    expect(enBA.tardeMin).toBe(15);
    expect(enBA.extrasMin).toBe(60);
    expect(enUTC.tardeMin).toBe(enBA.tardeMin);
    expect(enUTC.extrasMin).toBe(enBA.extrasMin);
    expect(enUTC.ingreso).toBe(enBA.ingreso);
  });

  it('agrupar una marca de las 21:30 la deja en el día correcto', () => {
    const jornadas = enHuso('UTC', () =>
      armarJornadas(
        [
          marca('2026-07-06T20:00:00+00:00', 'ingreso'), // 17:00 ART
          marca(iso, 'egreso'), // 21:30 ART, mismo día de negocio
        ],
        DESPUES
      )
    );
    expect(jornadas).toHaveLength(1);
    expect(jornadas[0].fecha).toBe('2026-07-06');
  });
});
