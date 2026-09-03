import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A qué dirección se le manda un mail a alguien de la plataforma.
 *
 * La autoridad es `auth.users.email`: es con lo que esa persona entra y lo
 * que Supabase usa para la invitación y la recuperación de contraseña.
 * `usuarios.email` es su espejo —lo escribe la API de invitaciones y lo
 * mantiene al día el cambio de email— pero es una copia, y una copia se
 * puede quedar vieja: mientras el cambio de email no existió, editar la
 * ficha dejaba los avisos yendo a la dirección de prueba original.
 *
 * Por eso los avisos se resuelven contra Auth y sólo caen al perfil si esa
 * consulta no responde. Así, aunque queden filas desincronizadas de antes,
 * el mail llega a donde la persona realmente puede entrar.
 */

/** Email con el que entra ese usuario, o el del perfil si Auth no responde. */
export const emailVigenteDeUsuario = async (
  admin: SupabaseClient,
  usuarioId: string,
  emailDelPerfil?: string | null
): Promise<string | null> => {
  try {
    const { data } = await admin.auth.admin.getUserById(usuarioId);
    if (data?.user?.email) return data.user.email;
  } catch {
    // Auth caído o id que ya no existe: se usa el espejo, que es lo mejor
    // que hay. Un aviso que no sale es peor que uno que sale al espejo.
  }
  return emailDelPerfil ?? null;
};

/** Email del usuario dueño de un legajo. Vacío si no tiene cuenta. */
export const emailDeEmpleado = async (
  admin: SupabaseClient,
  empleadoId: string
): Promise<string[]> => {
  const { data } = await admin
    .from('usuarios')
    .select('id, email')
    .eq('empleado_id', empleadoId)
    .maybeSingle();
  if (!data?.id) return [];
  const email = await emailVigenteDeUsuario(
    admin,
    data.id as string,
    data.email as string | null
  );
  return email ? [email] : [];
};

/** Emails de los admin de RRHH de una empresa. */
export const emailsDeAdmins = async (
  admin: SupabaseClient,
  empresaId: string
): Promise<string[]> => {
  const { data } = await admin
    .from('usuarios')
    .select('id, email')
    .eq('empresa_id', empresaId)
    .eq('rol', 'admin_rrhh');
  const emails = await Promise.all(
    (data ?? []).map((u) =>
      emailVigenteDeUsuario(admin, u.id as string, u.email as string | null)
    )
  );
  return emails.filter((e): e is string => Boolean(e));
};
