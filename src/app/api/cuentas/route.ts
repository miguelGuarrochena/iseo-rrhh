import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { logError } from '@/lib/api/registro';
import { dentroDelLimite } from '@/lib/api/limiteDeUso';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { CuentaDeAcceso } from '@/types/rrhh';

/**
 * Estado y mantenimiento de las cuentas de una empresa.
 *
 * Existe porque el estado real de una invitación no vive en
 * `public.usuarios` sino en `auth.users`, que RLS no expone al navegador:
 * la fila del perfil se crea al mandar el mail, así que desde la app
 * "invitado hace tres semanas y nunca entró" y "trabaja todos los días"
 * se veían exactamente igual. Sin esa diferencia, las dos salidas que un
 * admin necesita —reenviar una invitación y liberar un email— sólo se
 * podían hacer entrando a Supabase.
 */

/** Techo de barrido de Auth. Suficiente para la escala de la plataforma. */
const PAGINA = 200;
const PAGINAS_MAXIMAS = 20;

const traerCuentasDeAuth = async (admin: SupabaseClient): Promise<User[]> => {
  const todas: User[] = [];
  for (let pagina = 1; pagina <= PAGINAS_MAXIMAS; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: pagina,
      perPage: PAGINA,
    });
    if (error) throw new Error(error.message);
    todas.push(...data.users);
    if (data.users.length < PAGINA) break;
  }
  return todas;
};

const normalizar = (email: string) => email.trim().toLowerCase();

const metaTexto = (usuario: User, clave: string): string | undefined => {
  const valor = (usuario.user_metadata ?? {})[clave];
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
};

interface Contexto {
  admin: SupabaseClient;
  actorId: string;
  actorNombre: string;
  empresaId: string;
}

/**
 * Verifica sesión y permisos, y resuelve sobre qué empresa se trabaja.
 * Devuelve la respuesta de error ya armada cuando algo no da.
 */
const contextoDe = async (
  req: Request,
  empresaPedida: string | null
): Promise<Contexto | NextResponse> => {
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
    .select('rol, empresa_id, nombre_completo')
    .eq('id', auth.user.id)
    .single();
  if (!perfil || !['superadmin', 'admin_rrhh'].includes(perfil.rol)) {
    return NextResponse.json(
      { error: 'No tenés permisos para gestionar las cuentas.' },
      { status: 403 }
    );
  }

  // Un admin sólo toca su empresa aunque mande otra en el pedido.
  const empresaId =
    perfil.rol === 'superadmin' ? empresaPedida : perfil.empresa_id;
  if (!empresaId) {
    return NextResponse.json({ error: 'Falta la empresa.' }, { status: 400 });
  }

  return {
    admin,
    actorId: auth.user.id,
    actorNombre: perfil.nombre_completo,
    empresaId,
  };
};

const auditar = async (
  ctx: Contexto,
  accion: string,
  detalle: Record<string, unknown>
) => {
  await ctx.admin.from('auditoria_acciones').insert({
    empresa_id: ctx.empresaId,
    actor_id: ctx.actorId,
    actor_nombre: ctx.actorNombre,
    accion,
    entidad: 'usuario',
    detalle,
  });
};

