'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconArrowLeft,
  IconBeach,
  IconClockCheck,
  IconFileCertificate,
} from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { Boton } from '@/components/app/ui/Boton';
import { CampoPassword } from '@/components/app/ui/CampoPassword';
import { useAuth } from '@/lib/auth/AuthProvider';

/** En el subdominio de la app, "volver al sitio" va al dominio de marketing. */
const urlSitio = (): string =>
  typeof window !== 'undefined' && window.location.hostname.startsWith('app.')
    ? 'https://iseo-rh.com'
    : '/';

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
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700/90 via-brand-800/85 to-ink/90" />
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

      {/* Formulario */}
      <div className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <a
            href={urlSitio()}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft no-underline transition-colors hover:text-ink"
          >
            <IconArrowLeft size={16} />
            Volver al sitio
          </a>

          <div className="rounded-3xl border border-line bg-surface p-8 sm:p-10">
            <Logo size="md" />

            <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">
              Ingresá a tu cuenta
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Gestioná tu equipo, tus ausencias y tus recibos desde un solo
              lugar.
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
      </div>
    </main>
  );
};

export default LoginPage;
