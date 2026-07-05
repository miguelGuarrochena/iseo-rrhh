'use client';

import { useEffect, useState } from 'react';
import {
  IconCircleCheck,
  IconDeviceTablet,
  IconTrash,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  getTerminales,
  quitarTerminal,
  registrarTerminal,
} from '@/lib/services/rrhh';
import {
  borrarTerminalLocal,
  getTerminalLocal,
  setTerminalLocal,
} from '@/lib/terminal';
import { Terminal } from '@/types/rrhh';

export const Terminales = () => {
  const [terminales, setTerminales] = useState<Terminal[]>([]);
  const [nombre, setNombre] = useState('Tablet de planta');
  const [guardando, setGuardando] = useState(false);
  const [localId, setLocalId] = useState<string | null>(null);

  const cargar = () => void getTerminales().then(setTerminales);

  useEffect(() => {
    cargar();
    setLocalId(getTerminalLocal());
  }, []);

  const esteEsTerminal =
    localId != null && terminales.some((t) => t.id === localId);

  const autorizar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      const t = await registrarTerminal(nombre.trim());
      setTerminalLocal(t.id);
      setLocalId(t.id);
      avisoExito(
        'Dispositivo autorizado',
        'Ya podés usar el Modo planta en este equipo.'
      );
      cargar();
    } catch {
      avisoError('No pudimos autorizar el dispositivo', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (t: Terminal) => {
    try {
      await quitarTerminal(t.id);
      if (t.id === localId) {
        borrarTerminalLocal();
        setLocalId(null);
      }
      cargar();
    } catch {
      avisoError('No pudimos quitar la terminal', 'Probá de nuevo.');
    }
  };

  return (
    <div>
      <h2 className="text-base font-bold text-ink">Terminales de fichaje</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Autorizá una tablet como terminal del Modo planta. El fichaje facial de
        planta solo funciona en dispositivos autorizados: así nadie puede fichar
        desde su propio equipo.
      </p>

      {esteEsTerminal ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <IconCircleCheck size={18} />
          Este dispositivo está autorizado como terminal.
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-paper/50 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Campo
              etiqueta="Nombre de la terminal"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Tablet entrada planta"
            />
          </div>
          <Boton onClick={() => void autorizar()} disabled={guardando}>
            <IconDeviceTablet size={18} />
            {guardando ? 'Autorizando…' : 'Autorizar este dispositivo'}
          </Boton>
        </div>
      )}

      {terminales.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {terminales.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <IconDeviceTablet size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{t.nombre}</p>
                  {t.id === localId && (
                    <p className="text-xs text-emerald-700">Este dispositivo</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void quitar(t)}
                aria-label="Quitar terminal"
                className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-1 text-ink-soft transition-colors hover:text-red-600"
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
