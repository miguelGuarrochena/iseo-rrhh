'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { avisoError, avisoExito } from '@/lib/avisos';
import { feriadosSugeridos } from '@/lib/feriados';
import { formatearFecha } from '@/lib/fechas';
import {
  eliminarFeriado,
  getFeriados,
  guardarFeriados,
} from '@/lib/services/rrhh';
import { Feriado } from '@/types/rrhh';

const diaDeLaSemana = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long' });

const tipoLabels: Record<Feriado['tipo'], string> = {
  nacional: 'Nacional',
  puente: 'Puente',
  empresa: 'De la empresa',
};

/**
 * Calendario de feriados de la empresa. Se usa para no descontar esos
 * días de las vacaciones y para saber que lo trabajado ahí va aparte.
 */
export const FeriadosPanel = () => {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [lista, setLista] = useState<Feriado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { confirmar, dialogo } = useConfirmacion();

  const cargar = useCallback(() => {
    setCargando(true);
    void getFeriados(anio)
      .then(setLista)
      .finally(() => setCargando(false));
  }, [anio]);

  useEffect(cargar, [cargar]);

  const cargarSugeridos = async () => {
    setGuardando(true);
    try {
      const agregados = await guardarFeriados(feriadosSugeridos(anio));
      avisoExito(
        agregados.length > 0
          ? `Se cargaron ${agregados.length} feriados de ${anio}`
          : 'Ya estaban todos cargados',
        'Revisá si faltan puentes turísticos: esos salen por decreto cada año.'
      );
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos cargarlos',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const agregar = async () => {
    if (!fecha || !nombre.trim()) {
      avisoError('Falta la fecha o el nombre');
      return;
    }
    setGuardando(true);
    try {
      await guardarFeriados([
        { fecha, nombre: nombre.trim(), tipo: 'empresa', noLaborable: true },
      ]);
      avisoExito('Feriado agregado');
      setFecha('');
      setNombre('');
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos agregarlo',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const borrar = async (f: Feriado) => {
    const ok = await confirmar({
      titulo: 'Quitar feriado',
      detalle: `${f.nombre} (${formatearFecha(f.fecha)}) deja de contarse como día no laborable.`,
      confirmar: 'Quitar',
      peligrosa: true,
    });
    if (!ok) return;
    try {
      await eliminarFeriado(f.id);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos quitarlo',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Feriados</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Los sábados y domingos ya se detectan solos. Acá cargás los
            feriados, que se descuentan de las vacaciones cuando la empresa las
            cuenta en días hábiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => setAnio((a) => a - 1)}
          >
            ←
          </Boton>
          <span className="min-w-[3.5rem] text-center text-base font-bold tabular-nums text-ink">
            {anio}
          </span>
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => setAnio((a) => a + 1)}
          >
            →
          </Boton>
        </div>
      </div>

      {cargando ? (
        <p className="mt-4 text-sm text-ink-soft">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-paper px-4 py-5">
          <p className="text-sm text-ink">
            No hay feriados cargados para {anio}.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Puedo cargar los nacionales (fijos, trasladables según la ley, más
            Carnaval y Viernes Santo). Los puentes turísticos salen por decreto
            cada año, así que esos los cargás vos.
          </p>
          <Boton
            className="mt-3"
            onClick={() => void cargarSugeridos()}
            disabled={guardando}
          >
            Cargar feriados de {anio}
          </Boton>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {lista.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {f.nombre}
                </p>
                <p className="truncate text-xs capitalize text-ink-soft">
                  {diaDeLaSemana(f.fecha)} {formatearFecha(f.fecha)} ·{' '}
                  {tipoLabels[f.tipo]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void borrar(f)}
                aria-label={`Quitar ${f.nombre}`}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))}
          <Boton
            variante="secundario"
            tamano="sm"
            className="self-start"
            onClick={() => void cargarSugeridos()}
            disabled={guardando}
          >
            Completar con los nacionales de {anio}
          </Boton>
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-semibold text-ink">Agregar uno</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <CampoFecha etiqueta="Fecha" value={fecha} onChange={setFecha} />
          </div>
          <div className="flex-1">
            <Campo
              etiqueta="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.currentTarget.value)}
              placeholder="Ej: Día del gremio"
            />
          </div>
          <Boton onClick={() => void agregar()} disabled={guardando}>
            <IconPlus size={18} />
            Agregar
          </Boton>
        </div>
      </div>

      {dialogo}
    </Panel>
  );
};
