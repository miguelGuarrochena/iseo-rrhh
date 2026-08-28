/**
 * La capa de fechas de negocio, y los bordes donde se rompe sola.
 *
 * Casi todo acá se corre bajo varios husos horarios a propósito. La regla
 * de ISEO RH es una sola —Argentina— pero ninguna cuenta puede depender
 * del reloj del dispositivo, y la única forma de probarlo es cambiándolo.
 *
 * Sobre los tres tipos de dato que se mezclan en el módulo:
 *
 *   fecha civil   "1982-05-14"  un día del calendario, sin hora ni zona
 *   fecha límite  "2026-08-31"  un día civil, pero comparado contra hoy
 *   instante      timestamptz   un momento real, que se LEE en una zona
 *
 * Los bugs de esta auditoría salieron casi todos de tratar uno como otro.
 */
import {
  anioEmpresa,
  aniosCumplidos,
  diaEmpresa,
  diaSemanaEmpresa,
  diasEntre,
  diasHabilesEntre,
  diferenciaEnDias,
  domingoDeSemanaEmpresa,
  finDeMesEmpresa,
  formatearFecha,
  formatearFechaDeInstante,
  formatearInstante,
  hoyISO,
  instanteEnZonaEmpresa,
  lunesDeSemanaEmpresa,
  mesEmpresa,
  partesDeFecha,
  proximoAniversario,
  sumarDiasEmpresa,
  sumarMesesEmpresa,
} from '@/lib/fechas';
import { esFinDeSemana, fechaTrasladable } from '@/lib/feriados';
import { calcularVacacionesLegalesCorridas } from '@/lib/vacaciones';
import { analizarSalario } from '@/lib/remuneraciones';
import { Remuneracion } from '@/types/rrhh';

const TZ_ORIGINAL = process.env.TZ;

/**
 * Corre `fn` con el reloj del proceso en otro huso.
 *
 * Node relee `process.env.TZ` en cada operación de `Date`, así que esto
 * simula de verdad un dispositivo en otra zona — no un mock.
 */
const enHuso = <T>(tz: string, fn: () => T): T => {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = TZ_ORIGINAL;
  }
};

/** Los husos que importan: Argentina, UTC, y uno a cada lado. */
const HUSOS = [
  'America/Argentina/Buenos_Aires',
  'UTC',
  'Europe/Madrid',
  'Asia/Tokyo',
  'Pacific/Kiritimati', // UTC+14: el extremo
];

/** Comprueba que una función dé lo mismo en todos los husos. */
const igualEnTodosLosHusos = <T>(fn: () => T, esperado: T) => {
  HUSOS.forEach((tz) => {
    expect([tz, enHuso(tz, fn)]).toEqual([tz, esperado]);
  });
};

// ============================================================
// Fechas civiles: no son instantes
// ============================================================

describe('fecha civil: el día no se mueve nunca', () => {
  it('una fecha de nacimiento se muestra igual en cualquier huso', () => {
    // El caso del enunciado: 1982-05-14 no puede mostrarse 13/05/1982.
    igualEnTodosLosHusos(() => formatearFecha('1982-05-14'), '14 may');
    igualEnTodosLosHusos(() => partesDeFecha('1982-05-14').dia, 14);
  });

  it('partesDeFecha no construye un Date', () => {
    expect(partesDeFecha('2026-02-29')).toEqual({
      anio: 2026,
      mes: 2,
      dia: 29,
    });
  });

  it('el día de la semana de una fecha civil es el mismo en todos lados', () => {
    // 2026-08-28 es viernes.
    igualEnTodosLosHusos(() => diaSemanaEmpresa('2026-08-28'), 5);
    igualEnTodosLosHusos(() => esFinDeSemana('2026-08-29'), true); // sábado
    igualEnTodosLosHusos(() => esFinDeSemana('2026-08-30'), true); // domingo
    igualEnTodosLosHusos(() => esFinDeSemana('2026-08-31'), false); // lunes
  });
});

// ============================================================
// Bordes de calendario
// ============================================================

