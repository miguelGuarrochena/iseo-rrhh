'use client';

import { FormEvent, useEffect, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { CampoHora } from '@/components/app/ui/CampoHora';
import {
  actualizarConfigPlataforma,
  getConfigPlataforma,
} from '@/lib/services/rrhh';
import { ConfigPlataforma } from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { Switch } from '@/components/app/ui/Switch';

const campoClase =
  'w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(74,122,245,0.18)]';

/**
 * Configuración general de la plataforma (solo superadmin):
 * defaults para empresas nuevas y notificaciones.
 */
export const ConfigPlataformaForm = () => {
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const carga = useCarga(() => getConfigPlataforma(), [], {
    contexto: 'plataforma/config',
  });
  const [config, setConfig] = useState<ConfigPlataforma | null>(null);

  // Es un formulario: lo cargado pasa a estado local para poder editarlo.
  useEffect(() => {
    if (carga.datos) setConfig(carga.datos);
  }, [carga.datos]);

  if (carga.fase === 'error' && carga.error) {
    return <BloqueError error={carga.error} onReintentar={carga.recargar} />;
  }

  if (!config) {
    return <p className="text-sm text-ink-soft">Cargando configuración…</p>;
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    await actualizarConfigPlataforma(config);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4" noValidate>
      <Panel>
        <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
          Valores por defecto para empresas nuevas
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Horarios por defecto para empresas nuevas. Cada empresa después los
          ajusta en su propia configuración, y el modo de fichaje se define por
          colaborador.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CampoHora
            etiqueta="Entrada"
            value={config.horaEntradaDefault}
            onChange={(v) => setConfig({ ...config, horaEntradaDefault: v })}
          />
          <CampoHora
            etiqueta="Salida"
            value={config.horaSalidaDefault}
            onChange={(v) => setConfig({ ...config, horaSalidaDefault: v })}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Tolerancia (min)
            </span>
            <input
              type="number"
              min={0}
              value={config.toleranciaDefaultMin}
              onChange={(e) =>
                setConfig({
                  ...config,
                  toleranciaDefaultMin: Number(e.target.value),
                })
              }
              className={campoClase}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Días de aviso
            </span>
            <input
              type="number"
              min={1}
              value={config.diasAvisoDefault}
              onChange={(e) =>
                setConfig({
                  ...config,
                  diasAvisoDefault: Number(e.target.value),
                })
              }
              className={campoClase}
            />
          </label>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
          Avisos por mail
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
          Cada lunes le llega a quien administra RRHH un resumen de lo que quedó
          pendiente en su empresa: ausencias sin resolver, recibos sin firmar,
          consultas sin responder y vencimientos cercanos. Así no hace falta
          entrar a mirar si hay algo. Si la semana no tiene nada pendiente, no
          se manda ningún mail.
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl bg-paper px-4 py-3">
          <Switch
            checked={config.resumenSemanalEmail}
            onChange={() =>
              setConfig({
                ...config,
                resumenSemanalEmail: !config.resumenSemanalEmail,
              })
            }
          />
          <span className="text-sm font-medium text-ink">
            Enviar el resumen semanal
          </span>
        </label>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Este es el corte general: si lo apagás no sale ningún resumen, para
          ninguna empresa. Viene prendido para todas; cada empresa lo puede
          apagar desde su Configuración, y vos también desde Empresas → la ficha
          del cliente → Módulos.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Los avisos puntuales —te respondieron, tenés un recibo para firmar, te
          resolvieron una ausencia— se mandan siempre y no se configuran acá.
        </p>
      </Panel>

      <div className="flex items-center gap-3">
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Boton>
        {guardado && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <IconCheck size={16} />
            Guardado
          </span>
        )}
      </div>
    </form>
  );
};
