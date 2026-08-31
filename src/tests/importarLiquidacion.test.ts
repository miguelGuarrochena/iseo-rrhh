import {
  armarFilasDeLiquidacion,
  CAMPOS_LIQUIDACION,
  EmpleadoParaImportar,
  errorDeArchivo,
  filasImportables,
  parsearImporte,
  parsearPeriodo,
  resumirImportacion,
} from '@/lib/importarLiquidacion';
import { autoMapear, IGNORAR } from '@/lib/mapeoDeColumnas';

/**
 * Importar la liquidación del estudio contable.
 *
 * Lo que estos casos cuidan, por orden de gravedad:
 *
 *  1. que no se le cargue plata a la persona equivocada;
 *  2. que un archivo con errores no entre a medias;
 *  3. que reimportar un mes avise antes de pisar lo que había.
 *
 * El aislamiento entre empresas y el bloqueo por período cerrado no se
 * prueban acá porque no viven acá: son triggers de la base, y se prueban
 * en `supabase/tests/importar_liquidacion.test.sql`.
 */

const EMPLEADOS: EmpleadoParaImportar[] = [
  {
    id: 'e1',
    nombre: 'Ana',
    apellido: 'Ruiz',
    dni: '30111222',
    cuil: '27-30111222-4',
    numeroLegajo: '101',
  },
  {
    id: 'e2',
    nombre: 'Beto',
    apellido: 'Paz',
    dni: '28.999.111',
    cuil: '20289991117',
    numeroLegajo: '102',
  },
  {
    id: 'e3',
    nombre: 'Caro',
    apellido: 'Diaz',
    dni: '35222333',
    numeroLegajo: '103',
    activo: false,
  },
];

const armar = (
  filas: Record<string, unknown>[],
  extra: Partial<Parameters<typeof armarFilasDeLiquidacion>[0]> = {}
) =>
  armarFilasDeLiquidacion({
    filas,
    mapeo: autoMapear(Object.keys(filas[0] ?? {}), CAMPOS_LIQUIDACION),
    empleados: EMPLEADOS,
    periodoPorDefecto: '2026-07',
    ...extra,
  });

describe('parsearImporte', () => {
  it('lee el formato argentino', () => {
    expect(parsearImporte('1.234,56')).toBeCloseTo(1234.56);
    expect(parsearImporte('$ 1.500.000')).toBe(1500000);
  });

  it('lee el formato inglés que sale de los CSV exportados', () => {
    expect(parsearImporte('1234.56')).toBeCloseTo(1234.56);
    expect(parsearImporte('1,234.56')).toBeCloseTo(1234.56);
  });

  it('un número de Excel llega como número', () => {
    expect(parsearImporte(1234.56)).toBeCloseTo(1234.56);
  });

  it('los paréntesis de las planillas contables son negativos', () => {
    expect(parsearImporte('(1.234)')).toBe(-1234);
  });

  it('vacío no es cero', () => {
    // "no lo informaron" y "es cero" no son lo mismo: uno se ignora, el
    // otro entra en la suma.
    expect(parsearImporte('')).toBeUndefined();
    expect(parsearImporte('   ')).toBeUndefined();
    expect(parsearImporte(null)).toBeUndefined();
    expect(parsearImporte(0)).toBe(0);
  });

  it('lo que no es un importe se marca, no se convierte en cero', () => {
    // Silenciar esto sería importar un sueldo de $0 sin avisar.
    expect(parsearImporte('sin datos')).toBeNaN();
    expect(parsearImporte('12ab')).toBeNaN();
  });
});

