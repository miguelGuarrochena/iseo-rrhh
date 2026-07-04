'use client';

import { useEffect, useState } from 'react';
import { IconLock, IconPlus, IconTrash } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { avisoError } from '@/lib/avisos';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  agregarNotaInterna,
  getNotasInternas,
  quitarNotaInterna,
} from '@/lib/services/rrhh';
import { NotaInterna } from '@/types/rrhh';

const formatearFechaLarga = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

interface NotasInternasProps {
  empleadoId: string;
}

/**
 * Notas internas del empleado (bitácora). Solo se muestra a administradores;
 * el gating de rol lo hace la página que la incluye.
 */
export const NotasInternas = ({ empleadoId }: NotasInternasProps) => {
  const { usuario } = useAuth();
  const [notas, setNotas] = useState<NotaInterna[]>([]);
  const [motivo, setMotivo] = useState('');
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void getNotasInternas(empleadoId).then(setNotas);
  }, [empleadoId]);

  const agregar = async () => {
    if (!motivo.trim() || !usuario) return;
    setGuardando(true);
    try {
      const nueva = await agregarNotaInterna(empleadoId, {
        motivo: motivo.trim(),
        observacion: observacion.trim() || undefined,
        autorId: usuario.id,
        autorNombre: usuario.nombreCompleto,
      });
      setNotas((prev) => [nueva, ...prev]);
      setMotivo('');
      setObservacion('');
    } catch {
      avisoError('No pudimos guardar la nota', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (id: string) => {
    setNotas((prev) => prev.filter((n) => n.id !== id));
    try {
      await quitarNotaInterna(id);
    } catch {
      void getNotasInternas(empleadoId).then(setNotas);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-ink">Notas internas</h2>
        <span className="flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[0.65rem] font-bold text-ink-soft">
          <IconLock size={11} /> Solo administradores
        </span>
      </div>

      {/* Alta */}
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-paper/50 p-4">
        <Campo
          etiqueta="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Solicitó aumento, problema familiar, buen desempeño…"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">
            Observación (opcional)
          </span>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            placeholder="Detalle adicional…"
            className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
          />
        </label>
        <Boton
          onClick={() => void agregar()}
          disabled={!motivo.trim() || guardando}
          className="self-start"
        >
          <IconPlus size={16} />
          {guardando ? 'Guardando…' : 'Agregar nota'}
        </Boton>
      </div>

      {/* Historial */}
      <div className="mt-4 flex flex-col gap-2">
        {notas.length === 0 ? (
          <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
            Sin notas cargadas.
          </p>
        ) : (
          notas.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  <span className="text-ink-soft">
                    {formatearFechaLarga(n.fecha)} ·{' '}
                  </span>
                  {n.motivo}
                </p>
                {n.observacion && (
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {n.observacion}
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-soft">
                  Cargada por {n.autorNombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void quitar(n.id)}
                aria-label="Eliminar nota"
                className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-1 text-ink-soft transition-colors hover:text-red-600"
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
