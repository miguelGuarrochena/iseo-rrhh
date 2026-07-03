'use client';

import { ReactNode } from 'react';
import { RequireAuth } from '@/components/app/RequireAuth';
import { Sidebar } from '@/components/app/Sidebar';
import { BottomNav } from '@/components/app/BottomNav';
import { AppHeader } from '@/components/app/AppHeader';

const AppLayout = ({ children }: { children: ReactNode }) => (
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

export default AppLayout;
