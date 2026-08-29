import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarEmail } from '@/lib/email/resend';
import { formatearPesos } from '@/lib/formato';
import { logError, logInfo } from '@/lib/api/registro';
import { hoyISO } from '@/lib/fechas';

/**
 * Proceso diario de facturación (Vercel Cron).
 *
 * Para cada empresa activa con abono que todavía no pagó el mes:
 *  - Unos días ANTES del vencimiento → manda un mail recordatorio al
 *    contacto de la empresa (paga a mano). Una sola vez por período.
 *  - Al llegar/pasar el vencimiento → crea una notificación interna para
 *    ISEO (superadmin). Una sola vez por período.
 *
 * Vencimiento: día del mes DIA_VENCIMIENTO_FACTURACION (default 10).
 * Aviso previo: DIAS_AVISO_PREVIO días antes (default 3).
 *
 * Seguridad: exige CRON_SECRET y "Authorization: Bearer …".
 * Si falta el secret en el entorno, responde 401 (fail closed).
 */
export const POST = (req: Request) => procesar(req);
export const GET = (req: Request) => procesar(req);

const procesar = async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  // Período y día de negocio, no del servidor.
  //
  // Esto corre en Vercel, donde el proceso tiene TZ=UTC: `getDate()` y
  // `toISOString().slice(0, 7)` devuelven el día y el mes de UTC. Con el
  // cron a las 12:00 UTC (09:00 ART) coinciden con Argentina y por eso
  // nunca se notó, pero es una coincidencia del horario elegido: correrlo
  // a mano de madrugada, o mover el schedule, factura contra el día y el
  // mes equivocados.
  const hoy = hoyISO();
  const periodo = hoy.slice(0, 7);
  const dia = Number(hoy.slice(8, 10));
  const diaVenc = Number(process.env.DIA_VENCIMIENTO_FACTURACION ?? 10);
  const diasPrevio = Number(process.env.DIAS_AVISO_PREVIO ?? 3);

  const [{ data: empresas }, { data: movs }, { data: supers }] =
    await Promise.all([
      admin
        .from('empresas')
        .select(
          'id, nombre, razon_social, cuit, domicilio, plan, abono_mensual, estado, contacto_email, contacto_nombre'
        )
        .eq('estado', 'activa'),
      admin
        .from('movimientos_financieros')
        .select('empresa_id, monto')
        .eq('periodo', periodo)
        .eq('tipo', 'ingreso'),
      admin.from('usuarios').select('id').eq('rol', 'superadmin'),
    ]);

  const cobrado = new Map<string, number>();
  (movs ?? []).forEach((m) => {
    if (!m.empresa_id) return;
    cobrado.set(
      m.empresa_id,
      (cobrado.get(m.empresa_id) ?? 0) + Number(m.monto)
    );
  });

  const impagas = (empresas ?? []).filter((e) => {
    const abono = Number(e.abono_mensual) || 0;
    return abono > 0 && (cobrado.get(e.id) ?? 0) < abono;
  });

  const superadmins = supers ?? [];
  const enVentanaPrevio = dia >= diaVenc - diasPrevio && dia < diaVenc;
  const vencido = dia >= diaVenc;

  let recordatorios = 0;
  let notificados = 0;
  /** Avisos que no se pudieron entregar. Se devuelven para poder alertar. */
  let fallos = 0;

  /**
   * Marca de dedup: intenta insertar; si choca con el unique, ya se hizo.
   *
   * Sólo la violación de unique (23505) significa "ya avisado". Cualquier
   * otro error —una caída de red, un permiso— se trataba igual, así que
   * un fallo transitorio silenciaba el recordatorio de ese período para
   * siempre. Ahora se propaga: mejor reintentar que perderlo.
   */
  const yaHecho = async (empresaId: string, tipo: string): Promise<boolean> => {
    const { error } = await admin
      .from('avisos_facturacion')
      .insert({ empresa_id: empresaId, periodo, tipo });
    if (!error) return false;
    if (error.code === '23505') return true;
    throw new Error(`No se pudo registrar el aviso ${tipo}: ${error.message}`);
  };

  for (const e of impagas) {
    // Una empresa que falla no puede dejar sin avisos a las que siguen:
    // el error se registra, se cuenta y el bucle continúa.
    try {
      const abono = Number(e.abono_mensual) || 0;

      if (enVentanaPrevio && e.contacto_email) {
        if (!(await yaHecho(e.id, 'recordatorio'))) {
          const vence = `${String(diaVenc).padStart(2, '0')}/${periodo.slice(
            5,
            7
          )}/${periodo.slice(0, 4)}`;
          const ok = await enviarEmail({
            para: [e.contacto_email],
            asunto: `Aviso de pago — Abono ${periodo} · ISEO RH`,
            html: emailRecordatorio({
              razonSocial: e.razon_social || e.nombre,
              cuit: e.cuit ?? '',
              domicilio: e.domicilio ?? '',
              plan: e.plan ?? '',
              contacto: e.contacto_nombre ?? '',
              periodo,
              monto: abono,
              vence,
            }),
          });
          if (ok) {
            recordatorios += 1;
          } else {
            // La marca de dedup ya se insertó, así que este recordatorio no
            // se reintenta nunca. Sin registrarlo, la empresa se queda sin
            // el aviso de cobro y no queda rastro de por qué.
            fallos += 1;
            logError(
              'No se pudo enviar el recordatorio de pago',
              new Error('enviarEmail devolvió false'),
              { ruta: '/api/cron/facturacion', empresaId: e.id, periodo }
            );
          }
        }
      }

      if (vencido && superadmins.length > 0) {
        if (!(await yaHecho(e.id, 'vencido'))) {
          // Antes esto sumaba a `notificados` sin mirar el resultado: si el
          // insert fallaba, la respuesta del cron informaba avisos que no
          // existían y nadie se enteraba de nada.
          const { error: errorNotif } = await admin
            .from('notificaciones')
            .insert(
              superadmins.map((s) => ({
                usuario_id: s.id,
                tipo: 'vencimiento',
                titulo: 'Pago pendiente',
                cuerpo: `${e.nombre} no registra el pago del abono de ${periodo}.`,
                link: '/finanzas',
              }))
            );
          if (errorNotif) {
            fallos += 1;
            logError('No se pudo notificar el vencimiento', errorNotif, {
              ruta: '/api/cron/facturacion',
              empresaId: e.id,
              periodo,
            });
          } else {
            notificados += 1;
          }
        }
      }
    } catch (err) {
      fallos += 1;
      logError('No se pudo procesar la facturación de la empresa', err, {
        ruta: '/api/cron/facturacion',
        empresaId: e.id,
        periodo,
      });
    }
  }

  // Una línea por corrida: sin esto, saber si el cron corrió y qué hizo
  // depende de que alguien pase por la consola de Vercel en el momento.
  logInfo('Facturación procesada', {
    ruta: '/api/cron/facturacion',
    periodo,
    impagas: impagas.length,
    recordatorios,
    notificados,
    fallos,
  });

  return NextResponse.json({
    ok: true,
    periodo,
    impagas: impagas.length,
    fallos,
    recordatorios,
    notificados,
  });
};

