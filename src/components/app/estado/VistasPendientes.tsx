'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Icon,
  IconArrowNarrowRight,
  IconLayoutGrid,
  IconList,
} from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { TarjetaArea } from '@/components/app/estado/TarjetaArea';
import { DetalleAreaDrawer } from '@/components/app/estado/DetalleAreaDrawer';
import { ClaveArea, EstadoRrhh, SituacionAgrupada } from '@/lib/estadoRrhh';

export type VistaEstado = 'area' | 'resolver';

/**
 * Navegación entre las dos miradas del Estado de RRHH.
 *
 * Va junto al título de la pantalla, no adentro del contenido: es "dónde
 * estoy", no un bloque más. Por área es la entrada —esta pantalla se
 * llama Estado—. Qué resolver es la otra parada, con el número a la
 * vista para que no haya que adivinar si hay algo. El selector no se
 * esconde cuando la lista está vacía: la pantalla no puede cambiar de
 * forma según el humor de los legajos.
 */
export const SelectorVistaEstado = ({
  vista,
  onElegir,
  pendientes,
}: {
  vista: VistaEstado;
  onElegir: (vista: VistaEstado) => void;
  pendientes: number;
}) => (
  <div
    role="group"
    aria-label="Vista del estado de RRHH"
    className="flex w-full items-stretch gap-1 rounded-xl border border-line bg-paper p-1 sm:w-auto"
  >
    <TabVista
      activa={vista === 'area'}
      onClick={() => onElegir('area')}
      icono={IconLayoutGrid}
      etiqueta="Por área"
    />
    <TabVista
      activa={vista === 'resolver'}
      onClick={() => onElegir('resolver')}
      icono={IconList}
      etiqueta="Qué resolver"
      cuenta={pendientes}
    />
  </div>
);

const TabVista = ({
  activa,
  onClick,
  icono: Icono,
  etiqueta,
  cuenta,
}: {
  activa: boolean;
  onClick: () => void;
  icono: Icon;
  etiqueta: string;
  cuenta?: number;
}) => (
  <button
    type="button"
    aria-pressed={activa}
    onClick={onClick}
    className={`inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors sm:flex-none ${
      activa
        ? 'bg-surface text-brand-700 shadow-soft'
        : 'bg-transparent text-ink-soft hover:text-ink'
    }`}
  >
    <Icono size={16} stroke={2.2} className="shrink-0" />
    {etiqueta}
    {cuenta !== undefined && cuenta > 0 && (
      <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-brand-800">
        {cuenta}
      </span>
    )}
  </button>
);

/**
 * El cuerpo según la vista elegida.
 *
 * No son dos secciones apiladas ni dos columnas peleando: es una u
 * otra, como el historial de fichadas. El mapa es el estado; la lista
 * es el índice hacia las pantallas donde se arregla cada falta.
 */
export const VistasPendientes = ({
  vista,
  estado,
  prioritarias,
}: {
  vista: VistaEstado;
  estado: EstadoRrhh;
  prioritarias: SituacionAgrupada[];
}) => {
  const [abierta, setAbierta] = useState<ClaveArea | null>(null);
  const areaAbierta =
    estado.areas.find((a) => a.clave === abierta && a.pendientes > 0) ?? null;

  useEffect(() => {
    if (vista !== 'area') setAbierta(null);
  }, [vista]);

  return (
    <>
      {vista === 'resolver' ? (
        <Panel
          titulo="Qué resolver primero"
          descripcion="Ordenado por lo que frena y por cuánta gente afecta. Cada línea lleva a la pantalla donde se arregla."
        >
          {prioritarias.length > 0 ? (
            <ListaPrioritarias prioritarias={prioritarias} />
          ) : (
            <p className="text-sm leading-relaxed text-ink-soft">
              No hay nada que resolver primero. Los legajos están completos para
              lo que el sistema controla.
            </p>
          )}
        </Panel>
      ) : (
        <Panel
          titulo="Por área"
          descripcion="El porcentaje es el de los legajos activos sin pendientes en esa área. Sólo se muestran las áreas que tu empresa usa."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {estado.areas.map((a) => (
              <TarjetaArea
                key={a.clave}
                area={a}
                abierto={a.clave === abierta}
                onVerDetalle={
                  a.pendientes > 0 ? () => setAbierta(a.clave) : undefined
                }
              />
            ))}
          </div>
        </Panel>
      )}

      <DetalleAreaDrawer area={areaAbierta} onCerrar={() => setAbierta(null)} />
    </>
  );
};

const ListaPrioritarias = ({
  prioritarias,
}: {
  prioritarias: SituacionAgrupada[];
}) => (
  <ul className="flex list-none flex-col gap-2.5">
    {prioritarias.map((s) => {
      const ruta = s.falta.ruta
        ? s.nombres.length > 1
          ? (s.falta.ruta.split('?')[0] ?? s.falta.ruta)
          : s.falta.ruta
        : undefined;

      return (
        <li
          key={s.falta.clave}
          className="rounded-2xl border border-line bg-paper px-4 py-3.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.9375rem] font-bold text-ink">
              {s.falta.titulo}
            </p>
            {s.falta.severidad === 'bloquea' && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-red-800">
                Frena
              </span>
            )}
            {s.nombres.length > 0 && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-ink-soft">
                {s.nombres.length}
              </span>
            )}
          </div>
          {s.nombres.length > 0 && (
            <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">
              {s.nombres.slice(0, 3).join(', ')}
              {s.nombres.length > 3 ? ` y ${s.nombres.length - 3} más` : ''}
            </p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {s.falta.detalle}
          </p>
          {ruta && (
            <Link
              href={ruta}
              className="mt-2.5 inline-flex items-start gap-1.5 text-sm font-bold text-brand-700 no-underline underline-offset-4 hover:underline"
            >
              <IconArrowNarrowRight size={17} className="mt-0.5 shrink-0" />
              <span>{s.falta.comoSeArregla}</span>
            </Link>
          )}
        </li>
      );
    })}
  </ul>
);
