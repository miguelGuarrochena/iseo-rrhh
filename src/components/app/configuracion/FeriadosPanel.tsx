'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { avisoError, avisoExito } from '@/lib/avisos';
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

const tipoExtraOpciones = [
  { valor: 'empresa', etiqueta: 'De la empresa' },
  { valor: 'puente', etiqueta: 'Puente turístico' },
];

/**
 * Calendario de feriados de la empresa. Los nacionales se aseguran solos
 * al leer (agenda, vacaciones, fichadas). Acá RRHH suma puentes y días
 * propios, y puede quitar sólo esos (no los nacionales).
 */
export const FeriadosPanel = () => {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [lista, setLista] = useState<Feriado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipoExtra, setTipoExtra] = useState<'puente' | 'empresa'>('empresa');
  const [guardando, setGuardando] = useState(false);
  const { confirmar, dialogo } = useConfirmacion();

  const cargar = useCallback(() => {
    setCargando(true);
    void getFeriados(anio)
      .then(setLista)
      .finally(() => setCargando(false));
  }, [anio]);

  useEffect(cargar, [cargar]);

  const agregar = async () => {
    if (!fecha || !nombre.trim()) {
      avisoError('Falta la fecha o el nombre');
      return;
    }
    setGuardando(true);
    try {
      await guardarFeriados([
        {
          fecha,
          nombre: nombre.trim(),
          tipo: tipoExtra,
          noLaborable: true,
        },
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
    if (f.tipo === 'nacional') {
      avisoError(
        'Los feriados nacionales no se borran',
        'Se cargan solos todos los años. Si ese día se trabaja, sumalo como excepción en otro lado o consultá a soporte.'
      );
      return;
    }
    if (f.id.startsWith('nacional-')) {
      // Virtual (aún no persistido): no hay fila que borrar.
      return;
    }
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
            Los nacionales (fijos, trasladables y Carnaval / Viernes Santo) se
            cargan solos cada año. Acá sumás puentes turísticos y días no
            laborables de la empresa; se descuentan de las vacaciones cuando
            las cuentan en días hábiles.
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
        <p className="mt-4 text-sm text-ink-soft">
          No hay feriados para {anio}.
        </p>
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
              {f.tipo !== 'nacional' && (
                <button
                  type="button"
                  onClick={() => void borrar(f)}
                  aria-label={`Quitar ${f.nombre}`}
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-semibold text-ink">Agregar puente o día de la empresa</p>
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
          <div className="sm:w-44">
            <CampoSelect
              etiqueta="Tipo"
              value={tipoExtra}
              onChange={(v) => setTipoExtra(v as 'puente' | 'empresa')}
              opciones={tipoExtraOpciones}
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
