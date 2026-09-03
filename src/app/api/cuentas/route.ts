import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  aplicarCambioDeEmail,
  estadoDeCuentaDeEmpleado,
  type EstadoDeCuentaDeEmpleado,
  type PuertoCambioDeEmail,
} from '@/lib/api/cambioDeEmail';
import {
  cuentaSinPerfilEsDeLaEmpresa,
  datosParaCompletarAlta,
  datosParaReenviarInvitacion,
  esRolInvitable,
  normalizarEmail,
  type RolInvitable,
} from '@/lib/api/invitacionConfianza';
import { dentroDelLimite } from '@/lib/api/limiteDeUso';
import { crearPerfilDeInvitado } from '@/lib/api/perfilInvitado';
import { logError } from '@/lib/api/registro';
import {
  borrarInvitacion,
  buscarInvitacion,
  listarInvitacionesDeEmpresa,
  marcarInvitacionCompletada,
  registrarInvitacion,
} from '@/lib/api/registroInvitacion';
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
 *
 * Autoridad de rol/empresa/legajo: `public.invitaciones` (API), nunca
 * `user_metadata` (BUG-001 / BUG-002).
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

/** Lo que hace falta saber de un legajo antes de tocarle el email. */
interface CuentaDeUnLegajo {
  empleadoId: string;
  emailDeLaFicha: string;
  estado: EstadoDeCuentaDeEmpleado;
  usuarioId: string | null;
  emailDeLaCuenta: string | null;
  /** Rol y nombre con los que se rehace la invitación, si hace falta. */
  rol: RolInvitable;
  nombreCompleto: string;
}

/**
 * Resuelve en qué anda la cuenta de un colaborador.
 *
 * Con perfil alcanza con ir por su id a Auth. Sin perfil la cuenta puede
 * existir igual (quedó a medias): ahí el puente es la invitación, que sí
 * guarda el legajo. En los dos casos se evita barrer `auth.users` entero.
 */
const cuentaDelLegajo = async (
  ctx: Contexto,
  empleadoId: string
): Promise<CuentaDeUnLegajo | NextResponse> => {
  const { data: empleado } = await ctx.admin
    .from('empleados')
    .select('id, email, empresa_id, nombre, apellido')
    .eq('id', empleadoId)
    .maybeSingle();
  if (!empleado || empleado.empresa_id !== ctx.empresaId) {
    return NextResponse.json(
      { error: 'El colaborador no pertenece a esta empresa.' },
      { status: 403 }
    );
  }

  const nombreDeLaFicha =
    `${empleado.nombre ?? ''} ${empleado.apellido ?? ''}`.trim();

  const { data: perfil } = await ctx.admin
    .from('usuarios')
    .select('id, email, rol, nombre_completo')
    .eq('empleado_id', empleadoId)
    .limit(1)
    .maybeSingle();

  let authUserId: string | null = (perfil?.id as string | undefined) ?? null;
  let rol = (perfil?.rol as string | undefined) ?? 'empleado';
  let nombreCompleto =
    (perfil?.nombre_completo as string | undefined) || nombreDeLaFicha;

  // Sin perfil, la invitación es lo único que ata una cuenta a este legajo.
  if (!authUserId) {
    const { data: invitacion } = await ctx.admin
      .from('invitaciones')
      .select('rol, nombre_completo, auth_user_id')
      .eq('empresa_id', ctx.empresaId)
      .eq('empleado_id', empleadoId)
      .limit(1)
      .maybeSingle();
    if (invitacion?.auth_user_id) {
      authUserId = invitacion.auth_user_id as string;
      rol = (invitacion.rol as string) || rol;
      nombreCompleto = (invitacion.nombre_completo as string) || nombreCompleto;
    }
  }

  let cuenta: User | null = null;
  if (authUserId) {
    const { data } = await ctx.admin.auth.admin.getUserById(authUserId);
    cuenta = data?.user ?? null;
  }

  return {
    empleadoId,
    emailDeLaFicha: (empleado.email as string) ?? '',
    // La cuenta pudo haberse borrado por fuera: sin fila en Auth no hay
    // invitación viva, por más que quede el rastro en `usuarios`.
    estado: estadoDeCuentaDeEmpleado({
      tienePerfil: Boolean(perfil),
      authUserId: cuenta ? cuenta.id : null,
      ultimoAcceso: cuenta?.last_sign_in_at ?? null,
    }),
    usuarioId: cuenta?.id ?? null,
    emailDeLaCuenta: cuenta?.email ?? null,
    rol: esRolInvitable(rol) ? rol : 'empleado',
    nombreCompleto: nombreCompleto || (empleado.email as string) || '',
  };
};

