'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { Ausencia } from '@/types/rrhh';

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
}

/**
 * Calendario mensual con todas las ausencias del equipo. Cada día muestra
 * cuántas personas están ausentes; al tocarlo se listan.
 */
export const CalendarioAusencias = ({
  ausencias,
  nombreEmpleado,
}: CalendarioAusenciasProps) => {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [diaSel, setDiaSel] = useState<string | null>(null);

  // Solo cuentan las aprobadas o pendientes (no las rechazadas).
  const vigentes = useMemo(
    () => ausencias.filter((a) => a.estado !== 'rechazada'),
    [ausencias]
  );

  const ausentesEn = (fecha: string): Ausencia[] =>
    vigentes.filter((a) => a.fechaDesde <= fecha && fecha <= a.fechaHasta);

  const primerDia = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7; // Lunes = 0
  const hoyStr = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

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
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <IconChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-ink">
          {MESES[mes]} {anio}
        </span>
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Mes siguiente"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {DIAS.map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="text-[0.65rem] font-bold uppercase text-ink-soft"
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
          const cantidad = ausentesEn(fecha).length;
          const esHoy = fecha === hoyStr;
          return (
            <button
              key={fecha}
              type="button"
              disabled={cantidad === 0}
              onClick={() => setDiaSel(fecha)}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition-colors ${
                cantidad > 0
                  ? 'cursor-pointer border-line bg-brand-50/60 text-ink hover:border-brand-300 hover:bg-brand-100/70'
                  : esHoy
                    ? 'cursor-default border-line bg-paper font-bold text-ink'
                    : 'cursor-default border-transparent text-ink-soft'
              }`}
            >
              {dia}
              {cantidad > 0 && (
                <span className="mt-0.5 rounded-full bg-brand-600 px-1.5 text-[0.55rem] font-bold text-white">
                  {cantidad}
                </span>
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
            {seleccionados.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <span className="text-sm font-semibold text-ink">
                  {nombreEmpleado(a.empleadoId)}
                </span>
                <span className="flex items-center gap-2">
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
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
