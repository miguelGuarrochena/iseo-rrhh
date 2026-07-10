'use client';

import { ReactNode, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/app/RequireAuth';
import { Sidebar } from '@/components/app/Sidebar';
import { BottomNav } from '@/components/app/BottomNav';
import { AppHeader } from '@/components/app/AppHeader';
import { ModoKiosco } from '@/components/app/fichaje/ModoKiosco';
import { kioscoActivo } from '@/lib/kiosco';

const AppLayout = ({ children }: { children: ReactNode }) => {
  // Tablet bloqueada como terminal de fichaje: se muestra SOLO el
  // kiosco, sin navegación ni datos de la sesión que lo activó.
  const [kiosco, setKiosco] = useState<boolean | null>(null);
  useEffect(() => {
    setKiosco(kioscoActivo());
  }, []);

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
      <div className="app-scope bg-app min-h-screen">
        <Sidebar />
        <div className="lg:pl-64">
          <AppHeader />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </RequireAuth>
  );
};

export default AppLayout;
