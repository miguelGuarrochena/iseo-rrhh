import ExcelJS from 'exceljs';
import {
  ArchivoNoSoportado,
  FORMATOS_PERMITIDOS_TEXTO,
  leerFilasDeArchivo,
} from '@/lib/planillas';

/**
 * Qué archivos entran y qué archivos no.
 *
 * El pedido del cliente fue explícito: si suben otro formato hay que
 * rechazarlo y decirles cuál corresponde. Antes un .pdf entraba igual al
 * parser de xlsx y moría con "No pudimos leer el archivo" — la persona no
 * se enteraba de que el problema era el formato y volvía a intentar con
 * el mismo archivo.
 */

/** jsdom no implementa `Blob.arrayBuffer()` ni `Blob.text()`. */
beforeAll(() => {
  const leerComo = (
    blob: Blob,
    metodo: 'readAsArrayBuffer' | 'readAsText'
  ): Promise<never> =>
    new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result as never);
      lector.onerror = () => reject(lector.error);
      lector[metodo](blob);
    });

  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      return leerComo(this, 'readAsArrayBuffer');
    };
  }
  if (!Blob.prototype.text) {
    Blob.prototype.text = function () {
      return leerComo(this, 'readAsText');
    };
  }
});

const archivo = (nombre: string, contenido: BlobPart, tipo = ''): File =>
  new File([contenido], nombre, { type: tipo });

/** Un .xlsx de verdad, armado con la misma librería que lee la app. */
const xlsxDePrueba = async (
  filas: Record<string, string | number>[]
): Promise<File> => {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Liquidación');
  hoja.columns = Object.keys(filas[0]).map((k) => ({ header: k, key: k }));
  filas.forEach((f) => hoja.addRow(f));
  const buffer = await wb.xlsx.writeBuffer();
  return archivo(
    'liquidacion.xlsx',
    buffer as ArrayBuffer,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
};

describe('formatos aceptados', () => {
  it('lee un .xlsx', async () => {
    const f = await xlsxDePrueba([
      { Legajo: '101', Sueldo: 900000 },
      { Legajo: '102', Sueldo: 800000 },
    ]);
    const filas = await leerFilasDeArchivo(f);
    expect(filas).toHaveLength(2);
    expect(String(filas[0].Legajo)).toBe('101');
    expect(Number(filas[0].Sueldo)).toBe(900000);
  });

  it('lee un .csv', async () => {
    const csv = 'Legajo,Sueldo\n101,900000\n102,800000\n';
    const filas = await leerFilasDeArchivo(
      archivo('liquidacion.csv', csv, 'text/csv')
    );
    expect(filas).toHaveLength(2);
    expect(filas[1].Legajo).toBe('102');
  });

  it('un CSV con comas dentro de comillas no se parte mal', async () => {
    const csv = 'Legajo,Concepto,Sueldo\n101,"Sueldo, básico","900000"\n';
    const filas = await leerFilasDeArchivo(archivo('l.csv', csv, 'text/csv'));
    expect(filas[0].Concepto).toBe('Sueldo, básico');
  });

  it('la extensión manda sobre el MIME type', async () => {
    // El `type` que manda el navegador depende del sistema operativo y
    // viene vacío bastante seguido, sobre todo desde el celular.
    const filas = await leerFilasDeArchivo(
      archivo('liquidacion.csv', 'a,b\n1,2\n', '')
    );
    expect(filas).toHaveLength(1);
  });
});

describe('formatos rechazados', () => {
  const rechazados = [
    ['liquidacion.pdf', '%PDF-1.4 algo'],
    ['liquidacion.doc', 'contenido'],
    ['liquidacion.txt', 'contenido'],
    ['liquidacion.jpg', 'contenido'],
    ['liquidacion', 'contenido'],
  ] as const;

  it.each(rechazados)('rechaza %s', async (nombre, contenido) => {
    await expect(
      leerFilasDeArchivo(archivo(nombre, contenido))
    ).rejects.toBeInstanceOf(ArchivoNoSoportado);
  });

  it('el mensaje dice qué formatos se pueden subir', async () => {
    await expect(
      leerFilasDeArchivo(archivo('liquidacion.pdf', '%PDF'))
    ).rejects.toThrow(
      new RegExp(FORMATOS_PERMITIDOS_TEXTO.replace(/[().]/g, '\\$&'))
    );
  });

  it('el mensaje nombra la extensión que se intentó subir', async () => {
    await expect(
      leerFilasDeArchivo(archivo('liquidacion.pdf', '%PDF'))
    ).rejects.toThrow(/\.pdf/);
  });

  /**
   * El .xls viejo tiene mensaje propio: no es "formato raro", es un Excel
   * que la persona tiene delante y puede volver a guardar en dos clics.
   */
  it('el .xls viejo explica cómo convertirlo', async () => {
    await expect(
      leerFilasDeArchivo(archivo('liquidacion.xls', 'contenido'))
    ).rejects.toThrow(/guardalo como \.xlsx o \.csv/i);
  });

  it('un .xlsx corrupto falla, pero no como formato no soportado', async () => {
    // Distinguirlos importa: al de formato se le dice "subí otra cosa", y
    // al corrupto "el archivo está dañado". Confundirlos manda a la
    // persona a resolver el problema equivocado.
    const roto = archivo('liquidacion.xlsx', 'esto no es un zip');
    await expect(leerFilasDeArchivo(roto)).rejects.toThrow();
    await expect(leerFilasDeArchivo(roto)).rejects.not.toBeInstanceOf(
      ArchivoNoSoportado
    );
  });
});
