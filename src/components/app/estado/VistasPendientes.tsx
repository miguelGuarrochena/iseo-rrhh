'use client';

import { useState } from 'react';
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

type Vista = 'resolver' | 'area';

const TEXTO = {
  resolver:
    'Ordenado por lo que frena y por cuánta gente afecta. Cada línea lleva a la pantalla donde se arregla.',
  area: 'El porcentaje es el de los legajos activos sin pendientes en esa área. Sólo se muestran las áreas que tu empresa usa.',
} as const;

/**
 * Las dos maneras de mirar lo que falta, en un solo bloque.
 *
 * Apiladas, "Qué resolver primero" empuja "Por área" debajo del pliegue:
 * quien entra a la pantalla se queda en la lista y ni se entera de que
 * hay un mapa por área. No son dos secciones seguidas, son dos vistas
 * de lo mismo —la lista de acciones y el tablero— y el patrón de la
 * app para eso es un selector (Fichaje, Ausencias). Las dos opciones
 * quedan arriba, a ancho completo, y ninguna esconde a la otra.
 *
 * Si no hay nada que resolver, el selector no aparece: sólo el mapa.
 */
export const VistasPendientes = ({
  estado,
  prioritarias,
}: {
  estado: EstadoRrhh;
  prioritarias: SituacionAgrupada[];
}) => {
  const [vista, setVista] = useState<Vista>('resolver');
  const [abierta, setAbierta] = useState<ClaveArea | null>(null);

  const hayResolver = prioritarias.length > 0;
  const efectiva: Vista = hayResolver ? vista : 'area';
  const areasConPendientes = estado.areas.filter(
    (a) => a.pendientes > 0
  ).length;
  const areaAbierta =
    estado.areas.find((a) => a.clave === abierta && a.pendientes > 0) ?? null;

  const elegir = (siguiente: Vista) => {
    setVista(siguiente);
    if (siguiente !== 'area') setAbierta(null);
  };

  return (
    <>
      <Panel
        titulo={hayResolver ? undefined : 'Por área'}
        descripcion={hayResolver ? undefined : TEXTO.area}
      >
        {hayResolver && (
          <>
            <div
              role="group"
              aria-label="Cómo mirar los pendientes"
              className="grid w-full grid-cols-2 gap-1 rounded-xl border border-line bg-paper p-1 sm:max-w-md"
            >
              <TabVista
                activa={efectiva === 'resolver'}
                onClick={() => elegir('resolver')}
                icono={IconList}
                etiqueta="Qué resolver"
                cuenta={prioritarias.length}
              />
              <TabVista
                activa={efectiva === 'area'}
                onClick={() => elegir('area')}
                icono={IconLayoutGrid}
                etiqueta="Por área"
                cuenta={areasConPendientes}
              />
            </div>
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">
              {TEXTO[efectiva]}
            </p>
            <div className="divisor-panel mt-5 pt-5" />
          </>
        )}

        {efectiva === 'resolver' ? (
          <ListaPrioritarias prioritarias={prioritarias} />
        ) : (
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
        )}
      </Panel>

      <DetalleAreaDrawer area={areaAbierta} onCerrar={() => setAbierta(null)} />
    </>
  );
};

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
  cuenta: number;
}) => (
  <button
    type="button"
    aria-pressed={activa}
    onClick={onClick}
    className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors ${
      activa
        ? 'bg-surface text-brand-700 shadow-soft'
        : 'bg-transparent text-ink-soft hover:text-ink'
    }`}
  >
    <Icono size={16} stroke={2.2} className="shrink-0" />
    {etiqueta}
    {cuenta > 0 && (
      <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-brand-800">
        {cuenta}
      </span>
    )}
  </button>
);

const ListaPrioritarias = ({
  prioritarias,
}: {
  prioritarias: SituacionAgrupada[];
}) => (
  <ul className="flex list-none flex-col gap-2.5">
    {prioritarias.map((s) => (
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
        {s.falta.ruta && (
          <Link
            href={
              s.nombres.length > 1
                ? (s.falta.ruta.split('?')[0] ?? s.falta.ruta)
                : s.falta.ruta
            }
            className="mt-2.5 inline-flex items-start gap-1.5 text-sm font-bold text-brand-700 no-underline underline-offset-4 hover:underline"
          >
            <IconArrowNarrowRight size={17} className="mt-0.5 shrink-0" />
            <span>{s.falta.comoSeArregla}</span>
          </Link>
        )}
      </li>
    ))}
  </ul>
);
