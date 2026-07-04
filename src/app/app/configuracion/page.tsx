'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { IconCamera, IconCheck } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { avisoError, avisoExito } from '@/lib/avisos';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { ConfigPlataformaForm } from '@/components/app/configuracion/ConfigPlataformaForm';
import {
  actualizarConfigEmpresa,
  actualizarEmpresa,
  getEmpresa,
} from '@/lib/services/rrhh';
import { ConfigEmpresa, MetodoFichaje } from '@/types/rrhh';

const campoClase =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-brand-600';

const metodos: Record<MetodoFichaje, string> = {
  facial_tablet: 'Reconocimiento facial (tablet en planta)',
  celular: 'Celular (foto + ubicación)',
};

const ConfiguracionPage = () => {
  const { usuario, rolEfectivo, empresaVista } = useAuth();
  const [config, setConfig] = useState<ConfigEmpresa | null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoEmail, setContactoEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const inputLogo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getEmpresa().then((e) => {
      setConfig(e.config);
      setNombreEmpresa(e.nombre);
      setContactoNombre(e.contactoNombre);
      setContactoEmail(e.contactoEmail);
      setLogoUrl(e.logoUrl);
    });
  }, []);

  const cargarLogo = (archivo: File | undefined) => {
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => setLogoUrl(lector.result as string);
    lector.readAsDataURL(archivo);
  };

  if (!usuario || rolEfectivo === 'empleado' || rolEfectivo === 'supervisor') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  // Superadmin sin empresa elegida: configuración general de la plataforma
  if (usuario.rol === 'superadmin' && !empresaVista) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Configuración general
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Defaults de la plataforma y notificaciones. Lo específico de cada
            cliente se ajusta{' '}
            <Link
              href="/app/empresas"
              className="font-semibold text-brand-700 no-underline hover:underline"
            >
              entrando a su empresa
            </Link>
            .
          </p>
        </div>
        <ConfigPlataformaForm />
      </div>
    );
  }

  if (!config) {
    return <p className="text-sm text-ink-soft">Cargando configuración…</p>;
  }

  const toggleMetodo = (metodo: MetodoFichaje) => {
    const activos = config.metodosFichaje.includes(metodo)
      ? config.metodosFichaje.filter((m) => m !== metodo)
      : [...config.metodosFichaje, metodo];
    setConfig({ ...config, metodosFichaje: activos });
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await actualizarConfigEmpresa(config);
      await actualizarEmpresa({
        nombre: nombreEmpresa,
        contactoNombre,
        contactoEmail,
        logoUrl,
      });
      avisoExito('Configuración guardada');
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      avisoError(
        'No pudimos guardar la configuración',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Configuración
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Parámetros de {nombreEmpresa}.
        </p>
      </div>

      <form onSubmit={guardar} className="flex flex-col gap-4">
        <Panel>
          <h2 className="text-base font-bold text-ink">Datos de la empresa</h2>
          <div className="mt-4 flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="h-16 w-16 rounded-xl border border-line bg-surface object-contain p-1.5"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line bg-paper text-ink-soft">
                <IconCamera size={22} stroke={1.5} />
              </div>
            )}
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              onClick={() => inputLogo.current?.click()}
            >
              <IconCamera size={14} />
              {logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </Boton>
            <input
              ref={inputLogo}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => cargarLogo(e.target.files?.[0])}
            />
          </div>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            <Campo
              etiqueta="Nombre de la empresa"
              value={nombreEmpresa}
              onChange={(e) => setNombreEmpresa(e.target.value)}
            />
            <Campo
              etiqueta="Contacto (nombre)"
              value={contactoNombre}
              onChange={(e) => setContactoNombre(e.target.value)}
            />
            <Campo
              etiqueta="Contacto (email)"
              type="email"
              value={contactoEmail}
              onChange={(e) => setContactoEmail(e.target.value)}
            />
          </div>
        </Panel>

        <Panel>
          <h2 className="text-base font-bold text-ink">Fichaje</h2>
          <div className="mt-4 flex flex-col gap-2">
            {(Object.keys(metodos) as MetodoFichaje[]).map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-3 rounded-xl bg-paper px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={config.metodosFichaje.includes(m)}
                  onChange={() => toggleMetodo(m)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="text-sm font-medium text-ink">
                  {metodos[m]}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">
                Hora de entrada
              </span>
              <input
                type="time"
                value={config.horaEntrada}
                onChange={(e) =>
                  setConfig({ ...config, horaEntrada: e.target.value })
                }
                className={campoClase}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">
                Hora de salida
              </span>
              <input
                type="time"
                value={config.horaSalida}
                onChange={(e) =>
                  setConfig({ ...config, horaSalida: e.target.value })
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
                value={config.toleranciaLlegadaTardeMin}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    toleranciaLlegadaTardeMin: Number(e.target.value),
                  })
                }
                className={campoClase}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-base font-bold text-ink">Alertas</h2>
          <label className="mt-4 flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Días de aviso antes de un vencimiento
            </span>
            <input
              type="number"
              min={1}
              value={config.diasAvisoVencimiento}
              onChange={(e) =>
                setConfig({
                  ...config,
                  diasAvisoVencimiento: Number(e.target.value),
                })
              }
              className={campoClase}
            />
            <span className="text-xs text-ink-soft">
              Aplica a contratos a plazo, exámenes médicos, ART y documentos.
            </span>
          </label>
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
    </div>
  );
};

export default ConfiguracionPage;
