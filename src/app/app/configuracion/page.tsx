'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { IconCamera, IconCheck, IconLayoutGrid } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { avisoError, avisoExito } from '@/lib/avisos';
import { Panel } from '@/components/app/Panel';
import {
  errorDeConfiguracionDeTope,
  HORAS_MENSUALES,
  tieneAportesDeLey,
} from '@/lib/remuneraciones';
import { Terminales } from '@/components/app/configuracion/Terminales';
import { CuposLicenciaPanel } from '@/components/app/configuracion/CuposLicenciaPanel';
import { FeriadosPanel } from '@/components/app/configuracion/FeriadosPanel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { Switch } from '@/components/app/ui/Switch';
import { CampoHora } from '@/components/app/ui/CampoHora';
import { moduloActivo, MODULOS_OPCIONALES } from '@/components/app/navItems';
import { olvidarModulos, useModulos } from '@/lib/auth/useModulos';
import {
  juntarErrores,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';
import {
  actualizarConfigEmpresa,
  actualizarEmpresa,
  getEmpresa,
} from '@/lib/services/rrhh';
import { ConfigEmpresa } from '@/types/rrhh';
import {
  erroresDeEscala,
  escalaDe,
  escalaMinima,
  TRAMOS_VACACIONES,
} from '@/lib/vacaciones';
import { BloqueError } from '@/components/app/EstadoCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { useCarga } from '@/lib/useCarga';
import { faltasDeEmpresa } from '@/lib/requisitos';
import { BloqueFaltas } from '@/components/app/Faltas';

const campoClase =
  'w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(74,122,245,0.18)]';

const ConfiguracionPage = () => {
  const { usuario, rolEfectivo, empresaVista } = useAuth();
  const modulos = useModulos();
  const conFichaje = moduloActivo('fichaje', modulos);
  const [config, setConfig] = useState<ConfigEmpresa | null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoEmail, setContactoEmail] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [cuit, setCuit] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [domicilioFiscal, setDomicilioFiscal] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const inputLogo = useRef<HTMLInputElement>(null);

  const carga = useCarga(() => getEmpresa(), [], {
    contexto: 'configuracion/empresa',
  });

  // La empresa que se está configurando. Para el superadmin es la que
  // está visitando; para el admin del cliente, la suya.
  const idEmpresaVista = empresaVista?.id ?? usuario?.empresaId ?? null;

  // Es un formulario: lo cargado pasa a estado local para poder editarlo.
  useEffect(() => {
    const e = carga.datos;
    if (!e) return;
    setConfig(e.config);
    setNombreEmpresa(e.nombre);
    setContactoNombre(e.contactoNombre);
    setContactoEmail(e.contactoEmail);
    setContactoTelefono(e.contactoTelefono ?? '');
    setCuit(e.cuit ?? '');
    setRazonSocial(e.razonSocial ?? '');
    setDomicilioFiscal(e.domicilio ?? '');
    setLogoUrl(e.logoUrl);
  }, [carga.datos]);

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

  // El superadmin sin empresa activa no tiene nada que configurar acá:
  // lo suyo vive en Plataforma. Antes esta misma pantalla mostraba una
  // cosa u otra según el contexto y el nombre del menú significaba dos
  // cosas distintas.
  if (usuario.rol === 'superadmin' && !empresaVista) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface px-5 py-6">
        <h1 className="text-lg font-bold text-ink">
          Esta es la configuración de una empresa
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-ink-soft">
          Entrá a un cliente desde Empresas para ajustar sus horarios, módulos y
          cargas. Lo de ISEO —defaults, equipo y errores— está en Plataforma.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/empresas"
            className="presionable rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-brand-300"
          >
            Ir a Empresas
          </Link>
          <Link
            href="/plataforma"
            className="presionable rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-brand-300"
          >
            Ir a Plataforma
          </Link>
        </div>
      </div>
    );
  }

  if (carga.fase === 'error' && carga.error) {
    return <BloqueError error={carga.error} onReintentar={carga.recargar} />;
  }

  if (!config) {
    return <p className="text-sm text-ink-soft">Cargando configuración…</p>;
  }

  /** Escala vigente y su piso legal, para los campos y la validación. */
  const escalaActual = escalaDe(config);
  const minimaHabiles = escalaMinima('habiles');
  const erroresEscala = config.vacacionesDiasHabiles
    ? erroresDeEscala(escalaActual, 'habiles', carga.datos?.regimen)
    : {};

  /** Sólo en relación de dependencia hay aportes de ley que topear. */
  const exigeTope = tieneAportesDeLey(carga.datos?.regimen);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    // Un tramo por debajo del mínimo no se guarda: sería una config
    // ilegal cargada sin querer, y el que la paga es el empleado.
    if (Object.keys(erroresEscala).length > 0) {
      avisoError(
        'Revisá los días de vacaciones',
        'Hay tramos por debajo del mínimo que fija la ley.'
      );
      return;
    }
    const nuevos = juntarErrores({
      nombreEmpresa: validarRequerido(nombreEmpresa, 'El nombre de la empresa'),
      contactoNombre: validarRequerido(contactoNombre, 'El contacto'),
      contactoEmail:
        validarRequerido(contactoEmail, 'El email de contacto') ??
        validarEmail(contactoEmail),
      horaEntrada: validarRequerido(config.horaEntrada, 'La hora de entrada'),
      horaSalida: validarRequerido(config.horaSalida, 'La hora de salida'),
      tolerancia:
        !Number.isFinite(config.toleranciaLlegadaTardeMin) ||
        config.toleranciaLlegadaTardeMin < 0
          ? 'La tolerancia no puede ser negativa.'
          : null,
      diasAviso:
        !Number.isFinite(config.diasAvisoVencimiento) ||
        config.diasAvisoVencimiento < 1
          ? 'Los días de aviso deben ser al menos 1.'
          : null,
      /*
       * El tope sólo se exige donde hace falta: en régimen simplificado
       * no hay aportes de ley que retener, así que pedirlo sería trabar
       * la configuración por un dato que no entra en ninguna cuenta.
       */
      topeImponibleAportes: exigeTope
        ? errorDeConfiguracionDeTope(config.topeImponibleAportes)
        : config.topeImponibleAportes !== undefined
          ? errorDeConfiguracionDeTope(config.topeImponibleAportes)
          : null,
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setGuardando(true);
    try {
      await actualizarConfigEmpresa(config);
      await actualizarEmpresa({
        nombre: nombreEmpresa,
        contactoNombre,
        contactoEmail,
        contactoTelefono: contactoTelefono || undefined,
        cuit: cuit || undefined,
        razonSocial: razonSocial || undefined,
        domicilio: domicilioFiscal || undefined,
        logoUrl,
      });
      // El menú lee los módulos de un cache; sin esto, apagar una sección
      // no se vería hasta recargar la página.
      const empresaId = empresaVista?.id ?? usuario.empresaId;
      if (empresaId) olvidarModulos(empresaId);
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
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          Configuración
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Parámetros de {nombreEmpresa}.
        </p>
      </div>

      {/* Lo que le falta a la empresa, no a una persona. Va arriba de
          todo porque son datos que rompen cosas en otras secciones. */}
      {carga.datos && <BloqueFaltas faltas={faltasDeEmpresa(carga.datos)} />}

      <form onSubmit={guardar} className="flex flex-col gap-4">
        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Datos de la empresa
          </h2>
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
              error={errores.nombreEmpresa}
            />
            <Campo
              etiqueta="Contacto (nombre)"
              value={contactoNombre}
              onChange={(e) => setContactoNombre(e.target.value)}
              error={errores.contactoNombre}
            />
            <Campo
              etiqueta="Contacto (email)"
              type="email"
              value={contactoEmail}
              onChange={(e) => setContactoEmail(e.target.value)}
              error={errores.contactoEmail}
            />
            <Campo
              etiqueta="Contacto (teléfono)"
              value={contactoTelefono}
              onChange={(e) => setContactoTelefono(e.target.value)}
              placeholder="11-5555-0000"
            />
            <Campo
              etiqueta="CUIT"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              placeholder="30-12345678-9"
            />
            <Campo
              etiqueta="Razón social"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Si difiere del nombre comercial"
            />
            <Campo
              etiqueta="Domicilio fiscal"
              value={domicilioFiscal}
              onChange={(e) => setDomicilioFiscal(e.target.value)}
            />
          </div>
        </Panel>

        {/* Sin control horario no hay nada que configurar acá, y mostrar
            "hora de entrada" y "tolerancia de llegada tarde" a una
            empresa administrativa es lo que hace pensar que la app viene
            a controlar horarios. */}
        {conFichaje && (
          <Panel>
            <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
              Fichaje
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
              El modo de fichaje (en planta, celular con GPS o remoto) se
              configura por colaborador desde su ficha. El horario de acá es el
              punto de partida al asignar un turno nuevo: el control de llegadas
              tarde y horas extras se hace siempre contra el turno de cada
              persona.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <CampoHora
                etiqueta="Hora de entrada"
                value={config.horaEntrada}
                onChange={(v) => setConfig({ ...config, horaEntrada: v })}
                error={errores.horaEntrada}
              />
              <CampoHora
                etiqueta="Hora de salida"
                value={config.horaSalida}
                onChange={(v) => setConfig({ ...config, horaSalida: v })}
                error={errores.horaSalida}
              />
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
                {errores.tolerancia && (
                  <span className="text-xs font-medium text-red-600">
                    {errores.tolerancia}
                  </span>
                )}
              </label>
            </div>
          </Panel>
        )}

        {/* Las terminales son las tablets donde se ficha: sin control
            horario no hay ninguna que administrar. */}
        {conFichaje && (
          <Panel>
            <Terminales />
          </Panel>
        )}

        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Remuneraciones
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Se usa para estimar el costo laboral total en Remuneraciones (masa
            salarial + cargas).
          </p>
          <label className="mt-4 flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Cargas patronales estimadas (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={
                Math.round((config.cargasPatronalesPct ?? 0.27) * 1000) / 10
              }
              onChange={(e) =>
                setConfig({
                  ...config,
                  cargasPatronalesPct: Number(e.target.value) / 100,
                })
              }
              className={campoClase}
            />
          </label>
          <label className="mt-4 flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Horas mensuales para el valor hora
            </span>
            <input
              type="number"
              min={1}
              max={400}
              step={1}
              value={config.horasMensuales ?? HORAS_MENSUALES}
              onChange={(e) =>
                setConfig({
                  ...config,
                  horasMensuales: Number(e.target.value) || HORAS_MENSUALES,
                })
              }
              className={campoClase}
            />
            <span className="text-xs text-ink-soft">
              Con esto se divide el bruto para sugerir el pago de las horas
              extras al liquidar. {HORAS_MENSUALES} es la jornada legal (48 hs
              semanales); si tu convenio usa otra base, cambiala acá.
            </span>
          </label>
          <label
            className="mt-4 flex max-w-xs flex-col gap-1.5"
            {...(errores.topeImponibleAportes
              ? { 'data-error-campo': '' }
              : {})}
          >
            <span className="text-sm font-semibold text-ink">
              Tope de base imponible para aportes{exigeTope ? ' *' : ''}
            </span>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Ej.: 1200000"
              value={config.topeImponibleAportes ?? ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  topeImponibleAportes:
                    e.target.value.trim() === ''
                      ? undefined
                      : Number(e.target.value),
                })
              }
              className={campoClase}
            />
            {errores.topeImponibleAportes && (
              <span className="text-xs font-medium text-red-600">
                {errores.topeImponibleAportes}
              </span>
            )}
            <span className="text-xs text-ink-soft">
              Por encima de este monto no se aportan jubilación, PAMI ni obra
              social (art. 9, Ley 24.241). ANSES lo actualiza cada trimestre,
              así que hay que ponerlo al día.{' '}
              {exigeTope
                ? 'Es obligatorio: sin este dato no se pueden cargar ni importar remuneraciones.'
                : 'En tu régimen no se retienen aportes de ley, así que este dato no se usa.'}
            </span>
          </label>
        </Panel>

        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Vacaciones
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Por defecto se cuentan días corridos, que es lo que fija la LCT
            (art. 150). Algunas empresas otorgan días hábiles: es más generoso
            —los mismos 14 días cubren unas tres semanas— y por eso está
            permitido, porque la ley marca un piso y no un techo.
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            La opción cambia cómo se descuentan los días de cada licencia,
            cuántos quedan disponibles y cuánto se paga de vacaciones no gozadas
            en la liquidación final. Conviene definirla al empezar: si se cambia
            con licencias ya cargadas, las viejas quedan contadas con el
            criterio anterior.
          </p>
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <Switch
              checked={Boolean(config.vacacionesDiasHabiles)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  vacacionesDiasHabiles: e.target.checked,
                })
              }
            />
            <span className="text-sm font-semibold text-ink">
              Contar vacaciones en días hábiles (lun–vie)
            </span>
          </label>

          {/*
            Los días sólo se eligen en hábiles. En corridos rige la escala
            de la LCT y no hay nada que acordar; mostrar campos editables
            ahí invitaría a cargar algo por debajo del mínimo legal.
          */}
          {config.vacacionesDiasHabiles && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-sm font-semibold text-ink">
                Días por antigüedad
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                Arrancan en el equivalente al mínimo de ley. Subilos a lo que
                hayan acordado; no se puede bajar del mínimo.
              </p>
              <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                {TRAMOS_VACACIONES.map(({ clave, etiqueta }) => (
                  <Campo
                    key={clave}
                    etiqueta={etiqueta}
                    type="number"
                    value={String(escalaActual[clave])}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        vacacionesEscala: {
                          ...config.vacacionesEscala,
                          [clave]: Number(e.target.value),
                        },
                      })
                    }
                    error={erroresEscala[clave]}
                    ayuda={`Mínimo legal: ${minimaHabiles[clave]}`}
                  />
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Los módulos se administran desde Empresas → la ficha del
            cliente → Módulos, y sólo los toca el dueño de ISEO: definen
            el alcance de lo contratado. Tener el mismo interruptor en dos
            lugares es la forma más rápida de que queden desincronizados. */}
        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Secciones activas
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Estas son las secciones que tiene habilitadas la empresa. Si
            necesitás prender o apagar alguna, escribinos: forma parte del
            alcance contratado.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {MODULOS_OPCIONALES.map((m) => {
              const activo = config.modulos?.[m.clave] !== false;
              return (
                <span
                  key={m.clave}
                  title={m.descripcion}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    activo
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-paper text-ink-soft line-through'
                  }`}
                >
                  {m.etiqueta}
                </span>
              );
            })}
          </div>

          {/*
            Adentro de una empresa el superadmin opera con `rolEfectivo`
            de admin_rrhh, así que el ítem "Empresas" desaparece del menú
            y desde acá no había ningún camino hasta los interruptores
            reales: había que salir de la empresa y volver a buscarla.
            El atajo es de navegación y nada más —quien decide sigue
            siendo el guard de la pantalla de Módulos y el trigger
            `columnas_de_iseo`—, y se muestra por el rol crudo, para que
            el admin del cliente no lo vea nunca.
          */}
          {usuario.rol === 'superadmin' && idEmpresaVista && (
            <Link
              href={`/empresas/${idEmpresaVista}/modulos`}
              className="presionable mt-4 inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-brand-300"
            >
              <IconLayoutGrid size={16} className="text-ink-soft" />
              Prender o apagar secciones
            </Link>
          )}
        </Panel>

        <CuposLicenciaPanel />

        <FeriadosPanel />

        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Alertas
          </h2>
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
            {errores.diasAviso && (
              <span className="text-xs font-medium text-red-600">
                {errores.diasAviso}
              </span>
            )}
          </label>
        </Panel>

        {/* Ausente = prendido, para que las empresas que ya existen lo
            tengan sin que nadie entre a activarlo. */}
        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Resumen semanal
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Los lunes te llega un mail con lo que quedó pendiente: ausencias sin
            resolver, recibos sin firmar, consultas sin responder y vencimientos
            cercanos. Si la semana no tiene nada pendiente, no se manda nada.
          </p>
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl bg-paper px-4 py-3">
            <Switch
              checked={config.resumenSemanal !== false}
              onChange={(e) =>
                setConfig({ ...config, resumenSemanal: e.target.checked })
              }
            />
            <span className="text-sm font-medium text-ink">
              Quiero recibir el resumen semanal
            </span>
          </label>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Los avisos puntuales —te respondieron una consulta, hay un recibo
            para firmar— se mandan siempre y no dependen de esto.
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
    </div>
  );
};

/** Son los parámetros de una empresa: sin una activa no hay qué configurar. */
const ConfiguracionConEmpresa = () => (
  <RequireEmpresa>
    <ConfiguracionPage />
  </RequireEmpresa>
);

export default ConfiguracionConEmpresa;
