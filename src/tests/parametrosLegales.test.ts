import {
  errorDeVigencia,
  ParametroLegal,
  rigeEn,
  solapamientos,
  valorVigente,
} from '@/lib/parametrosLegales';

/**
 * Lo que estos casos protegen es la **no retroactividad**.
 *
 * Un valor legal con vigencia no es un número: si alguien carga el valor
 * de octubre, lo que se calculó para agosto tiene que seguir dando lo
 * mismo. Eso no se ve en pantalla hasta que ya pasó, así que va fijado
 * acá.
 *
 * El tope imponible de aportes **no** está entre estos parámetros: el
 * cliente decidió que lo carga cada empresa y es obligatorio, así que
 * vive en `empresas.config` y se prueba en `topeDeAportes.test.ts`. Hoy
 * no hay ningún parámetro central en uso; estas funciones quedan para el
 * primero que aparezca.
 */

const CLAVE = 'un_valor_con_vigencia';

const par = (
  valor: number,
  vigenciaDesde: string,
  vigenciaHasta?: string
): ParametroLegal => ({
  id: `p-${vigenciaDesde}`,
  clave: CLAVE,
  valor,
  vigenciaDesde,
  vigenciaHasta,
});

/** Tres tramos consecutivos, el último abierto. */
const historia = [
  par(1_000_000, '2026-03', '2026-05'),
  par(1_200_000, '2026-06', '2026-08'),
  par(1_500_000, '2026-09'),
];

describe('rigeEn', () => {
  it('los dos extremos son inclusivos', () => {
    const p = par(100, '2026-06', '2026-08');
    expect(rigeEn(p, '2026-06')).toBe(true);
    expect(rigeEn(p, '2026-08')).toBe(true);
    expect(rigeEn(p, '2026-05')).toBe(false);
    expect(rigeEn(p, '2026-09')).toBe(false);
  });

  it('sin vigencia hasta, sigue rigiendo para siempre', () => {
    const p = par(100, '2026-09');
    expect(rigeEn(p, '2026-09')).toBe(true);
    expect(rigeEn(p, '2030-12')).toBe(true);
    expect(rigeEn(p, '2026-08')).toBe(false);
  });
});

describe('valorVigente', () => {
  it('devuelve el valor del período que se pide, no el último cargado', () => {
    expect(valorVigente(historia, CLAVE, '2026-04')).toBe(1_000_000);
    expect(valorVigente(historia, CLAVE, '2026-07')).toBe(1_200_000);
    expect(valorVigente(historia, CLAVE, '2026-11')).toBe(1_500_000);
  });

  it('cargar el valor de septiembre no cambia lo que regía en julio', () => {
    // Es la razón de ser del módulo: nada se aplica hacia atrás.
    const soloHastaAgosto = historia.slice(0, 2);
    expect(valorVigente(soloHastaAgosto, CLAVE, '2026-07')).toBe(
      valorVigente(historia, CLAVE, '2026-07')
    );
  });

  it('un período anterior a todo lo cargado no tiene valor', () => {
    expect(valorVigente(historia, CLAVE, '2025-12')).toBeUndefined();
  });

  it('con la lista vacía no inventa nada', () => {
    expect(valorVigente([], CLAVE, '2026-07')).toBeUndefined();
  });

  it('otra clave no devuelve el valor de ésta', () => {
    expect(valorVigente(historia, 'otra_cosa', '2026-07')).toBeUndefined();
  });

  it('si dos rangos se pisan, gana el de vigencia más reciente', () => {
    // Es el criterio de la base (`parametro_legal_vigente`): el último
    // cargado corrige al anterior.
    const conCorreccion = [...historia, par(1_300_000, '2026-07')];
    expect(valorVigente(conCorreccion, CLAVE, '2026-07')).toBe(1_300_000);
    // Y no toca los meses de antes.
    expect(valorVigente(conCorreccion, CLAVE, '2026-06')).toBe(1_200_000);
  });
});

describe('validación de la carga', () => {
  it('rechaza períodos mal formados', () => {
    expect(
      errorDeVigencia({ clave: CLAVE, valor: 1, vigenciaDesde: '2026-13' })
    ).toMatch(/período válido/i);
    expect(
      errorDeVigencia({
        clave: CLAVE,
        valor: 1,
        vigenciaDesde: '2026-06',
        vigenciaHasta: 'x',
      })
    ).toMatch(/período válido/i);
  });

  it('rechaza un rango invertido', () => {
    expect(
      errorDeVigencia({
        clave: CLAVE,
        valor: 1,
        vigenciaDesde: '2026-08',
        vigenciaHasta: '2026-06',
      })
    ).toMatch(/anterior a la vigencia desde/i);
  });

  it('rechaza un valor que no es un importe', () => {
    expect(
      errorDeVigencia({ clave: CLAVE, valor: 0, vigenciaDesde: '2026-06' })
    ).toMatch(/mayor a cero/i);
  });

  it('acepta un rango abierto correcto', () => {
    expect(
      errorDeVigencia({
        clave: CLAVE,
        valor: 1_500_000,
        vigenciaDesde: '2026-09',
      })
    ).toBeNull();
  });
});

describe('solapamientos', () => {
  it('detecta el rango que se pisa', () => {
    const pisa = solapamientos(historia, {
      clave: CLAVE,
      valor: 1,
      vigenciaDesde: '2026-07',
      vigenciaHasta: '2026-07',
    });
    expect(pisa.map((p) => p.vigenciaDesde)).toEqual(['2026-06']);
  });

  it('un rango abierto se pisa con todo lo posterior', () => {
    const pisa = solapamientos(historia, {
      clave: CLAVE,
      valor: 1,
      vigenciaDesde: '2026-01',
    });
    expect(pisa).toHaveLength(3);
  });

  it('un rango libre no se pisa con nada', () => {
    expect(
      solapamientos(historia, {
        clave: CLAVE,
        valor: 1,
        vigenciaDesde: '2025-01',
        vigenciaHasta: '2025-12',
      })
    ).toHaveLength(0);
  });

  it('no se pisa con otra clave', () => {
    expect(
      solapamientos(historia, {
        clave: 'otra_cosa',
        valor: 1,
        vigenciaDesde: '2026-07',
      })
    ).toHaveLength(0);
  });
});