/** Estado de cada cuenta de la empresa, incluidas las que quedaron a medias. */
export const GET = async (req: Request) => {
  const ctx = await contextoDe(
    req,
    new URL(req.url).searchParams.get('empresa')
  );
  if (ctx instanceof NextResponse) return ctx;

  // `?empleado=` pide sólo el estado de ese legajo: lo consulta el formulario
  // de la ficha para avisar qué va a pasar si se cambia el email. Barrer todo
  // Auth para eso sería carísimo y no aportaría nada.
  const empleadoPedido = new URL(req.url).searchParams.get('empleado');
  if (empleadoPedido) {
    const legajo = await cuentaDelLegajo(ctx, empleadoPedido);
    if (legajo instanceof NextResponse) return legajo;
    return NextResponse.json({
      estado: legajo.estado,
      emailDeLaCuenta: legajo.emailDeLaCuenta,
      emailDeLaFicha: legajo.emailDeLaFicha,
    });
  }

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
  let invitaciones;
  try {
    [cuentasAuth, invitaciones] = await Promise.all([
      traerCuentasDeAuth(ctx.admin),
      listarInvitacionesDeEmpresa(ctx.admin, ctx.empresaId),
    ]);
  } catch (err) {
    logError('No se pudo listar Auth o invitaciones', err, {
      ruta: '/api/cuentas',
    });
    return NextResponse.json(
      { error: 'No pudimos leer el estado de las invitaciones.' },
      { status: 500 }
    );
  }

  const porId = new Map(cuentasAuth.map((u) => [u.id, u]));
  const porEmail = new Map(
    cuentasAuth
      .filter((u) => u.email)
      .map((u) => [normalizarEmail(u.email!), u])
  );
  const conPerfil = new Set((perfiles ?? []).map((p) => p.id as string));
  const invitacionPorEmail = new Map(
    invitaciones.map((i) => [normalizarEmail(i.email), i])
  );

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

  // Cuentas a medias: Auth sin perfil Y invitación confiable de esta
  // empresa. Metadata `empresa_id` ya no alcanza para aparecer acá.
  const huerfanas: CuentaDeAcceso[] = [];
  for (const inv of invitaciones) {
    const email = normalizarEmail(inv.email);
    const enAuth =
      (inv.authUserId ? porId.get(inv.authUserId) : undefined) ??
      porEmail.get(email);
    if (!enAuth) continue;
    if (
      !cuentaSinPerfilEsDeLaEmpresa({
        tienePerfil: conPerfil.has(enAuth.id),
        invitacionDeLaEmpresa: invitacionPorEmail.has(email),
      })
    ) {
      continue;
    }
    huerfanas.push({
      email: enAuth.email ?? email,
      nombre: inv.nombreCompleto || enAuth.email || email,
      estado: 'sin_perfil',
      invitadaEn: enAuth.invited_at ?? enAuth.created_at,
      ultimoAcceso: enAuth.last_sign_in_at ?? undefined,
    });
  }

  return NextResponse.json({ cuentas: [...cuentas, ...huerfanas] });
};

interface CuerpoAccion {
  accion?: unknown;
  email?: unknown;
  empresaId?: unknown;
  /** Sólo en `cambiar_email`: el legajo cuyo email se mueve. */
  empleadoId?: unknown;
}

/**
 * Mueve el email de un colaborador a donde haga falta, según su estado.
 *
 * Es el único camino por el que la app cambia un email: editar la ficha sola
 * dejaba `auth.users`, `usuarios` e `invitaciones` con el valor viejo, y ahí
 * seguían yendo la invitación y todos los avisos por mail.
 *
 * La decisión y el orden de las escrituras —incluido volver atrás si algo
 * falla a mitad— están en `aplicarCambioDeEmail`, que se prueba sin base.
 * Acá sólo se le da acceso a Supabase.
 */
