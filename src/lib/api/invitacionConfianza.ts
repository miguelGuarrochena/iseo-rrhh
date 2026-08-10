/**
 * Autoridad de invitaciones: rol / empresa / legajo NUNCA salen de
 * `user_metadata`. Esa metadata es mutable por el usuario final (signup).
 *
 * La fuente confiable es la fila de `public.invitaciones` escrita por las
 * APIs de invitación (service role). Acá vive la lógica pura para poder
 * testear BUG-001 y BUG-002 sin levantar Supabase.
 */

export const ROLES_INVITABLES = [
  'admin_rrhh',
  'supervisor',
  'empleado',
] as const;

export type RolInvitable = (typeof ROLES_INVITABLES)[number];

export const esRolInvitable = (valor: unknown): valor is RolInvitable =>
  typeof valor === 'string' &&
  (ROLES_INVITABLES as readonly string[]).includes(valor);

export const normalizarEmail = (email: string): string =>
  email.trim().toLowerCase();

/** Fila confiable emitida por el servidor al invitar. */
export interface InvitacionConfiable {
  email: string;
  empresaId: string;
  rol: string;
  nombreCompleto: string;
  empleadoId: string | null;
  authUserId: string | null;
}

export interface EmpleadoDeInvitacion {
  id: string;
  empresaId: string;
}

export interface DatosDeAltaConfiables {
  email: string;
  nombreCompleto: string;
  rol: RolInvitable;
  empresaId: string;
  empleadoId: string | null;
}

export type ResultadoCompletar =
  | { ok: true; datos: DatosDeAltaConfiables }
  | { ok: false; status: 400 | 403 | 404; error: string };

/**
 * Resuelve qué perfil se puede crear al "completar" una cuenta a medias.
 *
 * - Sin invitación registrada → rechazo (BUG-001: metadata envenenada).
 * - Rol fuera de allowlist → rechazo.
 * - Legajo de otra empresa → rechazo (BUG-002).
 * - Legajo ya ocupado → rechazo.
 * - `user_metadata` no se consulta acá a propósito.
 */
export const datosParaCompletarAlta = (args: {
  email: string;
  empresaId: string;
  invitacion: InvitacionConfiable | null;
  /** Empleado apuntado por la invitación (ya leído de DB), o null. */
  empleado: EmpleadoDeInvitacion | null;
  /** Email de la cuenta que ya ocupa ese legajo, si hay. */
  emailOcupandoLegajo: string | null;
}): ResultadoCompletar => {
  const email = normalizarEmail(args.email);
  const inv = args.invitacion;

  if (!inv || inv.empresaId !== args.empresaId) {
    return {
      ok: false,
      status: 404,
      error:
        'No hay una invitación registrada para esa cuenta en esta empresa. Si hace falta el acceso, invitála de nuevo desde Permisos.',
    };
  }

  if (normalizarEmail(inv.email) !== email) {
    return {
      ok: false,
      status: 403,
      error: 'Esa cuenta no pertenece a esta empresa.',
    };
  }

  if (!esRolInvitable(inv.rol)) {
    return {
      ok: false,
      status: 400,
      error:
        'La invitación tiene un rol que ya no se puede asignar. Borrala e invitá de nuevo.',
    };
  }

  let empleadoId: string | null = inv.empleadoId;
  if (empleadoId) {
    if (!args.empleado || args.empleado.id !== empleadoId) {
      return {
        ok: false,
        status: 400,
        error:
          'El colaborador de la invitación ya no existe. Corregí la invitación o invitá de nuevo sin vincular legajo.',
      };
    }
    if (args.empleado.empresaId !== args.empresaId) {
      return {
        ok: false,
        status: 400,
        error: 'El colaborador no pertenece a esta empresa.',
      };
    }
    if (args.emailOcupandoLegajo) {
      return {
        ok: false,
        status: 400,
        error: `Ese colaborador ya tiene cuenta (${args.emailOcupandoLegajo}). Desvinculala primero, o borrá esta cuenta a medias si sobra.`,
      };
    }
  } else {
    empleadoId = null;
  }

  return {
    ok: true,
    datos: {
      email,
      nombreCompleto: inv.nombreCompleto.trim() || email,
      rol: inv.rol,
      empresaId: args.empresaId,
      empleadoId,
    },
  };
};

/**
 * Una cuenta Auth sin perfil sólo se lista como "a medias" si hay
 * invitación confiable de esta empresa. Metadata `empresa_id` no cuenta.
 */
export const cuentaSinPerfilEsDeLaEmpresa = (args: {
  tienePerfil: boolean;
  invitacionDeLaEmpresa: boolean;
}): boolean => !args.tienePerfil && args.invitacionDeLaEmpresa;

/**
 * Datos para rehacer una invitación: perfil existente o invitación
 * registrada. Nunca metadata del Auth user.
 */
export type ResultadoReenvio =
  | {
      ok: true;
      datos: {
        nombreCompleto: string;
        rol: RolInvitable;
        empleadoId: string | null;
      };
    }
  | { ok: false; status: 400; error: string };

export const datosParaReenviarInvitacion = (args: {
  perfil: {
    rol: string;
    empleado_id: string | null;
    nombre_completo: string;
  } | null;
  invitacion: InvitacionConfiable | null;
  emailFallback: string;
}): ResultadoReenvio => {
  if (args.perfil) {
    if (!esRolInvitable(args.perfil.rol)) {
      return {
        ok: false,
        status: 400,
        error:
          'Esa cuenta tiene un rol que no se puede reinvitar por acá. Revisala con soporte.',
      };
    }
    return {
      ok: true,
      datos: {
        nombreCompleto: args.perfil.nombre_completo || args.emailFallback,
        rol: args.perfil.rol,
        empleadoId: args.perfil.empleado_id,
      },
    };
  }

  if (!args.invitacion || !esRolInvitable(args.invitacion.rol)) {
    return {
      ok: false,
      status: 400,
      error:
        'No hay una invitación registrada para rehacer. Invitá a esa persona de nuevo desde “Invitar usuario”.',
    };
  }

  return {
    ok: true,
    datos: {
      nombreCompleto:
        args.invitacion.nombreCompleto.trim() || args.emailFallback,
      rol: args.invitacion.rol,
      empleadoId: args.invitacion.empleadoId,
    },
  };
};
