import { readFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { leerFilasDeArchivo } from '@/lib/planillas';
import {
  armarFilasDeLiquidacion,
  conciliarMapeo,
  EmpleadoParaImportar,
  MapeoDeEmpresa,
  mapeoParaGuardar,
} from '@/lib/importarLiquidacion';

/**
 * El recorrido completo, con dos empresas que reciben planillas
 * distintas — que es el caso real: cada una trabaja con su estudio.
 *
 * A diferencia del resto, acá los archivos son `.xlsx` de verdad: se
 * generan con ExcelJS, se leen con el mismo camino que usa la app y se
 * mapean con el mapeo guardado de cada empresa. Es la prueba de que las
 * piezas encajan, no sólo de que cada una anda por separado.
 */

/** jsdom no implementa `Blob.arrayBuffer()`. */
beforeAll(() => {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result as ArrayBuffer);
        lector.onerror = () => reject(lector.error);
        lector.readAsArrayBuffer(this);
      });
    };
  }
});

const planilla = async (
  nombre: string,
  encabezados: string[],
  filas: (string | number)[][]
): Promise<File> => {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Liquidación');
  hoja.addRow(encabezados);
  filas.forEach((f) => hoja.addRow(f));
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer as ArrayBuffer], nombre, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

const EMPLEADOS_A: EmpleadoParaImportar[] = [
  { id: 'a1', nombre: 'Ana', apellido: 'Ruiz', numeroLegajo: '101' },
];
const EMPLEADOS_B: EmpleadoParaImportar[] = [
  { id: 'b1', nombre: 'Beto', apellido: 'Paz', numeroLegajo: '201' },
];

/** El recorrido de una importación, de archivo a filas listas. */
const recorrido = async (d: {
  archivo: File;
  guardado: MapeoDeEmpresa | null;
  empleados: EmpleadoParaImportar[];
}) => {
  const crudas = await leerFilasDeArchivo(d.archivo);
  const columnas = Object.keys(crudas[0]);
  const conciliado = conciliarMapeo({ columnas, guardado: d.guardado });
  const filas = armarFilasDeLiquidacion({
    filas: crudas,
    mapeo: conciliado.mapeo,
    empleados: d.empleados,
    periodoPorDefecto: '2026-07',
  });
  return {
    conciliado,
    filas,
    aGuardar: mapeoParaGuardar(columnas, conciliado.mapeo),
  };
};

