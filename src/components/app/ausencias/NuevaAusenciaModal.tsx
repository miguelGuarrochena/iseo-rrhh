'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { aOpciones } from '@/components/app/ui/Selector';
import { diasEntre, hoyISO } from '@/lib/fechas';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { TipoAusencia } from '@/types/rrhh';

interface NuevaAusenciaModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (datos: {
    tipo: TipoAusencia;
    fechaDesde: string;
    fechaHasta: string;
    comentario?: string;
  }) => Promise<void>;
}

const campoClase =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600';

export const NuevaAusenciaModal = ({
  abierto,
  onCerrar,
  onCrear,
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (dias < 1) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setError(null);
    setEnviando(true);
    await onCrear({
      tipo,
      fechaDesde,
      fechaHasta,
      comentario: comentario.trim() || undefined,
    });
    setEnviando(false);
    setComentario('');
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
