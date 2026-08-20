'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { IconFaceId, IconLock, IconWifiOff } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoPassword } from '@/components/app/ui/CampoPassword';
import { AvisoBateria } from '@/components/app/facial/AvisoBateria';
import { FichajeFacialModal } from '@/components/app/facial/FichajeFacialModal';
import { PinPad } from '@/components/app/fichaje/PinPad';
import {
  desactivarKiosco,
  empresaDelKiosco,
  intentosPinKiosco,
  MAX_INTENTOS_PIN,
  PAUSA_ENTRE_MARCAS_KIOSCO_MIN,
  pinBloqueado,
  pinLargoKiosco,
  puedeAdministrarTerminal,
  salirKioscoForzado,
} from '@/lib/kiosco';
import { getEmpleados, getEmpresa } from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';
import { useCarga } from '@/lib/useCarga';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useBateria } from '@/lib/dispositivo/useBateria';

type Pestania = 'fichar' | 'opciones';

/**
 * Tablet compartida: los colaboradores solo fichan. El menú de la app no
 * va acá —ahí están sueldos y legajos—. El PIN (o un usuario de RRHH)
 * abre la app en esta tablet; la sesión sigue y el PIN no se vuelve a
 * pedir. Para dejarla fichando otra vez, Modo planta.
 */
