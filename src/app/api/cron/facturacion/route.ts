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
        .select('id, nombre, abono_mensual, estado, contacto_email')
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
        const ok = await enviarEmail({
          para: [e.contacto_email],
          asunto: `Recordatorio de pago — ISEO RH (${periodo})`,
          html: `
            <div style="font-family: sans-serif; color: #2f2e3a;">
              <p>Hola,</p>
              <p>Te recordamos que el abono de <strong>${e.nombre}</strong>
              correspondiente a ${periodo} (${formatearPesos(abono)}) vence el
              día ${diaVenc}. Si ya lo abonaste, ignorá este mensaje.</p>
              <p>Gracias,<br/>Equipo ISEO RH</p>
            </div>`,
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