/** Escapa HTML para no inyectar markup desde datos de empresa en el mail. */
const esc = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Mail formal de aviso de pago (estilo comprobante). */
const emailRecordatorio = (d: {
  razonSocial: string;
  cuit: string;
  domicilio: string;
  plan: string;
  contacto: string;
  periodo: string;
  monto: number;
  vence: string;
}): string => {
  const fila = (k: string, v: string) =>
    v
      ? `<tr><td style="padding:6px 0;color:#6b6a7b;">${esc(k)}</td><td style="padding:6px 0;text-align:right;color:#2f2e3a;font-weight:600;">${esc(v)}</td></tr>`
      : '';
  const periodo = esc(d.periodo);
  const contacto = esc(d.contacto || 'cliente');
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2f2e3a;">
    <div style="background:#2563eb;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
      <div style="font-size:18px;font-weight:800;">ISEO RH</div>
      <div style="font-size:13px;opacity:.9;">Aviso de pago — Abono ${periodo}</div>
    </div>
    <div style="border:1px solid #e4e8f1;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
      <p style="margin:0 0 14px;">Estimado/a ${contacto},</p>
      <p style="margin:0 0 18px;">Le recordamos que se encuentra próximo a vencer el abono del servicio de ISEO RH correspondiente al período <strong>${periodo}</strong>. El pago se realiza de forma manual.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e4e8f1;">
        ${fila('Cliente', d.razonSocial)}
        ${fila('CUIT', d.cuit)}
        ${fila('Domicilio', d.domicilio)}
        ${fila('Plan', d.plan)}
        ${fila('Período', d.periodo)}
        ${fila('Vencimiento', d.vence)}
      </table>
      <div style="margin-top:16px;padding:14px 16px;background:#f1f4fa;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#6b6a7b;font-size:13px;">Total a abonar</span>
        <span style="font-size:20px;font-weight:800;color:#1a45ab;">${esc(formatearPesos(d.monto))}</span>
      </div>
      <p style="margin:18px 0 0;font-size:13px;color:#6b6a7b;">Si ya realizó el pago, por favor ignore este mensaje. Ante cualquier duda, responda a este correo.</p>
      <p style="margin:14px 0 0;">Saludos cordiales,<br/><strong>Equipo ISEO RH</strong></p>
    </div>
  </div>`;
};