describe('bordes de calendario', () => {
  it('cambio de mes en los dos sentidos', () => {
    expect(sumarDiasEmpresa('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDiasEmpresa('2026-02-01', -1)).toBe('2026-01-31');
    expect(sumarDiasEmpresa('2026-04-30', 1)).toBe('2026-05-01');
  });

  it('31 de diciembre → 1 de enero', () => {
    expect(sumarDiasEmpresa('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDiasEmpresa('2027-01-01', -1)).toBe('2026-12-31');
    expect(sumarMesesEmpresa('2026-12', 1)).toBe('2027-01');
    expect(sumarMesesEmpresa('2027-01', -1)).toBe('2026-12');
  });

  it('febrero y el año bisiesto', () => {
    expect(finDeMesEmpresa('2026-02')).toBe('2026-02-28');
    expect(finDeMesEmpresa('2028-02')).toBe('2028-02-29');
    expect(sumarDiasEmpresa('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDiasEmpresa('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('sumar meses no se sale del rango de mes', () => {
    expect(sumarMesesEmpresa('2026-08', -12)).toBe('2025-08');
    expect(sumarMesesEmpresa('2026-08', 12)).toBe('2027-08');
    expect(sumarMesesEmpresa('2026-01', -1)).toBe('2025-12');
  });

  it('la serie de los últimos 6 períodos no se corre de mes', () => {
    // Es la cuenta de Finanzas y de la ficha de empresa. Con `Date` +
    // `toISOString()` los seis salían un mes atrás desde un huso al este.
    const serie = () =>
      Array.from({ length: 6 }, (_, i) =>
        sumarMesesEmpresa('2026-01', -(5 - i))
      );
    igualEnTodosLosHusos(serie, [
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });
});

describe('semanas', () => {
  it('el lunes de la semana de un domingo es el lunes anterior', () => {
    // 2026-08-30 es domingo: su semana empieza el lunes 24.
    expect(lunesDeSemanaEmpresa('2026-08-30')).toBe('2026-08-24');
    expect(domingoDeSemanaEmpresa('2026-08-30')).toBe('2026-08-30');
  });

  it('el lunes es su propio lunes', () => {
    expect(lunesDeSemanaEmpresa('2026-08-31')).toBe('2026-08-31');
    expect(domingoDeSemanaEmpresa('2026-08-31')).toBe('2026-09-06');
  });

  it('el sábado todavía pertenece a la semana que arrancó el lunes', () => {
    expect(lunesDeSemanaEmpresa('2026-08-29')).toBe('2026-08-24');
  });

  it('una semana que cruza el cambio de año', () => {
    // 2027-01-01 es viernes; su lunes es el 28 de diciembre de 2026.
    expect(lunesDeSemanaEmpresa('2027-01-01')).toBe('2026-12-28');
  });

  it('el lunes no depende del huso del dispositivo', () => {
    igualEnTodosLosHusos(
      () => lunesDeSemanaEmpresa('2026-08-30'),
      '2026-08-24'
    );
  });
});

describe('diferencias entre fechas', () => {
  it('diasEntre cuenta los dos extremos; diferenciaEnDias mide la distancia', () => {
    expect(diasEntre('2026-08-01', '2026-08-01')).toBe(1);
    expect(diferenciaEnDias('2026-08-01', '2026-08-01')).toBe(0);
    expect(diasEntre('2026-08-01', '2026-08-31')).toBe(31);
    expect(diferenciaEnDias('2026-08-01', '2026-08-31')).toBe(30);
  });

  it('diferenciaEnDias puede ser negativa', () => {
    expect(diferenciaEnDias('2026-08-31', '2026-08-01')).toBe(-30);
  });

  it('cruzando el cambio de año, y en cualquier huso', () => {
    igualEnTodosLosHusos(() => diasEntre('2026-12-30', '2027-01-02'), 4);
  });

  it('los días hábiles no se mueven con el huso', () => {
    // Lunes 24 a viernes 28 de agosto de 2026: cinco hábiles.
    igualEnTodosLosHusos(() => diasHabilesEntre('2026-08-24', '2026-08-28'), 5);
    // Con el fin de semana adentro siguen siendo cinco.
    igualEnTodosLosHusos(() => diasHabilesEntre('2026-08-24', '2026-08-30'), 5);
  });
});

// ============================================================
// "Hoy", "este mes", "este año": el reloj del negocio
// ============================================================

describe('el día de negocio no sale del dispositivo', () => {
  /** 2026-08-31 21:30 ART = 2026-09-01 00:30 UTC. */
  const CASI_MEDIANOCHE = new Date('2026-09-01T00:30:00+00:00');

  it('a las 21:30 del 31 de agosto todavía es 31 de agosto', () => {
    igualEnTodosLosHusos(() => hoyISO(CASI_MEDIANOCHE), '2026-08-31');
    igualEnTodosLosHusos(() => mesEmpresa(CASI_MEDIANOCHE), '2026-08');
    igualEnTodosLosHusos(() => anioEmpresa(CASI_MEDIANOCHE), 2026);
  });

  it('el 31 de diciembre a las 21:30 todavía es el año viejo', () => {
    // 2026-12-31 21:30 ART = 2027-01-01 00:30 UTC. Es el caso del saldo
    // de vacaciones y de los feriados a asegurar.
    const finDeAnio = new Date('2027-01-01T00:30:00+00:00');
    igualEnTodosLosHusos(() => anioEmpresa(finDeAnio), 2026);
    igualEnTodosLosHusos(() => hoyISO(finDeAnio), '2026-12-31');
  });

  it('a las 00:30 ART ya es el día nuevo', () => {
    // 2026-09-01 00:30 ART = 03:30 UTC del mismo día.
    const reciénPasadaLaMedianoche = new Date('2026-09-01T03:30:00+00:00');
    igualEnTodosLosHusos(() => hoyISO(reciénPasadaLaMedianoche), '2026-09-01');
  });

  it('el último día del mes cierra el 31, no el 1º del siguiente', () => {
    igualEnTodosLosHusos(
      () => finDeMesEmpresa(mesEmpresa(CASI_MEDIANOCHE)),
      '2026-08-31'
    );
  });
});

// ============================================================
// Instantes: se leen en la zona del negocio
// ============================================================

describe('instantes mostrados al usuario', () => {
  /** 2026-08-31 21:30 ART. */
  const INSTANTE = '2026-09-01T00:30:00+00:00';

  it('un timestamp se lee siempre en hora de Argentina', () => {
    igualEnTodosLosHusos(() => diaEmpresa(INSTANTE), '2026-08-31');
    igualEnTodosLosHusos(() => formatearFechaDeInstante(INSTANTE), '31 ago');
  });

  it('formatearInstante no depende del reloj de quien mira', () => {
    const texto = enHuso('America/Argentina/Buenos_Aires', () =>
      formatearInstante(INSTANTE)
    );
    expect(texto).toContain('31/08/2026');
    igualEnTodosLosHusos(() => formatearInstante(INSTANTE), texto);
  });

  it('instanteEnZonaEmpresa es la inversa: hora de pared argentina', () => {
    igualEnTodosLosHusos(
      () => instanteEnZonaEmpresa('2026-08-31', '21:30').toISOString(),
      '2026-09-01T00:30:00.000Z'
    );
  });
});

// ============================================================
// Cumpleaños y aniversarios
// ============================================================

describe('próximo cumpleaños', () => {
  it('quien cumple hoy, cumple hoy', () => {
    // El bug que ya se había corregido una vez: comparar contra "ahora"
    // con hora hacía que el cumpleaños de hoy quedara en el pasado y se
    // corriera un año.
    expect(proximoAniversario('1982-05-14', '2026-05-14')).toBe('2026-05-14');
  });

  it('el de mañana es mañana', () => {
    expect(proximoAniversario('1982-05-15', '2026-05-14')).toBe('2026-05-15');
  });

  it('el de ayer es el del año que viene', () => {
    expect(proximoAniversario('1982-05-13', '2026-05-14')).toBe('2027-05-13');
  });

  it('cruza el cambio de año', () => {
    expect(proximoAniversario('1990-01-05', '2026-12-31')).toBe('2027-01-05');
    expect(proximoAniversario('1990-12-31', '2026-12-31')).toBe('2026-12-31');
  });

  it('el 29 de febrero cae el 1 de marzo los años no bisiestos', () => {
    expect(proximoAniversario('1988-02-29', '2026-01-01')).toBe('2026-03-01');
    // Y en el bisiesto, el 29.
    expect(proximoAniversario('1988-02-29', '2028-01-01')).toBe('2028-02-29');
  });

  it('no se mueve con el huso del dispositivo', () => {
    igualEnTodosLosHusos(
      () => proximoAniversario('1982-05-14', '2026-05-14'),
      '2026-05-14'
    );
  });
});

describe('edad y antigüedad', () => {
  it('el día del cumpleaños ya suma el año', () => {
    expect(aniosCumplidos('1982-05-14', '2026-05-14')).toBe(44);
    expect(aniosCumplidos('1982-05-14', '2026-05-13')).toBe(43);
    expect(aniosCumplidos('1982-05-14', '2026-05-15')).toBe(44);
  });

  it('quien ingresó hoy tiene cero de antigüedad', () => {
    expect(aniosCumplidos('2026-08-28', '2026-08-28')).toBe(0);
  });

  it('alrededor del aniversario de ingreso', () => {
    expect(aniosCumplidos('2021-03-01', '2026-02-28')).toBe(4);
    expect(aniosCumplidos('2021-03-01', '2026-03-01')).toBe(5);
  });

  it('nacido un 29 de febrero', () => {
    expect(aniosCumplidos('1988-02-29', '2026-02-28')).toBe(37);
    expect(aniosCumplidos('1988-02-29', '2026-03-01')).toBe(38);
  });
});

// ============================================================
// Consumidores: que la corrección llegue hasta la regla de negocio
// ============================================================

describe('vacaciones legales por antigüedad', () => {
  const legales = (fechaIngreso: string, anio: number) =>
    calcularVacacionesLegalesCorridas({
      fechaIngreso,
      fechaBaja: undefined,
      anio,
    });

  it('el tramo cambia en el aniversario, no un día antes', () => {
    // Entró el 1/1/2021: al 31/12/2025 tiene 4 años cumplidos (tramo
    // hasta5 = 14); al 31/12/2026 tiene 5 (tramo hasta10 = 21).
    expect(legales('2021-01-01', 2025)).toBe(14);
    expect(legales('2021-01-01', 2026)).toBe(21);
  });

  it('quien no llega al requisito del art. 151 va al proporcional', () => {
    /**
     * Del 1/10/2026 al 31/12/2026 hay 65 días hábiles → 3 días.
     *
     * Antes daba 4, porque contaba los 91 días CORRIDOS. El art. 153
     * manda contar el trabajo efectivo "según la forma prevista en el
     * artículo 151", o sea en días hábiles computables.
     */
    expect(legales('2026-10-01', 2026)).toBe(3);
  });

  it('justo seis meses ya entra en el tramo completo', () => {
    // Del 1/7/2026 al 31/12/2026: seis meses cumplidos.
    expect(legales('2026-07-01', 2026)).toBe(14);
  });

  it('quien entra después del cierre no tiene días', () => {
    expect(legales('2027-01-05', 2026)).toBe(0);
  });

  it('el resultado no depende del huso', () => {
    igualEnTodosLosHusos(() => legales('2021-01-01', 2026), 21);
    igualEnTodosLosHusos(() => legales('2026-10-01', 2026), 3);
  });
});

describe('feriados trasladables (Ley 27.399)', () => {
  it('un martes se corre al lunes anterior', () => {
    // 2027-06-15 es martes.
    expect(diaSemanaEmpresa('2027-06-15')).toBe(2);
    expect(fechaTrasladable(2027, '06-15')).toBe('2027-06-14');
  });

  it('un jueves se corre al lunes siguiente', () => {
    // 2026-10-08 es jueves.
    expect(diaSemanaEmpresa('2026-10-08')).toBe(4);
    expect(fechaTrasladable(2026, '10-08')).toBe('2026-10-12');
  });

  it('un lunes se queda donde está', () => {
    expect(fechaTrasladable(2026, '10-12')).toBe('2026-10-12');
  });

  it('el traslado no depende del huso', () => {
    igualEnTodosLosHusos(() => fechaTrasladable(2026, '10-08'), '2026-10-12');
  });
});

describe('semestre del análisis salarial', () => {
  const rem = (periodo: string, bruto: number): Remuneracion =>
    ({
      id: `r-${periodo}`,
      empleadoId: 'e1',
      periodo,
      montoBruto: bruto,
      tipo: 'mensual',
    }) as Remuneracion;

  const rems = [rem('2026-05', 1_000_000), rem('2026-08', 2_000_000)];

  it('el 30 de junio todavía es primer semestre', () => {
    // Con `getMonth()` sobre el reloj del dispositivo, a las 21:00 de
    // Buenos Aires una máquina en otro huso ya estaba en julio y buscaba
    // el mejor bruto en el semestre equivocado.
    igualEnTodosLosHusos(
      () => analizarSalario(rems, '2026-06-30').mejorSemestreBruto,
      1_000_000
    );
  });

  it('el 1 de julio ya es segundo semestre', () => {
    igualEnTodosLosHusos(
      () => analizarSalario(rems, '2026-07-01').mejorSemestreBruto,
      2_000_000
    );
  });
});

// ============================================================
// Las dos ventanas que dispararon esta auditoría
//
// `getAlertas` y los cumpleaños de Agenda viven en el servicio real y
// necesitan Supabase, así que no se pueden llamar desde acá. Lo que sí se
// puede —y es donde estaba el bug— es fijar la REGLA que ahora usan: los
// dos extremos de la ventana medidos con la misma vara, y el día de hoy
// incluido.
// ============================================================

describe('ventana de vencimientos (documentos y contratos)', () => {
  /** 2026-08-31 21:30 ART: la hora en la que se rompía. */
  const CASI_MEDIANOCHE = new Date('2026-09-01T00:30:00+00:00');
  const DIAS_AVISO = 30;

  /** La misma cuenta que hace `getAlertas`. */
  const ventana = (ahora: Date) => {
    const hoy = hoyISO(ahora);
    return { hoy, limite: sumarDiasEmpresa(hoy, DIAS_AVISO) };
  };
  const avisa = (vencimiento: string, ahora = CASI_MEDIANOCHE) => {
    const { hoy, limite } = ventana(ahora);
    return vencimiento >= hoy && vencimiento <= limite;
  };

  it('los dos extremos se miden con la misma vara', () => {
    // El bug: `hoy` salía de `hoyISO()` (negocio) y el límite de
    // `aISOLocal(new Date())` (dispositivo). A las 21:30 de Buenos Aires
    // el límite se corría un día y el borde de la ventana mentía.
    igualEnTodosLosHusos(() => ventana(CASI_MEDIANOCHE), {
      hoy: '2026-08-31',
      limite: '2026-09-30',
    });
  });

  it('un documento que vence hoy se avisa', () => {
    igualEnTodosLosHusos(() => avisa('2026-08-31'), true);
  });

  it('uno que venció ayer ya no', () => {
    igualEnTodosLosHusos(() => avisa('2026-08-30'), false);
  });

  it('uno que vence justo el último día de la ventana entra', () => {
    igualEnTodosLosHusos(() => avisa('2026-09-30'), true);
  });

  it('uno que vence un día después de la ventana queda afuera', () => {
    igualEnTodosLosHusos(() => avisa('2026-10-01'), false);
  });

  it('la ventana cruza bien el cambio de año', () => {
    // 2026-12-31 21:30 ART.
    const finDeAnio = new Date('2027-01-01T00:30:00+00:00');
    igualEnTodosLosHusos(() => ventana(finDeAnio), {
      hoy: '2026-12-31',
      limite: '2027-01-30',
    });
  });
});

describe('cumpleaños en Agenda', () => {
  /** La misma cuenta que hace `getEventosProximos`. */
  const enLosProximos90 = (nacimiento: string, ahora: Date) => {
    const hoy = hoyISO(ahora);
    const proximo = proximoAniversario(nacimiento, hoy);
    return { proximo, entra: diasEntre(hoy, proximo) <= 90 };
  };

  it('el cumpleaños de hoy aparece hoy, no dentro de un año', () => {
    // 2026-05-14 21:30 ART = 2026-05-15 00:30 UTC. Con el reloj del
    // dispositivo, "hoy" ya era el 15 y el cumpleaños del 14 se corría
    // al 2027.
    const casiMedianoche = new Date('2026-05-15T00:30:00+00:00');
    igualEnTodosLosHusos(() => enLosProximos90('1982-05-14', casiMedianoche), {
      proximo: '2026-05-14',
      entra: true,
    });
  });

  it('el de mañana aparece mañana', () => {
    const casiMedianoche = new Date('2026-05-15T00:30:00+00:00');
    igualEnTodosLosHusos(() => enLosProximos90('1982-05-15', casiMedianoche), {
      proximo: '2026-05-15',
      entra: true,
    });
  });

  it('uno de dentro de cuatro meses no entra en la ventana de 90 días', () => {
    const ahora = new Date('2026-05-15T00:30:00+00:00');
    expect(enLosProximos90('1982-09-20', ahora).entra).toBe(false);
  });

  it('el que cae el 1 de enero se ve desde diciembre', () => {
    // 2026-12-31 21:30 ART.
    const finDeAnio = new Date('2027-01-01T00:30:00+00:00');
    igualEnTodosLosHusos(() => enLosProximos90('1990-01-01', finDeAnio), {
      proximo: '2027-01-01',
      entra: true,
    });
  });
});
