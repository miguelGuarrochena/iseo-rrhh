import type { SupabaseClient } from '@supabase/supabase-js';
import {
  esRolInvitable,
  normalizarEmail,
  type InvitacionConfiable,
  type RolInvitable,
} from '@/lib/api/invitacionConfianza';

type FilaInvitacion = {
  email: string;
  empresa_id: string;
  rol: string;
  nombre_completo: string;
  empleado_id: string | null;
  auth_user_id: string | null;
};

export const aInvitacionConfiable = (
  fila: FilaInvitacion
): InvitacionConfiable => ({
  email: fila.email,
  empresaId: fila.empresa_id,
  rol: fila.rol,
  nombreCompleto: fila.nombre_completo,
  empleadoId: fila.empleado_id,
  authUserId: fila.auth_user_id,
});

/** Lee la invitación confiable de un email en una empresa. */
export const buscarInvitacion = async (
  admin: SupabaseClient,
  empresaId: string,
  email: string
): Promise<InvitacionConfiable | null> => {
  const { data, error } = await admin
    .from('invitaciones')
    .select(
      'email, empresa_id, rol, nombre_completo, empleado_id, auth_user_id'
    )
    .eq('empresa_id', empresaId)
    .eq('email', normalizarEmail(email))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aInvitacionConfiable(data as FilaInvitacion) : null;
};

/** Invitaciones de la empresa (para listar cuentas a medias). */
export const listarInvitacionesDeEmpresa = async (
  admin: SupabaseClient,
  empresaId: string
): Promise<InvitacionConfiable[]> => {
  const { data, error } = await admin
    .from('invitaciones')
    .select(
      'email, empresa_id, rol, nombre_completo, empleado_id, auth_user_id'
    )
    .eq('empresa_id', empresaId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => aInvitacionConfiable(f as FilaInvitacion));
};

export interface DatosRegistroInvitacion {
  email: string;
  empresaId: string;
  rol: RolInvitable;
  nombreCompleto: string;
  empleadoId: string | null;
  authUserId: string;
  creadaPor: string | null;
  /** Si el perfil ya se escribió en el mismo request. */
  perfilCreado: boolean;
}

/**
 * Persiste la invitación emitida por el servidor. Upsert por
 * (empresa_id, email): reinvitar refresca rol/legajo confiables.
 */
export const registrarInvitacion = async (
  admin: SupabaseClient,
  datos: DatosRegistroInvitacion
): Promise<string | null> => {
  if (!esRolInvitable(datos.rol)) {
    return 'Rol de invitación inválido.';
  }
  const ahora = new Date().toISOString();
  const { error } = await admin.from('invitaciones').upsert(
    {
      email: normalizarEmail(datos.email),
      empresa_id: datos.empresaId,
      rol: datos.rol,
      nombre_completo: datos.nombreCompleto || datos.email,
      empleado_id: datos.empleadoId,
      auth_user_id: datos.authUserId,
      creada_por: datos.creadaPor,
      creada_en: ahora,
      perfil_creado_en: datos.perfilCreado ? ahora : null,
    },
    { onConflict: 'empresa_id,email' }
  );
  return error ? error.message : null;
};

export const marcarInvitacionCompletada = async (
  admin: SupabaseClient,
  empresaId: string,
  email: string,
  authUserId: string
): Promise<void> => {
  await admin
    .from('invitaciones')
    .update({
      perfil_creado_en: new Date().toISOString(),
      auth_user_id: authUserId,
    })
    .eq('empresa_id', empresaId)
    .eq('email', normalizarEmail(email));
};

export const borrarInvitacion = async (
  admin: SupabaseClient,
  empresaId: string,
  email: string
): Promise<void> => {
  await admin
    .from('invitaciones')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('email', normalizarEmail(email));
};