describe('empresa A y empresa B, cada una con su estudio contable', () => {
  it('primera importación de A: se sugiere, se importa y queda el mapeo', async () => {
    const archivo = await planilla(
      'a.xlsx',
      ['Legajo', 'Sueldo', 'Obs.'],
      [['101', 800000, 'ok']]
    );
    const r = await recorrido({
      archivo,
      guardado: null,
      empleados: EMPLEADOS_A,
    });

    expect(r.conciliado.origen).toBe('sugerido');
    expect(r.filas[0].empleadoId).toBe('a1');
    expect(r.filas[0].montoBruto).toBe(800_000);
    expect(r.filas[0].errores).toEqual([]);
    // "Obs." no se reconoce y queda fuera, no adivinada.
    expect(r.aGuardar['Obs.']).toBe('__ignorar__');
    expect(r.aGuardar['Sueldo']).toBe('sueldo');
  });

  it('primera importación de B: otros encabezados, mismo resultado', async () => {
    const archivo = await planilla(
      'b.xlsx',
      ['Nro Legajo', 'Haberes', 'Hs 50%'],
      [['201', 900000, 50000]]
    );
    // "Haberes" no se parece a nada conocido: la persona lo mapea.
    const r = await recorrido({
      archivo,
      guardado: null,
      empleados: EMPLEADOS_B,
    });
    expect(r.conciliado.mapeo['Haberes']).toBe('__ignorar__');

    const corregido = { ...r.conciliado.mapeo, Haberes: 'sueldo' };
    const crudas = await leerFilasDeArchivo(
      await planilla(
        'b.xlsx',
        ['Nro Legajo', 'Haberes', 'Hs 50%'],
        [['201', 900000, 50000]]
      )
    );
    const filas = armarFilasDeLiquidacion({
      filas: crudas,
      mapeo: corregido,
      empleados: EMPLEADOS_B,
      periodoPorDefecto: '2026-07',
    });

    expect(filas[0].empleadoId).toBe('b1');
    expect(filas[0].montoBruto).toBe(950_000);
    expect(filas[0].detalle).toMatchObject({
      sueldo: 900000,
      horasExtras50: 50000,
    });
  });

  it('segunda importación de A: usa el mapeo guardado sin preguntar', async () => {
    const guardado: MapeoDeEmpresa = {
      mapeo: { Legajo: 'legajo', Sueldo: 'sueldo', 'Obs.': '__ignorar__' },
    };
    const archivo = await planilla(
      'a-agosto.xlsx',
      ['Legajo', 'Sueldo', 'Obs.'],
      [['101', 850000, 'ok']]
    );
    const r = await recorrido({ archivo, guardado, empleados: EMPLEADOS_A });

    expect(r.conciliado.origen).toBe('guardado');
    expect(r.conciliado.porConfirmar).toEqual([]);
    expect(r.filas[0].montoBruto).toBe(850_000);
  });

  it('el mapeo de A aplicado al archivo de B avisa que cambió todo', async () => {
    const guardadoDeA: MapeoDeEmpresa = {
      mapeo: { Legajo: 'legajo', Sueldo: 'sueldo', 'Obs.': '__ignorar__' },
    };
    const archivoDeB = await planilla(
      'b.xlsx',
      ['Nro Legajo', 'Haberes', 'Hs 50%'],
      [['201', 900000, 50000]]
    );
    const r = await recorrido({
      archivo: archivoDeB,
      guardado: guardadoDeA,
      empleados: EMPLEADOS_B,
    });
    expect(r.conciliado.origen).toBe('guardado_con_cambios');
    expect(r.conciliado.porConfirmar).toHaveLength(3);
  });

  it('el estudio de A cambia el formato: se avisa y hay que revisar', async () => {
    const guardado: MapeoDeEmpresa = {
      mapeo: { Legajo: 'legajo', Sueldo: 'sueldo', 'Obs.': '__ignorar__' },
    };
    const archivo = await planilla(
      'a-septiembre.xlsx',
      ['Legajo', 'Sueldo', 'Hs 50%'],
      [['101', 800000, 30000]]
    );
    const r = await recorrido({ archivo, guardado, empleados: EMPLEADOS_A });

    expect(r.conciliado.origen).toBe('guardado_con_cambios');
    expect(r.conciliado.columnasNuevas).toEqual(['Hs 50%']);
    expect(r.conciliado.columnasQueFaltan).toEqual(['Obs.']);
    // Se reconoce, pero igual se confirma: es una columna nueva.
    expect(r.conciliado.mapeo['Hs 50%']).toBe('horasExtras50');
    expect(r.conciliado.porConfirmar).toEqual(['Hs 50%']);

    // Confirmada, el bruto suma las extras.
    expect(r.filas[0].montoBruto).toBe(830_000);
    // Y el mapeo que se guarda ya no arrastra "Obs.".
    expect(Object.keys(r.aGuardar).sort()).toEqual(
      ['Hs 50%', 'Legajo', 'Sueldo'].sort()
    );
  });

  it('un archivo de otro formato se rechaza antes de mapear nada', async () => {
    const pdf = new File(['%PDF-1.4'], 'liquidacion.pdf');
    await expect(leerFilasDeArchivo(pdf)).rejects.toThrow(
      /Excel \(\.xlsx\) o CSV \(\.csv\)/
    );
  });

  it('las planillas generadas para la verificación manual se leen igual', async () => {
    // Los mismos dos archivos que se usaron para probar contra la base
    // local, leídos por el camino de la app.
    const dir = process.env.PLANILLAS_DE_PRUEBA;
    if (!dir) return;
    for (const [nombre, columna] of [
      ['empresaA.xlsx', 'Sueldo'],
      ['empresaB.xlsx', 'Haberes'],
    ] as const) {
      const bytes = readFileSync(join(dir, nombre));
      const f = new File([bytes], nombre);
      const filas = await leerFilasDeArchivo(f);
      expect(Object.keys(filas[0])).toContain(columna);
    }
  });
});
