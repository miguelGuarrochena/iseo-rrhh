'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle } from '@tabler/icons-react';

/**
 * Red de seguridad de la plataforma: si una pantalla lanza un error
 * inesperado (una consulta que falla, un dato mal formado, etc.), en vez
 * de dejar la pantalla en blanco mostramos un mensaje claro y la opción
 * de reintentar. Así una falla puntual no deja a la empresa "sin acceso".
 */
const AppError = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => {
  const router = useRouter();

  useEffect(() => {
    // Deja rastro en consola para diagnóstico (y a futuro, un logger).
    console.error('Error en la app:', error);
  }, [error]);

  return (
    <div className="app-scope bg-app flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <IconAlertTriangle size={32} />
      </span>
      <div>
        <h1 className="text-xl font-bold text-ink">
          Algo no salió como esperábamos
        </h1>
        <p className="mt-2 max-w-md text-sm text-ink-soft">
          Fue un problema puntual, no perdiste nada. Probá de nuevo; si sigue
          pasando, avisá a ISEO RH.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="cursor-pointer rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700"
        >
          Reintentar
        </button>
        <button
          onClick={() => router.push('/')}
          className="cursor-pointer rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:border-brand-300"
        >
          Ir al inicio
        </button>
      </div>
    </div>
  );
};

export default AppError;
