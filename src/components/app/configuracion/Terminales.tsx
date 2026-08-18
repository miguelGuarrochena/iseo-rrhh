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
  autorizarTerminal,
  getTerminales,
  quitarTerminal,
  setTerminalActiva,
} from '@/lib/services/rrhh';
import {
  borrarTerminalLocal,
  getTerminalLocal,
  setTerminalLocal,
} from '@/lib/terminal';
import { Terminal } from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

export const Terminales = () => {
  const [nombre, setNombre] = useState('Tablet de planta');
  const [guardando, setGuardando] = useState(false);
  const [localId, setLocalId] = useState<string | null>(null);

  const carga = useCarga(() => getTerminales(), [], {
    contexto: 'configuracion/terminales',
    inicial: [] as Terminal[],
  });
  const terminales = carga.datos;
  const cargar = carga.recargar;

  useEffect(() => {
    setLocalId(getTerminalLocal()?.id ?? null);
  }, []);

  const esteEsTerminal =
    localId != null && terminales.some((t) => t.id === localId);

  /**
   * El secreto que devuelve el servidor va derecho al almacenamiento de
   * este dispositivo y no se muestra ni se guarda en ningún otro lado:
   * se entrega una sola vez y no hay nada que hacer con él salvo
   * dejarlo acá. Si se pierde, se vuelve a autorizar la tablet.
   */
  const autorizar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      const { terminal, secreto } = await autorizarTerminal(nombre.trim());
      setTerminalLocal({ id: terminal.id, secreto });
      setLocalId(terminal.id);
      avisoExito('Tablet lista', 'Ahora andá a Fichaje y tocá Modo planta.');
      cargar();
    } catch {
      avisoError(
        'No pudimos autorizar el dispositivo',
        'Sólo RRHH puede autorizar una tablet. Probá de nuevo.'
      );
    } finally {
      setGuardando(false);
    }
  };

  const alternarActiva = async (t: Terminal) => {
    try {
      await setTerminalActiva(t.id, !t.activa);
      cargar();
    } catch {
      avisoError('No pudimos cambiar el estado', 'Probá de nuevo.');
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
      <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
        Terminales de fichaje
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Primer paso: autorizá esta tablet. Después andá a Fichaje y tocá Modo
        planta. Así el equipo ficha con la cara y nadie ve sueldos ni legajos.
      </p>

      {esteEsTerminal ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <IconCircleCheck size={18} />
          Este dispositivo está autorizado. Siguiente: Fichaje → Modo planta.
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

      {carga.fase === 'error' && carga.error && (
        <div className="mt-4">
          <BloqueError error={carga.error} onReintentar={carga.recargar} />
        </div>
      )}

      {terminales.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {terminales.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <IconDeviceTablet size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{t.nombre}</p>
                  {t.id === localId ? (
                    <p className="text-xs text-emerald-700">Este dispositivo</p>
                  ) : null}
                  {!t.activa && (
                    <p className="text-xs font-semibold text-amber-700">
                      Desactivada: no puede fichar
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => void alternarActiva(t)}
                >
                  {t.activa ? 'Desactivar' : 'Activar'}
                </Boton>
                <button
                  type="button"
                  onClick={() => void quitar(t)}
                  aria-label="Quitar terminal"
                  className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent inline-flex h-11 w-11 items-center justify-center sm:h-9 sm:w-9 text-ink-soft transition-colors hover:text-red-600"
                >
                  <IconTrash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
