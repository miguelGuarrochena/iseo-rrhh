import type { ResultadoVerificacion } from '@/lib/constanciaFirma';

/**
 * Copy de la firma de recibos: constancia en el sistema, no sello en el PDF.
 *
 * El badge «Firmado» registra quién y cuándo. El archivo que se abre es
 * el PDF original que subió RRHH. Mezclar las dos cosas es lo que hacía
 * parecer que "falta la firma" al abrir un recibo ya firmado.
 */
export const AVISO_FIRMA_SIN_SELLO =
  'La firma es una constancia digital en el sistema: queda registrado quién y cuándo. El PDF del recibo no incluye un sello visual.';

export const ETIQUETA_FIRMA_PENDIENTE = 'Pendiente de firma';

export const etiquetaFirmaConfirmada = (fecha?: string): string =>
  fecha ? `Constancia digital · ${fecha}` : 'Constancia digital';

/** Sin haber abierto el PDF en esta sesión, no se habilita firmar. */
export const puedeFirmarTrasVer = (visto: boolean): boolean => visto;

/**
 * El recibo se cuenta como visto sólo si el PDF se abrió de verdad.
 * Un fallo de Storage o un archivo inexistente no habilita firmar.
 */
export const vistosTrasAbrir = (
  vistos: Record<string, boolean>,
  reciboId: string,
  abrio: boolean
): Record<string, boolean> => {
  if (!abrio || vistos[reciboId]) return vistos;
  return { ...vistos, [reciboId]: true };
};

export const claseVerificacion = (
  estado: ResultadoVerificacion['estado']
): 'ok' | 'alerta' | 'neutro' => {
  if (estado === 'coincide') return 'ok';
  if (estado === 'no_coincide') return 'alerta';
  return 'neutro';
};
