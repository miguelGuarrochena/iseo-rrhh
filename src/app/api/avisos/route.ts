import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarEmail } from '@/lib/email/resend';
import { emailDeEmpleado } from '@/lib/api/emailVigente';
import { dentroDelLimite } from '@/lib/api/limiteDeUso';

/**
 * Avisos por mail de los eventos que no pueden esperar a que la persona
 * entre sola a la app: te respondieron, tenés un recibo para firmar, te
 * resolvieron una ausencia.
 *
 * Seguridad: el cuerpo sólo trae QUÉ pasó y SOBRE QUÉ registro. Los
 * destinatarios, el asunto y el texto se arman acá con el cliente admin.
 * Si el body pudiera elegir a quién escribirle, esta ruta sería un
 * formulario de spam con la marca de la plataforma.
 */

const EVENTOS = [
  'comunicacion_respondida',
  'recibo_disponible',
  'ausencia_resuelta',
] as const;
type Evento = (typeof EVENTOS)[number];

const esEvento = (v: unknown): v is Evento =>
  typeof v === 'string' && (EVENTOS as readonly string[]).includes(v);

/**
 * Quién puede disparar cada aviso.
 *
 * Antes acá sólo se validaba que el registro fuera de la misma empresa,
 * no el rol. Con eso, cualquier `empleado` con sesión podía mandarle
 * mails a sus compañeros sobre recibos o ausencias ajenas, y además usar
 * la diferencia entre "enviado" y "no enviado" para averiguar qué ids
 * existen en su empresa.
 *
 * El criterio es quién realiza la acción que se está avisando: los
 * recibos son sólo de RRHH (ver migración 32), y las ausencias y
 * comunicaciones las resuelve cualquier gestor.
 */
const ROLES_POR_EVENTO: Record<Evento, readonly string[]> = {
  comunicacion_respondida: ['admin_rrhh', 'supervisor'],
  recibo_disponible: ['admin_rrhh'],
  ausencia_resuelta: ['admin_rrhh', 'supervisor'],
};

const plantilla = (titulo: string, cuerpo: string, ruta: string) => `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2f2e3a">
    <h1 style="font-size:18px;font-weight:700;margin:0 0 12px">${titulo}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#5f5e6a">${cuerpo}</p>
    <a href="${ruta}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:10px">Abrir en ISEO RH</a>
    <p style="font-size:12px;color:#9a98a6;margin:24px 0 0">Recibís este aviso porque tenés una cuenta en ISEO RH.</p>
  </div>
`;

export const POST = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: auth, error: errorAuth } = await admin.auth.getUser(token);
  if (errorAuth || !auth.user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  }
  const { data: perfil } = await admin
    .from('usuarios')
    .select('rol, empresa_id')
    .eq('id', auth.user.id)
    .single();
  if (!perfil) {
    return NextResponse.json({ error: 'Sin perfil.' }, { status: 403 });
  }

  // Un body que no es JSON válido es un 400, no un 500 sin controlar.
  let cuerpo: { evento?: unknown; id?: unknown };
  try {
    cuerpo = (await req.json()) as { evento?: unknown; id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  if (!esEvento(cuerpo.evento) || typeof cuerpo.id !== 'string') {
    return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
  }

  // El rol se chequea antes de tocar la base: si no corresponde, ni
  // siquiera se confirma que el id exista.
  if (!ROLES_POR_EVENTO[cuerpo.evento].includes(perfil.rol as string)) {
    return NextResponse.json(
      { error: 'No tenés permisos para enviar este aviso.' },
      { status: 403 }
    );
  }

  // Enviar mails cuesta plata y quema reputación de dominio. El límite es
  // por usuario y best-effort (ver limiteDeUso), pero corta el loop.
  if (!dentroDelLimite(`avisos:${auth.user.id}`, 30)) {
    return NextResponse.json(
      { error: 'Demasiados avisos seguidos. Esperá un minuto.' },
      { status: 429 }
    );
  }

  const origen = new URL(req.url).origin;
  let para: string[] = [];
  let asunto = '';
  let texto = '';
  let ruta = '/';

  if (cuerpo.evento === 'comunicacion_respondida') {
    const { data: com } = await admin
      .from('comunicaciones')
      .select('empleado_id, asunto, empresa_id')
      .eq('id', cuerpo.id)
      .single();
    // El registro tiene que ser de la empresa de quien dispara el aviso.
    if (!com || com.empresa_id !== perfil.empresa_id) {
      return NextResponse.json({ ok: false, enviado: false });
    }
    para = await emailDeEmpleado(admin, com.empleado_id as string);
    asunto = `Respondieron: ${com.asunto}`;
    texto = 'Tenés una respuesta nueva en tu comunicación con RRHH.';
    ruta = `${origen}/comunicaciones`;
  }

  if (cuerpo.evento === 'recibo_disponible') {
    const { data: rec } = await admin
      .from('recibos')
      .select('empleado_id, periodo, empresa_id')
      .eq('id', cuerpo.id)
      .single();
    if (!rec || rec.empresa_id !== perfil.empresa_id) {
      return NextResponse.json({ ok: false, enviado: false });
    }
    para = await emailDeEmpleado(admin, rec.empleado_id as string);
    asunto = `Tu recibo de ${rec.periodo} está disponible`;
    texto = 'Ya podés verlo y firmarlo desde la app.';
    ruta = `${origen}/recibos`;
  }

  if (cuerpo.evento === 'ausencia_resuelta') {
    const { data: aus } = await admin
      .from('ausencias')
      .select('empleado_id, estado, tipo, empresa_id')
      .eq('id', cuerpo.id)
      .single();
    if (!aus || aus.empresa_id !== perfil.empresa_id) {
      return NextResponse.json({ ok: false, enviado: false });
    }
    para = await emailDeEmpleado(admin, aus.empleado_id as string);
    asunto = `Tu solicitud de ${aus.tipo} fue ${aus.estado}`;
    texto = `RRHH resolvió tu pedido: quedó ${aus.estado}.`;
    ruta = `${origen}/ausencias`;
  }

  // No avisarse a uno mismo: si el admin también es el destinatario, el
  // mail sobra porque acaba de hacer la acción.
  const propio = auth.user.email?.toLowerCase();
  para = para.filter((e) => e.toLowerCase() !== propio);
  if (para.length === 0) {
    return NextResponse.json({ ok: true, enviado: false });
  }

  const enviado = await enviarEmail({
    para,
    asunto,
    html: plantilla(asunto, texto, ruta),
  });
  return NextResponse.json({ ok: true, enviado });
};