describe('parsearPeriodo', () => {
  it('acepta lo que sale de las planillas', () => {
    expect(parsearPeriodo('2026-07')).toBe('2026-07');
    expect(parsearPeriodo('2026-7')).toBe('2026-07');
    expect(parsearPeriodo('07/2026')).toBe('2026-07');
    expect(parsearPeriodo('2026-07-31')).toBe('2026-07');
    expect(parsearPeriodo('31/07/2026')).toBe('2026-07');
  });

  it('una fecha de Excel llega como Date', () => {
    expect(parsearPeriodo(new Date(2026, 6, 15))).toBe('2026-07');
  });

  it('no adivina nombres de mes', () => {
    // "julio" en una celda es tan probable que sea un encabezado mal
    // leído como un dato.
    expect(parsearPeriodo('julio')).toBeUndefined();
    expect(parsearPeriodo('')).toBeUndefined();
  });
});

describe('a quién se le carga', () => {
  it('reconoce por legajo', () => {
    const [f] = armar([{ Legajo: '101', Sueldo: '900000' }]);
    expect(f.empleadoId).toBe('e1');
    expect(f.errores).toEqual([]);
  });

  it('reconoce por DNI aunque venga con puntos', () => {
    const [f] = armar([{ DNI: '28.999.111', Sueldo: '900000' }]);
    expect(f.empleadoId).toBe('e2');
  });

  it('reconoce por CUIL aunque venga con guiones', () => {
    const [f] = armar([{ CUIL: '20-28999111-7', Sueldo: '900000' }]);
    expect(f.empleadoId).toBe('e2');
  });

  it('un legajo que no existe es un error, no una fila vacía', () => {
    const [f] = armar([{ Legajo: '999', Sueldo: '900000' }]);
    expect(f.empleadoId).toBeUndefined();
    expect(f.errores.join(' ')).toMatch(/no hay ningún colaborador/i);
  });

  /**
   * La lista que llega es la de la empresa activa, así que un empleado de
   * otra empresa cae en "no está". No se distingue a propósito: decir
   * "existe pero es de otra empresa" confirmaría el dato de un tercero.
   */
  it('un empleado de otra empresa no se reconoce', () => {
    const [f] = armar([{ DNI: '99888777', Sueldo: '900000' }]);
    expect(f.empleadoId).toBeUndefined();
    expect(f.errores).toHaveLength(1);
  });

  it('sin ningún identificador es un error', () => {
    const [f] = armar([{ Sueldo: '900000' }]);
    expect(f.errores.join(' ')).toMatch(/falta legajo, DNI o CUIL/i);
  });

  it('la misma persona dos veces en el archivo es un error', () => {
    // Sin esto, el upsert dejaría el último y nadie se enteraría de que
    // el archivo traía dos filas distintas para la misma persona.
    const filas = armar([
      { Legajo: '101', Sueldo: '900000' },
      { Legajo: '101', Sueldo: '800000' },
    ]);
    expect(filas[0].errores).toEqual([]);
    expect(filas[1].errores.join(' ')).toMatch(/repetido.*fila 2/i);
  });

  it('alguien dado de baja se avisa pero no se bloquea', () => {
    // Una liquidación final es exactamente eso.
    const [f] = armar([{ Legajo: '103', Sueldo: '900000' }]);
    expect(f.errores).toEqual([]);
    expect(f.advertencias.join(' ')).toMatch(/baja/i);
  });
});

describe('qué mes', () => {
  it('sin columna de período usa el que eligió la persona', () => {
    const [f] = armar([{ Legajo: '101', Sueldo: '900000' }]);
    expect(f.periodo).toBe('2026-07');
  });

  it('la columna del archivo gana sobre el período elegido', () => {
    const [f] = armar([
      { Legajo: '101', Periodo: '2026-05', Sueldo: '900000' },
    ]);
    expect(f.periodo).toBe('2026-05');
  });

  it('un período ilegible es un error', () => {
    const [f] = armar([{ Legajo: '101', Periodo: 'agosto', Sueldo: '900000' }]);
    expect(f.errores.join(' ')).toMatch(/no se entiende el período/i);
  });

  it('un mes que no existe es un error', () => {
    const [f] = armar([
      { Legajo: '101', Periodo: '2026-13', Sueldo: '900000' },
    ]);
    expect(f.errores.join(' ')).toMatch(/no existe/i);
  });
});

