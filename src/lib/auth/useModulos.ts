'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getEmpresa } from '@/lib/services/rrhh';

/**
 * Qué ve cada empresa: los módulos que tiene encendidos y los servicios
 * que tiene contratados.
 *
 * Los dos salen de la misma fila de `empresas`, así que se leen y se
 * cachean juntos: lo consultan a la vez el sidebar, la barra inferior y
 * el buscador, y antes de esto una segunda consulta habría duplicado
 * todos esos pedidos. Cuando alguien guarda Configuración (o ISEO cambia
 * los servicios de un cliente) se refresca y todas se enteran solas, sin
 * recargar la página.
 *
 * Ojo con el default de cada uno, que es opuesto a propósito:
 *   - módulo ausente  = ENCENDIDO (la empresa lo tiene y puede apagarlo).
 *   - servicio ausente = NO CONTRATADO (no lo tiene hasta que ISEO lo dé).
 */
interface Capacidades {
  modulos: Record<string, boolean>;
  servicios: Record<string, boolean>;
}

const cache = new Map<string, Capacidades>();
const suscriptores = new Set<() => void>();

const avisar = (): void => suscriptores.forEach((f) => f());

/** Guarda lo leído y despierta a quien esté escuchando. */
const guardar = (empresaId: string, capacidades: Capacidades): void => {
  cache.set(empresaId, capacidades);
  avisar();
};

/**
 * Vuelve a leer la config de la empresa (tras guardar Configuración o
 * tras cambiar los servicios de un cliente desde ISEO).
 */
export const olvidarModulos = (empresaId: string): void => {
  cache.delete(empresaId);
  avisar();
};

/** Lo mismo, con el nombre que corresponde cuando lo que cambió es un servicio. */
export const olvidarCapacidades = olvidarModulos;

const useCapacidades = (): Capacidades | undefined => {
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
      guardar(empresaId, {
        modulos: empresaVista.config.modulos ?? {},
        servicios: empresaVista.servicios ?? {},
      });
      return;
    }
    void getEmpresa()
      .then((e) =>
        guardar(empresaId, {
          modulos: e.config?.modulos ?? {},
          servicios: e.servicios ?? {},
        })
      )
      /*
       * Si falla, no se esconde ningún módulo: mejor mostrar de más que
       * dejar a alguien sin acceso a una sección por un error de red.
       *
       * Con los servicios es al revés y también por lo mismo: sin
       * respuesta no se puede afirmar que la empresa contrató la
       * asesoría, así que queda sin contratar. El default de cada uno es
       * el que hace menos daño cuando no se sabe.
       */
      .catch(() => guardar(empresaId, { modulos: {}, servicios: {} }));
  }, [empresaId, empresaVista]);

  return empresaId ? cache.get(empresaId) : undefined;
};

/** Módulos encendidos de la empresa activa. `undefined` = todavía no se sabe. */
export const useModulos = (): Record<string, boolean> | undefined =>
  useCapacidades()?.modulos;

/** Servicios contratados de la empresa activa. `undefined` = todavía no se sabe. */
export const useServicios = (): Record<string, boolean> | undefined =>
  useCapacidades()?.servicios;
