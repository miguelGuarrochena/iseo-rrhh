'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { aOpciones } from '@/components/app/ui/Selector';
import { diasEntre, formatearFecha, hoyISO } from '@/lib/fechas';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { Ausencia, TipoAusencia } from '@/types/rrhh';

interface NuevaAusenciaModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (datos: {
    tipo: TipoAusencia;
    fechaDesde: string;
    fechaHasta: string;
    comentario?: string;
  }) => Promise<void>;
  vacacionesSector?: Ausencia[];
  nombreEmpleado?: (empleadoId: string) => string;
}

const campoClase =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600';

export const NuevaAusenciaModal = ({
  abierto,
  onCerrar,
  onCrear,
  vacacionesSector = [],
  nombreEmpleado,
}: NuevaAusenciaModalProps) => {
  const [tipo, setTipo] = useState<TipoAusencia>('vacaciones');
  const [fechaDesde, setFechaDesde] = useState(hoyISO());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const dias = useMemo(
    () => diasEntre(fechaDesde, fechaHasta),
    [fechaDesde, fechaHasta]
  );
  const superpuestas = useMemo(
    () =>
      tipo === 'vacaciones'
        ? vacacionesSector.filter(
            (a) => fechaDesde <= a.fechaHasta && fechaHasta >= a.fechaDesde
          )
        : [],
    [fechaDesde, fechaHasta, tipo, vacacionesSector]
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (dias < 1) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await onCrear({
        tipo,
        fechaDesde,
        fechaHasta,
        comentario: comentario.trim() || undefined,
      });
      setComentario('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No pudimos enviar la solicitud.'
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Nueva solicitud de ausencia"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <CampoSelect
          etiqueta="Tipo"
          value={tipo}
          onChange={(v) => setTipo(v as TipoAusencia)}
          opciones={aOpciones(tipoAusenciaLabels)}
        />

        <div className="grid grid-cols-2 gap-3">
          <CampoFecha
            etiqueta="Desde"
            value={fechaDesde}
            onChange={setFechaDesde}
          />
          <CampoFecha
            etiqueta="Hasta"
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={setFechaHasta}
          />
        </div>

        {dias > 0 && (
          <p className="text-sm text-ink-soft">
            Total: <strong className="text-ink">{dias} días</strong>
          </p>
        )}

        {tipo === 'vacaciones' && vacacionesSector.length > 0 && (
          <div
            className={`rounded-xl px-4 py-3 text-xs ${
              superpuestas.length > 0
                ? 'bg-amber-50 text-amber-900'
                : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {superpuestas.length > 0 ? (
              <>
                <p className="font-bold">
                  Hay vacaciones aprobadas del sector en esas fechas:
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {superpuestas.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      {nombreEmpleado?.(a.empleadoId) ?? 'Compañero'} ·{' '}
                      {formatearFecha(a.fechaDesde)} al{' '}
                      {formatearFecha(a.fechaHasta)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              'No hay vacaciones aprobadas del sector pisando este rango.'
            )}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">
            Comentario (opcional)
          </span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            placeholder="Motivo o detalle para tu supervisor"
            className={campoClase}
          />
        </label>

        <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
          Si es por enfermedad vas a poder adjuntar el certificado médico
          (disponible próximamente).
        </p>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Boton
          type="submit"
          disabled={enviando}
          className="mt-1 py-3 text-base"
        >
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </Boton>
      </form>
    </Modal>
  );
};
