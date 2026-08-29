/**
 * Contrato de baja de un documento para firma (F-10).
 *
 * La regla es una sola y decide entre borrar y archivar, así que vive
 * acá y no adentro del servicio: es lo que se puede probar sin base, y
 * es lo que hay que mirar si algún día cambia.
 *
 * Autoridad real: `eliminarDocumentoFirma` + la columna `archivado_en`
 * de la migración 95.
 */

/**
 * ¿Hay que archivar en vez de borrar?
 *
 * Sí en cuanto exista una sola firma. Una firma es la constancia de que
 * a esa persona se le notificó algo y lo aceptó; el DELETE cascadeaba
 * sobre los destinatarios y se la llevaba puesta, dejando sólo el rastro
 * de la eliminación en la auditoría.
 *
 * Sin firmas se borra: es el caso que la función vino a resolver —el PDF
 * equivocado recién subido— y no hay nada que conservar.
 */
export const documentoFirmaSeArchiva = (firmados: number): boolean =>
  firmados > 0;

/** Un documento archivado sale de circulación: no se lista ni pide firma. */
export const documentoFirmaVigente = (archivadoEn?: string | null): boolean =>
  !archivadoEn;
