'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Menu, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBell,
  IconDeviceMobileDown,
  IconLogout,
  IconMoon,
  IconSun,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getNotificaciones } from '@/lib/services/rrhh';
import { BuscadorGlobal } from './BuscadorGlobal';
import { InstalarAppModal } from './InstalarAppModal';
import { Notificacion, Rol } from '@/types/rrhh';

const etiquetaRol: Record<Rol, string> = {
  superadmin: 'Superadmin',
  admin_rrhh: 'Admin RRHH',
  supervisor: 'Supervisor',
  empleado: 'Empleado',
};

const iniciales = (nombreCompleto: string): string =>
  nombreCompleto
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * Barra superior de la app: notificaciones y menú de usuario.
 */
export const AppHeader = () => {
  const { usuario, logout, empresaVista } = useAuth();
  const router = useRouter();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [instalarAbierto, { open: abrirInstalar, close: cerrarInstalar }] =
    useDisclosure(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);

  useEffect(() => {
    if (usuario) void getNotificaciones(usuario.id).then(setNotificaciones);
  }, [usuario]);

  if (!usuario) return null;

  const sinLeer = notificaciones.filter((n) => !n.leida).length;

  const oscuro = colorScheme === 'dark';

  const subtitulo = empresaVista
    ? `${etiquetaRol[usuario.rol]} · ${empresaVista.nombre}`
    : etiquetaRol[usuario.rol];

  const cerrarSesion = () => {
    logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-30 px-4 pt-3 sm:px-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface/80 px-4 py-2.5 backdrop-blur-md sm:px-5">
        <div className="min-w-0 shrink-0">
          <p className="truncate text-sm font-semibold text-ink">
            {usuario.nombreCompleto}
          </p>
          <p className="text-xs text-ink-soft">{subtitulo}</p>
        </div>

        <BuscadorGlobal />

        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="Cambiar tema"
            onClick={() => setColorScheme(oscuro ? 'light' : 'dark')}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-soft transition-colors hover:bg-paper hover:text-ink"
          >
            {oscuro ? (
              <IconSun size={20} stroke={1.8} />
            ) : (
              <IconMoon size={20} stroke={1.8} />
            )}
          </button>
          <Menu position="bottom-end" radius="lg" shadow="md" width={320}>
            <Menu.Target>
              <button
                aria-label="Notificaciones"
                className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-soft transition-colors hover:bg-paper hover:text-ink"
              >
                <IconBell size={20} stroke={1.8} />
                {sinLeer > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[0.6rem] font-bold text-white">
                    {sinLeer}
                  </span>
                )}
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Notificaciones</Menu.Label>
              {notificaciones.length === 0 ? (
                <Menu.Item disabled>Sin notificaciones.</Menu.Item>
              ) : (
                notificaciones.slice(0, 6).map((n) => (
                  <Menu.Item
                    key={n.id}
                    onClick={() => n.link && router.push(n.link)}
                  >
                    <span className="block text-sm font-semibold text-ink">
                      {n.titulo}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {n.cuerpo}
                    </span>
                  </Menu.Item>
                ))
              )}
            </Menu.Dropdown>
          </Menu>

          <Menu position="bottom-end" radius="lg" shadow="md">
            <Menu.Target>
              <button
                aria-label="Menú de usuario"
                className="cursor-pointer rounded-full border-0 bg-transparent p-0"
              >
                <Avatar color="brand" radius="xl" size={40}>
                  {iniciales(usuario.nombreCompleto)}
                </Avatar>
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{usuario.email}</Menu.Label>
              <Menu.Item
                leftSection={<IconDeviceMobileDown size={16} />}
                onClick={abrirInstalar}
              >
                Instalar app
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLogout size={16} />}
                onClick={cerrarSesion}
              >
                Cerrar sesión
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>

      <InstalarAppModal abierto={instalarAbierto} onCerrar={cerrarInstalar} />
    </header>
  );
};
