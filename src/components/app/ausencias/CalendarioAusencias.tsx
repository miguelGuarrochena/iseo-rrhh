'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import {
  tipoAusenciaColores,
  tipoAusenciaIconos,
  tipoAusenciaLabels,
} from '@/lib/etiquetas';
import { Ausencia, TipoAusencia } from '@/types/rrhh';

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${pad(mes + 1)}-${pad(dia)}`;

interface CalendarioAusenciasProps {
  ausencias: Ausencia[];
  nombreEmpleado: (empleadoId: string) => string;
  soloAprobadas?: boolean;
}

/**
 * Calendario mensual con todas las ausencias del equipo. Cada día muestra
 * cuántas personas están ausentes; al tocarlo se listan.
 */
export const CalendarioAusencias = ({
  ausencias,
  nombreEmpleado,
  soloAprobadas = false,
}: CalendarioAusenciasProps) => {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [diaSel, setDiaSel] = useState<string | null>(null);

  // Admin ve aprobadas y pendientes; empleados solo ven vacaciones aprobadas.
  const vigentes = useMemo(
    () =>
      ausencias.filter((a) =>
        soloAprobadas ? a.estado === 'aprobada' : a.estado !== 'rechazada'
      ),
    [ausencias, soloAprobadas]
  );

  const ausentesEn = (fecha: string): Ausencia[] =>
    vigentes.filter((a) => a.fechaDesde <= fecha && fecha <= a.fechaHasta);

  const primerDia = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7; // Lunes = 0
  const hoyStr = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  // Tipos que aparecen este mes, para armar la leyenda de colores.
  const tiposDelMes = useMemo(() => {
    const vistos = new Set<TipoAusencia>();
    for (let dia = 1; dia <= diasEnMes; dia += 1) {
      ausentesEn(iso(anio, mes, dia)).forEach((a) => vistos.add(a.tipo));
    }
    return Array.from(vistos).sort((a, b) =>
      tipoAusenciaLabels[a].localeCompare(tipoAusenciaLabels[b])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vigentes, anio, mes, diasEnMes]);

  const mover = (delta: number) => {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
    setDiaSel(null);
  };

  const seleccionados = diaSel ? ausentesEn(diaSel) : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Mes anterior"
          className="presionable flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink-soft hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 sm:h-10 sm:w-10"
        >
          <IconChevronLeft size={18} />
        </button>
        <span className="text-[0.9375rem] font-bold text-ink">
          {MESES[mes]} {anio}
        </span>
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Mes siguiente"
          className="presionable flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink-soft hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 sm:h-10 sm:w-10"
        >
          <IconChevronRight size={18} />
        </button>
      </div>

      {tiposDelMes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5">
          {tiposDelMes.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1.5 text-[0.7rem] text-ink-soft"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${tipoAusenciaColores[t]}`}
              />
              {tipoAusenciaLabels[t]}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[0.7rem] text-ink-soft">
            <span className="h-2 w-2 shrink-0 rounded-full ring-2 ring-amber-400 ring-offset-1 ring-offset-surface" />
            Pendiente de aprobar
          </span>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {DIAS.map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="pb-1 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-soft"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`v-${i}`} />
        ))}
        {Array.from({ length: diasEnMes }).map((_, i) => {
          const dia = i + 1;
          const fecha = iso(anio, mes, dia);
          const ausentes = ausentesEn(fecha);
          const cantidad = ausentes.length;
          const esHoy = fecha === hoyStr;
          const esFinDeSemana = (offset + i) % 7 >= 5;
          const tienePendiente = ausentes.some((a) => a.estado === 'pendiente');
          const tiposDelDia = Array.from(new Set(ausentes.map((a) => a.tipo)));
          return (
            <button
              key={fecha}
              type="button"
              disabled={cantidad === 0}
              onClick={() => setDiaSel(fecha)}
              title={
                cantidad > 0
                  ? `${cantidad} ${cantidad === 1 ? 'ausente' : 'ausentes'}: ${ausentes
                      .map((a) => tipoAusenciaLabels[a.tipo])
                      .join(', ')}`
                  : undefined
              }
              className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl border p-1 text-sm transition-colors sm:min-h-[3.75rem] ${
                cantidad > 0
                  ? 'cursor-pointer border-line bg-brand-50/60 text-ink hover:border-brand-300 hover:bg-brand-100/70'
                  : esHoy
                    ? 'cursor-default border-line bg-paper font-bold text-ink'
                    : `cursor-default border-transparent ${esFinDeSemana ? 'text-ink-soft/50' : 'text-ink-soft'}`
              } ${esHoy ? 'ring-2 ring-inset ring-brand-500' : ''}`}
            >
              {tienePendiente && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
              <span className={esHoy ? 'font-bold' : undefined}>{dia}</span>
              {cantidad > 0 && (
                <>
                  <div className="flex items-center gap-0.5">
                    {tiposDelDia.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className={`h-1.5 w-1.5 rounded-full ${tipoAusenciaColores[t]}`}
                      />
                    ))}
                  </div>
                  <span className="rounded-full bg-brand-600 px-1.5 text-[0.55rem] font-bold text-white">
                    {cantidad}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <Modal
        opened={Boolean(diaSel)}
        onClose={() => setDiaSel(null)}
        radius="lg"
        centered
        title={
          diaSel
            ? capitalizar(
                new Date(`${diaSel}T00:00:00`).toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              )
            : ''
        }
        styles={{ title: { fontWeight: 800 } }}
      >
        {seleccionados.length === 0 ? (
          <p className="text-sm text-ink-soft">Nadie ausente este día.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft">
              {seleccionados.length}{' '}
              {seleccionados.length === 1
                ? 'persona ausente'
                : 'personas ausentes'}
              :
            </p>
            {seleccionados.map((a) => {
              const Icono = tipoAusenciaIconos[a.tipo];
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3.5 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${tipoAusenciaColores[a.tipo]}`}
                    >
                      <Icono size={15} />
                    </span>
                    <span className="truncate text-sm font-semibold text-ink">
                      {nombreEmpleado(a.empleadoId)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-ink-soft">
                      {tipoAusenciaLabels[a.tipo]}
                    </span>
                    {a.estado === 'pendiente' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold text-amber-800">
                        Pendiente
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};
