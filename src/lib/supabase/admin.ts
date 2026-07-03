import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente administrativo (clave secret, saltea RLS).
 * SOLO puede importarse desde código de servidor: 'server-only'
 * rompe el build si alguien lo importa en un componente cliente.
 */
export const supabaseAdmin = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !clave) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en .env.local'
    );
  }
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
