'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { avisoError, avisoExito } from '@/lib/avisos';
import { getCuposLicencia, guardarCupoLicencia } from '@/lib/services/rrhh';
import {
  CupoLicencia,
  TIPOS_LICENCIA_CON_CUPO,
  TipoAusencia,
} from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

/**
 * Cupos anuales de licencias legales (mudanza, casamiento, etc.).
 */
export const CuposLicenciaPanel = () => {
  const [cupos, setCupos] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);

  const carga = useCarga(() => getCuposLicencia(), [], {
    contexto: 'configuracion/cupos',
    inicial: [] as CupoLicencia[],
  });
  const cargar = carga.recargar;

  // Los cupos se editan en el form, así que lo cargado se copia a estado
  // local. Se rearma cuando llega una respuesta nueva (o un reintento).
  useEffect(() => {
    const mapa: Record<string, number> = {};
    TIPOS_LICENCIA_CON_CUPO.forEach((t) => {
      mapa[t] = carga.datos.find((c) => c.tipo === t)?.diasAnuales ?? 0;
    });
    setCupos(mapa);
  }, [carga.datos]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await Promise.all(
        TIPOS_LICENCIA_CON_CUPO.map((tipo) =>
          guardarCupoLicencia(tipo, cupos[tipo] ?? 0)
        )
      );
      avisoExito('Cupos de licencia guardados');
      // Relee lo guardado: si el servidor ajustó algo, el form lo refleja.
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  if (carga.fase === 'error' && carga.error) {
    return <BloqueError error={carga.error} onReintentar={carga.recargar} />;
  }

  return (
    <Panel>
      <h2 className="text-base font-bold text-ink">
        Cupos anuales de licencias legales
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Días disponibles por año para cada tipo. El saldo se muestra al
        solicitar o cargar una ausencia.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {TIPOS_LICENCIA_CON_CUPO.map((tipo) => (
          <label key={tipo} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              {tipoAusenciaLabels[tipo as TipoAusencia]}
            </span>
            <input
              type="number"
              min={0}
              value={cupos[tipo] ?? 0}
              onChange={(e) =>
                setCupos((prev) => ({
                  ...prev,
                  [tipo]: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-brand-600"
            />
          </label>
        ))}
      </div>
      <Boton
        className="mt-4"
        onClick={() => void guardar()}
        disabled={guardando}
      >
        {guardando ? 'Guardando…' : 'Guardar cupos'}
      </Boton>
    </Panel>
  );
};
