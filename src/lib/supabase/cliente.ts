import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase para el navegador (clave publishable + RLS).
 * Lazy: se crea recién al usarse, así el build no exige las env vars.
 */
let instancia: SupabaseClient | null = null;

export const supabase = (): SupabaseClient => {
  if (instancia) return instancia;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local'
    );
  }
  instancia = createClient(url, clave);
  return instancia;
};
