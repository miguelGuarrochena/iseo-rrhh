'use client';

import { useEffect, useMemo, useState } from 'react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { avisoError, avisoExito } from '@/lib/avisos';
import { getCuposLicencia, guardarCupoLicencia } from '@/lib/services/rrhh';
import {
  CupoLicencia,
  TIPOS_LICENCIA_CON_CUPO,
  TIPOS_LICENCIA_POR_EVENTO,
  TipoAusencia,
} from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

/**
 * Cupos anuales de licencias.
 *
 * El campo vacío significa **sin límite** y es distinto de un cupo de
 * cero. La diferencia importa porque la base la usa como regla: "sin
 * fila" es libre y "fila con 0" es tope estricto. Con un formulario que
 * arrancaba en `0` y guardaba los siete tipos de una, entrar a mirar esta
 * pantalla y apretar Guardar dejaba a toda la empresa sin licencias, sin
 * forma de volver atrás y sin override de RRHH.
 *
 * Por eso ahora se guarda sólo lo que cambió, el vacío borra la fila, y
 * el cero hay que escribirlo a propósito para que valga como tope.
 *
 * Las licencias que la ley otorga por hecho generador —fallecimiento,
 * casamiento, nacimiento, maternidad, excedencia— no aparecen acá: no
 * tienen cupo que configurar.
 */
export const CuposLicenciaPanel = () => {
  /** '' = sin límite. El estado va en texto para distinguirlo del 0. */
  const [cupos, setCupos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const carga = useCarga(() => getCuposLicencia(), [], {
    contexto: 'configuracion/cupos',
    inicial: [] as CupoLicencia[],
  });
  const cargar = carga.recargar;

  /** Lo que está guardado hoy: sirve para saber qué cambió y qué no tocar. */
  const guardados = useMemo(() => {
    const mapa: Record<string, string> = {};
    TIPOS_LICENCIA_CON_CUPO.forEach((t) => {
      const fila = carga.datos.find((c) => c.tipo === t);
      mapa[t] = fila ? String(fila.diasAnuales) : '';
    });
    return mapa;
  }, [carga.datos]);

  // Los cupos se editan en el form, así que lo cargado se copia a estado
  // local. Se rearma cuando llega una respuesta nueva (o un reintento).
  useEffect(() => {
    setCupos(guardados);
  }, [guardados]);

  const cambiados = TIPOS_LICENCIA_CON_CUPO.filter(
    (t) => (cupos[t] ?? '') !== guardados[t]
  );

  const guardar = async () => {
    if (cambiados.length === 0) {
      avisoExito('No había cambios que guardar');
      return;
    }
    setGuardando(true);
    try {
      await Promise.all(
        cambiados.map((tipo) => {
          const valor = (cupos[tipo] ?? '').trim();
          // Vacío = sin límite: se borra la fila, que es como la base
          // expresa que ese tipo no tiene tope.
          return guardarCupoLicencia(tipo, valor === '' ? null : Number(valor));
        })
      );
      avisoExito(
        cambiados.length === 1
          ? 'Cupo actualizado'
          : `${cambiados.length} cupos actualizados`
      );
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
      <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
        Cupos anuales de licencias
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Días disponibles por año para cada tipo. Dejalo <strong>vacío</strong>{' '}
        para que no tenga límite; un <strong>0</strong> es un tope real y
        bloquea el pedido. El saldo se muestra al solicitar o cargar una
        ausencia.
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
              inputMode="numeric"
              placeholder="Sin límite"
              value={cupos[tipo] ?? ''}
              onChange={(e) =>
                setCupos((prev) => ({
                  ...prev,
                  [tipo]: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base text-ink outline-none focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(74,122,245,0.18)]"
            />
          </label>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-xs leading-relaxed text-ink-soft">
        {TIPOS_LICENCIA_POR_EVENTO.map(
          (t) => tipoAusenciaLabels[t as TipoAusencia]
        ).join(', ')}{' '}
        no se configuran acá: la ley las otorga por cada hecho que las genera,
        no por año.
      </p>
      <Boton
        className="mt-4"
        onClick={() => void guardar()}
        disabled={guardando || cambiados.length === 0}
      >
        {guardando ? 'Guardando…' : 'Guardar cupos'}
      </Boton>
    </Panel>
  );
};
