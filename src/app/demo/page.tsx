'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconBeach,
  IconClockCheck,
  IconFileCertificate,
} from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { DemoUserPicker } from '@/components/login/DemoUserPicker';
import { useAuth } from '@/lib/auth/AuthProvider';

const ventajas = [
  {
    icono: IconClockCheck,
    texto: 'Fichaje, horas y llegadas tarde al instante',
  },
  {
    icono: IconBeach,
    texto: 'Vacaciones y licencias con aprobación en un click',
  },
  {
    icono: IconFileCertificate,
    texto: 'Recibos firmados y guardados, sin papeles',
  },
];

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
    router.push('/');
  };

  return (
    <main className="app-scope bg-app min-h-screen lg:grid lg:grid-cols-2">
      {/* Panel de marca (solo desktop) */}
      <aside className="relative hidden overflow-hidden lg:block">
        <Image
          src="/images/rrhh-1.jpg"
          alt="Equipo de trabajo"
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/45 to-ink/25" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <p className="text-2xl font-extrabold tracking-tight">
            ISEO <span className="text-brand-200">RH</span>
          </p>

          <div className="max-w-md">
            <h2 className="text-balance text-4xl font-extrabold leading-tight">
              Tu equipo, con orden y claridad.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/80">
              El área de Recursos Humanos de tu empresa, en un solo lugar.
            </p>
            <ul className="mt-8 flex flex-col gap-4">
              {ventajas.map(({ icono: Icono, texto }) => (
                <li key={texto} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Icono size={18} stroke={1.9} />
                  </span>
                  <span className="text-[0.95rem] text-white/90">{texto}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-white/50">
            © {new Date().getFullYear()} ISEO RH
          </p>
        </div>
      </aside>

      {/* Selector de demo */}
      <div className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-line bg-surface p-8 sm:p-10">
            <Logo size="md" />

            <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">
              Probá ISEO RH
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Una empresa de ejemplo con datos ficticios para que recorras la
              plataforma desde cada rol. Nada de lo que hagas acá queda
              guardado.
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
      </div>
    </main>
  );
};

export default DemoPage;
