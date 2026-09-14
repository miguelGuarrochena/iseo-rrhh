/**
 * Resumen semanal a RRHH: qué se manda, a quién y cuándo se omite.
 *
 * El cron de Vercel (`/api/cron/resumen-semanal`) arma el mail. Esta
 * pieza es la regla, sin I/O: así se puede probar sin Resend ni la base.
 */

export interface PendientesResumenSemanal {
  ausencias: number;
  recibosSinFirmar: number;
  comunicacionesAbiertas: number;
  jornadasSinCerrar: number;
  vencimientos: { titulo: string; fecha: string }[];
}

export const hayPendientesResumen = (p: PendientesResumenSemanal): boolean =>
  p.ausencias > 0 ||
  p.recibosSinFirmar > 0 ||
  p.comunicacionesAbiertas > 0 ||
  p.jornadasSinCerrar > 0 ||
  p.vencimientos.length > 0;

export const cronAutorizado = (
  secret: string | undefined,
  authorization: string | null
): boolean => Boolean(secret) && authorization === `Bearer ${secret}`;

export const resumenPlataformaActivo = (
  config: { resumenSemanalEmail?: boolean } | null | undefined
): boolean => config?.resumenSemanalEmail !== false;

export const resumenEmpresaActivo = (
  config: { resumenSemanal?: boolean } | null | undefined
): boolean => config?.resumenSemanal !== false;

export const moduloEncendido = (
  modulos: Record<string, boolean> | undefined,
  clave: string
): boolean => (modulos ?? {})[clave] !== false;

const fila = (n: number, singular: string, plural: string): string =>
  n === 0
    ? ''
    : `<li style="margin-bottom:6px"><strong>${n}</strong> ${n === 1 ? singular : plural}</li>`;

const escapeHtml = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const armarEmailResumen = (
  empresa: string,
  p: PendientesResumenSemanal
): string => {
  const nombre = escapeHtml(empresa);
  return `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2f2e3a">
    <h1 style="font-size:18px;font-weight:700;margin:0 0 4px">Tu semana en ${nombre}</h1>
    <p style="font-size:14px;color:#5f5e6a;margin:0 0 18px">Esto quedó pendiente:</p>
    <ul style="font-size:15px;line-height:1.6;padding-left:20px;margin:0 0 18px">
      ${fila(p.ausencias, 'ausencia sin resolver', 'ausencias sin resolver')}
      ${fila(p.recibosSinFirmar, 'recibo sin firmar por el colaborador', 'recibos sin firmar por los colaboradores')}
      ${fila(p.comunicacionesAbiertas, 'consulta sin responder', 'consultas sin responder')}
      ${fila(p.jornadasSinCerrar, 'jornada sin cerrar (falta una marca)', 'jornadas sin cerrar (falta una marca)')}
    </ul>
    ${
      p.vencimientos.length > 0
        ? `<p style="font-size:14px;font-weight:600;margin:0 0 6px">Vence pronto</p>
           <ul style="font-size:14px;line-height:1.6;padding-left:20px;margin:0 0 18px;color:#5f5e6a">
             ${p.vencimientos
               .map(
                 (v) =>
                   `<li>${escapeHtml(v.titulo)} — ${escapeHtml(v.fecha)}</li>`
               )
               .join('')}
           </ul>`
        : ''
    }
    <p style="font-size:12px;color:#9a98a6;margin:22px 0 0">
      Recibís este resumen porque administrás RRHH en ${nombre}. Se puede
      desactivar desde ISEO RH.
    </p>
  </div>
`;
};

export type AccionResumen =
  | 'omitida_sin_pendientes'
  | 'omitida_sin_admins'
  | 'omitida_desactivada'
  | 'omitida_error'
  | 'ya_enviado'
  | 'enviado'
  | 'fallo_envio';

/**
 * Reserva la marca de "ya mandado esta semana" ANTES del envío para no
 * duplicar mails si el cron corre dos veces. Si el envío falla, hay que
 * liberar esa marca: si no, se pierde el resumen hasta el lunes siguiente.
 */
export const decidirTrasEnvio = (ok: boolean): AccionResumen =>
  ok ? 'enviado' : 'fallo_envio';
