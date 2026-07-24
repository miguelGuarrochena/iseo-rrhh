'use client';

import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  getCuposLicencia,
  guardarCupoLicencia,
} from '@/lib/services/rrhh';
import { CupoLicencia, TIPOS_LICENCIA_CON_CUPO, TipoAusencia } from '@/types/rrhh';

/**
 * Cupos anuales de licencias legales (mudanza, casamiento, etc.).
 */
export const CuposLicenciaPanel = () => {
  const [cupos, setCupos] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    void getCuposLicencia().then((lista: CupoLicencia[]) => {
      const mapa: Record<string, number> = {};
      TIPOS_LICENCIA_CON_CUPO.forEach((t) => {
        mapa[t] = lista.find((c) => c.tipo === t)?.diasAnuales ?? 0;
      });
      setCupos(mapa);
    });
  }, []);

  useEffect(cargar, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await Promise.all(
        TIPOS_LICENCIA_CON_CUPO.map((tipo) =>
          guardarCupoLicencia(tipo, cupos[tipo] ?? 0)
        )
      );
      avisoExito('Cupos de licencia guardados');
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

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
