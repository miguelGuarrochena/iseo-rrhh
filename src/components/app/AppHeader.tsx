'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Menu, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconBell,
  IconBuildingFactory2,
  IconDeviceMobileDown,
  IconLogout,
  IconLogout2,
  IconMoon,
  IconSun,
  IconUserCog,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  getNotificaciones,
  marcarNotificacionesLeidas,
} from '@/lib/services/rrhh';
import { BuscadorGlobal } from './BuscadorGlobal';
import { InstalarAppModal } from './InstalarAppModal';
import { Notificacion, Rol } from '@/types/rrhh';
import { useCarga } from '@/lib/useCarga';

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
  const { usuario, logout, empresaVista, salirDeEmpresa } = useAuth();
  const router = useRouter();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [instalarAbierto, { open: abrirInstalar, close: cerrarInstalar }] =
    useDisclosure(false);
  // La campanita: si falla, el resto del header anda igual.
  const cNotis = useCarga(() => getNotificaciones(usuario!.id), [usuario], {
    activo: Boolean(usuario),
    contexto: 'header/notificaciones',
    inicial: [] as Notificacion[],
  });
  const notificaciones = cNotis.datos;

  /**
   * La campana se refresca sola cada tanto. Antes se pedía una sola vez
   * al montar: un aviso que llegaba mientras la persona estaba adentro
   * de la app no aparecía hasta recargar la página, y uno que se apagaba
   * al leer la conversación seguía contando.
   */
  const recargarNotis = cNotis.recargar;
  useEffect(() => {
    if (!usuario) return;
    const id = window.setInterval(recargarNotis, 60_000);
    return () => window.clearInterval(id);
  }, [usuario, recargarNotis]);

  if (!usuario) return null;

  const sinLeer = notificaciones.filter((n) => !n.leida).length;

  /** Al abrir la campana se marcan leídas (el badge se apaga). */
  const alAbrirCampana = (abierta: boolean) => {
    if (!abierta || sinLeer === 0) return;
    void marcarNotificacionesLeidas(usuario.id).then(() =>
      // El servidor ya las marcó: alcanza con reflejarlo acá.
      cNotis.actualizar(notificaciones.map((n) => ({ ...n, leida: true })))
    );
  };

  const oscuro = colorScheme === 'dark';

  const subtitulo = empresaVista
    ? `${etiquetaRol[usuario.rol]} · ${empresaVista.nombre}`
    : etiquetaRol[usuario.rol];

  const cerrarSesion = () => {
    logout();
    router.replace('/login');
  };

  /**
   * Entrar y salir de una empresa vivía sólo en el menú lateral, que
   * abajo de `lg` no existe. En una tablet o un celular el dueño de ISEO
   * entraba a un cliente y quedaba encerrado: su rol pasa a ser el de
   * admin de esa empresa, así que "Empresas" también desaparece de la
   * barra de abajo. El menú del avatar está en todos los tamaños, y por
   * eso la salida vive acá —y también como control visible, porque
   * esconderla detrás del avatar era lo mismo que no tenerla.
   */
  const esSuperadmin = usuario.rol === 'superadmin';
  const salirDeLaEmpresa = () => {
    salirDeEmpresa();
    router.push('/empresas');
  };

  return (
    <header className="cabecera-app sticky top-0 z-30 px-4 pb-3 pt-3 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface/85 px-3 py-2 shadow-sm backdrop-blur-md sm:gap-3 sm:px-4 sm:py-2.5">
        {/* `flex-1` y no `shrink-0`: con un nombre largo en un celular
            angosto, un bloque que no se encoge empuja los botones fuera
            de la pantalla en vez de recortarse. */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {usuario.nombreCompleto}
          </p>
          {esSuperadmin && empresaVista ? (
            <button
              type="button"
              onClick={salirDeLaEmpresa}
              className="mt-0.5 flex min-h-8 max-w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-xs font-semibold text-brand-700"
            >
              <IconArrowLeft size={14} className="shrink-0" />
              <span className="truncate">Salir de {empresaVista.nombre}</span>
            </button>
          ) : (
            <p className="truncate text-xs text-ink-soft">{subtitulo}</p>
          )}
        </div>

        <BuscadorGlobal />

        <div className="flex shrink-0 items-center gap-2">
          {/* En un celular angosto cuatro controles no entran sin comerse
              el nombre. El tema se cambia una vez y no se toca más: abajo
              de `sm` se accede desde el menú del avatar, que lo ofrece en
              todos los tamaños. */}
          <button
            aria-label="Cambiar tema"
            onClick={() => setColorScheme(oscuro ? 'light' : 'dark')}
            className="presionable hidden h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-soft hover:bg-paper hover:text-ink sm:flex"
          >
            {oscuro ? (
              <IconSun size={20} stroke={1.8} />
            ) : (
              <IconMoon size={20} stroke={1.8} />
            )}
          </button>
          <Menu
            position="bottom-end"
            radius="lg"
            shadow="md"
            width={320}
            onChange={alAbrirCampana}
          >
            <Menu.Target>
              <button
                aria-label="Notificaciones"
                className="presionable relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-soft hover:bg-paper hover:text-ink"
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
                className="presionable flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0"
              >
                <Avatar color="brand" radius="xl" size={40}>
                  {iniciales(usuario.nombreCompleto)}
                </Avatar>
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{usuario.email}</Menu.Label>
              {esSuperadmin && (
                <>
                  <Menu.Label>
                    {empresaVista
                      ? `Estás dentro de ${empresaVista.nombre}`
                      : 'Sin empresa elegida'}
                  </Menu.Label>
                  {empresaVista ? (
                    <Menu.Item
                      leftSection={<IconLogout2 size={16} />}
                      onClick={salirDeLaEmpresa}
                    >
                      Salir de la empresa
                    </Menu.Item>
                  ) : (
                    <Menu.Item
                      leftSection={<IconBuildingFactory2 size={16} />}
                      onClick={() => router.push('/empresas')}
                    >
                      Elegir una empresa
                    </Menu.Item>
                  )}
                  <Menu.Divider />
                </>
              )}
              <Menu.Item
                leftSection={<IconUserCog size={16} />}
                onClick={() => router.push('/mi-cuenta')}
              >
                Mi cuenta
              </Menu.Item>
              <Menu.Item
                leftSection={
                  oscuro ? <IconSun size={16} /> : <IconMoon size={16} />
                }
                onClick={() => setColorScheme(oscuro ? 'light' : 'dark')}
              >
                {oscuro ? 'Tema claro' : 'Tema oscuro'}
              </Menu.Item>
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
