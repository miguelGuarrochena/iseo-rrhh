import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarEmail } from '@/lib/email/resend';
import { emailsDeAdmins } from '@/lib/api/emailVigente';
import { desdeIncidencias } from '@/lib/fichadas';
import {
  formatearFechaCivil,
  hoyISO,
  lunesDeSemanaEmpresa,
  sumarDiasEmpresa,
} from '@/lib/fechas';

/**
 * Resumen semanal a quien administra RRHH en cada empresa.
 *
 * La idea es no tener que entrar a la app a ver si hay algo: los lunes
 * llega un mail con lo que quedó pendiente. Si no hay nada pendiente, no
 * se manda nada — un mail que dice "no tenés nada" entrena a la gente a
 * ignorar los mails.
 *
 * Dos interruptores, los dos arrancan prendidos:
 *   1. `empresas.config.resumenSemanal` — por empresa. Lo cambia RRHH
 *      desde su Configuración o ISEO desde la ficha de la empresa.
 *   2. `config_plataforma.resumenSemanalEmail` — corte general de ISEO.
 *
 * Seguridad: exige CRON_SECRET y "Authorization: Bearer …". Si falta el
 * secret en el entorno responde 401, igual que el cron de facturación.
 */
export const POST = (req: Request) => procesar(req);
export const GET = (req: Request) => procesar(req);

interface Pendientes {
  ausencias: number;
  recibosSinFirmar: number;
  comunicacionesAbiertas: number;
  /** Jornadas con entrada y sin salida (o al revés) de las últimas dos semanas. */
  jornadasSinCerrar: number;
  vencimientos: { titulo: string; fecha: string }[];
}

const hayAlgo = (p: Pendientes): boolean =>
  p.ausencias > 0 ||
  p.recibosSinFirmar > 0 ||
  p.comunicacionesAbiertas > 0 ||
  p.jornadasSinCerrar > 0 ||
  p.vencimientos.length > 0;

const fila = (n: number, singular: string, plural: string): string =>
  n === 0
    ? ''
    : `<li style="margin-bottom:6px"><strong>${n}</strong> ${n === 1 ? singular : plural}</li>`;

const armarEmail = (empresa: string, p: Pendientes): string => `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2f2e3a">
    <h1 style="font-size:18px;font-weight:700;margin:0 0 4px">Tu semana en ${empresa}</h1>
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
             ${p.vencimientos.map((v) => `<li>${v.titulo} — ${v.fecha}</li>`).join('')}
           </ul>`
        : ''
    }
    <p style="font-size:12px;color:#9a98a6;margin:22px 0 0">
      Recibís este resumen porque administrás RRHH en ${empresa}. Se puede
      desactivar desde ISEO RH.
    </p>
  </div>
