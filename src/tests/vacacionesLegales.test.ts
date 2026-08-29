/**
 * Vacaciones LEGALES en días corridos — LCT arts. 150 a 153.
 *
 * Este archivo cubre exclusivamente el régimen legal. La modalidad
 * propia de ISEO RH basada en días hábiles es otra cosa y se prueba en
 * `vacaciones.test.ts`, sin tocar.
 *
 * Los dos conceptos que este módulo confundía y que conviene tener a la
 * vista al leer los casos:
 *
 *   art. 150 → DURACIÓN de las vacaciones, en días corridos
 *   art. 151 → REQUISITO para tener derecho, medido en días hábiles
 *
 * Que el requisito se cuente en días hábiles no convierte a las
 * vacaciones legales en "vacaciones por días hábiles".
 */
import {
  AUSENCIAS_NO_COMPUTABLES_ART_152,
  calcularVacacionesDiasHabiles,
  calcularVacacionesLegalesCorridas,
  cumpleRequisitoArt151,
  diasHabilesArt151,
  diasProporcionalesArt153,
  diasTrabajadosArt151,
  diasVacacionesCorresponden,
  tramoLegalArt150,
} from '@/lib/vacaciones';
import { sumarDiasEmpresa } from '@/lib/fechas';
import type { Ausencia } from '@/types/rrhh';

const legales = (fechaIngreso: string, anio = 2026, resto = {}) =>
  // `fechaBaja: undefined` explícito: la propiedad es obligatoria a
  // propósito, para que nadie la omita sin darse cuenta (D-01).
  calcularVacacionesLegalesCorridas({
    fechaIngreso,
    fechaBaja: undefined,
    anio,
    ...resto,
  });

const ausencia = (
  tipo: string,
  fechaDesde: string,
  fechaHasta: string,
  estado: Ausencia['estado'] = 'aprobada'
) =>
  ({ tipo, estado, fechaDesde, fechaHasta }) as Pick<
    Ausencia,
    'tipo' | 'estado' | 'fechaDesde' | 'fechaHasta'
  >;

// ============================================================
// Art. 150 — la duración, en días corridos
// ============================================================

describe('art. 150: tramos por antigüedad al 31/12', () => {
  /**
   * Los cortes de la ley son "hasta N años", no "menos de N".
   *
   * Es el error que tenía la implementación anterior: usaba `< 5`, `< 10`
   * y `< 20`, así que quien cumplía la antigüedad exacta el 31/12 caía en
   * el tramo de arriba y se le liquidaba un período más largo del que le
   * corresponde.
   *
   * `aniosCumplidos` no alcanza para distinguir los dos casos —da 5 tanto
   * con cinco años justos como con cinco años y un día— así que el tramo
   * se decide mirando si el aniversario ya quedó atrás al cierre.
   */
  it('5 años exactos al 31/12 → 14 días', () => {
    // Ingreso 31/12/2021: el quinto aniversario cae justo el 31/12/2026.
    expect(tramoLegalArt150('2021-12-31', '2026-12-31')).toBe(14);
    expect(legales('2021-12-31')).toBe(14);
  });

  it('5 años y 1 día → 21 días', () => {
    // Ingreso 30/12/2021: el quinto aniversario fue el 30/12/2026, ayer.
    expect(tramoLegalArt150('2021-12-30', '2026-12-31')).toBe(21);
    expect(legales('2021-12-30')).toBe(21);
  });

  it('10 años exactos → 21 días', () => {
    expect(tramoLegalArt150('2016-12-31', '2026-12-31')).toBe(21);
    expect(legales('2016-12-31')).toBe(21);
  });

  it('10 años y 1 día → 28 días', () => {
    expect(tramoLegalArt150('2016-12-30', '2026-12-31')).toBe(28);
    expect(legales('2016-12-30')).toBe(28);
  });

  it('20 años exactos → 28 días', () => {
    expect(tramoLegalArt150('2006-12-31', '2026-12-31')).toBe(28);
    expect(legales('2006-12-31')).toBe(28);
  });

  it('20 años y 1 día → 35 días', () => {
    expect(tramoLegalArt150('2006-12-30', '2026-12-31')).toBe(35);
    expect(legales('2006-12-30')).toBe(35);
  });

  it('menos de 5 años sigue en el primer tramo', () => {
    expect(legales('2023-02-15')).toBe(14);
  });

  it('el ingreso posterior al año consultado no da nada', () => {
    expect(legales('2027-01-10')).toBe(0);
  });
});