/** Estado de cada cuenta de la empresa, incluidas las que quedaron a medias. */
export const GET = async (req: Request) => {
  const ctx = await contextoDe(
    req,
    new URL(req.url).searchParams.get('empresa')
  );
  if (ctx instanceof NextResponse) return ctx;

  const { data: perfiles, error: errorPerfiles } = await ctx.admin
    .from('usuarios')
    .select('id, email, nombre_completo')
    .eq('empresa_id', ctx.empresaId)
    .neq('rol', 'superadmin');
  if (errorPerfiles) {
    logError('No se pudieron leer los perfiles', errorPerfiles, {
      ruta: '/api/cuentas',
    });
    return NextResponse.json(
      { error: 'No pudimos leer las cuentas.' },
      { status: 500 }
    );
  }

  let cuentasAuth: User[];
  try {
    cuentasAuth = await traerCuentasDeAuth(ctx.admin);
  } catch (err) {
    logError('No se pudo listar Auth', err, { ruta: '/api/cuentas' });
    return NextResponse.json(
      { error: 'No pudimos leer el estado de las invitaciones.' },
      { status: 500 }
    );
  }

  const porId = new Map(cuentasAuth.map((u) => [u.id, u]));
  const conPerfil = new Set((perfiles ?? []).map((p) => p.id as string));

  const cuentas: CuentaDeAcceso[] = (perfiles ?? []).map((p) => {
    const enAuth = porId.get(p.id as string);
    return {
      email: p.email as string,
      usuarioId: p.id as string,
      nombre: p.nombre_completo as string,
      estado: enAuth?.last_sign_in_at ? 'activa' : 'pendiente',
      invitadaEn: enAuth?.invited_at ?? enAuth?.created_at,
      ultimoAcceso: enAuth?.last_sign_in_at ?? undefined,
    };
  });

  // Cuentas a medias: existen en Auth y dicen ser de esta empresa, pero
  // nunca llegaron a tener perfil. Quien las tenga puede poner su
  // contraseña y entrar a una app que no sabe quién es.
  const huerfanas: CuentaDeAcceso[] = cuentasAuth
    .filter(
      (u) =>
        !conPerfil.has(u.id) && metaTexto(u, 'empresa_id') === ctx.empresaId
    )
    .map((u) => ({
      email: u.email ?? '',
      nombre: metaTexto(u, 'nombre_completo') ?? u.email ?? '',
      estado: 'sin_perfil' as const,
      invitadaEn: u.invited_at ?? u.created_at,
      ultimoAcceso: u.last_sign_in_at ?? undefined,
    }));

  return NextResponse.json({ cuentas: [...cuentas, ...huerfanas] });
};

interface CuerpoAccion {
  accion?: unknown;
  email?: unknown;
  empresaId?: unknown;
}

/**
 * Rehace la invitación de alguien que todavía no entró.
 *
 * Supabase no reenvía: `inviteUserByEmail` sobre un email ya registrado
 * falla, así que la invitación vencida y la cuenta a medias eran callejones
 * sin salida. Se borra la cuenta anterior y se invita de nuevo con los
 * mismos datos; como nunca se usó, no hay nada que perder, y el alta pasa
 * otra vez por el trigger que arma el perfil.
 */