export const ModoKiosco = ({ onSalir }: { onSalir: () => void }) => {
  const { usuario, empresaVista, entrarAEmpresa, login, logout } = useAuth();
  const [pestania, setPestania] = useState<Pestania>('fichar');
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [conUsuario, setConUsuario] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hora, setHora] = useState('');
  const [bloqueado, setBloqueado] = useState(pinBloqueado());
  const [abrirAlEstarListo, setAbrirAlEstarListo] = useState(false);
  const bateria = useBateria();
  const largoPin = pinLargoKiosco();

  useEffect(() => {
    if (empresaVista?.id || usuario?.empresaId) return;
    const guardada = empresaDelKiosco();
    if (guardada) entrarAEmpresa(guardada);
  }, [empresaVista, usuario, entrarAEmpresa]);

  const hayEmpresa = Boolean(empresaVista?.id ?? usuario?.empresaId);

  const cEmpresa = useCarga(() => getEmpresa(), [hayEmpresa], {
    activo: hayEmpresa,
    contexto: 'kiosco/empresa',
  });
  const empresa = cEmpresa.datos ?? empresaVista ?? null;

  const cEmpleados = useCarga(() => getEmpleados(), [hayEmpresa], {
    activo: hayEmpresa,
    contexto: 'kiosco/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cEmpleados.datos;

  useEffect(() => {
    const tick = () =>
      setHora(
        new Date().toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const nombreEmpleado = useCallback(
    (id: string): string => {
      const e = empleados.find((x) => x.id === id);
      return e ? `${e.nombre} ${e.apellido}` : 'Colaborador';
    },
    [empleados]
  );

  const puedeFichar = hayEmpresa && cEmpleados.fase === 'ok';
  const cargando =
    cEmpleados.fase === 'cargando' || cEmpresa.fase === 'cargando';

  const recargarEmpresa = cEmpresa.recargar;
  const recargarEmpleados = cEmpleados.recargar;

  const reintentar = useCallback(() => {
    if (!empresaVista?.id && !usuario?.empresaId) {
      const guardada = empresaDelKiosco();
      if (guardada) entrarAEmpresa(guardada);
    }
    recargarEmpresa();
    recargarEmpleados();
  }, [
    empresaVista,
    usuario,
    entrarAEmpresa,
    recargarEmpresa,
    recargarEmpleados,
  ]);

  useEffect(() => {
    if (puedeFichar) return;
    const id = window.setInterval(reintentar, 15_000);
    return () => window.clearInterval(id);
  }, [puedeFichar, reintentar]);

  useEffect(() => {
    if (!abrirAlEstarListo || !puedeFichar) return;
    if (pestania !== 'fichar') {
      setAbrirAlEstarListo(false);
      return;
    }
    setAbrirAlEstarListo(false);
    setCamaraAbierta(true);
  }, [abrirAlEstarListo, puedeFichar, pestania]);

  const tocarFichar = () => {
    setPestania('fichar');
    if (puedeFichar) {
      setCamaraAbierta(true);
      return;
    }
    setAbrirAlEstarListo(true);
    reintentar();
  };

  const intentarPin = async () => {
    setPinError(null);
    if (await desactivarKiosco(pin)) {
      onSalir();
      return;
    }
    setPin('');
    const trabado = pinBloqueado();
    setBloqueado(trabado);
    const restan = MAX_INTENTOS_PIN - intentosPinKiosco();
    setPinError(
      trabado
        ? 'Demasiados intentos. Entrá con tu usuario de RRHH.'
        : restan === 1
          ? 'PIN incorrecto. Te queda 1 intento.'
          : `PIN incorrecto. Te quedan ${restan} intentos.`
    );
  };

  const entrarComoAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setEnviando(true);
    try {
      const u = await login(email.trim(), password);
      if (!u) {
        setLoginError('Email o contraseña incorrectos.');
        return;
      }
      if (!puedeAdministrarTerminal(u, empresaDelKiosco() ?? empresa)) {
        logout();
        setLoginError('Esta cuenta no administra esta tablet.');
        return;
      }
      salirKioscoForzado();
      onSalir();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'No pudimos entrar.');
    } finally {
      setEnviando(false);
    }
  };

  const etiquetaFichar =
    cargando && abrirAlEstarListo ? 'Conectando…' : 'Tocá para fichar';
  const ayudaFichar = puedeFichar
    ? 'Se abre la cámara. Sin tocar, no ficha nadie.'
    : cargando
      ? 'Estamos reconectando. Si no abre, tocá de nuevo.'
      : 'No hay conexión. Tocá para reintentar. Si sigue, avisá a tu responsable.';

  return (
    <div className="app-scope bg-app fixed inset-0 z-50 flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {empresa?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={empresa.logoUrl}
              alt={empresa.nombre}
              className="h-9 w-auto"
            />
          ) : (
            <Logo className="h-8 w-auto" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">
              {empresa?.nombre ?? 'Fichaje en planta'}
            </p>
            <p className="truncate text-xs text-ink-soft">
              Tocá Fichar para abrir la cámara. No está prendida todo el tiempo.
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[0.65rem] font-bold ${
            puedeFichar
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          {puedeFichar ? 'Listo' : cargando ? 'Conectando' : 'Sin conexión'}
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 pb-28 pt-2 text-center">
        {pestania === 'fichar' ? (
          <>
            <div>
              <p className="text-6xl font-extrabold tracking-tight text-ink sm:text-7xl">
                {hora}
              </p>
              <p className="mt-2 text-sm capitalize text-ink-soft">
                {new Date().toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </div>

            {!puedeFichar && (
              <p className="flex max-w-sm items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-left text-xs font-semibold text-amber-900">
                <IconWifiOff size={16} className="shrink-0" />
                Reintentamos solos cada 15 segundos. También podés tocar Fichar.
              </p>
            )}

            {bateria.alerta !== 'ok' && (
              <AvisoBateria bateria={bateria} className="max-w-sm" />
            )}

            <div className="w-full max-w-md rounded-2xl border border-line bg-surface px-5 py-4 text-left">
              <p className="text-xl font-extrabold tracking-tight text-ink">
                Para fichar
              </p>
              <ol className="mt-3 flex flex-col gap-2.5 text-base font-medium leading-snug text-ink">
                <li>
                  <strong className="text-brand-700">1.</strong> Tocá el botón
                  Fichar. La cámara no está prendida hasta que lo toques.
                </li>
                <li>
                  <strong className="text-brand-700">2.</strong> Cara de frente
                  en el óvalo y parpadeá una vez.
                </li>
                <li>
                  <strong className="text-brand-700">3.</strong> Mirá si dice
                  Ingreso o Egreso. Después, el que sigue toca Fichar.
                </li>
              </ol>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Si ya ingresaste, esperá {PAUSA_ENTRE_MARCAS_KIOSCO_MIN} minutos
                para el egreso. Si no, dejá pasar al que sigue.
              </p>
            </div>

            <button
              type="button"
              onClick={tocarFichar}
              className="presionable flex cursor-pointer flex-col items-center gap-4 rounded-3xl border border-brand-200 bg-surface px-12 py-10 sm:px-14"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <IconFaceId size={44} stroke={1.6} />
              </span>
              <span className="text-2xl font-extrabold text-ink">
                {etiquetaFichar}
              </span>
              <span className="max-w-64 text-sm font-semibold leading-relaxed text-ink-soft">
                {ayudaFichar}
              </span>
            </button>
          </>
        ) : (
          <div className="flex w-full max-w-sm flex-col items-center gap-5 text-left">
            <div className="w-full">
              <p className="text-lg font-bold text-ink">Solo para RRHH</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                El PIN abre la app en esta tablet. No te saca ni pide otro PIN.
                Cuando termines, en Fichaje tocá Modo planta.
              </p>
            </div>

            {bloqueado || conUsuario ? (
              <form
                onSubmit={(e) => void entrarComoAdmin(e)}
                className="flex w-full flex-col gap-3"
              >
                <Campo
                  etiqueta="Email de RRHH o ISEO"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                />
                <CampoPassword
                  etiqueta="Contraseña"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {loginError && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {loginError}
                  </p>
                )}
                <Boton type="submit" disabled={enviando || !email || !password}>
                  {enviando ? 'Entrando…' : 'Entrar y desbloquear'}
                </Boton>
                {!bloqueado && (
                  <button
                    type="button"
                    onClick={() => {
                      setConUsuario(false);
                      setLoginError(null);
                    }}
                    className="min-h-11 cursor-pointer border-0 bg-transparent text-sm font-semibold text-brand-700"
                  >
                    Usar el PIN
                  </button>
                )}
              </form>
            ) : (
              <>
                <p className="w-full text-sm font-semibold text-ink">
                  PIN de esta tablet
                </p>
                <PinPad
                  value={pin}
                  max={largoPin ?? 6}
                  onChange={(v) => {
                    setPin(v);
                    setPinError(null);
                  }}
                  onConfirmar={() => void intentarPin()}
                />
                {pinError && (
                  <p className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {pinError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setConUsuario(true);
                    setPin('');
                    setPinError(null);
                  }}
                  className="min-h-11 cursor-pointer border-0 bg-transparent text-sm font-semibold text-brand-700"
                >
                  ¿No tenés el PIN? Entrá con tu usuario
                </button>
              </>
            )}
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md items-stretch">
          <button
            type="button"
            onClick={tocarFichar}
            className={`flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent text-xs font-semibold ${
              pestania === 'fichar' ? 'text-brand-600' : 'text-ink-soft'
            }`}
          >
            <IconFaceId size={22} stroke={pestania === 'fichar' ? 2 : 1.6} />
            Fichar
          </button>
          <button
            type="button"
            onClick={() => setPestania('opciones')}
            className={`flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent text-xs font-semibold ${
              pestania === 'opciones' ? 'text-brand-600' : 'text-ink-soft'
            }`}
          >
            <IconLock size={22} stroke={pestania === 'opciones' ? 2 : 1.6} />
            RRHH
          </button>
        </div>
      </nav>

      <FichajeFacialModal
        abierto={camaraAbierta}
        onCerrar={() => setCamaraAbierta(false)}
        modo="identificar"
        /*
         * La tablet no pide GPS. Está atornillada en la planta, así que
         * su ubicación no dice nada de quién ficha; y cuando el GPS no
         * engancha —lo normal bajo techo— `obtenerUbicacion` se queda
         * hasta 8 segundos esperando un `timeout` antes de devolver
         * undefined. Con una fila de gente a la mañana, esos 8 segundos
         * por persona eran buena parte de la sensación de "la tablet va
         * lenta". La garantía de presencia acá es la terminal
         * autorizada, no la coordenada.
         */
        pedirUbicacion={false}
        resolverNombre={nombreEmpleado}
      />
    </div>
  );
};
