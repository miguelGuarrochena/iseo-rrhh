'use client';

import { useState } from 'react';
import Link from 'next/link';
import { IconArrowNarrowRight } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { TarjetaArea } from '@/components/app/estado/TarjetaArea';
import { DetalleAreaDrawer } from '@/components/app/estado/DetalleAreaDrawer';
import { ClaveArea, EstadoRrhh, SituacionAgrupada } from '@/lib/estadoRrhh';

/**
 * El cuerpo del Estado de RRHH: el mapa por área, y al lado los atajos
 * para ir a resolver.
 *
 * Esta pantalla se llama Estado, no Pendientes. Quien entra desde el
 * menú o desde el reporte mensual viene a ver cómo está cada área. La
 * lista de "qué hacer ahora" es un índice hacia otras pantallas —la
 * ficha, remuneraciones, permisos—, no otra vista que reemplace al mapa.
 *
 * En escritorio el mapa va a la izquierda (es lo primero que se lee) y
 * los atajos a la derecha, a un click sin esconder nada. En el celular
 * los atajos van arriba, compactos: tres renglones no empujan el mapa
 * debajo del pliegue. Si no hay nada que resolver, el índice no aparece
 * y el mapa ocupa todo: la pantalla no cambia de forma.
 */
export const VistasPendientes = ({
  estado,
  prioritarias,
}: {
  estado: EstadoRrhh;
  prioritarias: SituacionAgrupada[];
}) => {
  const [abierta, setAbierta] = useState<ClaveArea | null>(null);
  const hayResolver = prioritarias.length > 0;
  const areaAbierta =
    estado.areas.find((a) => a.clave === abierta && a.pendientes > 0) ?? null;

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        {hayResolver && (
          <div
            id="resolver"
            className="scroll-mt-24 lg:col-start-2 lg:row-start-1"
          >
            <Panel
              titulo="Qué resolver primero"
              descripcion="Cada línea abre la pantalla donde se arregla."
            >
              <ListaPrioritarias prioritarias={prioritarias} />
            </Panel>
          </div>
        )}

        <div
          id="por-area"
          className="scroll-mt-24 lg:col-start-1 lg:row-start-1"
        >
          <Panel
            titulo="Por área"
            descripcion="El porcentaje es el de los legajos activos sin pendientes en esa área. Sólo se muestran las áreas que tu empresa usa."
          >
            <div
              className={`grid gap-4 sm:grid-cols-2 ${hayResolver ? '' : 'xl:grid-cols-3'}`}
            >
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
        </div>
      </div>

      <DetalleAreaDrawer area={areaAbierta} onCerrar={() => setAbierta(null)} />
    </>
  );
};

/**
 * Una fila por falta, no una tarjeta. El detalle largo ya está en la
 * pantalla de destino: acá alcanza con el nombre, a quiénes les pasa y
 * a dónde ir. Así el índice cabe de un vistazo y no compite con el mapa.
 */
const ListaPrioritarias = ({
  prioritarias,
}: {
  prioritarias: SituacionAgrupada[];
}) => (
  <ul className="flex list-none flex-col gap-2">
    {prioritarias.map((s) => {
      const ruta = s.falta.ruta
        ? s.nombres.length > 1
          ? (s.falta.ruta.split('?')[0] ?? s.falta.ruta)
          : s.falta.ruta
        : undefined;
      const cuerpo = (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-ink">{s.falta.titulo}</p>
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
            <p className="mt-1 truncate text-[0.8125rem] leading-snug text-ink-soft">
              {s.nombres.slice(0, 3).join(', ')}
              {s.nombres.length > 3 ? ` y ${s.nombres.length - 3} más` : ''}
            </p>
          )}
          {s.falta.comoSeArregla && (
            <p className="mt-1.5 inline-flex items-start gap-1 text-[0.8125rem] font-bold text-brand-700">
              {ruta && (
                <IconArrowNarrowRight size={16} className="mt-0.5 shrink-0" />
              )}
              <span>{s.falta.comoSeArregla}</span>
            </p>
          )}
        </>
      );

      return (
        <li key={s.falta.clave}>
          {ruta ? (
            <Link
              href={ruta}
              className="hover-bloque block rounded-2xl border border-line bg-paper px-4 py-3 no-underline"
            >
              {cuerpo}
            </Link>
          ) : (
            <div className="rounded-2xl border border-line bg-paper px-4 py-3">
              {cuerpo}
            </div>
          )}
        </li>
      );
    })}
  </ul>
);
