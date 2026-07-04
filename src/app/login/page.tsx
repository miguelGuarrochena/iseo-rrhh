'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { Boton } from '@/components/app/ui/Boton';
import { CampoPassword } from '@/components/app/ui/CampoPassword';
import { useAuth } from '@/lib/auth/AuthProvider';

const LoginPage = () => {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ingresar = async (emailElegido: string, passwordElegida?: string) => {
    setError(null);
    setEnviando(true);
    let usuario = null;
    try {
      usuario = await login(emailElegido, passwordElegida);
    } catch (err) {
      setEnviando(false);
      setError(err instanceof Error ? err.message : 'No pudimos ingresar.');
      return;
    }
    setEnviando(false);
    if (!usuario) {
      setError(
        passwordElegida
          ? 'Email o contraseña incorrectos.'
          : 'No encontramos una cuenta con ese email.'
      );
      return;
    }
    router.push('/app');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Ingresá tu email.');
      return;
    }
    void ingresar(email, password || undefined);
  };

  return (
    <main className="app-scope bg-app flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft no-underline transition-colors hover:text-ink"
        >
          <IconArrowLeft size={16} />
          Volver al sitio
        </Link>

        <div className="rounded-3xl border border-line bg-surface p-8 sm:p-10">
          <Logo size="md" />

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">
            Ingresá a tu cuenta
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Gestioná tu equipo, tus ausencias y tus recibos desde un solo lugar.
          </p>

          <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
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

            <label className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-ink">
                  Contraseña
                </span>
                <Link
                  href="/recuperar-contrasena"
                  className="text-xs font-semibold text-brand-700 no-underline hover:text-brand-600 hover:underline"
                >
                  ¿La olvidaste?
                </Link>
              </div>
              <CampoPassword
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <Boton
              type="submit"
              disabled={enviando}
              className="mt-1 py-3.5 text-base"
            >
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </Boton>
          </form>
        </div>
      </div>
    </main>
  );
};

export default LoginPage;