const cambiarEmail = async (
  ctx: Contexto,
  empleadoId: string,
  emailNuevo: string,
  origen: string
) => {
  const legajo = await cuentaDelLegajo(ctx, empleadoId);
  if (legajo instanceof NextResponse) return legajo;

  const puerto: PuertoCambioDeEmail = {
    duenoDelEmail: async (email) => {
      // `listUsers` no filtra por email, así que se barre igual que en el
      // resto de la ruta. Es el único punto que lo necesita: sirve para
      // avisar antes de romper nada que ese email ya está tomado.
      const cuentas = await traerCuentasDeAuth(ctx.admin);
      const duena = cuentas.find(
        (u) => u.email && normalizarEmail(u.email) === normalizarEmail(email)
      );
      return duena?.id ?? null;
    },
    moverEmailDeAuth: async (usuarioId, email) => {
      // `email_confirm` evita mandar el mail de "confirmá tu nueva
      // dirección": el cambio lo hace RRHH, no la persona, y si quedara
      // pendiente de confirmación no podría entrar con ninguno de los dos.
      const { error } = await ctx.admin.auth.admin.updateUserById(usuarioId, {
        email,
        email_confirm: true,
      });
      return error ? error.message : null;
    },
    moverEmailDePerfil: async (usuarioId, email) => {
      const { error } = await ctx.admin
        .from('usuarios')
        .update({ email })
        .eq('id', usuarioId);
      return error ? error.message : null;
    },
    moverEmailDeFicha: async (id, email) => {
      const { error } = await ctx.admin
        .from('empleados')
        .update({ email })
        .eq('id', id);
      return error ? error.message : null;
    },
    borrarCuenta: async (usuarioId) => {
      const { error } = await ctx.admin.auth.admin.deleteUser(usuarioId);
      return error ? error.message : null;
    },
    borrarInvitacion: (email) =>
      borrarInvitacion(ctx.admin, ctx.empresaId, email),
    invitar: async (email) => {
      const { data, error } = await ctx.admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${origen}/crear-contrasena`,
          data: {
            nombre_completo: legajo.nombreCompleto,
            rol: legajo.rol,
            empresa_id: ctx.empresaId,
            empleado_id: empleadoId,
          },
        }
      );
      if (error) return { error: error.message };
      if (!data?.user) return { error: 'No pudimos crear la cuenta invitada.' };
      return { usuarioId: data.user.id };
    },
    crearPerfil: (usuarioId, email) =>
      crearPerfilDeInvitado(ctx.admin, usuarioId, {
        email,
        nombreCompleto: legajo.nombreCompleto,
        rol: legajo.rol,
        empresaId: ctx.empresaId,
        empleadoId,
      }),
    registrarInvitacion: (email, usuarioId) =>
      registrarInvitacion(ctx.admin, {
        email,
        empresaId: ctx.empresaId,
        rol: legajo.rol,
        nombreCompleto: legajo.nombreCompleto,
        empleadoId,
        authUserId: usuarioId,
        creadaPor: ctx.actorId,
        perfilCreado: true,
      }),
  };

  const resultado = await aplicarCambioDeEmail(puerto, {
    empleadoId,
    emailNuevo,
    emailDeLaFicha: legajo.emailDeLaFicha,
    estado: legajo.estado,
    usuarioId: legajo.usuarioId,
    emailDeLaCuenta: legajo.emailDeLaCuenta,
  });

  if (!resultado.ok) {
    logError('No se pudo cambiar el email del colaborador', resultado.error, {
      ruta: '/api/cuentas',
    });
    // `requiereReinvitar` viaja para que la pantalla no diga "no se guardó
    // nada" cuando en realidad el email quedó guardado y la invitación
    // anterior anulada: ahí lo que falta es una acción del admin.
    return NextResponse.json(
      {
        error: resultado.error,
        ...(resultado.requiereReinvitar ? { requiereReinvitar: true } : {}),
      },
      { status: resultado.status }
    );
  }

  if (!resultado.datos.sinCambios) {
    // Es un cambio de identidad: queda quién lo hizo y desde qué dirección.
    await auditar(ctx, 'cambiar_email', {
      empleadoId,
      anterior: legajo.emailDeLaCuenta ?? legajo.emailDeLaFicha,
      nuevo: resultado.datos.email,
      estado: resultado.datos.estado,
    });
  }

  return NextResponse.json({ ok: true, ...resultado.datos });
};

/**
 * Rehace la invitación de alguien que todavía no entró.
 *
 * Supabase no reenvía: `inviteUserByEmail` sobre un email ya registrado
 * falla, así que la invitación vencida y la cuenta a medias eran callejones
 * sin salida. Se borra la cuenta anterior y se invita de nuevo con los
 * mismos datos; como nunca se usó, no hay nada que perder.
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

  const email = normalizarEmail(cuenta.email ?? '');
  let invitacion;
  try {
    invitacion = await buscarInvitacion(ctx.admin, ctx.empresaId, email);
  } catch (err) {
    logError('No se pudo leer la invitación al reenviar', err, {
      ruta: '/api/cuentas',
    });
    return NextResponse.json(
      { error: 'No pudimos rehacer la invitación. Probá de nuevo.' },
      { status: 500 }
    );
  }

  const resuelto = datosParaReenviarInvitacion({
    perfil,
    invitacion,
    emailFallback: email,
  });
  if (!resuelto.ok) {
    return NextResponse.json(
      { error: resuelto.error },
      { status: resuelto.status }
    );
  }

  const datos = {
    nombre_completo: resuelto.datos.nombreCompleto,
    rol: resuelto.datos.rol,
    empresa_id: ctx.empresaId,
    empleado_id: resuelto.datos.empleadoId ?? '',
  };

  const { error: errorBorrado } = await ctx.admin.auth.admin.deleteUser(
    cuenta.id
  );
  if (errorBorrado) {
    logError('No se pudo borrar la cuenta a reinvitar', errorBorrado, {
      ruta: '/api/cuentas',
    });
    return NextResponse.json(
      { error: 'No pudimos rehacer la invitación. Probá de nuevo.' },
      { status: 500 }
    );
  }

  const { data: invitado, error } =
    await ctx.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origen}/crear-contrasena`,
      data: datos,
    });
  if (error) {
    // La cuenta vieja ya no está: el email quedó libre y se puede volver
    // a invitar desde cero. Se dice así, que es lo accionable.
    logError('No se pudo reinvitar', error, { ruta: '/api/cuentas' });
    return NextResponse.json(
      {
        error: `Se liberó la cuenta anterior pero el mail no salió (${error.message}). Invitá a ${email} de nuevo desde “Invitar usuario”.`,
      },
      { status: 500 }
    );
  }

  if (invitado?.user) {
    const errorPerfil = await crearPerfilDeInvitado(
      ctx.admin,
      invitado.user.id,
      {
        email,
        nombreCompleto: datos.nombre_completo,
        rol: datos.rol,
        empresaId: ctx.empresaId,
        empleadoId: resuelto.datos.empleadoId,
      }
    );
    if (errorPerfil) {
      logError('No se pudo rehacer el perfil al reinvitar', errorPerfil, {
        ruta: '/api/cuentas',
      });
      return NextResponse.json(
        {
          error: `Se mandó el mail pero la cuenta quedó otra vez sin perfil (${errorPerfil}). No la uses hasta resolverlo.`,
        },
        { status: 500 }
      );
    }

    const errorInv = await registrarInvitacion(ctx.admin, {
      email,
      empresaId: ctx.empresaId,
      rol: resuelto.datos.rol,
      nombreCompleto: datos.nombre_completo,
      empleadoId: resuelto.datos.empleadoId,
      authUserId: invitado.user.id,
      creadaPor: ctx.actorId,
      perfilCreado: true,
    });
    if (errorInv) {
      logError('No se pudo refrescar la invitación al reenviar', errorInv, {
        ruta: '/api/cuentas',
      });
    }
  }

  await auditar(ctx, 'reinvitar', { email });
  return NextResponse.json({ ok: true });
};

