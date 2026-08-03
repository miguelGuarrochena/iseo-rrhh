'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDeviceFloppy,
  IconLayoutGrid,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { avisoError, avisoExito } from '@/lib/avisos';
import { actualizarModulosEmpresa, getEmpresaPorId } from '@/lib/services/rrhh';
import {
  dependenDe,
  MODULOS_OPCIONALES,
  ModuloOpcional,
} from '@/components/app/navItems';
import { Empresa } from '@/types/rrhh';

const etiquetaDe = (clave: ModuloOpcional): string =>
  MODULOS_OPCIONALES.find((m) => m.clave === clave)?.etiqueta ?? clave;

/**
 * Qué secciones usa cada empresa. Es del dueño de ISEO, no del cliente:
 * define el alcance de lo que contrató.
 *
 * Todo arranca prendido a propósito. Apagar es una decisión explícita, y
 * así las empresas que ya venían funcionando no pierden nada cuando se
 * suma un módulo nuevo al catálogo.
 */
const ModulosEmpresaPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { usuario } = useAuth();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [modulos, setModulos] = useState<Record<string, boolean>>({});
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id) return;
    void getEmpresaPorId(id)
      .then((e) => {
        setEmpresa(e);
        // Lo que no figura guardado está prendido: se guarda solo lo
        // apagado, así sumar un módulo nuevo no apaga nada sin querer.
        const guardados = e?.config.modulos ?? {};
        setModulos(
          Object.fromEntries(
            MODULOS_OPCIONALES.map((m) => [
              m.clave,
              guardados[m.clave] !== false,
            ])
          )
        );
      })
      .finally(() => setCargando(false));
  }, [id]);

  const encendido = useCallback(
    (clave: ModuloOpcional) => modulos[clave] !== false,
    [modulos]
  );

  /** Secciones prendidas que quedan a medias por algo que se apagó. */
  const advertencias = useMemo(
    () =>
      MODULOS_OPCIONALES.filter((m) => !encendido(m.clave)).flatMap((apagado) =>
        dependenDe(apagado.clave)
          .filter((dependiente) => encendido(dependiente))
          .map((dependiente) => ({
            apagado: apagado.etiqueta,
            dependiente: etiquetaDe(dependiente),
          }))
      ),
    [encendido]
  );

  const prendidos = MODULOS_OPCIONALES.filter((m) => encendido(m.clave)).length;

  const guardar = async () => {
    if (!id) return;
    setGuardando(true);
    try {
      await actualizarModulosEmpresa(id, modulos);
      avisoExito(
        'Módulos actualizados',
        `${empresa?.nombre ?? 'La empresa'} ve ${prendidos} de ${MODULOS_OPCIONALES.length} secciones.`
      );
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  if (!usuario || usuario.rol !== 'superadmin') {
    return (
      <p className="text-sm text-ink-soft">
        Solo el dueño de la plataforma puede configurar los módulos de una
        empresa.
      </p>
    );
  }

  if (cargando) {
    return <p className="text-sm text-ink-soft">Cargando…</p>;
  }

  if (!empresa) {
    return <p className="text-sm text-ink-soft">No encontramos la empresa.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(`/empresas/${id}`)}
          className="presionable mb-3 inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={16} />
          Volver a {empresa.nombre}
        </button>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
          <IconLayoutGrid size={24} className="text-ink-soft" />
          Módulos de {empresa.nombre}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Qué secciones ve esta empresa. Lo que apagues desaparece del menú para
          todos sus usuarios, pero <strong>no se borra nada</strong>: si lo
          volvés a prender, la información sigue estando.
        </p>
      </div>

      {advertencias.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <IconAlertTriangle size={18} />
            Ojo con estas combinaciones
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {advertencias.map((a) => (
              <li
                key={`${a.apagado}-${a.dependiente}`}
                className="text-xs leading-relaxed text-amber-900"
              >
                <strong>{a.dependiente}</strong> queda incompleta porque{' '}
                <strong>{a.apagado}</strong> está apagada. Podés guardar igual,
                pero conviene apagar las dos o prender las dos.
              </li>
            ))}
          </ul>
        </div>
      )}

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-ink">Secciones</h2>
          <p className="text-sm text-ink-soft">
            {prendidos} de {MODULOS_OPCIONALES.length} prendidas
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          {MODULOS_OPCIONALES.map((m) => {
            const activo = encendido(m.clave);
            const rompe = dependenDe(m.clave).filter((d) => encendido(d));
            return (
              <label
                key={m.clave}
                className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border px-4 py-3.5 transition-[background-color,border-color] duration-150 ${
                  activo
                    ? 'border-line bg-surface hover:border-brand-300'
                    : 'border-line bg-paper/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) =>
                    setModulos((prev) => ({
                      ...prev,
                      [m.clave]: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-bold ${activo ? 'text-ink' : 'text-ink-soft'}`}
                  >
                    {m.etiqueta}
                    {!activo && (
                      <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                        Apagada
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                    {m.descripcion}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft/80">
                    <span className="font-semibold">Cuándo apagarla:</span>{' '}
                    {m.cuandoApagarla}
                  </p>
                  {activo && rompe.length > 0 && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft/80">
                      <span className="font-semibold">Si la apagás:</span>{' '}
                      {rompe.map(etiquetaDe).join(' y ')}{' '}
                      {rompe.length === 1 ? 'queda' : 'quedan'} a medias.
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Boton onClick={() => void guardar()} disabled={guardando}>
            <IconDeviceFloppy size={16} />
            {guardando ? 'Guardando…' : 'Guardar módulos'}
          </Boton>
          <Boton
            variante="secundario"
            onClick={() =>
              setModulos(
                Object.fromEntries(
                  MODULOS_OPCIONALES.map((m) => [m.clave, true])
                )
              )
            }
          >
            Prender todas
          </Boton>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Inicio, Mi legajo, Colaboradores, Permisos, Ayuda y Configuración no
          se pueden apagar: sin legajo no hay a quién liquidarle ni a quién
          darle acceso, y sin Permisos la empresa se queda sin forma de
          administrar sus propios usuarios.
        </p>
      </Panel>
    </div>
  );
};

export default ModulosEmpresaPage;
