import { NextResponse } from 'next/server';
import { logError } from '@/lib/api/registro';
import { dentroDelLimite } from '@/lib/api/limiteDeUso';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Alta de otro superadmin (equipo de ISEO).
 *
 * Es la ruta más sensible de la app: un superadmin ve todas las empresas
 * y la facturación de la plataforma. Por eso:
 *
 *  - sólo un superadmin puede invitar a otro (se verifica en el servidor,
 *    no alcanza con que el botón esté escondido en la UI),
 *  - el rol NO viaja en el body: se fija acá. Si viniera de afuera,
 *    cualquiera con sesión podría mandar `{"rol":"superadmin"}` por curl,
 *  - queda registrado en la auditoría con quién lo hizo.
 *
 * La invitación va por mail: nadie define la contraseña de otro.
 */
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
    .select('rol, nombre_completo')
    .eq('id', auth.user.id)
    .single();
  if (!perfil || perfil.rol !== 'superadmin') {
    return NextResponse.json(
      { error: 'Sólo el equipo de ISEO puede dar de alta a otro miembro.' },
      { status: 403 }
    );
  }

  if (!dentroDelLimite(`equipo-iseo:${auth.user.id}`, 20)) {
    return NextResponse.json(
      { error: 'Demasiadas invitaciones seguidas. Esperá un minuto.' },
      { status: 429 }
    );
  }

  let cuerpo: { email?: unknown; nombreCompleto?: unknown };
  try {
    cuerpo = (await req.json()) as {
      email?: unknown;
      nombreCompleto?: unknown;
    };
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  const email = typeof cuerpo.email === 'string' ? cuerpo.email.trim() : '';
  const nombreCompleto =
    typeof cuerpo.nombreCompleto === 'string'
      ? cuerpo.nombreCompleto.trim()
      : '';

  if (!email || !nombreCompleto) {
    return NextResponse.json(
      { error: 'Faltan el nombre y el email.' },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json(
      { error: 'El email no tiene un formato válido.' },
      { status: 400 }
    );
  }

  const origen = new URL(req.url).origin;
  const { data: invitado, error } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${origen}/crear-contrasena`,
      data: {
        nombre_completo: nombreCompleto,
        // Informativo: el rol real lo escribe esta ruta más abajo. El
        // trigger `crear_perfil_usuario` ignora `rol: superadmin` a
        // propósito desde la migración 33, para que nadie pueda hacerse
        // superadmin metiendo metadata en una invitación.
        rol: 'superadmin',
        empresa_id: '',
        empleado_id: '',
      },
    }
  );

  if (error) {
    const m = error.message.toLowerCase();
    if (
      m.includes('already') &&
      (m.includes('registered') || m.includes('exists'))
    ) {
      return NextResponse.json(
        {
          error:
            'Ese email ya tiene una cuenta en la plataforma. Si es de un cliente, no se puede reusar para el equipo de ISEO.',
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  /**
   * El perfil lo crea esta ruta, no el trigger.
   *
   * Desde la migración 33 `crear_perfil_usuario` ignora las invitaciones
   * con `rol: superadmin` — es la defensa contra que alguien se haga
   * superadmin mandando metadata. Pero esta ruta seguía confiando en el
   * trigger, así que la invitación creaba la cuenta en `auth.users` y
   * nunca la fila en `public.usuarios`: la persona ponía su contraseña,
   * entraba, y se encontraba con "tu cuenta existe pero todavía no tiene
   * un perfil asignado". En Permisos figuraba la invitación en el
   * historial y "Usuarios (0)" en la lista.
   *
   * Acá es seguro: quien llama ya fue verificado como superadmin contra
   * la base (no contra el body), y el rol se escribe fijo.
   */
  if (invitado?.user) {
    const { error: errorPerfil } = await admin.from('usuarios').insert({
      id: invitado.user.id,
      email,
      rol: 'superadmin',
      nombre_completo: nombreCompleto,
      empresa_id: null,
    });
    if (errorPerfil) {
      // Sin perfil la cuenta no sirve para nada y la persona igual
      // recibiría el mail de invitación. Se deshace el alta para no
      // dejarla a mitad de camino.
      await admin.auth.admin.deleteUser(invitado.user.id);
      logError('No se pudo crear el perfil de superadmin', errorPerfil, {
        ruta: '/api/equipo-iseo',
        email,
      });
      return NextResponse.json(
        {
          error:
            'No pudimos completar el alta. No se envió la invitación; probá de nuevo.',
        },
        { status: 500 }
      );
    }
  }

  // Queda constancia de quién sumó a quién al equipo. `empresa_id` nulo
  // marca que es una acción de plataforma, no de un cliente.
  await admin.from('auditoria_acciones').insert({
    empresa_id: null,
    actor_id: auth.user.id,
    actor_nombre: perfil.nombre_completo,
    accion: 'invitar',
    entidad: 'usuario',
    detalle: { email, rol: 'superadmin' },
  });

  return NextResponse.json({ ok: true });
};
