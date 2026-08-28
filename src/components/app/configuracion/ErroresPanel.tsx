'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconRefresh } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { getErroresApp } from '@/lib/services/rrhh';
import { ErrorApp } from '@/types/rrhh';
import { formatearInstante } from '@/lib/fechas';

/**
 * Cuándo ocurrió el error, en hora de la empresa. Es un instante: sin
 * `timeZone` cada quien lo leía con el reloj de su equipo, y comparar
 * "a qué hora se cayó" entre dos personas no daba lo mismo.
 */
const cuando = (iso: string) =>
  formatearInstante(iso, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Los errores que la app fue registrando, con el mensaje crudo. Es la
 * alternativa a pedirle al cliente que abra la consola del navegador:
 * acá está lo mismo, ya guardado, con la pantalla y el momento.
 *
 * Sólo lo ve el superadmin (la política de la base lo hace cumplir).
 */
export const ErroresPanel = () => {
  const [lista, setLista] = useState<ErrorApp[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    void getErroresApp(50)
      .then(setLista)
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Errores registrados
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Lo que falló en la app, con el mensaje técnico completo. Sirve para
            diagnosticar sin tener que pedirle nada a quien lo reportó.
          </p>
        </div>
        <Boton variante="secundario" tamano="sm" onClick={cargar}>
          <IconRefresh size={16} />
          Actualizar
        </Boton>
      </div>

      {cargando ? (
        <p className="mt-4 text-sm text-ink-soft">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          No hay errores registrados. Buena señal.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {lista.map((e) => (
            <details
              key={e.id}
              className="rounded-xl border border-line bg-paper px-4 py-3"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink">
                <span className="text-ink-soft tabular-nums">
                  {cuando(e.creadoEn)}
                </span>{' '}
                · {e.contexto ?? e.ruta ?? 'sin contexto'}
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-paper px-3 py-2 font-mono text-xs text-ink">
                {e.mensaje}
              </p>
              <p className="mt-2 text-xs text-ink-soft">
                {e.ruta ? `Pantalla: ${e.ruta}` : ''}
                {e.usuarioId ? ` · Usuario: ${e.usuarioId.slice(0, 8)}` : ''}
                {e.empresaId ? ` · Empresa: ${e.empresaId.slice(0, 8)}` : ''}
              </p>
            </details>
          ))}
        </div>
      )}
    </Panel>
  );
};
