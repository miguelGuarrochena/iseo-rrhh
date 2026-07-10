'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconFaceId, IconLock } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { FichajeFacialModal } from '@/components/app/facial/FichajeFacialModal';
import { desactivarKiosco } from '@/lib/kiosco';
import { avisoExito } from '@/lib/avisos';
import { getEmpleados, getEmpresa } from '@/lib/services/rrhh';
import { formatearHora } from '@/lib/fechas';
import { Empleado, Empresa } from '@/types/rrhh';

/**
 * Pantalla de la tablet bloqueada como terminal de fichaje: solo se
 * puede fichar con la cara. Nada de la sesión que la activó queda
 * accesible; para salir hace falta el PIN.
 */
export const ModoKiosco = ({ onSalir }: { onSalir: () => void }) => {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [salidaAbierta, setSalidaAbierta] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [hora, setHora] = useState('');

  useEffect(() => {
    void getEmpresa().then(setEmpresa);
    void getEmpleados().then(setEmpleados);
  }, []);

  // Reloj grande, para que la terminal sirva también de referencia.
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

  const intentarSalir = async () => {
    setPinError(null);
    if (await desactivarKiosco(pin)) {
      setSalidaAbierta(false);
      setPin('');
      onSalir();
    } else {
      setPinError('PIN incorrecto.');
    }
  };

  return (
    <div className="app-scope bg-app fixed inset-0 z-50 flex min-h-screen flex-col">
      {/* Marca de la empresa */}
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
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
          <span className="text-sm font-bold text-ink">
            {empresa?.nombre ?? ''}
          </span>
        </div>
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-ink-soft">
          Terminal de fichaje
        </span>
      </header>

      {/* Centro: reloj + fichar */}
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        <div>
          <p className="text-6xl font-extrabold tracking-tight text-ink sm:text-7xl">
            {hora}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {new Date().toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCamaraAbierta(true)}
          className="flex cursor-pointer flex-col items-center gap-4 rounded-3xl border border-brand-200 bg-surface px-14 py-10 transition-colors hover:border-brand-400"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <IconFaceId size={44} stroke={1.6} />
          </span>
          <span className="text-xl font-bold text-ink">Fichar</span>
          <span className="max-w-56 text-sm text-ink-soft">
            Acercate y mirá a la cámara: te reconoce y registra tu ingreso o
            egreso.
          </span>
        </button>
      </main>

      {/* Salida con PIN, discreta */}
      <footer className="flex justify-center pb-6">
        <button
          type="button"
          onClick={() => {
            setPin('');
            setPinError(null);
            setSalidaAbierta(true);
          }}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-soft/70 transition-colors hover:text-ink"
        >
          <IconLock size={13} />
          Salir del modo terminal
        </button>
      </footer>

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

      <Modal
        opened={salidaAbierta}
        onClose={() => setSalidaAbierta(false)}
        title="Salir del modo terminal"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-sm text-ink-soft">
            Ingresá el PIN que se definió al bloquear esta tablet.
          </p>
          <Campo
            etiqueta="PIN"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            error={pinError ?? undefined}
            placeholder="••••"
          />
          <Boton onClick={() => void intentarSalir()} disabled={!pin}>
            Desbloquear
          </Boton>
        </div>
      </Modal>
    </div>
  );
};
