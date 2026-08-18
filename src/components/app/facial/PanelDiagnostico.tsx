'use client';

import { PUNTAJE_ACEPTABLE, UMBRALES } from '@/lib/facial/calidad';
import type { Diagnostico, Fase } from '@/lib/facial/motor';

/**
 * Panel de diagnóstico del pipeline facial.
 *
 * Se muestra sólo con el modo diagnóstico activo (`?diag=1`), así que no
 * afecta la experiencia de producción. Existe para que "no anda en la
 * tablet" deje de ser una hipótesis y pase a ser un número: en qué
 * backend corrió, cuánto tarda cada etapa, qué resolución entrega
 * realmente la cámara y por qué se está rechazando el cuadro.
 *
 * **No muestra ni el descriptor ni ninguna imagen.** Un panel de
 * depuración que filtre biometría es peor que no tener panel.
 */

const Fila = ({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  alerta?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-ink-soft">{etiqueta}</span>
    <span
      className={`font-mono text-[0.7rem] ${alerta ? 'font-bold text-red-600' : 'text-ink'}`}
    >
      {valor}
    </span>
  </div>
);

const ms = (v: number | null) => (v === null ? '—' : `${v} ms`);
const num = (v: number | null) => (v === null ? '—' : String(v));

export const PanelDiagnostico = ({
  diagnostico: d,
  fase,
}: {
  diagnostico: Diagnostico;
  fase: Fase;
}) => {
  const res = d.resolucion;
  const emb = d.embedding;
  const cal = d.ultimaCalidad;

  return (
    <div className="w-full rounded-xl border border-line bg-paper/70 p-3 text-[0.72rem] leading-relaxed">
      <p className="mb-2 font-bold uppercase tracking-wide text-ink-soft">
        Diagnóstico · {fase}
      </p>

      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Fila
          etiqueta="Percepción"
          valor={`${d.percepcion.delegado ?? '—'} · ${ms(d.msPercepcion)}`}
          // El delegado CPU funciona pero es varias veces más lento: si
          // aparece acá, es la primera cosa a investigar en esa tablet.
          alerta={d.percepcion.delegado === 'CPU'}
        />
        <Fila
          etiqueta="Embedding"
          valor={`${emb.backend ?? '—'} · ${emb.donde ?? '—'} · ${ms(emb.msPromedio)}`}
          alerta={emb.backend === 'cpu'}
        />
        <Fila
          etiqueta="FPS del bucle"
          valor={num(d.fps)}
          alerta={(d.fps ?? 99) < 8}
        />
        <Fila etiqueta="Calentamiento" valor={ms(emb.msCalentamiento)} />
        <Fila etiqueta="Carga percepción" valor={ms(d.percepcion.msCarga)} />
        <Fila etiqueta="Carga embedding" valor={ms(emb.msCarga)} />
        <Fila
          etiqueta="Cámara real"
          valor={res ? `${res.ancho}×${res.alto} @ ${num(res.fps)}` : '—'}
        />
        <Fila
          etiqueta="WASM SIMD"
          valor={
            d.percepcion.simd === null ? '—' : d.percepcion.simd ? 'sí' : 'no'
          }
        />
        <Fila
          etiqueta="Cuadros"
          valor={`${d.cuadrosAceptados}/${d.cuadrosVistos} útiles`}
        />
        <Fila
          etiqueta="Descriptores"
          valor={String(d.descriptoresCalculados)}
        />
        <Fila
          etiqueta="Puntaje calidad"
          valor={
            d.ultimoPuntaje === null
              ? '—'
              : `${d.ultimoPuntaje.toFixed(2)} (mín ${PUNTAJE_ACEPTABLE})`
          }
          alerta={
            d.ultimoPuntaje !== null && d.ultimoPuntaje < PUNTAJE_ACEPTABLE
          }
        />
        <Fila
          etiqueta="Motivo rechazo"
          valor={d.ultimoMotivo ?? 'ok'}
          alerta={Boolean(d.ultimoMotivo)}
        />
        <Fila etiqueta="Modelo percepción" valor={d.modeloPercepcion} />
      </div>

      {cal && (
        <>
          <p className="mb-1 mt-3 font-bold uppercase tracking-wide text-ink-soft">
            Último cuadro
          </p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Fila
              etiqueta="Tamaño (interocular/ancho)"
              valor={cal.tamano.toFixed(3)}
            />
            <Fila etiqueta="Desvío del centro" valor={cal.desvio.toFixed(3)} />
            <Fila etiqueta="Roll" valor={`${cal.rollGrados.toFixed(1)}°`} />
            <Fila etiqueta="Yaw (índice)" valor={cal.yaw.toFixed(3)} />
            <Fila etiqueta="Pitch (índice)" valor={cal.pitch.toFixed(3)} />
            <Fila etiqueta="Parpadeo" valor={cal.ojos.toFixed(2)} />
            <Fila
              etiqueta="Luma"
              valor={`${cal.luma.toFixed(0)} (${UMBRALES.lumaMinima}–${UMBRALES.lumaMaxima})`}
              alerta={
                cal.luma < UMBRALES.lumaMinima || cal.luma > UMBRALES.lumaMaxima
              }
            />
            <Fila
              etiqueta="Contraste"
              valor={`${cal.contraste.toFixed(1)} (mín ${UMBRALES.contrasteMinimo})`}
              alerta={cal.contraste < UMBRALES.contrasteMinimo}
            />
            <Fila
              etiqueta="Nitidez"
              valor={`${cal.nitidez.toFixed(4)} (mín ${UMBRALES.nitidezMinima})`}
              alerta={cal.nitidez < UMBRALES.nitidezMinima}
            />
            <Fila etiqueta="Movimiento" valor={cal.movimiento.toFixed(4)} />
          </div>
        </>
      )}

      {(d.percepcion.error || emb.error || emb.motivoFallback) && (
        <p className="mt-3 rounded-lg bg-red-50 px-2 py-1.5 font-mono text-[0.68rem] text-red-700">
          {d.percepcion.error ?? emb.error ?? emb.motivoFallback}
        </p>
      )}
    </div>
  );
};
