'use client';

import { ReactNode, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/app/RequireAuth';
import { Sidebar } from '@/components/app/Sidebar';
import { BottomNav } from '@/components/app/BottomNav';
import { AppHeader } from '@/components/app/AppHeader';
import { ModoKiosco } from '@/components/app/fichaje/ModoKiosco';
import { RedDeSeguridad } from '@/components/app/RedDeSeguridad';
import { kioscoActivo } from '@/lib/kiosco';
import { liberarModelosFaciales } from '@/lib/facial/motor';

const AppLayout = ({ children }: { children: ReactNode }) => {
  // Tablet bloqueada como terminal de fichaje: se muestra SOLO el
  // kiosco, sin navegación ni datos de la sesión que lo activó.
  const [kiosco, setKiosco] = useState<boolean | null>(null);
  useEffect(() => {
    setKiosco(kioscoActivo());
  }, []);

  /**
   * Los modelos faciales viven mientras dura la sesión, no mientras dura
   * la pantalla de fichaje.
   *
   * Cargarlos cuesta casi un segundo entre bajar 10 MB de pesos y
   * compilar los shaders de WebGL, y en el kiosco esa pantalla se abre y
   * se cierra decenas de veces por turno: soltarlos en cada cierre haría
   * que cada persona de la fila pagara de nuevo el arranque.
   *
   * Al salir de la app —cerrar sesión, volver al login— sí se sueltan:
   * no hay motivo para dejar un modelo biométrico y un Worker residentes
   * en una tablet compartida después de que la sesión terminó.
   */
  useEffect(() => () => liberarModelosFaciales(), []);

  if (kiosco === null) return null; // evita mostrar la app antes de saber

  if (kiosco) {
    return (
      <RequireAuth>
        <ModoKiosco onSalir={() => setKiosco(false)} />
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <RedDeSeguridad />
      <div className="app-scope bg-app min-h-screen overflow-x-clip">
        <Sidebar />
        <div className="min-w-0 lg:pl-64">
          <AppHeader />
          <main className="mx-auto min-w-0 max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </RequireAuth>
  );
};

export default AppLayout;
