'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconLockCheck } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { Boton } from '@/components/app/ui/Boton';
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';

const campoClase =
  'rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600';

/**
 * Acá cae el link del email (invitación o recuperación): la sesión
 * viene en la URL y la persona define su contraseña.
 */
const CrearContrasenaPage = () => {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [linkValido, setLinkValido] = useState(false);
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!supabaseConfigurado()) {
      setListo(true);
      return;
    }
    // supabase-js procesa el token del hash de la URL automáticamente;
    // esperamos a que la sesión esté disponible.
    let intentos = 0;
    const esperar = window.setInterval(() => {
      void supabase()
        .auth.getSession()
        .then(({ data }) => {
          intentos += 1;
          if (data.session) {
            setLinkValido(true);
            setListo(true);
            window.clearInterval(esperar);
          } else if (intentos > 6) {
            setListo(true);
            window.clearInterval(esperar);
          }
        });
    }, 500);
    return () => window.clearInterval(esperar);
  }, []);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('La contraseña necesita al menos 8 caracteres.');
      return;
    }
    if (password !== repetir) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setError(null);
    setEnviando(true);
    const { error: errorSupabase } = await supabase().auth.updateUser({
      password,
    });
    setEnviando(false);
    if (errorSupabase) {
      setError(errorSupabase.message);
      return;
    }
    router.push('/app');
  };

  return (
    <main className="app-scope bg-app flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 sm:p-10">
        <Logo size="md" />

        {!listo && (
          <p className="mt-6 text-sm text-ink-soft">Verificando el link…</p>
        )}

        {listo && !linkValido && (
          <>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">
              El link no es válido
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Puede haber vencido o ya fue usado. Pedí uno nuevo desde &quot;¿La
              olvidaste?&quot; en el login, o contactá a quien te invitó.
            </p>
            <Link href="/login" className="mt-6 inline-block no-underline">
              <Boton type="button" variante="secundario">
                Ir al login
              </Boton>
            </Link>
          </>
        )}

        {listo && linkValido && (
          <>
            <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
              <IconLockCheck size={26} className="text-brand-600" />
              Creá tu contraseña
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Con esta contraseña vas a entrar a ISEO RH de ahora en más.
            </p>

            <form onSubmit={guardar} className="mt-7 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-ink">
                  Nueva contraseña
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  className={campoClase}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-ink">
                  Repetila para confirmar
                </span>
                <input
                  type="password"
                  value={repetir}
                  onChange={(e) => setRepetir(e.target.value)}
                  autoComplete="new-password"
                  className={campoClase}
                />
              </label>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Boton
                type="submit"
                variante="negro"
                disabled={enviando}
                className="mt-1 py-3.5 text-base"
              >
                {enviando ? 'Guardando…' : 'Guardar y entrar'}
              </Boton>
            </form>
          </>
        )}
      </div>
    </main>
  );
};

export default CrearContrasenaPage;
