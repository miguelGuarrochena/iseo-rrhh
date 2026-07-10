import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

interface CuerpoInvitacion {
  email: string;
  nombreCompleto: string;
  rol: 'admin_rrhh' | 'supervisor' | 'empleado';
  /** requerida si invita el superadmin; los admin invitan a su empresa */
  empresaId?: string;
  empleadoId?: string;
}

/** Errores comunes de Supabase Auth, en castellano y accionables. */
const traducirErrorInvitacion = (mensaje: string): string => {
  const m = mensaje.toLowerCase();
  if (
    m.includes('already') &&
    (m.includes('registered') || m.includes('exists'))
  ) {
    return 'Ese email ya tiene una cuenta en la plataforma (cada email puede usarse una sola vez, aunque sea en otra empresa). Usá otro email o borrá el usuario anterior desde Supabase → Authentication → Users.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'El email no tiene un formato válido. Revisá que no tenga espacios ni errores de tipeo.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Se enviaron muchos emails seguidos y el servicio puso una pausa. Esperá unos minutos y reintentá.';
  }
  return mensaje;
};

/**
 * Invita a un usuario a la plataforma. Requiere sesión de superadmin
 * o admin_rrhh (token en Authorization). Supabase manda el email con
 * el link para crear la contraseña; el trigger de la DB arma el perfil.
 */
export const POST = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // ¿Quién invita?
  const { data: auth, error: errorAuth } = await admin.auth.getUser(token);
  if (errorAuth || !auth.user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  }
  const { data: perfil } = await admin
    .from('usuarios')
    .select('rol, empresa_id')
    .eq('id', auth.user.id)
    .single();
  if (!perfil || !['superadmin', 'admin_rrhh'].includes(perfil.rol)) {
    return NextResponse.json(
      { error: 'No tenés permisos para invitar usuarios.' },
      { status: 403 }
    );
  }

  const cuerpo = (await req.json()) as CuerpoInvitacion;
  if (!cuerpo.email || !cuerpo.nombreCompleto || !cuerpo.rol) {
    return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 });
  }

  // Los admin solo invitan dentro de su empresa; el superadmin elige.
  const empresaId =
    perfil.rol === 'superadmin' ? cuerpo.empresaId : perfil.empresa_id;
  if (!empresaId) {
    return NextResponse.json(
      { error: 'Falta la empresa destino.' },
      { status: 400 }
    );
  }

  // Si se vincula a un legajo, el email tiene que coincidir con el de la
  // ficha (control de identidad). Si la ficha no tiene email, se completa.
  if (cuerpo.empleadoId) {
    const { data: empleado } = await admin
      .from('empleados')
      .select('email, empresa_id')
      .eq('id', cuerpo.empleadoId)
      .single();
    if (!empleado || empleado.empresa_id !== empresaId) {
      return NextResponse.json(
        { error: 'El colaborador no pertenece a esta empresa.' },
        { status: 400 }
      );
    }
    const emailFicha = (empleado.email ?? '').trim().toLowerCase();
    const emailInvitado = cuerpo.email.trim().toLowerCase();
    if (emailFicha && emailFicha !== emailInvitado) {
      return NextResponse.json(
        {
          error: `El email no coincide con el del legajo (${empleado.email}). Corregí la ficha o usá ese email.`,
        },
        { status: 400 }
      );
    }
    if (!emailFicha) {
      await admin
        .from('empleados')
        .update({ email: cuerpo.email.trim() })
        .eq('id', cuerpo.empleadoId);
    }
  }

  const origen = new URL(req.url).origin;
  const { error } = await admin.auth.admin.inviteUserByEmail(cuerpo.email, {
    redirectTo: `${origen}/crear-contrasena`,
    data: {
      nombre_completo: cuerpo.nombreCompleto,
      rol: cuerpo.rol,
      empresa_id: empresaId,
      empleado_id: cuerpo.empleadoId ?? '',
    },
  });
  if (error) {
    return NextResponse.json(
      { error: traducirErrorInvitacion(error.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
};