`;

const procesar = async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // Interruptor general: si está apagado, no se manda nada.
  const { data: plataforma } = await admin
    .from('config_plataforma')
    .select('config')
    .maybeSingle();
  const config = (plataforma?.config ?? {}) as {
    resumenSemanalEmail?: boolean;
  };
  if (config.resumenSemanalEmail === false) {
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'desactivado' });
  }

  // Todo el resumen se fecha en la zona de negocio.
  //
  // Esto corre en Vercel con TZ=UTC: `toISOString()`, `getDay()` y
  // `setDate()` daban el día, la semana y el límite de UTC. Con el cron
  // los lunes a las 11:00 UTC (08:00 ART) coincidían con Argentina, pero
  // era una propiedad del horario elegido y no de la cuenta. Un reintento
  // de madrugada mandaba el resumen con la semana anterior como clave de
  // dedup, o directamente lo saltaba.
  const hoy = hoyISO();
  const limiteISO = sumarDiasEmpresa(hoy, 30);
  // Misma ventana que usan la pantalla de Fichaje y el aviso de Inicio:
  // el mail no puede decir una cantidad distinta de la que se ve al
  // entrar a corregirlas.
  const desdeIncidenciasISO = desdeIncidencias();

  // Lunes de esta semana: la clave de dedup. Si el cron corre dos veces
  // (reintento, deploy, ejecución manual) el segundo no manda nada.
  const semana = lunesDeSemanaEmpresa(hoy);

  const { data: empresas } = await admin
    .from('empresas')
    .select('id, nombre, config')
    .eq('estado', 'activa');

  let enviados = 0;

  for (const empresa of empresas ?? []) {
    const cfg = (empresa.config ?? {}) as {
      modulos?: Record<string, boolean>;
      resumenSemanal?: boolean;
    };

    // Lo puede apagar RRHH desde su Configuración o ISEO desde la ficha
    // de la empresa. Ausente = prendido.
    if (cfg.resumenSemanal === false) continue;

    // Lo que no figura guardado está prendido, igual que en la pantalla
    // de módulos. Contar pendientes de una sección apagada sería mandar
    // a alguien a una pantalla que no tiene.
    const modulos = cfg.modulos ?? {};
    const activo = (clave: string) => modulos[clave] !== false;

    // Contra Auth y no contra el espejo de `usuarios`: si alguna fila
    // quedó desincronizada de antes del cambio de email, el resumen tiene
    // que llegar igual a donde esa persona entra.
    const destinos = await emailsDeAdmins(admin, empresa.id as string);
    if (destinos.length === 0) continue;

    const [ausencias, recibos, comunicaciones, incompletas, alertas] =
      await Promise.all([
        admin
          .from('ausencias')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id)
          .eq('estado', 'pendiente'),
        admin
          .from('recibos')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id)
          .eq('estado_firma', 'pendiente')
          .not('firmado_empleador_en', 'is', null),
        admin
          .from('comunicaciones')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id)
          .neq('estado', 'cerrada'),
        // Jornadas sin cerrar: mismo RPC y mismos filtros que el
        // historial. `head` + `count` para traer el número y no las filas.
        admin
          .rpc(
            'jornadas_de_empresa',
            {
              p_empresa_id: empresa.id,
              p_desde: desdeIncidenciasISO,
              p_hasta: hoy,
              p_empleado_ids: null,
            },
            { count: 'exact', head: true }
          )
          .eq('cerrada', false)
          .eq('en_curso', false),
        admin
          .from('documentos_legajo')
          .select('nombre, fecha_vencimiento')
          .eq('empresa_id', empresa.id)
          .not('fecha_vencimiento', 'is', null)
          .gte('fecha_vencimiento', hoy)
          .lte('fecha_vencimiento', limiteISO)
          .order('fecha_vencimiento')
          .limit(5),
      ]);

    const pendientes: Pendientes = {
      ausencias: activo('ausencias') ? (ausencias.count ?? 0) : 0,
      recibosSinFirmar: activo('recibos') ? (recibos.count ?? 0) : 0,
      comunicacionesAbiertas: activo('comunicaciones')
        ? (comunicaciones.count ?? 0)
        : 0,
      jornadasSinCerrar: activo('fichaje') ? (incompletas.count ?? 0) : 0,
      vencimientos: (alertas.data ?? []).map((d) => ({
        titulo: String(d.nombre),
        // Fecha civil: el vencimiento es un día, no un instante. Y va
        // por el formateador compartido para que el mail diga lo mismo
        // que la pantalla.
        fecha: formatearFechaCivil(String(d.fecha_vencimiento), {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      })),
    };

    // Semana tranquila: no se manda nada. Un mail que dice "no tenés
    // nada" enseña a archivar sin leer, y entonces el que importa
    // también se archiva sin leer.
    if (!hayAlgo(pendientes)) continue;

    // La marca se escribe ANTES de mandar: si el envío falla, se pierde
    // un resumen semanal. Al revés se podrían mandar dos, y duplicar un
    // mail es más caro que saltear uno que se repite en siete días.
    const { error: yaEnviado } = await admin
      .from('avisos_resumen_semanal')
      .insert({ empresa_id: empresa.id, semana });
    if (yaEnviado) continue;

    const ok = await enviarEmail({
      para: destinos,
      asunto: `Tu semana en ${empresa.nombre} · ISEO RH`,
      html: armarEmail(String(empresa.nombre), pendientes),
    });
    if (ok) enviados += 1;
  }

  return NextResponse.json({ ok: true, enviados });
};
