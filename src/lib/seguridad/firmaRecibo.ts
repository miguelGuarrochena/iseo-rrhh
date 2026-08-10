/**
 * Contrato documentado de firma de recibos (BUG-005 / BUG-006).
 * Los tests RLS/Storage reales están en
 * `supabase/tests/rls_firma_recibos.test.sql`.
 */

/** Columnas que el empleado NUNCA debe poder mutar por REST. */
export const COLUMNAS_RECIBO_INMUTABLES_EMPLEADO = [
  'archivo_url',
  'empresa_id',
  'empleado_id',
  'periodo',
  'tipo',
  'firmado_empleador_en',
  'archivado_en',
  'rectifica_a',
] as const;

/** Única transición de firma permitida (RPC / trigger). */
export const firmaOneShotPermitida = (args: {
  estadoAntes: 'pendiente' | 'firmado';
  estadoDespues: 'pendiente' | 'firmado';
  firmadoEnAntes: string | null;
  firmadoEnDespues: string | null;
}): boolean =>
  args.estadoAntes === 'pendiente' &&
  args.estadoDespues === 'firmado' &&
  args.firmadoEnAntes === null &&
  args.firmadoEnDespues !== null;

/** Storage: el path debe vivir bajo el empresa_id del recibo. */
export const pathReciboPerteneceAlTenant = (
  path: string,
  empresaId: string
): boolean => path.startsWith(`${empresaId}/`);
