'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconFaceId, IconLock } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoPassword } from '@/components/app/ui/CampoPassword';
import { FichajeFacialModal } from '@/components/app/facial/FichajeFacialModal';
import { PinPad } from '@/components/app/fichaje/PinPad';
import {
  desactivarKiosco,
  empresaDelKiosco,
  pinBloqueado,
  puedeAdministrarTerminal,
  salirKioscoForzado,
} from '@/lib/kiosco';
import { avisoExito } from '@/lib/avisos';
import { getEmpleados, getEmpresa } from '@/lib/services/rrhh';
import { formatearHora } from '@/lib/fechas';
import { Empleado } from '@/types/rrhh';
import { useCarga } from '@/lib/useCarga';
import { useAuth } from '@/lib/auth/AuthProvider';

type Pestania = 'fichar' | 'opciones';

/**
 * Tablet compartida: los colaboradores solo fichan. El menú de la app no
 * va acá —ahí están sueldos y legajos—. Para salir hay que saber el PIN
 * (y aun así se cierra la sesión) o entrar con un usuario de RRHH.
 */
export const ModoKiosco = ({ onSalir }: { onSalir: () => void }) => {
  const { usuario, empresaVista, entrarAEmpresa, login, logout } = useAuth();
  const router = useRouter();
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

  // Si se cayó la red, se recupera solo: no hace falta ir a Opciones.
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

  /** Un toque: si está listo abre la cámara; si no, recarga y ficha en cuanto vuelva. */
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
      logout();
      router.replace('/login');
      return;
    }
    setPin('');
    const trabado = pinBloqueado();
    setBloqueado(trabado);
    setPinError(
      trabado
        ? 'Demasiados intentos. Entrá con tu usuario de RRHH.'
        : 'PIN incorrecto.'
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
      setLoginError(
        err instanceof Error ? err.message : 'No pudimos entrar.'
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="app-scope bg-app fixed inset-0 z-50 flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-6">
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
          <span className="truncate text-sm font-bold text-ink">
            {empresa?.nombre ?? 'Terminal de fichaje'}
          </span>
        </div>
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

            <button
              type="button"
              onClick={tocarFichar}
              className="flex cursor-pointer flex-col items-center gap-4 rounded-3xl border border-brand-200 bg-surface px-14 py-10 transition-colors hover:border-brand-400"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <IconFaceId size={44} stroke={1.6} />
              </span>
              <span className="text-xl font-bold text-ink">
                {cargando && abrirAlEstarListo ? 'Conectando…' : 'Fichar'}
              </span>
              <span className="max-w-56 text-sm text-ink-soft">
                {puedeFichar
                  ? 'Acercate y mirá a la cámara: te reconoce y registra tu ingreso o egreso.'
                  : 'Tocá Fichar para volver a intentar. Si sigue así, avisá a tu responsable.'}
              </span>
            </button>
          </>
        ) : (
          <div className="flex w-full max-w-sm flex-col items-center gap-5 text-left">
            <div className="w-full">
              <p className="text-lg font-bold text-ink">Solo para RRHH</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                Los colaboradores fichan con la cara. Acá se desbloquea la
                tablet para configurarla.
              </p>
            </div>

            {bloqueado || conUsuario ? (
              <form
                onSubmit={(e) => void entrarComoAdmin(e)}
                className="flex w-full flex-col gap-3"
              >
                <Campo
                  etiqueta="Email"
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
                  <p className="text-sm font-semibold text-red-700">
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
                    className="cursor-pointer border-0 bg-transparent text-sm font-semibold text-brand-700"
                  >
                    Usar el PIN
                  </button>
                )}
              </form>
            ) : (
              <>
                <PinPad
                  value={pin}
                  onChange={(v) => {
                    setPin(v);
                    setPinError(null);
                  }}
                  onConfirmar={() => void intentarPin()}
                />
                {pinError && (
                  <p className="text-sm font-semibold text-red-700">
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
                  className="cursor-pointer border-0 bg-transparent text-sm font-semibold text-brand-700"
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
            Opciones
          </button>
        </div>
      </nav>

      <FichajeFacialModal
        abierto={camaraAbierta}
        onCerrar={() => setCamaraAbierta(false)}
        modo="identificar"
        resolverNombre={nombreEmpleado}
        onFichado={(marca, empleadoId) => {
          setCamaraAbierta(false);
          avisoExito(
            marca.tipo === 'ingreso'
              ? 'Ingreso registrado'
              : 'Egreso registrado',
            `${nombreEmpleado(empleadoId)} · ${formatearHora(marca.timestamp)}.`
          );
        }}
      />
    </div>
  );
};
