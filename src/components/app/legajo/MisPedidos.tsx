'use client';

import { useState } from 'react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import {
  ETIQUETA_ESTADO,
  etiquetaDeCampo,
  mostrarValor,
  SolicitudDatoLegajo,
} from '@/lib/autoservicioLegajo';
import { anularSolicitudDeLegajo } from '@/lib/services/rrhh';
import { formatearFechaCivil } from '@/lib/fechas';

const CLASE_ESTADO: Record<SolicitudDatoLegajo['estado'], string> = {
  pendiente: 'bg-amber-100 text-amber-900',
  aprobada: 'bg-emerald-100 text-emerald-900',
  rechazada: 'bg-red-100 text-red-900',
  anulada: 'bg-paper text-ink-soft',
};

const fecha = (iso: string) =>
  formatearFechaCivil(iso.slice(0, 10), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/**
 * Lo que la persona pidió y en qué quedó.
 *
 * Muestra también lo ya resuelto: la pregunta que sigue a "pedí un
 * cambio" es "¿qué pasó con eso?", y si la fila desaparece al aprobarse
 * no queda dónde leer la respuesta —ni el motivo de un rechazo.
 */
export const MisPedidos = ({
  solicitudes,
  onCambio,
}: {
  solicitudes: SolicitudDatoLegajo[];
  onCambio: () => void;
}) => {
  const { confirmar, dialogo } = useConfirmacion();
  const [anulando, setAnulando] = useState<string | null>(null);

  if (solicitudes.length === 0) return null;

  const anular = async (s: SolicitudDatoLegajo) => {
    const ok = await confirmar({
      titulo: 'Cancelar el pedido',
      detalle: `Se cancela el cambio de ${etiquetaDeCampo(s.campo).toLowerCase()}. Podés volver a pedirlo cuando quieras.`,
    });
    if (!ok) return;
    setAnulando(s.id);
    try {
      await anularSolicitudDeLegajo(s.id);
      onCambio();
    } finally {
      setAnulando(null);
    }
  };

  return (
    <Panel>
      <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
        Mis pedidos de cambio
      </h2>
      <div className="mt-4 flex flex-col gap-2">
        {solicitudes.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-line bg-paper px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                {etiquetaDeCampo(s.campo)}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CLASE_ESTADO[s.estado]}`}
              >
                {ETIQUETA_ESTADO[s.estado]}
              </span>
            </div>

            <p className="mt-1.5 text-sm text-ink-soft">
              <span className="line-through">
                {mostrarValor(s.campo, s.valorActual)}
              </span>{' '}
              →{' '}
              <span className="text-ink">
                {mostrarValor(s.campo, s.valorPropuesto)}
              </span>
            </p>

            <p className="mt-1 text-xs text-ink-soft">
              Pedido el {fecha(s.creadaEn)}
              {s.resueltaEn && ` · resuelto el ${fecha(s.resueltaEn)}`}
            </p>

            {s.estado === 'rechazada' && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                {s.motivoResolucion
                  ? `RRHH no lo aprobó: ${s.motivoResolucion}`
                  : 'RRHH no lo aprobó. Consultá con tu referente.'}
              </p>
            )}

            {s.estado === 'pendiente' && (
              <div className="mt-2.5 flex justify-end">
                <Boton
                  variante="secundario"
                  tamano="sm"
                  disabled={anulando === s.id}
                  onClick={() => void anular(s)}
                >
                  {anulando === s.id ? 'Cancelando…' : 'Cancelar pedido'}
                </Boton>
              </div>
            )}
          </div>
        ))}
      </div>
      {dialogo}
    </Panel>
  );
};
