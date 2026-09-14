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
import {
  armarEmailResumen,
  cronAutorizado,
  hayPendientesResumen,
  moduloEncendido,
  resumenEmpresaActivo,
  resumenPlataformaActivo,
  type PendientesResumenSemanal,
} from '@/lib/resumenSemanal';

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
 *
 * La marca de "ya mandado esta semana" se escribe ANTES del envío para
 * no duplicar mails si el cron corre dos veces. Si Resend falla, se
 * borra esa marca para poder reintentar.
 */
export const POST = (req: Request) => procesar(req);
export const GET = (req: Request) => procesar(req);

const log = (
  nivel: 'info' | 'warn' | 'error',
  mensaje: string,
  extra?: Record<string, unknown>
) => {
  const linea = extra
    ? `resumen-semanal: ${mensaje} ${JSON.stringify(extra)}`
    : `resumen-semanal: ${mensaje}`;
  if (nivel === 'error') console.error(linea);
  else if (nivel === 'warn') console.warn(linea);
  else console.info(linea);
};

const procesar = async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!cronAutorizado(secret, req.headers.get('authorization'))) {
    log('warn', 'no autorizado');
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: plataforma, error: errorPlataforma } = await admin
    .from('config_plataforma')
    .select('config')
    .maybeSingle();
  if (errorPlataforma) {
    log('error', 'no se pudo leer config_plataforma', {
      error: errorPlataforma.message,
    });
    return NextResponse.json(
      { error: 'No se pudo leer la configuración.' },
      { status: 500 }
    );
  }
  const config = (plataforma?.config ?? {}) as {
    resumenSemanalEmail?: boolean;
  };
  if (!resumenPlataformaActivo(config)) {
    log('info', 'desactivado en plataforma');
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'desactivado' });
  }

  const hoy = hoyISO();
  const limiteISO = sumarDiasEmpresa(hoy, 30);
  const desdeIncidenciasISO = desdeIncidencias();
  const semana = lunesDeSemanaEmpresa(hoy);

  const { data: empresas, error: errorEmpresas } = await admin
    .from('empresas')
    .select('id, nombre, config')
    .eq('estado', 'activa');
  if (errorEmpresas) {
    log('error', 'no se pudieron leer empresas', {
      error: errorEmpresas.message,
    });
    return NextResponse.json(
      { error: 'No se pudieron leer las empresas.' },
      { status: 500 }
    );
  }

  let enviados = 0;
  let omitidas = 0;
  let fallos = 0;

  for (const empresa of empresas ?? []) {
    const cfg = (empresa.config ?? {}) as {
      modulos?: Record<string, boolean>;
      resumenSemanal?: boolean;
    };

    if (!resumenEmpresaActivo(cfg)) {
      omitidas += 1;
      log('info', 'empresa con resumen apagado', { empresaId: empresa.id });
      continue;
    }

    const destinos = await emailsDeAdmins(admin, empresa.id as string);
    if (destinos.length === 0) {
      omitidas += 1;
      log('info', 'sin admin_rrhh con email', { empresaId: empresa.id });
      continue;
    }

    const activo = (clave: string) => moduloEncendido(cfg.modulos, clave);

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

    const errorConsulta =
      ausencias.error ||
      recibos.error ||
      comunicaciones.error ||
      incompletas.error ||
      alertas.error;
    if (errorConsulta) {
      omitidas += 1;
      fallos += 1;
      log('error', 'consulta de pendientes falló', {
        empresaId: empresa.id,
        error: errorConsulta.message,
      });
      continue;
    }

    const pendientes: PendientesResumenSemanal = {
      ausencias: activo('ausencias') ? (ausencias.count ?? 0) : 0,
      recibosSinFirmar: activo('recibos') ? (recibos.count ?? 0) : 0,
      comunicacionesAbiertas: activo('comunicaciones')
        ? (comunicaciones.count ?? 0)
        : 0,
      jornadasSinCerrar: activo('fichaje') ? (incompletas.count ?? 0) : 0,
      vencimientos: (alertas.data ?? []).map((d) => ({
        titulo: String(d.nombre),
        fecha: formatearFechaCivil(String(d.fecha_vencimiento), {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      })),
    };

    if (!hayPendientesResumen(pendientes)) {
      omitidas += 1;
      log('info', 'semana sin pendientes', { empresaId: empresa.id });
      continue;
    }

    const { error: yaEnviado } = await admin
      .from('avisos_resumen_semanal')
      .insert({ empresa_id: empresa.id, semana });
    if (yaEnviado) {
      omitidas += 1;
      log('info', 'ya enviado esta semana', { empresaId: empresa.id, semana });
      continue;
    }

    const ok = await enviarEmail({
      para: destinos,
      asunto: `Tu semana en ${empresa.nombre} · ISEO RH`,
      html: armarEmailResumen(String(empresa.nombre), pendientes),
    });
    if (ok) {
      enviados += 1;
      log('info', 'enviado', {
        empresaId: empresa.id,
        destinatarios: destinos.length,
      });
    } else {
      fallos += 1;
      const { error: errorLiberar } = await admin
        .from('avisos_resumen_semanal')
        .delete()
        .eq('empresa_id', empresa.id)
        .eq('semana', semana);
      if (errorLiberar) {
        log('error', 'falló el envío y no se pudo liberar la marca', {
          empresaId: empresa.id,
          error: errorLiberar.message,
        });
      } else {
        log('warn', 'falló el envío; se libera la marca para reintentar', {
          empresaId: empresa.id,
        });
      }
    }
  }

  log('info', 'fin', { enviados, omitidas, fallos, semana });
  return NextResponse.json({ ok: true, enviados, omitidas, fallos });
};
