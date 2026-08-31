import {
  armarFilasDeLiquidacion,
  CAMPOS_LIQUIDACION,
  conciliarMapeo,
  EmpleadoParaImportar,
  MapeoDeEmpresa,
  mapeoParaGuardar,
  TEXTO_ORIGEN,
} from '@/lib/importarLiquidacion';
import { IGNORAR, sugerirMapeo } from '@/lib/mapeoDeColumnas';

/**
 * Cada empresa trabaja con su estudio contable, y cada estudio arma la
 * planilla a su manera.
 *
 * Lo que estos casos cuidan:
 *
 *  1. que dos empresas con formatos distintos importen las dos bien;
 *  2. que la segunda importación de una empresa no vuelva a preguntar;
 *  3. que si el estudio cambia las columnas **no** se aplique el mapeo
 *     viejo en silencio. Eso es cómo un "Retenciones" termina sumando al
 *     sueldo: los números están todos, la pantalla se ve normal, y el
 *     error aparece el día que alguien cobra de menos.
 *
 * El aislamiento entre empresas no se prueba acá —es RLS— sino en
 * `supabase/tests/mapeo_importacion.test.sql`.
 */

const EMPLEADOS: EmpleadoParaImportar[] = [
  { id: 'e1', nombre: 'Ana', apellido: 'Ruiz', numeroLegajo: '101' },
  { id: 'e2', nombre: 'Beto', apellido: 'Paz', numeroLegajo: '102' },
];

const importar = (
  filas: Record<string, unknown>[],
  mapeo: Record<string, string>
) =>
  armarFilasDeLiquidacion({
    filas,
    mapeo,
    empleados: EMPLEADOS,
    periodoPorDefecto: '2026-07',
  });

describe('dos empresas, dos estudios, dos formatos', () => {
  // Estudio A: nombres "de manual".
  const archivoA = [
    { Legajo: '101', Sueldo: '800000', Antigüedad: '80000' },
    { Legajo: '102', Sueldo: '700000', Antigüedad: '70000' },
  ];
  // Estudio B: otros nombres para las mismas cosas.
  const archivoB = [
    { 'Nro Legajo': '101', Haberes: '900000', 'Hs. suplementarias': '50000' },
  ];

  it('la empresa A importa con su mapeo', () => {
    const c = conciliarMapeo({
      columnas: Object.keys(archivoA[0]),
      guardado: {
        mapeo: { Legajo: 'legajo', Sueldo: 'sueldo', Antigüedad: 'antiguedad' },
      },
    });
    expect(c.origen).toBe('guardado');
    expect(c.porConfirmar).toEqual([]);

    const filas = importar(archivoA, c.mapeo);
    expect(filas.map((f) => f.empleadoId)).toEqual(['e1', 'e2']);
    expect(filas[0].montoBruto).toBe(880_000);
  });

  it('la empresa B importa con el suyo, que es distinto', () => {
    // Mismo campo `sueldo`, otro encabezado. Es el punto de todo esto.
    const c = conciliarMapeo({
      columnas: Object.keys(archivoB[0]),
      guardado: {
        mapeo: {
          'Nro Legajo': 'legajo',
          Haberes: 'sueldo',
          'Hs. suplementarias': 'horasExtras',
        },
      },
    });
    expect(c.origen).toBe('guardado');

    const filas = importar(archivoB, c.mapeo);
    expect(filas[0].empleadoId).toBe('e1');
    expect(filas[0].montoBruto).toBe(950_000);
    expect(filas[0].detalle).toMatchObject({
      sueldo: 900000,
      horasExtras: 50000,
    });
  });

  it('el mapeo de una no sirve para el archivo de la otra', () => {
    // Aplicar el mapeo de A al archivo de B no reconoce nada: por eso
    // el mapeo se guarda por empresa y no hay un formato único.
    const c = conciliarMapeo({
      columnas: Object.keys(archivoB[0]),
      guardado: { mapeo: { Legajo: 'legajo', Sueldo: 'sueldo' } },
    });
    expect(c.origen).toBe('guardado_con_cambios');
    expect(c.columnasNuevas).toEqual(Object.keys(archivoB[0]));
  });
});

