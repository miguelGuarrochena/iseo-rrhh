import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarEmail } from '@/lib/email/resend';
import { formatearPesos } from '@/lib/formato';

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
 * Seguridad: si CRON_SECRET está seteada, exige "Authorization: Bearer …".
 */
export const POST = (req: Request) => procesar(req);
export const GET = (req: Request) => procesar(req);

const procesar = async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const ahora = new Date();
  const periodo = ahora.toISOString().slice(0, 7);
  const dia = ahora.getDate();
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

  // Marca dedup: intenta insertar; si choca con el unique, ya se hizo.
  const yaHecho = async (empresaId: string, tipo: string): Promise<boolean> => {
    const { error } = await admin
      .from('avisos_facturacion')
      .insert({ empresa_id: empresaId, periodo, tipo });
    return Boolean(error);
  };

  for (const e of impagas) {
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
        if (ok) recordatorios += 1;
      }
    }

    if (vencido && superadmins.length > 0) {
      if (!(await yaHecho(e.id, 'vencido'))) {
        await admin.from('notificaciones').insert(
          superadmins.map((s) => ({
            usuario_id: s.id,
            tipo: 'vencimiento',
            titulo: 'Pago pendiente',
            cuerpo: `${e.nombre} no registra el pago del abono de ${periodo}.`,
            link: '/finanzas',
          }))
        );
        notificados += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    periodo,
    impagas: impagas.length,
    recordatorios,
    notificados,
  });
};

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
      ? `<tr><td style="padding:6px 0;color:#6b6a7b;">${k}</td><td style="padding:6px 0;text-align:right;color:#2f2e3a;font-weight:600;">${v}</td></tr>`
      : '';
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2f2e3a;">
    <div style="background:#2563eb;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
      <div style="font-size:18px;font-weight:800;">ISEO RH</div>
      <div style="font-size:13px;opacity:.9;">Aviso de pago — Abono ${d.periodo}</div>
    </div>
    <div style="border:1px solid #e4e8f1;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
      <p style="margin:0 0 14px;">Estimado/a ${d.contacto || 'cliente'},</p>
      <p style="margin:0 0 18px;">Le recordamos que se encuentra próximo a vencer el abono del servicio de ISEO RH correspondiente al período <strong>${d.periodo}</strong>. El pago se realiza de forma manual.</p>
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
        <span style="font-size:20px;font-weight:800;color:#1a45ab;">${formatearPesos(d.monto)}</span>
      </div>
      <p style="margin:18px 0 0;font-size:13px;color:#6b6a7b;">Si ya realizó el pago, por favor ignore este mensaje. Ante cualquier duda, responda a este correo.</p>
      <p style="margin:14px 0 0;">Saludos cordiales,<br/><strong>Equipo ISEO RH</strong></p>
    </div>
  </div>`;
};
