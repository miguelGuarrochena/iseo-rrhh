'use client';

/**
 * Excel de resumen de fichadas, con el mismo formato de la planilla que
 * el cliente ya usa (y que le pasa al contador).
 *
 * La forma no es un capricho estético: es una matriz de una fila por
 * persona con cinco columnas por día. El CSV plano que había antes
 * —"Empleado / Llegadas tarde / Minutos tarde / Horas extras"— no
 * reemplaza esto, porque no dice a qué hora entró ni salió nadie, que es
 * el dato que se revisa cuando alguien discute un día.
 *
 * Se usa ExcelJS y no la librería `xlsx` por lo mismo que en
 * `planillas.ts`: esa tiene vulnerabilidades sin fix.
 */
import ExcelJS from 'exceljs';
import {
  encabezadoDia,
  horaLocal,
  minutosAHhMm,
  Resumen,
} from '@/lib/fichadas';

/** Columnas que se repiten para cada día del rango. */
const COLUMNAS_DIA = [
  'Ausencia',
  'Entrada',
  'Salida',
  'Total Hs.',
  'DÍAS TRABAJADOS',
];

const CABECERA_FIJA = [
  'LEGAJO',
  'APELLIDO Y NOMBRE',
  'DESTINO',
  'RAZÓN SOCIAL',
];
const CABECERA_FINAL = ['FERIADOS', 'HORAS TOTALES', 'DÍAS TRABAJADOS'];

const AZUL = 'FF1F4E79';
const GRIS = 'FFF2F2F2';

export interface DatosExportacion {
  resumen: Resumen;
  /** Nombre comercial de la empresa, para la columna "Razón social". */
  empresa: string;
  /** Descripción de los filtros aplicados, para la segunda hoja. */
  filtros: string[];
}

/**
 * Genera el .xlsx y dispara la descarga.
 *
 * Devuelve el nombre del archivo para poder mostrarlo en el aviso de
 * "listo", que si no queda un éxito sin nada que mirar.
 */
export const descargarResumenFichadas = async ({
  resumen,
  empresa,
  filtros,
}: DatosExportacion): Promise<string> => {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'ISEO RH';
  libro.created = new Date();

  const hoja = libro.addWorksheet(rotuloHoja(resumen.desde, resumen.hasta), {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 2 }],
  });

  // ---- Fila 1: el nombre del día sobre cada bloque de 5 columnas ----
  const fila1: (string | null)[] = [null, null, null, null];
  resumen.dias.forEach((d) => {
    fila1.push(encabezadoDia(d), null, null, null, null);
  });
  fila1.push(...CABECERA_FINAL);
  hoja.addRow(fila1);

  // ---- Fila 2: las columnas concretas ----
  const fila2 = [...CABECERA_FIJA];
  resumen.dias.forEach(() => fila2.push(...COLUMNAS_DIA));
  fila2.push('', '', '');
  hoja.addRow(fila2);

  // Cada día ocupa 5 columnas: se combinan en la fila del título.
  resumen.dias.forEach((_, i) => {
    const primera = CABECERA_FIJA.length + i * COLUMNAS_DIA.length + 1;
    hoja.mergeCells(1, primera, 1, primera + COLUMNAS_DIA.length - 1);
  });
  // Los totales de la derecha valen para las dos filas de encabezado.
  const primerTotal =
    CABECERA_FIJA.length + resumen.dias.length * COLUMNAS_DIA.length + 1;
  CABECERA_FINAL.forEach((_, i) =>
    hoja.mergeCells(1, primerTotal + i, 2, primerTotal + i)
  );

  // ---- Filas de datos ----
  resumen.filas.forEach((f) => {
    const fila: (string | number)[] = [
      f.empleado.numeroLegajo ?? f.empleado.dni ?? '',
      `${f.empleado.apellido} ${f.empleado.nombre}`,
      f.empleado.sector ?? '',
      empresa,
    ];
    f.dias.forEach((d) => {
      fila.push(
        d.ausencia ?? '',
        d.entrada ? horaLocal(d.entrada) : '',
        d.salida ? horaLocal(d.salida) : '',
        // Texto "H:MM" en vez de decimal: 8:30 se lee solo, 8,5 hay
        // que traducirlo mentalmente. Sale de los minutos exactos, así
        // que una jornada de 8h58 dice 8:58 y no 9:00.
        d.minutos > 0 ? minutosAHhMm(d.minutos) : '',
        d.diaTrabajado
      );
    });
    fila.push(
      f.feriadosTrabajados,
      minutosAHhMm(f.minutosTotales),
      f.diasTrabajados
    );
    hoja.addRow(fila);
  });

  // ---- Formato ----
  [1, 2].forEach((n) => {
    const fila = hoja.getRow(n);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    fila.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    fila.height = 24;
  });

  // Franjas alternadas: con 30 columnas de horas, seguir una fila con la
  // vista es imposible sin ellas.
  hoja.eachRow((fila, n) => {
    if (n <= 2) return;
    if (n % 2 === 1) {
      fila.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: GRIS },
      };
    }
    fila.alignment = { vertical: 'middle', horizontal: 'center' };
    fila.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    fila.font = { size: 10 };
  });

  hoja.getColumn(1).width = 14;
  hoja.getColumn(2).width = 30;
  hoja.getColumn(3).width = 16;
  hoja.getColumn(4).width = 20;
  for (let c = 5; c <= fila2.length; c++) hoja.getColumn(c).width = 11;

  hoja.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 4 } };

  // ---- Hoja de filtros ----
  // El cliente manda estos archivos por mail y después no se acuerda de
  // qué rango pidió. Dejarlo escrito adentro evita esa consulta.
  const hojaFiltros = libro.addWorksheet('Filtros aplicados');
  hojaFiltros.getColumn(1).width = 80;
  // Con el año completo: estos archivos se guardan y se comparan entre
  // meses, y "27 jul a 1 ago" sin año no alcanza para saber cuál es cuál.
  hojaFiltros.addRow([
    `Período: ${aDdMmAaaa(resumen.desde)} a ${aDdMmAaaa(resumen.hasta)}`,
  ]);
  hojaFiltros.addRow([`Empresa: ${empresa}`]);
  hojaFiltros.addRow([`Generado: ${new Date().toLocaleString('es-AR')}`]);
  hojaFiltros.addRow([]);
  if (filtros.length > 0) {
    filtros.forEach((f) => hojaFiltros.addRow([f]));
  } else {
    hojaFiltros.addRow(['No se aplicaron filtros en esta exportación.']);
  }
  hojaFiltros.getRow(1).font = { bold: true };

  const nombre = `Fichajes_${resumen.desde}_a_${resumen.hasta}.xlsx`;
  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
  return nombre;
};

/** "2026-07-27" → "27/07/2026". */
const aDdMmAaaa = (iso: string): string => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

/** Nombre corto de la hoja: Excel no acepta más de 31 caracteres. */
const rotuloHoja = (desde: string, hasta: string): string => {
  const corto = (iso: string) => iso.slice(8, 10) + '-' + iso.slice(5, 7);
  return `${corto(desde)} a ${corto(hasta)}`;
};
