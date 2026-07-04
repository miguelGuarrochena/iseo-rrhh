/**
 * Archivos en Supabase Storage. Convención: todo va bajo
 * <empresaId>/... para que las políticas por tenant apliquen.
 * En la base se guarda el PATH; la URL firmada se genera al leer.
 */
import { supabase } from '@/lib/supabase/cliente';
import { empresaOperativaId } from '@/lib/auth/store';

const UNA_HORA = 60 * 60;

const empresaId = (): string => {
  const id = empresaOperativaId();
  if (!id) throw new Error('Sin empresa activa.');
  return id;
};

const extensionDe = (nombre: string, porDefecto = 'bin'): string => {
  const ext = nombre.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : porDefecto;
};

/** dataURL (previsualización del form) → Blob subible. */
const dataUrlABlob = async (dataUrl: string): Promise<Blob> =>
  (await fetch(dataUrl)).blob();

const subir = async (
  bucket: string,
  path: string,
  archivo: Blob,
  contentType?: string
): Promise<string> => {
  const { error } = await supabase()
    .storage.from(bucket)
    .upload(path, archivo, { upsert: true, contentType });
  if (error) throw new Error(`No pudimos subir el archivo: ${error.message}`);
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
export const subirReciboPdf = async (
  empleadoId: string,
  periodo: string,
  archivo: File
): Promise<string> =>
  subir(
    'recibos-pdf',
    `${empresaId()}/${empleadoId}/${periodo}.pdf`,
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

/** ¿El valor guardado es un path de storage (y no una URL/dataURL)? */
export const esPathDeStorage = (valor?: string | null): valor is string =>
  Boolean(valor && !valor.startsWith('http') && !valor.startsWith('data:'));
