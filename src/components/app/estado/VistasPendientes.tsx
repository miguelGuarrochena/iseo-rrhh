'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconArrowLeft, IconArrowNarrowRight } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { TarjetaArea } from '@/components/app/estado/TarjetaArea';
import { DetalleAreaDrawer } from '@/components/app/estado/DetalleAreaDrawer';
import { ClaveArea, EstadoRrhh, SituacionAgrupada } from '@/lib/estadoRrhh';

export type VistaEstado = 'area' | 'resolver';

/**
 * El cuerpo del Estado de RRHH: el mapa por área, y adentro el camino
 * a la lista de acciones.
 *
 * Las pestañas junto al título quedaban fuera de la mirada: quien entra
 * lee el cartel, los números y el bloque "Por área". El botón vive en
 * ese bloque, donde ya se está. No va en cada tarjeta —"Qué resolver"
 * agrupa por tipo de falta, no por área; el detalle de un área ya abre
 * el panel de al lado—.
 *
 * Tampoco es un popup: la lista manda a otras pantallas, y un modal que
 * se cierra al salir era un paso de más. El bloque cambia de contenido
 * y el mismo lugar del botón pasa a ser "Volver a las áreas".
 */
export const VistasPendientes = ({
  vista,
  onElegir,
  estado,
  prioritarias,
}: {
  vista: VistaEstado;
  onElegir: (vista: VistaEstado) => void;
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
          acciones={
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => onElegir('area')}
            >
              <IconArrowLeft size={16} />
              Volver a las áreas
            </Boton>
          }
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
          acciones={
            prioritarias.length > 0 ? (
              <Boton tamano="sm" onClick={() => onElegir('resolver')}>
                Qué resolver
                <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-brand-800">
                  {prioritarias.length}
                </span>
              </Boton>
            ) : undefined
          }
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