describe('primera importación', () => {
  it('sin mapeo guardado, se sugiere por nombre', () => {
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo básico', 'Antigüedad'],
      guardado: null,
    });
    expect(c.origen).toBe('sugerido');
    expect(c.mapeo).toEqual({
      Legajo: 'legajo',
      'Sueldo básico': 'sueldo',
      Antigüedad: 'antiguedad',
    });
    // Reconocidas exactas: no hace falta confirmarlas.
    expect(c.porConfirmar).toEqual([]);
  });

  it('un mapeo guardado vacío cuenta como que no hay', () => {
    const c = conciliarMapeo({ columnas: ['Legajo'], guardado: { mapeo: {} } });
    expect(c.origen).toBe('sugerido');
  });

  it('lo que se adivinó "de parecido" hay que confirmarlo', () => {
    // "Sueldo básico del mes" no es ningún alias exacto; se parece.
    // Proponerlo está bien; darlo por hecho, no.
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo básico del mes'],
      guardado: null,
    });
    expect(c.mapeo['Sueldo básico del mes']).toBe('sueldo');
    expect(c.porConfirmar).toEqual(['Sueldo básico del mes']);
  });

  it('lo que no se reconoce queda sin importar, no adivinado', () => {
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo', 'Observaciones del liquidador'],
      guardado: null,
    });
    expect(c.mapeo['Observaciones del liquidador']).toBe(IGNORAR);
  });
});

describe('segunda importación', () => {
  const guardado: MapeoDeEmpresa = {
    mapeo: {
      Legajo: 'legajo',
      Sueldo: 'sueldo',
      'Obs.': IGNORAR,
    },
  };

  it('mismo archivo: se aplica y no se pregunta nada', () => {
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo', 'Obs.'],
      guardado,
    });
    expect(c.origen).toBe('guardado');
    expect(c.porConfirmar).toEqual([]);
    expect(c.columnasNuevas).toEqual([]);
    expect(c.columnasQueFaltan).toEqual([]);
  });

  it('el orden de las columnas no cuenta como cambio', () => {
    const c = conciliarMapeo({
      columnas: ['Obs.', 'Sueldo', 'Legajo'],
      guardado,
    });
    expect(c.origen).toBe('guardado');
  });

  it('respeta que una columna se haya descartado a propósito', () => {
    // "Obs." podría parecerse a algo; si la última vez se descartó,
    // se sigue descartando.
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo', 'Obs.'],
      guardado,
    });
    expect(c.mapeo['Obs.']).toBe(IGNORAR);
  });

  it('el mapeo guardado gana sobre lo que sugeriría el nombre', () => {
    // La empresa decidió que "Sueldo" es en realidad el bruto total.
    // La próxima vez tiene que seguir siendo eso.
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo'],
      guardado: { mapeo: { Legajo: 'legajo', Sueldo: 'montoBruto' } },
    });
    expect(c.mapeo['Sueldo']).toBe('montoBruto');
    expect(c.origen).toBe('guardado');
  });
});

describe('el estudio cambió el formato', () => {
  const guardado: MapeoDeEmpresa = {
    mapeo: {
      Sueldo: 'sueldo',
      Extras: 'horasExtras',
      Descuentos: 'otrosDescuentos',
      Legajo: 'legajo',
    },
  };

  const nuevas = ['Legajo', 'Haberes', 'Hs. suplementarias', 'Retenciones'];

  it('se avisa que cambió, no se aplica lo viejo en silencio', () => {
    const c = conciliarMapeo({ columnas: nuevas, guardado });
    expect(c.origen).toBe('guardado_con_cambios');
    expect(TEXTO_ORIGEN[c.origen].titulo).toMatch(/cambios en las columnas/i);
  });

  it('dice qué columnas son nuevas y cuáles dejaron de venir', () => {
    const c = conciliarMapeo({ columnas: nuevas, guardado });
    expect(c.columnasNuevas.sort()).toEqual(
      ['Haberes', 'Hs. suplementarias', 'Retenciones'].sort()
    );
    expect(c.columnasQueFaltan.sort()).toEqual(
      ['Descuentos', 'Extras', 'Sueldo'].sort()
    );
  });

  /**
   * Es la regla que más importa del cambio de formato: aunque el nombre
   * nuevo se reconozca perfecto, alguien tiene que mirarlo. Que el
   * estudio agregue una columna es justamente el momento de mirar.
   */
  it('toda columna nueva pasa por confirmación, aunque se reconozca', () => {
    const c = conciliarMapeo({ columnas: nuevas, guardado });
    expect(c.porConfirmar.sort()).toEqual(c.columnasNuevas.sort());
    expect(c.mapeo['Hs. suplementarias']).toBe('horasExtras');
    expect(c.porConfirmar).toContain('Hs. suplementarias');
  });

  it('lo que sigue calzando conserva su mapeo', () => {
    const c = conciliarMapeo({ columnas: nuevas, guardado });
    expect(c.mapeo['Legajo']).toBe('legajo');
    expect(c.porConfirmar).not.toContain('Legajo');
  });

  it('una columna nueva no roba un campo que el mapeo guardado ya usa', () => {
    // Sumar dos columnas al mismo campo da el doble sin que nada se vea
    // raro en pantalla.
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo', 'Sueldo básico'],
      guardado: { mapeo: { Legajo: 'legajo', Sueldo: 'sueldo' } },
    });
    expect(c.mapeo['Sueldo']).toBe('sueldo');
    expect(c.mapeo['Sueldo básico']).toBe(IGNORAR);
  });

  it('sacar una columna también es un cambio', () => {
    const c = conciliarMapeo({ columnas: ['Legajo', 'Sueldo'], guardado });
    expect(c.origen).toBe('guardado_con_cambios');
    expect(c.columnasNuevas).toEqual([]);
    expect(c.columnasQueFaltan.sort()).toEqual(['Descuentos', 'Extras']);
  });
});

