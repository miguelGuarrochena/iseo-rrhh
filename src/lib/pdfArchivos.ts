'use client';

/**
 * Lectura y corte de PDFs en el navegador.
 *
 * Todo pasa en la máquina de quien sube: los recibos no viajan a ningún
 * lado para ser analizados. Las dos librerías son pesadas, así que se
 * importan sólo cuando se usan (carga masiva de recibos) y no entran en
 * el bundle del resto de la app.
 */

import {
  CandidatoRecibo,
  MotivoSinDueno,
  PistaTramo,
  TipoDeArchivo,
  TramoRecibo,
  agruparPorDueno,
  clasificarArchivo,
} from '@/lib/recibosPdf';

/** Falla esperable al leer un PDF: se muestra tal cual en pantalla. */
export class PdfIlegible extends Error {}

/**
 * Texto de cada página del PDF, en orden.
 *
 * Devuelve strings vacíos para las páginas que no tienen capa de texto
 * (un PDF escaneado). Quien llama decide qué hacer con eso; acá no se
 * asume que sea un error.
 */
export const textoPorPagina = async (archivo: File): Promise<string[]> => {
  const pdfjs = await import('pdfjs-dist');
  // El worker se sirve desde public/ y lo copia scripts/copiar-worker-pdf.mjs
  // en cada install, para que su versión no se despegue de la librería.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  // Se guarda la tarea de carga, no sólo el documento: `destroy()` vive
  // ahí y es lo que apaga el worker. Sin eso, una carga masiva de 40
  // recibos deja 40 workers abiertos y la pestaña se arrastra.
  const tarea = pdfjs.getDocument({
    data: new Uint8Array(await archivo.arrayBuffer()),
    // Los recibos no traen fuentes exóticas; apagarlo acelera bastante
    // una nómina de 200 páginas.
    disableFontFace: true,
  });

  let doc;
  try {
    doc = await tarea.promise;
  } catch {
    await tarea.destroy();
    throw new PdfIlegible(
      'No pudimos abrir el PDF. Puede estar dañado o protegido con contraseña.'
    );
  }

  try {
    const paginas: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      paginas.push(
        contenido.items
          .map((i) => ('str' in i ? i.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
      pagina.cleanup();
    }
    return paginas;
  } finally {
    await tarea.destroy();
  }
};

export interface AnalisisPdf {
  archivo: File;
  paginas: number;
  tramos: TramoRecibo[];
  clase: TipoDeArchivo;
}

/** Lee el PDF y dice de quién es cada tramo de páginas. */
export const analizarPdf = async (
  archivo: File,
  candidatos: CandidatoRecibo[],
  cuitEmpleador?: string
): Promise<AnalisisPdf> => {
  const textos = await textoPorPagina(archivo);
  const tramos = agruparPorDueno(textos, candidatos, cuitEmpleador);
  return {
    archivo,
    paginas: textos.length,
    tramos,
    clase: clasificarArchivo(tramos),
  };
};

export interface ParteRecibo {
  /** Vacío si no se pudo identificar de quién es el tramo. */
  empleadoId: string;
  archivo: File;
  paginas: number;
  motivo?: MotivoSinDueno;
  /** De quién parece ser, cuando no se pudo atribuir. */
  pista?: PistaTramo;
  /** El documento y el nombre impreso apuntan a personas distintas. */
  discrepancia?: { nombreImpreso: string };
}

/** Nombre de archivo legible: sin espacios, acentos ni caracteres raros. */
const aNombreDeArchivo = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * Corta el PDF en uno por tramo. Cada archivo resultante contiene sólo
 * las páginas de esa persona: es lo que evita que alguien abra el suyo y
 * vea el de toda la empresa.
 *
 * Los tramos que no se pudieron atribuir **también** se recortan, aunque
 * salgan sin dueño. Antes se descartaban y la pantalla ofrecía asignar a
 * mano el archivo original entero: elegir un colaborador ahí le subía la
 * nómina completa, que es justo la filtración que estamos evitando. Con
 * el recorte, asignarlo a mano es seguro.
 */
export const partirPorTramo = async (
  archivo: File,
  tramos: TramoRecibo[],
  nombreDe: (empleadoId: string) => string
): Promise<ParteRecibo[]> => {
  const { PDFDocument } = await import('pdf-lib');
  const original = await PDFDocument.load(await archivo.arrayBuffer());
  const base = archivo.name.replace(/\.pdf$/i, '');

  const salida: ParteRecibo[] = [];
  for (const tramo of tramos) {
    const nuevo = await PDFDocument.create();
    const copiadas = await nuevo.copyPages(original, tramo.paginas);
    copiadas.forEach((p) => nuevo.addPage(p));
    const bytes = await nuevo.save();

    // El nombre tiene que decir de quién es. Si no lo sabemos pero
    // leímos el nombre impreso, se usa ese; recién en última instancia
    // se cae a "pagina-N", que al menos ubica dónde estaba en el original.
    const nombre = tramo.empleadoId
      ? `${nombreDe(tramo.empleadoId)}.pdf`
      : tramo.pista?.nombre
        ? `${aNombreDeArchivo(tramo.pista.nombre)}.pdf`
        : `${base}-pagina-${tramo.paginas[0] + 1}.pdf`;

    salida.push({
      empleadoId: tramo.empleadoId ?? '',
      archivo: new File([new Uint8Array(bytes)], nombre, {
        type: 'application/pdf',
      }),
      paginas: tramo.paginas.length,
      motivo: tramo.motivo,
      pista: tramo.pista,
      discrepancia: tramo.discrepancia,
    });
  }
  return salida;
};
