import { PDFDocument, StandardFonts } from '../node_modules/pdf-lib/cjs/index.js';
import { writeFileSync } from 'node:fs';
const hoja = (doc, font, [nombre, cuil, dni], dup) => {
  const p = doc.addPage([595, 842]);
  const L = (t, y, s = 11) => p.drawText(t, { x: 40, y, size: s, font });
  L('RECIBO DE HABERES - Periodo 07/2026', 780, 14);
  L('Empleador: PRUEBA SRL   CUIT 30-71234567-1', 750);
  L(`Apellido y Nombre: ${nombre}`, 720);
  L(dup ? 'DUPLICADO' : `CUIL ${cuil}    DNI ${dni}`, 700);
  L('Sueldo basico                 1.707.317,07', 660);
  L('Total Neto                    1.400.000,00', 640);
};
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const g of [
  ['DOO, SCOOBY',   '20-11111111-2', '11.111.111'],
  ['ESPONJA, BOB',  '20-22222222-3', '22.222.222'],
  ['FLANDERS, NED', '20-33333333-4', '33.333.333'],
]) { hoja(doc, font, g, false); hoja(doc, font, g, true); }
writeFileSync('nomina-completa.pdf', await doc.save());
console.log('listo: 6 paginas, 3 personas');