describe('qué se guarda para la próxima', () => {
  it('todas las columnas del archivo, incluidas las descartadas', () => {
    // Saber que "Obs." ya se vio y se descartó a propósito es lo que
    // permite detectar después que el formato cambió.
    const guardar = mapeoParaGuardar(['Legajo', 'Sueldo', 'Obs.'], {
      Legajo: 'legajo',
      Sueldo: 'sueldo',
      'Obs.': IGNORAR,
    });
    expect(guardar).toEqual({
      Legajo: 'legajo',
      Sueldo: 'sueldo',
      'Obs.': IGNORAR,
    });
  });

  it('no arrastra columnas que este archivo ya no trae', () => {
    // Si no, el próximo archivo parecería "con cambios" para siempre.
    const guardar = mapeoParaGuardar(['Legajo'], {
      Legajo: 'legajo',
      Vieja: 'sueldo',
    });
    expect(Object.keys(guardar)).toEqual(['Legajo']);
  });

  it('una columna sin decisión queda como no importar', () => {
    expect(mapeoParaGuardar(['Rara'], {})).toEqual({ Rara: IGNORAR });
  });
});

describe('sugerirMapeo — con cuánta certeza adivina', () => {
  it('un alias exacto es exacto', () => {
    const s = sugerirMapeo(['Legajo', 'Sueldo'], CAMPOS_LIQUIDACION);
    expect(s['Legajo']).toEqual({ campo: 'legajo', certeza: 'exacta' });
    expect(s['Sueldo'].certeza).toBe('exacta');
  });

  it('un nombre parecido es aproximado', () => {
    const s = sugerirMapeo(['Sueldo básico del mes'], CAMPOS_LIQUIDACION);
    expect(s['Sueldo básico del mes']).toEqual({
      campo: 'sueldo',
      certeza: 'aproximada',
    });
  });

  it('lo que no se parece a nada no se inventa', () => {
    const s = sugerirMapeo(['Observaciones'], CAMPOS_LIQUIDACION);
    expect(s['Observaciones']).toEqual({ campo: IGNORAR, certeza: 'ninguna' });
  });

  it('la exacta le gana a la aproximada, aunque venga después', () => {
    const s = sugerirMapeo(
      ['Sueldo del mes pasado', 'Sueldo'],
      CAMPOS_LIQUIDACION
    );
    expect(s['Sueldo'].campo).toBe('sueldo');
    expect(s['Sueldo del mes pasado'].campo).not.toBe('sueldo');
  });

  /**
   * "Hs 50" y "Hs 100" comparten el "hs" y difieren en un número. Si el
   * parecido contara los números o las palabras de una letra, se
   * mezclarían — y son dos importes distintos.
   */
  it('las extras al 50 y al 100 no se confunden entre sí', () => {
    const s = sugerirMapeo(['Hs 50%', 'Hs 100%'], CAMPOS_LIQUIDACION);
    expect(s['Hs 50%'].campo).toBe('horasExtras50');
    expect(s['Hs 100%'].campo).toBe('horasExtras100');
  });

  it('las dos suman al bruto, y el desglose las guarda por separado', () => {
    const c = conciliarMapeo({
      columnas: ['Legajo', 'Sueldo', 'Hs 50%', 'Hs 100%'],
      guardado: null,
    });
    const [f] = importar(
      [
        {
          Legajo: '101',
          Sueldo: '800000',
          'Hs 50%': '30000',
          'Hs 100%': '20000',
        },
      ],
      c.mapeo
    );
    expect(f.montoBruto).toBe(850_000);
    expect(f.detalle).toMatchObject({
      horasExtras50: 30000,
      horasExtras100: 20000,
    });
  });
});
