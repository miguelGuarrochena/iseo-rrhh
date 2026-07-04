'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { DemoUserPicker } from '@/components/login/DemoUserPicker';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Demo pública: entra con datos de ejemplo (mocks), sin tocar la base
 * real. Pensada para mostrar la plataforma a clientes potenciales.
 */
const DemoPage = () => {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ingresar = async (email: string) => {
    setError(null);
    setEnviando(true);
    const usuario = await login(email); // sin contraseña → modo demo
    setEnviando(false);
    if (!usuario) {
      setError('No pudimos iniciar la demo. Probá de nuevo.');
      return;
    }
    router.push('/app');
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
            Probá ISEO RH
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Una empresa de ejemplo con datos ficticios para que recorras la
            plataforma desde cada rol. Nada de lo que hagas acá queda guardado.
          </p>

          <div className="mt-6">
            <DemoUserPicker onElegir={ingresar} deshabilitado={enviando} />
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <p className="mt-6 text-xs leading-relaxed text-ink-soft">
            ¿Ya tenés cuenta?{' '}
            <Link
              href="/login"
              className="font-semibold text-brand-700 no-underline hover:underline"
            >
              Ingresá acá
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
};

export default DemoPage;