describe('cómo se arma el bruto', () => {
  it('sin columna de bruto, se suman los conceptos remunerativos', () => {
    const [f] = armar([
      {
        Legajo: '101',
        Sueldo: '800000',
        Antiguedad: '80000',
        Presentismo: '40000',
        'Horas extras': '30000',
        Adicionales: '50000',
      },
    ]);
    expect(f.montoBruto).toBe(1_000_000);
    expect(f.errores).toEqual([]);
  });

  it('con columna de bruto, manda el número del estudio', () => {
    // Lo que se liquidó es lo que dice el estudio, no nuestra suma.
    const [f] = armar([{ Legajo: '101', Sueldo: '800000', Bruto: '1000000' }]);
    expect(f.montoBruto).toBe(1_000_000);
  });

  it('si el desglose no cuadra con el bruto, avisa sin frenar', () => {
    const [f] = armar([{ Legajo: '101', Sueldo: '800000', Bruto: '1000000' }]);
    expect(f.errores).toEqual([]);
    expect(f.advertencias.join(' ')).toMatch(/desglose suma 800000/i);
  });

  it('una diferencia de redondeo no molesta', () => {
    // Un peso de diferencia por el redondeo del estudio no puede frenar
    // una importación de 120 personas.
    const [f] = armar([{ Legajo: '101', Sueldo: '999999', Bruto: '1000000' }]);
    expect(f.advertencias).toEqual([]);
  });

  it('el desglose se guarda igual, aunque no se sume', () => {
    const [f] = armar([
      {
        Legajo: '101',
        Sueldo: '800000',
        Antiguedad: '80000',
        Bruto: '1000000',
      },
    ]);
    expect(f.detalle).toMatchObject({
      sueldo: 800000,
      antiguedad: 80000,
      montoBruto: 1000000,
    });
  });

  it('no remunerativo y descuentos van a sus propias columnas', () => {
    const [f] = armar([
      {
        Legajo: '101',
        Sueldo: '900000',
        'No remunerativo': '50000',
        Descuentos: '20000',
      },
    ]);
    expect(f.montoBruto).toBe(900_000);
    expect(f.noRemunerativo).toBe(50_000);
    expect(f.otrosDescuentos).toBe(20_000);
  });

  it('un importe ilegible es un error de la fila', () => {
    const [f] = armar([{ Legajo: '101', Sueldo: 'ochocientos mil' }]);
    expect(f.errores.join(' ')).toMatch(/no es un importe/i);
  });

  it('un importe negativo se rechaza', () => {
    const [f] = armar([{ Legajo: '101', Sueldo: '(900000)' }]);
    expect(f.errores.join(' ')).toMatch(/negativo/i);
  });

  it('una fila sin ningún importe es un error', () => {
    const [f] = armar([{ Legajo: '101', Sueldo: '' }]);
    expect(f.errores.join(' ')).toMatch(/ningún importe/i);
  });

  it('una fila que da cero es un error', () => {
    const [f] = armar([{ Legajo: '101', Sueldo: '0' }]);
    expect(f.errores.join(' ')).toMatch(/da cero/i);
  });
});

describe('reimportar el mismo mes', () => {
  it('marca lo que va a pisar', () => {
    const filas = armar([{ Legajo: '101', Sueldo: '900000' }], {
      yaCargadas: new Set(['e1|2026-07']),
    });
    expect(filas[0].pisa).toBe(true);
    // Pisar no es un error: corregir un archivo mal armado es normal.
    expect(filas[0].errores).toEqual([]);
  });

  it('otro período de la misma persona no pisa nada', () => {
    const filas = armar([{ Legajo: '101', Sueldo: '900000' }], {
      yaCargadas: new Set(['e1|2026-06']),
    });
    expect(filas[0].pisa).toBe(false);
  });

  it('una fila con error no cuenta como pisada', () => {
    const filas = armar([{ Legajo: '999', Sueldo: '900000' }], {
      yaCargadas: new Set(['e1|2026-07']),
    });
    expect(resumirImportacion(filas).aSobrescribir).toBe(0);
  });
});