// ============================================================
// Art. 151 — el requisito, en días hábiles
// ============================================================

describe('art. 151: la mitad de los días hábiles del año', () => {
  /**
   * 2026 tiene 261 días hábiles de lunes a viernes. La mitad son 130,5,
   * así que el mínimo para tener derecho al período completo son 131.
   */
  const HABILES_2026 = diasHabilesArt151('2026-01-01', '2026-12-31');

  it('el año 2026 tiene 261 días hábiles', () => {
    expect(HABILES_2026).toBe(261);
  });

  it('los feriados cuentan como hábiles', () => {
    /**
     * El art. 151 mide los días en que el trabajador DEBÍA prestar
     * servicios. En un feriado normalmente debería trabajar y es la ley
     * la que lo libera: no es un día que él no haya prestado servicios.
     *
     * Es la diferencia con `diasHabilesEntre`, que sí descuenta feriados
     * porque responde otra pregunta —cuántos días de vacaciones consume
     * un período— y por eso son dos funciones distintas.
     */
    // Semana del 1 al 5 de junio de 2026 (lunes a viernes), con el 20 de
    // junio feriado fuera del rango: los cinco días cuentan.
    expect(diasHabilesArt151('2026-06-01', '2026-06-05')).toBe(5);
    // Y una semana con un feriado adentro sigue dando cinco.
    expect(diasHabilesArt151('2026-06-15', '2026-06-19')).toBe(5);
  });

  it('cuenta lunes a viernes y nada más (F-18)', () => {
    /**
     * La función no tiene forma de excluir días sueltos, y es a propósito:
     * el `sinPrestacion` que tenía no lo usaba ningún llamador y la
     * función SQL espejo, `dias_habiles_art151`, ni siquiera lo tenía. El
     * primero que lo hubiera usado habría hecho que la pantalla y la base
     * calcularan cupos distintos para el mismo legajo.
     *
     * Las jornadas de seis días son una decisión de negocio pendiente y
     * se resuelve en los dos lados a la vez.
     */
    // Semana con el feriado del 17 de junio adentro: cuenta igual.
    expect(diasHabilesArt151('2026-06-15', '2026-06-19')).toBe(5);
    // Sábado y domingo nunca cuentan.
    expect(diasHabilesArt151('2026-06-20', '2026-06-21')).toBe(0);
  });

  describe('el borde exacto del 50%', () => {
    /**
     * "La mitad, como mínimo": la mitad exacta ALCANZA.
     *
     * Hace falta un año con una cantidad PAR de días hábiles para poder
     * tocar el borde con precisión de un día. 2026 tiene 261, que es
     * impar; 2024 tiene 262 y sirve.
     */
    const ANIO = 2024;
    const delAnio = diasHabilesArt151(`${ANIO}-01-01`, `${ANIO}-12-31`);

    /** El ingreso más tardío que todavía deja `n` hábiles hasta el 31/12. */
    const ingresoConHabiles = (n: number): string => {
      let fecha = `${ANIO}-01-01`;
      for (let i = 0; i < 366; i += 1) {
        const candidato = sumarDiasEmpresa(`${ANIO}-01-01`, i);
        if (diasHabilesArt151(candidato, `${ANIO}-12-31`) === n) {
          fecha = candidato;
        }
      }
      return fecha;
    };

    it('el denominador queda par para poder tocar el borde', () => {
      expect(delAnio).toBe(262);
      expect(delAnio % 2).toBe(0);
    });

    it('la mitad exacta da derecho al período completo', () => {
      const ingreso = ingresoConHabiles(delAnio / 2); // 131
      const datos = {
        fechaIngreso: ingreso,
        fechaBaja: undefined,
        anio: ANIO,
      };
      expect(diasTrabajadosArt151(datos)).toBe(131);
      expect(cumpleRequisitoArt151(datos)).toBe(true);
      expect(calcularVacacionesLegalesCorridas(datos)).toBe(14);
    });

    it('un día hábil menos que la mitad ya no alcanza', () => {
      const ingreso = ingresoConHabiles(delAnio / 2 - 1); // 130
      const datos = {
        fechaIngreso: ingreso,
        fechaBaja: undefined,
        anio: ANIO,
      };
      expect(diasTrabajadosArt151(datos)).toBe(130);
      expect(cumpleRequisitoArt151(datos)).toBe(false);
      // Y cae al proporcional del art. 153: 130 / 20 → 6.
      expect(calcularVacacionesLegalesCorridas(datos)).toBe(6);
    });
  });

  it('quien trabajó todo el año cumple', () => {
    expect(
      cumpleRequisitoArt151({
        fechaIngreso: '2020-01-01',
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(true);
  });

  it('ingresar el 1 de julio alcanza el mínimo; el 15 no', () => {
    // Del 1/7 al 31/12 hay 132 hábiles: 132 × 2 = 264 ≥ 261. Alcanza.
    expect(
      diasTrabajadosArt151({
        fechaIngreso: '2026-07-01',
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(132);
    expect(
      cumpleRequisitoArt151({
        fechaIngreso: '2026-07-01',
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(true);

    // Del 15/7 al 31/12 hay 122: 244 < 261. No alcanza.
    expect(
      cumpleRequisitoArt151({
        fechaIngreso: '2026-07-15',
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(false);
  });

  it('un día menos que el mínimo deja afuera', () => {
    // Se busca el primer día de ingreso que ya NO alcanza.
    const alcanza = (ingreso: string) =>
      cumpleRequisitoArt151({
        fechaIngreso: ingreso,
        fechaBaja: undefined,
        anio: 2026,
      });
    expect(alcanza('2026-07-02')).toBe(true);
    expect(alcanza('2026-07-06')).toBe(false);
  });
});

// ============================================================
// Art. 152 — qué se computa como trabajado
// ============================================================

describe('art. 152: días computados como trabajados', () => {
  /**
   * El artículo manda computar como trabajados los días de licencia legal
   * o convencional, enfermedad inculpable, infortunio de trabajo "y otras
   * causas no imputables al trabajador". Lo que hay que enumerar son las
   * EXCEPCIONES, no lo que cuenta.
   *
   * Repasando los tipos que ISEO RH modela hoy, ninguno le es imputable al
   * trabajador: son todos licencia legal o convencional, o directamente
   * días trabajados. Por eso la lista de excepciones está vacía, y estos
   * casos lo dejan fijado: si alguien agrega un tipo y lo descuenta sin
   * pensarlo, se entera acá.
   */
  const BASE = {
    fechaIngreso: '2020-01-01',
    fechaBaja: undefined,
    anio: 2026,
  };
  const SIN_AUSENCIAS = diasTrabajadosArt151(BASE);

  const conAusencia = (tipo: string, noComputables?: Set<string>) =>
    diasTrabajadosArt151({
      ...BASE,
      // Todo junio: 22 días hábiles.
      ausencias: [ausencia(tipo, '2026-06-01', '2026-06-30')],
      noComputables,
    });

  it.each([
    'enfermedad',
    'estudio',
    'mudanza',
    'fallecimiento',
    'especial',
    'casamiento',
    'donacion_sangre',
    'examenes',
    'vacaciones',
    'home_office',
  ])('la licencia por %s se computa como trabajada', (tipo) => {
    expect(conAusencia(tipo)).toBe(SIN_AUSENCIAS);
  });

  it('hoy no hay ningún tipo de ausencia que no se compute', () => {
    /**
     * La excepción típica sería la licencia sin goce de sueldo, que se
     * otorga a pedido de la persona. ISEO RH no la modela: no está en
     * `TipoAusencia` ni en el enum de la base.
     */
    expect(AUSENCIAS_NO_COMPUTABLES_ART_152.size).toBe(0);
  });

  it('el mecanismo de exclusión funciona si algún día se agrega un tipo', () => {
    // Se inyecta la lista para probar la maquinaria sin inventar un tipo
    // que no existe en el producto.
    expect(conAusencia('enfermedad', new Set(['enfermedad']))).toBe(
      SIN_AUSENCIAS - 22
    );
  });

  it('una ausencia pendiente de aprobación no descuenta nada', () => {
    expect(
      diasTrabajadosArt151({
        ...BASE,
        ausencias: [
          ausencia('enfermedad', '2026-06-01', '2026-06-30', 'pendiente'),
        ],
        noComputables: new Set(['enfermedad']),
      })
    ).toBe(SIN_AUSENCIAS);
  });

  it('una ausencia no computable larga puede tirar abajo el requisito', () => {
    // Ocho meses excluidos: deja de alcanzar la mitad de los hábiles.
    const datos = {
      ...BASE,
      ausencias: [ausencia('especial', '2026-01-01', '2026-08-31')],
      noComputables: new Set(['especial']),
    };
    expect(cumpleRequisitoArt151(datos)).toBe(false);
    // Y entonces cobra el proporcional del art. 153, no el tramo.
    expect(calcularVacacionesLegalesCorridas(datos)).toBe(
      diasProporcionalesArt153(diasTrabajadosArt151(datos))
    );
  });
});

// ============================================================
// Art. 153 — el proporcional
// ============================================================

describe('art. 153: un día cada veinte de trabajo efectivo', () => {
  it.each([
    [19, 0],
    [20, 1],
    [39, 1],
    [40, 2],
    [41, 2],
    [60, 3],
  ])('%i días de trabajo efectivo → %i días', (dias, esperado) => {
    expect(diasProporcionalesArt153(dias)).toBe(esperado);
  });

  it('no usa una regla de tres contra 14/21/28/35', () => {
    /**
     * La razón es fija: 1 a 20, sin importar la antigüedad. Alguien con
     * veinte años y sólo cuarenta días trabajados en el año cobra 2 días,
     * no una fracción de 35.
     */
    const pocos = {
      fechaIngreso: '2026-11-02',
      fechaBaja: undefined,
      anio: 2026,
    };
    const muchos = {
      fechaIngreso: '2000-01-01',
      fechaBaja: undefined,
      anio: 2026,
    };
    const trabajados = diasTrabajadosArt151(pocos);
    expect(cumpleRequisitoArt151(pocos)).toBe(false);
    expect(calcularVacacionesLegalesCorridas(pocos)).toBe(
      Math.floor(trabajados / 20)
    );
    // Y quien sí cumple el requisito cobra el tramo entero, sin prorrateo.
    expect(calcularVacacionesLegalesCorridas(muchos)).toBe(35);
  });

  it('no usa el umbral de medio año por división', () => {
    // 182,625 días desde el 1/7 daba "medio año cumplido" y por lo tanto
    // el período completo. Ahora la pregunta es otra —la mitad de los
    // hábiles— y da lo mismo por casualidad; el 15/7 ya no.
    expect(legales('2026-07-01')).toBe(14);
    expect(legales('2026-07-15')).toBe(6); // 122 hábiles → 6
  });
});

// ============================================================
// Fechas frontera
// ============================================================

describe('fronteras de calendario', () => {
  it('ingreso el 31 de diciembre del año consultado', () => {
    // Un solo día hábil (o ninguno, si cae fin de semana). 31/12/2026 es
    // jueves: un hábil → proporcional 0.
    expect(
      diasTrabajadosArt151({
        fechaIngreso: '2026-12-31',
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(1);
    expect(legales('2026-12-31')).toBe(0);
  });

  it('ingreso el 1 de enero: cumple el requisito y cobra el tramo', () => {
    expect(legales('2026-01-01')).toBe(14);
  });

  it('quien nació de un 29 de febrero cumple antigüedad el 1 de marzo', () => {
    /**
     * Ingreso 29/02/2016. El décimo aniversario en 2026, que no es
     * bisiesto, cae el 1 de marzo (art. 25 del Código Civil), no el 28 de
     * febrero: adelantarlo un día lo correría de tramo.
     */
    expect(tramoLegalArt150('2016-02-29', '2026-02-28')).toBe(21);
    expect(tramoLegalArt150('2016-02-29', '2026-03-01')).toBe(21);
    expect(tramoLegalArt150('2016-02-29', '2026-03-02')).toBe(28);
  });

  it('un año bisiesto tiene sus propios días hábiles', () => {
    // 2028 es bisiesto y arranca en sábado.
    expect(diasHabilesArt151('2028-02-01', '2028-02-29')).toBe(21);
  });

  it('el aniversario exacto un 29 de febrero cae en el tramo de abajo', () => {
    // Ingreso 29/02/2020, cierre 29/02/2028: cinco... no, ocho años.
    // Con cinco: 29/02/2020 → 2025 no es bisiesto → aniversario 01/03/2025.
    expect(tramoLegalArt150('2020-02-29', '2025-03-01')).toBe(14);
    expect(tramoLegalArt150('2020-02-29', '2025-03-02')).toBe(21);
  });
});

// ============================================================
// D-01 — la baja entra en el cálculo, y del mismo modo que en SQL
// ============================================================

describe('empleado con fecha de baja', () => {
  /**
   * El art. 151 mide los días hábiles en los que la persona PRESTÓ
   * servicios. Si dejó de prestarlos a mitad de año, la cuenta se corta
   * ahí — no sigue hasta el 31/12.
   *
   * Esto es D-01: la base aceptaba la baja como parámetro opcional y el
   * despachador no se la pasaba, así que la pantalla y el trigger de saldo
   * calculaban cupos distintos para el mismo legajo. La corrección fue
   * estructural en las dos capas: en SQL las funciones leen el legajo y ya
   * no reciben campos sueltos; acá `fechaBaja` es obligatoria y hay que
   * escribir `undefined` a propósito.
   *
   * Los mismos casos están en `scripts/comparar-vacaciones.sh`, que corre
   * las dos implementaciones sobre el mismo set y compara.
   */
  const conBaja = (fechaBaja: string | undefined) =>
    calcularVacacionesLegalesCorridas({
      fechaIngreso: '2020-01-01',
      fechaBaja,
      anio: 2026,
    });

  it('sin baja conserva el tramo entero de sus seis años', () => {
    expect(conBaja(undefined)).toBe(21);
  });

  it('baja el 31 de marzo: no alcanza el art. 151 y va al proporcional', () => {
    // Del 1/1 al 31/03 hay 64 hábiles: 64 × 2 = 128 < 261. → 64 / 20 = 3.
    expect(
      diasTrabajadosArt151({
        fechaIngreso: '2020-01-01',
        fechaBaja: '2026-03-31',
        anio: 2026,
      })
    ).toBe(64);
    expect(conBaja('2026-03-31')).toBe(3);
  });

  it('baja el 30 de junio: sigue sin alcanzar', () => {
    expect(conBaja('2026-06-30')).toBe(6);
  });

  it('baja el 31 de octubre: ya pasó la mitad y conserva el período', () => {
    expect(conBaja('2026-10-31')).toBe(21);
  });

  it('baja el 31 de diciembre: trabajó el año entero', () => {
    expect(conBaja('2026-12-31')).toBe(21);
  });

  it('baja anterior al año: no prestó servicios, no corresponde nada', () => {
    expect(conBaja('2025-06-30')).toBe(0);
  });

  it('ingreso y baja dentro del mismo año', () => {
    // Del 1/2 al 30/11: 217 hábiles, alcanza de sobra.
    expect(
      calcularVacacionesLegalesCorridas({
        fechaIngreso: '2026-02-01',
        fechaBaja: '2026-11-30',
        anio: 2026,
      })
    ).toBe(14);
  });

  it('la baja también llega a través del despachador', () => {
    // Es el punto exacto donde se perdía en SQL: el despachador tiene que
    // dar lo mismo que el cálculo legal directo.
    const datos = {
      fechaIngreso: '2020-01-01',
      fechaBaja: '2026-03-31' as string | undefined,
      anio: 2026,
    };
    expect(diasVacacionesCorresponden({ ...datos, config: {} })).toBe(
      calcularVacacionesLegalesCorridas(datos)
    );
  });

  it('la modalidad de días hábiles NO mira la baja', () => {
    // Su regla no cambió: seis años de antigüedad, tramo 15, con baja o sin.
    const sinBaja = diasVacacionesCorresponden({
      config: { vacacionesDiasHabiles: true },
      fechaIngreso: '2020-01-01',
      fechaBaja: undefined,
      anio: 2026,
    });
    const conBajaTemprana = diasVacacionesCorresponden({
      config: { vacacionesDiasHabiles: true },
      fechaIngreso: '2020-01-01',
      fechaBaja: '2026-03-31',
      anio: 2026,
    });
    expect(sinBaja).toBe(15);
    expect(conBajaTemprana).toBe(15);
  });
});

// ============================================================
// El dispatcher: cada régimen por su camino
// ============================================================

describe('diasVacacionesCorresponden elige el régimen', () => {
  const ingreso = '2026-10-01';

  it('sin configuración usa el régimen legal en días corridos', () => {
    expect(
      diasVacacionesCorresponden({
        fechaIngreso: ingreso,
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(
      calcularVacacionesLegalesCorridas({
        fechaIngreso: ingreso,
        fechaBaja: undefined,
        anio: 2026,
      })
    );
  });

  it('con días corridos explícito, también el legal', () => {
    expect(
      diasVacacionesCorresponden({
        config: { vacacionesDiasHabiles: false },
        fechaIngreso: ingreso,
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(3);
  });

  it('con días hábiles usa la modalidad propia, intacta', () => {
    // La modalidad de días hábiles conserva su regla: días de calendario
    // sobre 20 cuando no llega al medio año por división. 91 días → 4.
    expect(
      diasVacacionesCorresponden({
        config: { vacacionesDiasHabiles: true },
        fechaIngreso: ingreso,
        fechaBaja: undefined,
        anio: 2026,
      })
    ).toBe(4);
    expect(
      calcularVacacionesDiasHabiles(ingreso, 2026, {
        hasta5: 10,
        hasta10: 15,
        hasta20: 20,
        masDe20: 25,
      })
    ).toBe(4);
  });

  it('las dos modalidades dan números distintos y eso es correcto', () => {
    const legal = diasVacacionesCorresponden({
      config: { vacacionesDiasHabiles: false },
      fechaIngreso: ingreso,
      fechaBaja: undefined,
      anio: 2026,
    });
    const habiles = diasVacacionesCorresponden({
      config: { vacacionesDiasHabiles: true },
      fechaIngreso: ingreso,
      fechaBaja: undefined,
      anio: 2026,
    });
    expect(legal).not.toBe(habiles);
  });
});
