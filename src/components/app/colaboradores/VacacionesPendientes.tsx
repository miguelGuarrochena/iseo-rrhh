'use client';

import { useEffect, useState } from 'react';
import { IconBeach } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  getVacacionesPendientes,
  guardarVacacionesPendientes,
} from '@/lib/services/rrhh';
import { VacacionesPendientes as Registro } from '@/types/rrhh';

interface Props {
  empleadoId: string;
  /** Año al que se le suman los días (el período en curso). */
  anio: number;
  puedeEditar: boolean;
  /** Para refrescar el saldo de la ficha después de guardar. */
  onGuardado?: () => void;
}

/**
 * Días de vacaciones que quedaron sin usar el año anterior y se
 * arrastran al período que arranca.
 *
 * Se carga a mano y no se calcula solo, que fue lo que pidió el
 * cliente. Además es lo correcto: la LCT (art. 164) deja acumular como
 * máximo un tercio del período anterior y el resto caduca, así que
 * decidir automáticamente qué días sobreviven sería tomar por la
 * empresa una decisión que no le corresponde a la app.
 */
export const VacacionesPendientesPanel = ({
  empleadoId,
  anio,
  puedeEditar,
  onGuardado,
}: Props) => {
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [dias, setDias] = useState('');
  const [motivo, setMotivo] = useState('');
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    void getVacacionesPendientes(empleadoId, anio)
      .then((r) => {
        if (!vigente) return;
        setRegistro(r);
        setDias(r ? String(r.dias) : '');
        setMotivo(r?.motivo ?? '');
      })
      .catch(() => {
        if (vigente) setRegistro(null);
      });
    return () => {
      vigente = false;
    };
  }, [empleadoId, anio]);

  const guardar = async () => {
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      avisoError('Días inválidos', 'Poné un número entero entre 0 y 365.');
      return;
    }
    setGuardando(true);
    try {
      const r = await guardarVacacionesPendientes(
        empleadoId,
        anio,
        n,
        motivo || undefined
      );
      setRegistro(r);
      setEditando(false);
      avisoExito(
        n > 0 ? 'Días pendientes cargados' : 'Días pendientes eliminados',
        n > 0 ? `Se suman ${n} al saldo de ${anio}.` : undefined
      );
      onGuardado?.();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-paper/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <IconBeach size={15} className="text-ink-soft" />
            Vacaciones pendientes de años anteriores
          </p>
          <p className="text-xs text-ink-soft">
            Días que no usó y se suman al período {anio}.
          </p>
        </div>
        {puedeEditar && !editando && (
          <Boton
            variante="sutil"
            tamano="sm"
            type="button"
            onClick={() => setEditando(true)}
          >
            {registro ? 'Editar' : 'Cargar'}
          </Boton>
        )}
      </div>

      {!editando && (
        <p className="mt-2.5 text-sm text-ink">
          {registro ? (
            <>
              <strong className="text-base font-bold">{registro.dias}</strong>{' '}
              {registro.dias === 1 ? 'día' : 'días'} acumulados
              {registro.motivo && (
                <span className="text-ink-soft"> · {registro.motivo}</span>
              )}
            </>
          ) : (
            <span className="text-xs text-ink-soft">
              Sin días acumulados. Al cerrar el año, cargá acá los que le
              quedaron sin tomar.
            </span>
          )}
        </p>
      )}

      {editando && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
            <Campo
              etiqueta="Días"
              type="number"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              placeholder="0"
              ayuda="0 lo borra."
            />
            <Campo
              etiqueta="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Le quedaron 7 días de 2025"
            />
          </div>
          <p className="text-[0.7rem] leading-relaxed text-ink-soft">
            La LCT (art. 164) permite acumular hasta un tercio del período
            anterior; el resto caduca. Cargá los días que la empresa decidió
            reconocer.
          </p>
          <div className="flex gap-2">
            <Boton
              tamano="sm"
              onClick={() => void guardar()}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => {
                setEditando(false);
                setDias(registro ? String(registro.dias) : '');
                setMotivo(registro?.motivo ?? '');
              }}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
};
