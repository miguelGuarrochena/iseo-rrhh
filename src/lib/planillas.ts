'use client';

/**
 * Lectura/escritura de planillas (.xlsx/.csv) en el navegador.
 *
 * Usa ExcelJS en vez de la librería `xlsx` (SheetJS): esa tiene una
 * vulnerabilidad de prototype pollution y otra de ReDoS sin fix disponible,
 * y acá se usa justo para parsear archivos que sube cualquier usuario
 * (importación de colaboradores), así que conviene evitarla.
 *
 * Nota: a diferencia de SheetJS, ExcelJS no lee el formato binario viejo
 * .xls (pre-2007) — solo .xlsx (Office Open XML) y .csv. Si alguien sube un
 * .xls real, se le pide que lo vuelva a guardar como .xlsx o .csv.
 */
import ExcelJS from 'exceljs';

export type FilaPlanilla = Record<string, unknown>;

/** Normaliza el valor de una celda de ExcelJS (fórmulas, texto enriquecido,
 * hipervínculos, fechas) a algo simple: string, number o Date. */
const valorDeCelda = (valor: ExcelJS.CellValue): unknown => {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object') {
    if ('result' in valor) {
      return valorDeCelda(
        (valor as { result: ExcelJS.CellValue }).result ?? ''
      );
    }
    if ('richText' in valor) {
      return (valor as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join('');
    }
    if ('text' in valor) {
      return String((valor as { text: unknown }).text ?? '');
    }
    return '';
  }
  return valor;
};

const leerXlsx = async (archivo: File): Promise<FilaPlanilla[]> => {
  const buffer = await archivo.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  // ExcelJS tipa esto como Buffer (Node); en el navegador un ArrayBuffer
  // funciona igual de bien en tiempo de ejecución, pero el tipo no calza
  // 1 a 1 con el Buffer de @types/node instalado acá.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const hoja = workbook.worksheets[0];
  if (!hoja) return [];

  const encabezados: string[] = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, i) => {
    encabezados[i - 1] = String(valorDeCelda(celda.value) ?? '').trim();
  });

  const filas: FilaPlanilla[] = [];
  hoja.eachRow((row, numeroFila) => {
    if (numeroFila === 1) return;
    const vacia = row.cellCount === 0;
    if (vacia) return;
    const fila: FilaPlanilla = {};
    let tieneAlgo = false;
    encabezados.forEach((col, i) => {
      if (!col) return;
      const valor = valorDeCelda(row.getCell(i + 1).value);
      fila[col] = valor;
      if (valor !== '' && valor !== undefined && valor !== null)
        tieneAlgo = true;
    });
    if (tieneAlgo) filas.push(fila);
  });
  return filas;
};

/** Parser CSV chico (RFC4180: comillas, comas y saltos de línea en campos). */
const parsearCsv = (texto: string): FilaPlanilla[] => {
  const normalizado = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < normalizado.length; i++) {
    const c = normalizado[i];
    if (enComillas) {
      if (c === '"') {
        if (normalizado[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  const filasConDatos = filas.filter((f) => f.some((v) => v.trim() !== ''));
  if (filasConDatos.length === 0) return [];
  const encabezados = filasConDatos[0].map((h) => h.trim());
  return filasConDatos.slice(1).map((valores) => {
    const obj: FilaPlanilla = {};
    encabezados.forEach((col, i) => {
      if (col) obj[col] = (valores[i] ?? '').trim();
    });
    return obj;
  });
};

/** Error con mensaje pensado para mostrar directo al usuario. */
export class ArchivoNoSoportado extends Error {}

/** Lo único que se puede leer. Se dice tal cual en los mensajes. */
export const EXTENSIONES_PERMITIDAS = ['.xlsx', '.csv'] as const;

/** Para el `accept` del input y para los textos de la pantalla. */
export const ACCEPT_PLANILLA =
  '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

export const FORMATOS_PERMITIDOS_TEXTO = 'Excel (.xlsx) o CSV (.csv)';

/**
 * Lee un .xlsx o .csv y devuelve las filas como objetos {columna: valor},
 * tomando la primera fila como encabezado.
 *
 * La extensión se valida **antes** de tocar el contenido. Antes, un .pdf
 * o un .doc entraban igual al parser de xlsx y morían con "No pudimos
 * leer el archivo": el usuario no se enteraba de que el problema era el
 * formato, y volvía a intentar con el mismo archivo.
 */
export const leerFilasDeArchivo = async (
  archivo: File
): Promise<FilaPlanilla[]> => {
  const nombre = archivo.name.toLowerCase();

  if (nombre.endsWith('.csv')) return parsearCsv(await archivo.text());

  if (nombre.endsWith('.xls') && !nombre.endsWith('.xlsx')) {
    throw new ArchivoNoSoportado(
      'El formato .xls (Excel viejo) no se puede leer. Abrilo en Excel o Google Sheets y guardalo como .xlsx o .csv.'
    );
  }

  if (!nombre.endsWith('.xlsx')) {
    /*
     * Se mira la extensión y no el MIME type: el `type` que manda el
     * navegador depende del sistema operativo y viene vacío bastante
     * seguido, sobre todo desde el celular.
     */
    const extension = nombre.includes('.')
      ? nombre.slice(nombre.lastIndexOf('.'))
      : 'sin extensión';
    throw new ArchivoNoSoportado(
      `Formato no válido (${extension}). Debe subir un archivo ${FORMATOS_PERMITIDOS_TEXTO}.`
    );
  }

  return leerXlsx(archivo);
};

/** Genera un .xlsx (una hoja) a partir de filas de objetos y dispara la
 * descarga en el navegador. */
export const descargarComoXlsx = async (
  filas: FilaPlanilla[],
  nombreHoja: string,
  nombreArchivo: string
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet(nombreHoja);
  if (filas.length > 0) {
    hoja.columns = Object.keys(filas[0]).map((clave) => ({
      header: clave,
      key: clave,
    }));
    filas.forEach((fila) => hoja.addRow(fila));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
