'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getEmpresa } from '@/lib/services/rrhh';

/**
 * Módulos encendidos/apagados de la empresa activa, para que la
 * navegación esconda las secciones que la empresa no usa.
 *
 * Lo consultan a la vez el sidebar, la barra inferior y el buscador, así
 * que la config se busca una sola vez y se comparte. Cuando alguien
 * guarda Configuración se refresca y las tres se enteran solas, sin que
 * haya que recargar la página.
 */
const cache = new Map<string, Record<string, boolean>>();
const suscriptores = new Set<() => void>();

const avisar = (): void => suscriptores.forEach((f) => f());

/** Guarda lo leído y despierta a quien esté escuchando. */
const guardar = (empresaId: string, modulos: Record<string, boolean>): void => {
  cache.set(empresaId, modulos);
  avisar();
};

/** Vuelve a leer la config de la empresa (tras guardar Configuración). */
export const olvidarModulos = (empresaId: string): void => {
  cache.delete(empresaId);
  avisar();
};

export const useModulos = (): Record<string, boolean> | undefined => {
  const { usuario, empresaVista } = useAuth();
  const empresaId = empresaVista?.id ?? usuario?.empresaId ?? null;
  const [, refrescar] = useState(0);

  useEffect(() => {
    const escuchar = () => refrescar((n) => n + 1);
    suscriptores.add(escuchar);
    return () => {
      suscriptores.delete(escuchar);
    };
  }, []);

  useEffect(() => {
    if (!empresaId || cache.has(empresaId)) return;
    // Si el superadmin entró a una empresa, la config ya viaja con ella.
    if (empresaVista?.config) {
      guardar(empresaId, empresaVista.config.modulos ?? {});
      return;
    }
    void getEmpresa()
      .then((e) => guardar(empresaId, e.config?.modulos ?? {}))
      // Si falla, no se esconde nada: mejor mostrar de más que dejar a
      // alguien sin acceso a una sección por un error de red.
      .catch(() => guardar(empresaId, {}));
  }, [empresaId, empresaVista]);

  return empresaId ? cache.get(empresaId) : undefined;
};