/**
 * Le arma el perfil a una cuenta que quedó a medias, con los datos de su
 * invitación registrada en el servidor (no la metadata de Auth).
 *
 * Rehacer la invitación no sirve para todos: quien ya puso su contraseña
 * la tiene y no hay por qué hacérsela cambiar ni mandarle otro mail. Lo
 * único que le falta es la fila del perfil.
 */
const completar = async (ctx: Contexto, cuenta: User) => {
  const email = normalizarEmail(cuenta.email ?? '');
  let invitacion;
  try {
    invitacion = await buscarInvitacion(ctx.admin, ctx.empresaId, email);
  } catch (err) {
    logError('No se pudo leer la invitación al completar', err, {
      ruta: '/api/cuentas',
    });
    return NextResponse.json(
      { error: 'No pudimos completar el alta. Probá de nuevo.' },
      { status: 500 }
    );
  }

  let empleado: { id: string; empresaId: string } | null = null;
  let emailOcupandoLegajo: string | null = null;
  if (invitacion?.empleadoId) {
    const { data: fila } = await ctx.admin
      .from('empleados')
      .select('id, empresa_id')
      .eq('id', invitacion.empleadoId)
      .maybeSingle();
    if (fila) {
      empleado = {
        id: fila.id as string,
        empresaId: fila.empresa_id as string,
      };
    }
    const { data: ocupado } = await ctx.admin
      .from('usuarios')
      .select('email')
      .eq('empleado_id', invitacion.empleadoId)
      .limit(1)
      .maybeSingle();
    emailOcupandoLegajo = (ocupado?.email as string | undefined) ?? null;
  }

  const resuelto = datosParaCompletarAlta({
    email,
    empresaId: ctx.empresaId,
    invitacion,
    empleado,
    emailOcupandoLegajo,
  });
  if (!resuelto.ok) {
    return NextResponse.json(
      { error: resuelto.error },
      { status: resuelto.status }
    );
  }

  const errorPerfil = await crearPerfilDeInvitado(ctx.admin, cuenta.id, {
    email: resuelto.datos.email,
    nombreCompleto: resuelto.datos.nombreCompleto,
    rol: resuelto.datos.rol,
    empresaId: resuelto.datos.empresaId,
    empleadoId: resuelto.datos.empleadoId,
  });
  if (errorPerfil) {
    logError('No se pudo completar el alta', errorPerfil, {
      ruta: '/api/cuentas',
    });
    return NextResponse.json(
      { error: `No pudimos completar el alta: ${errorPerfil}` },
      { status: 500 }
    );
  }

  await marcarInvitacionCompletada(ctx.admin, ctx.empresaId, email, cuenta.id);
  await auditar(ctx, 'completar_alta', {
    email,
    rol: resuelto.datos.rol,
  });
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
    });
    return NextResponse.json(
      { error: 'No pudimos quitar el acceso. Probá de nuevo.' },
      { status: 500 }
    );
  }

  if (cuenta.email) {
    await borrarInvitacion(ctx.admin, ctx.empresaId, cuenta.email);
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
    typeof cuerpo.email === 'string' ? normalizarEmail(cuerpo.email) : '';
  const ACCIONES = [
    'reenviar',
    'quitar',
    'completar',
    'cambiar_email',
  ] as const;
  if (
    typeof accion !== 'string' ||
    !(ACCIONES as readonly string[]).includes(accion) ||
    !email
  ) {
    return NextResponse.json({ error: 'Pedido incompleto.' }, { status: 400 });
  }

  // Todas mandan mail o borran cuentas: se acotan igual que las invitaciones
  // para que una sesión robada no las use en masa.
  if (!dentroDelLimite(`cuentas:${ctx.actorId}`, 20)) {
    return NextResponse.json(
      { error: 'Demasiadas acciones seguidas. Esperá un minuto.' },
      { status: 429 }
    );
  }

  // Va antes del barrido de Auth: acá el email del cuerpo es el DESTINO, no
  // la cuenta a buscar. El legajo se resuelve por id.
  if (accion === 'cambiar_email') {
    const empleadoId =
      typeof cuerpo.empleadoId === 'string' ? cuerpo.empleadoId : '';
    if (!empleadoId) {
      return NextResponse.json(
        { error: 'Falta el colaborador.' },
        { status: 400 }
      );
    }
    return cambiarEmail(ctx, empleadoId, email, new URL(req.url).origin);
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

  const cuenta = cuentas.find(
    (u) => u.email && normalizarEmail(u.email) === email
  );
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

  let invitacion;
  try {
    invitacion = await buscarInvitacion(ctx.admin, ctx.empresaId, email);
  } catch (err) {
    logError('No se pudo leer la invitación', err, { ruta: '/api/cuentas' });
    return NextResponse.json(
      { error: 'No pudimos leer las cuentas.' },
      { status: 500 }
    );
  }

  // Pertenencia: perfil de esta empresa, o invitación confiable (nunca
  // metadata). Nada de tocar cuentas de otro cliente ni del equipo ISEO.
  const esDeLaEmpresa = perfil
    ? perfil.empresa_id === ctx.empresaId && perfil.rol !== 'superadmin'
    : invitacion?.empresaId === ctx.empresaId;
  if (!esDeLaEmpresa) {
    return NextResponse.json(
      { error: 'Esa cuenta no pertenece a esta empresa.' },
      { status: 403 }
    );
  }

  if (accion === 'completar') {
    if (perfil) {
      return NextResponse.json(
        { error: 'Esa cuenta ya tiene perfil. Actualizá la pantalla.' },
        { status: 400 }
      );
    }
    return completar(ctx, cuenta);
  }

  const origen = new URL(req.url).origin;
  return accion === 'reenviar'
    ? reenviar(ctx, cuenta, perfil, origen)
    : quitar(ctx, cuenta, perfil?.rol === 'admin_rrhh');
};