const reenviar = async (
  ctx: Contexto,
  cuenta: User,
  perfil: {
    rol: string;
    empleado_id: string | null;
    nombre_completo: string;
  } | null,
  origen: string
) => {
  if (cuenta.last_sign_in_at) {
    return NextResponse.json(
      {
        error:
          'Esa persona ya creó su contraseña, así que la invitación no corresponde. Si no puede entrar, que use “¿La olvidaste?” en el login.',
      },
      { status: 400 }
    );
  }

  const email = cuenta.email ?? '';
  const datos = {
    nombre_completo:
      perfil?.nombre_completo ?? metaTexto(cuenta, 'nombre_completo') ?? email,
    rol: perfil?.rol ?? metaTexto(cuenta, 'rol') ?? 'empleado',
    empresa_id: ctx.empresaId,
    empleado_id: perfil?.empleado_id ?? metaTexto(cuenta, 'empleado_id') ?? '',
  };

  const { error: errorBorrado } = await ctx.admin.auth.admin.deleteUser(
    cuenta.id
  );
  if (errorBorrado) {
    logError('No se pudo borrar la cuenta a reinvitar', errorBorrado, {
      ruta: '/api/cuentas',
      email,
    });
    return NextResponse.json(
      { error: 'No pudimos rehacer la invitación. Probá de nuevo.' },
      { status: 500 }
    );
  }

  const { error } = await ctx.admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origen}/crear-contrasena`,
    data: datos,
  });
  if (error) {
    // La cuenta vieja ya no está: el email quedó libre y se puede volver
    // a invitar desde cero. Se dice así, que es lo accionable.
    logError('No se pudo reinvitar', error, { ruta: '/api/cuentas', email });
    return NextResponse.json(
      {
        error: `Se liberó la cuenta anterior pero el mail no salió (${error.message}). Invitá a ${email} de nuevo desde “Invitar usuario”.`,
      },
      { status: 500 }
    );
  }

  await auditar(ctx, 'reinvitar', { email });
  return NextResponse.json({ ok: true });
};

/**
 * Saca a alguien de la plataforma y libera su email.
 *
 * Es la contracara de que un email valga para una sola cuenta en toda la
 * plataforma: sin esto, un alta hecha con el email equivocado quedaba
 * ocupando ese email para siempre.
 */
const quitar = async (ctx: Contexto, cuenta: User, esAdmin: boolean) => {
  if (cuenta.id === ctx.actorId) {
    return NextResponse.json(
      { error: 'No podés quitarte el acceso a vos mismo.' },
      { status: 400 }
    );
  }

  // Una empresa sin admin no puede dar de alta gente, cargar recibos ni
  // invitar: para salir de ahí hay que entrar por soporte.
  if (esAdmin) {
    const { data: admins } = await ctx.admin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', ctx.empresaId)
      .eq('rol', 'admin_rrhh');
    if ((admins ?? []).filter((a) => a.id !== cuenta.id).length === 0) {
      return NextResponse.json(
        {
          error:
            'Es el único admin de la empresa. Nombrá a otro admin antes de sacarle el acceso, si no la empresa queda sin quien la administre.',
        },
        { status: 400 }
      );
    }
  }

  const { error } = await ctx.admin.auth.admin.deleteUser(cuenta.id);
  if (error) {
    logError('No se pudo quitar el acceso', error, {
      ruta: '/api/cuentas',
      email: cuenta.email,
    });
    return NextResponse.json(
      { error: 'No pudimos quitar el acceso. Probá de nuevo.' },
      { status: 500 }
    );
  }

  await auditar(ctx, 'quitar_acceso', { email: cuenta.email });
  return NextResponse.json({ ok: true });
};

export const POST = async (req: Request) => {
  let cuerpo: CuerpoAccion;
  try {
    cuerpo = (await req.json()) as CuerpoAccion;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const ctx = await contextoDe(
    req,
    typeof cuerpo.empresaId === 'string' ? cuerpo.empresaId : null
  );
  if (ctx instanceof NextResponse) return ctx;

  const accion = cuerpo.accion;
  const email =
    typeof cuerpo.email === 'string' ? normalizar(cuerpo.email) : '';
  if ((accion !== 'reenviar' && accion !== 'quitar') || !email) {
    return NextResponse.json({ error: 'Pedido incompleto.' }, { status: 400 });
  }

  // Las dos acciones mandan mail o borran cuentas: se acotan igual que las
  // invitaciones para que una sesión robada no las use en masa.
  if (!dentroDelLimite(`cuentas:${ctx.actorId}`, 20)) {
    return NextResponse.json(
      { error: 'Demasiadas acciones seguidas. Esperá un minuto.' },
      { status: 429 }
    );
  }

  let cuentas: User[];
  try {
    cuentas = await traerCuentasDeAuth(ctx.admin);
  } catch (err) {
    logError('No se pudo listar Auth', err, { ruta: '/api/cuentas' });
    return NextResponse.json(
      { error: 'No pudimos leer las cuentas.' },
      { status: 500 }
    );
  }

  const cuenta = cuentas.find((u) => normalizar(u.email ?? '') === email);
  if (!cuenta) {
    return NextResponse.json(
      { error: 'Esa cuenta ya no existe. Actualizá la pantalla.' },
      { status: 404 }
    );
  }

  const { data: perfil } = await ctx.admin
    .from('usuarios')
    .select('rol, empresa_id, empleado_id, nombre_completo')
    .eq('id', cuenta.id)
    .maybeSingle();

  // Pertenencia: o tiene perfil en esta empresa, o quedó a medias con esta
  // empresa en la metadata. Nada de tocar cuentas de otro cliente ni del
  // equipo de ISEO desde acá.
  const esDeLaEmpresa = perfil
    ? perfil.empresa_id === ctx.empresaId && perfil.rol !== 'superadmin'
    : metaTexto(cuenta, 'empresa_id') === ctx.empresaId;
  if (!esDeLaEmpresa) {
    return NextResponse.json(
      { error: 'Esa cuenta no pertenece a esta empresa.' },
      { status: 403 }
    );
  }

  const origen = new URL(req.url).origin;
  return accion === 'reenviar'
    ? reenviar(ctx, cuenta, perfil, origen)
    : quitar(ctx, cuenta, perfil?.rol === 'admin_rrhh');
};
