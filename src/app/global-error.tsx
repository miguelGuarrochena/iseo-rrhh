'use client';

import { useEffect } from 'react';

/**
 * Último recurso: captura errores que ocurran en el layout raíz (fuera del
 * alcance de app/error.tsx). Debe traer sus propios <html>/<body>.
 */
const GlobalError = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => {
  useEffect(() => {
    console.error('Error global:', error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily:
            "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          background: '#f1f4fa',
          color: '#2f2e3a',
          textAlign: 'center',
          padding: '1.5rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
          Se produjo un error inesperado
        </h1>
        <p style={{ maxWidth: '28rem', color: '#7e7c8c', margin: 0 }}>
          Volvé a intentar. Si el problema continúa, comunicate con ISEO RH.
        </p>
        <button
          onClick={() => reset()}
          style={{
            cursor: 'pointer',
            border: 'none',
            borderRadius: '0.75rem',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
            padding: '0.65rem 1.25rem',
            fontSize: '0.875rem',
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
};

export default GlobalError;
