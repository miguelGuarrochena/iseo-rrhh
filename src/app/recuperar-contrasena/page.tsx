'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { IconArrowLeft, IconMailForward } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { Boton } from '@/components/app/ui/Boton';
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';
import { validarEmail, validarRequerido } from '@/lib/validaciones';

const RecuperarContrasenaPage = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const invalido = validarRequerido(email, 'El email') ?? validarEmail(email);
    if (invalido) {
      setError(invalido);
      return;
    }
    setError(null);
    if (!supabaseConfigurado()) {
      setError('La recuperación va a estar disponible con el lanzamiento.');
      return;
    }
    setEnviando(true);
    await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/crear-contrasena`,
    });
    setEnviando(false);
    // Siempre mostramos éxito: no revelamos si el email existe o no.
    setEnviado(true);
  };

  return (
    <main className="app-scope bg-app flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft no-underline transition-colors hover:text-ink"
        >
          <IconArrowLeft size={16} />
          Volver al login
        </Link>

        <div className="rounded-3xl border border-line bg-surface p-8 sm:p-10">
          <Logo size="md" />

          {enviado ? (
            <>
              <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
                <IconMailForward size={26} className="text-brand-600" />
                Revisá tu correo
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Si <strong className="text-ink">{email}</strong> tiene una
                cuenta, le enviamos un link para crear una contraseña nueva.
                Mirá también la carpeta de spam.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">
                Recuperá tu contraseña
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Te mandamos un link por email para que crees una nueva.
              </p>

              <form onSubmit={enviar} className="mt-7 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-ink">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@empresa.com"
                    autoComplete="email"
                    className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
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
                  {enviando ? 'Enviando…' : 'Enviarme el link'}
                </Boton>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default RecuperarContrasenaPage;
