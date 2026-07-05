'use client';

import { FormEvent, useEffect, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { validarEmail } from '@/lib/validaciones';
import {
  actualizarConfigPlataforma,
  getConfigPlataforma,
} from '@/lib/services/rrhh';
import { ConfigPlataforma } from '@/types/rrhh';

const campoClase =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-brand-600';

/**
 * Configuración general de la plataforma (solo superadmin):
 * defaults para empresas nuevas y notificaciones.
 */
export const ConfigPlataformaForm = () => {
  const [config, setConfig] = useState<ConfigPlataforma | null>(null);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    void getConfigPlataforma().then(setConfig);
  }, []);

  if (!config) {
    return <p className="text-sm text-ink-soft">Cargando configuración…</p>;
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const err = validarEmail(config.emailAvisos);
    setErrorEmail(err);
    if (err) return;
    setGuardando(true);
    await actualizarConfigPlataforma(config);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4" noValidate>
      <Panel>
        <h2 className="text-base font-bold text-ink">
          Valores por defecto para empresas nuevas
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Horarios por defecto para empresas nuevas. Cada empresa después los
          ajusta en su propia configuración, y el modo de fichaje se define por
          colaborador.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Entrada</span>
            <input
              type="time"
              value={config.horaEntradaDefault}
              onChange={(e) =>
                setConfig({ ...config, horaEntradaDefault: e.target.value })
              }
              className={campoClase}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Salida</span>
            <input
              type="time"
              value={config.horaSalidaDefault}
              onChange={(e) =>
                setConfig({ ...config, horaSalidaDefault: e.target.value })
              }
              className={campoClase}
            />
          </label>
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
        <h2 className="text-base font-bold text-ink">Notificaciones</h2>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Email remitente de avisos"
            type="email"
            value={config.emailAvisos}
            onChange={(e) =>
              setConfig({ ...config, emailAvisos: e.target.value })
            }
            error={errorEmail ?? undefined}
            ayuda="Desde esta casilla salen los avisos a las empresas."
          />
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-paper px-4 py-3">
              <input
                type="checkbox"
                checked={config.pushHabilitado}
                onChange={() =>
                  setConfig({
                    ...config,
                    pushHabilitado: !config.pushHabilitado,
                  })
                }
                className="h-4 w-4 accent-brand-600"
              />
              <span className="text-sm font-medium text-ink">
                Notificaciones push habilitadas
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-paper px-4 py-3">
              <input
                type="checkbox"
                checked={config.resumenSemanalEmail}
                onChange={() =>
                  setConfig({
                    ...config,
                    resumenSemanalEmail: !config.resumenSemanalEmail,
                  })
                }
                className="h-4 w-4 accent-brand-600"
              />
              <span className="text-sm font-medium text-ink">
                Resumen semanal por email a cada admin
              </span>
            </label>
          </div>
        </div>
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
