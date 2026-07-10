/**
 * Descarga un CSV listo para Excel: separador ";" (regional AR)
 * y BOM para que las ñ y tildes se vean bien.
 */
export const descargarCSV = (nombre: string, filas: string[][]): void => {
  const csv = filas.map((f) => f.map((c) => `"${c}"`).join(';')).join('\n');
  const url = URL.createObjectURL(
    new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};