describe('el resumen que se muestra antes de confirmar', () => {
  const filas = armar(
    [
      { Legajo: '101', Sueldo: '900000' },
      { Legajo: '102', Sueldo: '800000' },
      { Legajo: '999', Sueldo: '700000' },
      { Legajo: '103', Sueldo: '600000' },
    ],
    { yaCargadas: new Set(['e1|2026-07']) }
  );

  it('cuenta lo que hay', () => {
    const r = resumirImportacion(filas);
    expect(r.total).toBe(4);
    expect(r.validas).toBe(3);
    expect(r.conErrores).toBe(1);
    expect(r.conAdvertencias).toBe(1); // el dado de baja
    expect(r.aSobrescribir).toBe(1);
    expect(r.periodos).toEqual(['2026-07']);
  });

  it('sólo se importan las filas sin errores', () => {
    expect(filasImportables(filas)).toHaveLength(3);
    expect(filasImportables(filas).every((f) => f.empleadoId)).toBe(true);
  });
});

describe('errorDeArchivo — lo que no se arregla sacando una fila', () => {
  const mapeoDe = (cols: string[]) => autoMapear(cols, CAMPOS_LIQUIDACION);

  it('un archivo vacío', () => {
    expect(errorDeArchivo({ filas: [], mapeo: {} })).toMatch(/no tiene filas/i);
  });

  it('sin ninguna columna que identifique a la persona', () => {
    const filas = armar([{ Sueldo: '900000' }]);
    expect(errorDeArchivo({ filas, mapeo: mapeoDe(['Sueldo']) })).toMatch(
      /identifica a cada colaborador/i
    );
  });

  it('sin ninguna columna de importe', () => {
    const filas = armar([{ Legajo: '101' }]);
    expect(errorDeArchivo({ filas, mapeo: mapeoDe(['Legajo']) })).toMatch(
      /importe remunerativo/i
    );
  });

  it('con identificador e importe, adelante', () => {
    const filas = armar([{ Legajo: '101', Sueldo: '900000' }]);
    expect(
      errorDeArchivo({ filas, mapeo: mapeoDe(['Legajo', 'Sueldo']) })
    ).toBeNull();
  });
});

describe('el mapeo automático de columnas', () => {
  it('reconoce los encabezados típicos, con acentos y mayúsculas', () => {
    const mapeo = autoMapear(
      ['LEGAJO', 'Sueldo Básico', 'Antigüedad', 'Nro. Documento'],
      CAMPOS_LIQUIDACION
    );
    expect(mapeo['LEGAJO']).toBe('legajo');
    expect(mapeo['Sueldo Básico']).toBe('sueldo');
    expect(mapeo['Antigüedad']).toBe('antiguedad');
    expect(mapeo['Nro. Documento']).toBe('dni');
  });

  it('lo que no reconoce queda para que lo mapee la persona', () => {
    const mapeo = autoMapear(['Obra social del mes'], CAMPOS_LIQUIDACION);
    expect(mapeo['Obra social del mes']).toBe(IGNORAR);
  });

  /**
   * Dos columnas que matchean el mismo campo se sumarían dos veces. Es
   * el error que da un bruto del doble sin que nada se vea raro.
   */
  it('un campo se asigna a una sola columna', () => {
    const mapeo = autoMapear(['Sueldo', 'Salario'], CAMPOS_LIQUIDACION);
    expect(mapeo['Sueldo']).toBe('sueldo');
    expect(mapeo['Salario']).toBe(IGNORAR);
  });

  it('el mapeo se puede corregir a mano y se respeta', () => {
    const [f] = armarFilasDeLiquidacion({
      filas: [{ 'Columna rara': '101', Plata: '900000' }],
      mapeo: { 'Columna rara': 'legajo', Plata: 'montoBruto' },
      empleados: EMPLEADOS,
      periodoPorDefecto: '2026-07',
    });
    expect(f.empleadoId).toBe('e1');
    expect(f.montoBruto).toBe(900_000);
  });
});
