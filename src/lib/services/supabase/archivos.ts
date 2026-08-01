/**
 * Archivos en Supabase Storage. Convención: todo va bajo
 * <empresaId>/... para que las políticas por tenant apliquen.
 * En la base se guarda el PATH; la URL firmada se genera al leer.
 */
import { supabase } from '@/lib/supabase/cliente';
import { empresaOperativaId } from '@/lib/auth/store';
import { registrarErrorApp } from '@/lib/erroresApp';

const UNA_HORA = 60 * 60;
const MB = 1024 * 1024;

/** Tamaño máximo por bucket (evita subidas gigantes que cuelguen al usuario
 * o infracen costo/espacio de storage sin querer). */
const LIMITE_POR_BUCKET: Record<string, number> = {
  logos: 5 * MB,
  fotos: 8 * MB,
  documentos: 20 * MB,
  'recibos-pdf': 20 * MB,
};

const validarTamano = (bucket: string, archivo: Blob) => {
  const limite = LIMITE_POR_BUCKET[bucket] ?? 20 * MB;
  if (archivo.size > limite) {
    throw new Error(
      `El archivo pesa demasiado (máximo ${Math.round(limite / MB)}MB).`
    );
  }
};

const empresaId = (): string => {
  const id = empresaOperativaId();
  if (!id) throw new Error('Sin empresa activa.');
  return id;
};

const extensionDe = (nombre: string, porDefecto = 'bin'): string => {
  const ext = nombre.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : porDefecto;
};

/**
 * dataURL (previsualización del form) → Blob subible.
 *
 * Se decodifica a mano y no con `fetch(dataUrl)`: aunque el dato ya está
 * en memoria, `fetch` cuenta como conexión para la CSP, y `connect-src`
 * no incluye —ni debería incluir— el esquema `data:`. El navegador la
 * bloqueaba y el error que llegaba al usuario era "Failed to fetch",
 * que no dice nada sobre una foto.
 */
const dataUrlABlob = async (dataUrl: string): Promise<Blob> => {
  const coma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || coma === -1) {
    throw new Error('No pudimos leer la imagen. Probá con otro archivo.');
  }

  const cabecera = dataUrl.slice('data:'.length, coma);
  const enBase64 = cabecera.endsWith(';base64');
  const tipo =
    (enBase64 ? cabecera.slice(0, -';base64'.length) : cabecera) ||
    'application/octet-stream';
  const cuerpo = dataUrl.slice(coma + 1);

  if (!enBase64) {
    return new Blob([decodeURIComponent(cuerpo)], { type: tipo });
  }

  const binario = atob(cuerpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return new Blob([bytes], { type: tipo });
};

const subir = async (
  bucket: string,
  path: string,
  archivo: Blob,
  contentType?: string
): Promise<string> => {
  validarTamano(bucket, archivo);
  const { error } = await supabase()
    .storage.from(bucket)
    .upload(path, archivo, { upsert: true, contentType });
  if (error) {
    registrarErrorApp(error.message, `subir archivo a ${bucket}`);
    throw new Error(`No pudimos subir el archivo: ${error.message}`);
  }
  return path;
};

/** Logo de la empresa (bucket público): devuelve la URL directa. */
export const subirLogoEmpresa = async (dataUrl: string): Promise<string> => {
  const blob = await dataUrlABlob(dataUrl);
  const path = `${empresaId()}/logo-${Date.now()}`;
  await subir('logos', path, blob, blob.type);
  return supabase().storage.from('logos').getPublicUrl(path).data.publicUrl;
};

/** Foto del empleado (bucket privado): devuelve el path a guardar. */
export const subirFotoEmpleado = async (dataUrl: string): Promise<string> => {
  const blob = await dataUrlABlob(dataUrl);
  return subir(
    'fotos',
    `${empresaId()}/${crypto.randomUUID()}`,
    blob,
    blob.type
  );
};

/** Documento del legajo: devuelve el path a guardar. */
export const subirDocumentoLegajo = async (
  empleadoId: string,
  archivo: File
): Promise<string> =>
  subir(
    'documentos',
    `${empresaId()}/${empleadoId}/${crypto.randomUUID()}.${extensionDe(archivo.name, 'pdf')}`,
    archivo,
    archivo.type
  );

/** PDF de recibo de sueldo: devuelve el path a guardar. */
/**
 * Cada carga va a su propia ruta. Antes todas las de un período pisaban
 * el mismo archivo, así que al rectificar se perdía el PDF original —el
 * que el colaborador había firmado—. El sufijo con marca de tiempo lo
 * evita sin depender de nada más.
 */
export const subirReciboPdf = async (
  empleadoId: string,
  periodo: string,
  archivo: File,
  tipo = 'mensual'
): Promise<string> =>
  subir(
    'recibos-pdf',
    `${empresaId()}/${empleadoId}/${periodo}-${tipo}-${Date.now()}.pdf`,
    archivo,
    'application/pdf'
  );

/** URL firmada temporal para ver/descargar un archivo privado. */
export const urlFirmada = async (
  bucket: 'fotos' | 'documentos' | 'recibos-pdf',
  path: string
): Promise<string> => {
  const { data, error } = await supabase()
    .storage.from(bucket)
    .createSignedUrl(path, UNA_HORA);
  if (error || !data) throw new Error('No pudimos abrir el archivo.');
  return data.signedUrl;
};

/** URLs firmadas en lote (ej. fotos de un listado). */
export const urlsFirmadas = async (
  bucket: 'fotos',
  paths: string[]
): Promise<Map<string, string>> => {
  if (paths.length === 0) return new Map();
  const { data } = await supabase()
    .storage.from(bucket)
    .createSignedUrls(paths, UNA_HORA);
  const mapa = new Map<string, string>();
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) mapa.set(d.path, d.signedUrl);
  });
  return mapa;
};

/**
 * Borra archivos del bucket al eliminar el registro que los referenciaba.
 *
 * Sin esto, borrar un recibo o un documento sacaba la fila de la base
 * pero dejaba el PDF en el bucket para siempre: nadie lo podía encontrar
 * desde la app —no queda ninguna referencia— pero seguía ocupando el
 * espacio contratado. Con recibos de sueldo es además un problema de
 * datos personales: si se borra, tiene que irse de verdad.
 *
 * No propaga errores a propósito: la fila ya no está, y un archivo
 * huérfano no justifica mostrarle un error a quien acaba de borrar bien.
 */
export const borrarDeStorage = async (
  bucket: 'fotos' | 'documentos' | 'recibos-pdf',
  paths: (string | null | undefined)[]
): Promise<void> => {
  const limpios = Array.from(new Set(paths.filter(esPathDeStorage)));
  if (limpios.length === 0) return;
  try {
    await supabase().storage.from(bucket).remove(limpios);
  } catch {
    // Silencio deliberado (ver comentario de arriba).
  }
};

/** ¿El valor guardado es un path de storage (y no una URL/dataURL)? */
export const esPathDeStorage = (valor?: string | null): valor is string =>
  Boolean(valor && !valor.startsWith('http') && !valor.startsWith('data:'));
