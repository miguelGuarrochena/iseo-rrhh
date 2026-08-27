'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';

export interface FiltrosFichadas {
  desde: string;
  hasta: string;
  /** Busca en nombre, apellido, legajo y DNI. */
  nombre: string;
  sector: string;
  soloIncompletos: boolean;
}

interface Props {
  abierto: boolean;
  valores: FiltrosFichadas;
  sectores: string[];
  /**
   * Historial de una sola persona (el empleado mirando el suyo): buscar
   * por colaborador o por sector no filtraría nada.
   */
  sinColaborador?: boolean;
  onCerrar: () => void;
  onAplicar: (valores: FiltrosFichadas) => void;
  onRestablecer: () => void;
}

/**
 * Filtros del historial, con la misma forma que los de la aplicación
 * que el cliente usa hoy: rango de fechas arriba, el resto abajo, y
 * "Restablecer" a la izquierda de los botones.
 *
 * Los cambios se guardan en un borrador y recién se aplican al
 * confirmar. Aplicarlos en vivo dispararía una consulta por cada tecla
 * del campo de nombre.
 */
export const FiltrosFichadasModal = ({
  abierto,
  valores,
  sectores,
  sinColaborador = false,
  onCerrar,
  onAplicar,
  onRestablecer,
}: Props) => {
  const [borrador, setBorrador] = useState<FiltrosFichadas>(valores);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setBorrador(valores);
      setError(null);
    }
  }, [abierto, valores]);

  const set = <K extends keyof FiltrosFichadas>(
    campo: K,
    valor: FiltrosFichadas[K]
  ) => setBorrador((prev) => ({ ...prev, [campo]: valor }));

  const aplicar = () => {
    if (!borrador.desde || !borrador.hasta) {
      setError('Completá las dos fechas.');
      return;
    }
    // Un rango al revés no devuelve nada y desde afuera parece que no
    // hay fichadas, así que conviene decirlo en vez de mostrar vacío.
    if (borrador.desde > borrador.hasta) {
      setError('La fecha "desde" tiene que ser anterior a "hasta".');
      return;
    }
    onAplicar(borrador);
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Filtros"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <CampoFecha
            etiqueta="Desde *"
            value={borrador.desde}
            onChange={(v) => set('desde', v)}
          />
          <CampoFecha
            etiqueta="Hasta *"
            value={borrador.hasta}
            onChange={(v) => set('hasta', v)}
          />
        </div>

        {!sinColaborador && (
          <>
            <Campo
              etiqueta="Colaborador"
              value={borrador.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              placeholder="Nombre, apellido, legajo o DNI"
              ayuda="Busca por coincidencia parcial."
            />

            <CampoSelect
              etiqueta="Sector"
              value={borrador.sector}
              onChange={(v) => set('sector', v)}
              opciones={[
                { valor: '', etiqueta: 'Todos los sectores' },
                ...sectores.map((s) => ({ valor: s, etiqueta: s })),
              ]}
            />
          </>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-paper p-4">
          <input
            type="checkbox"
            checked={borrador.soloIncompletos}
            onChange={(e) => set('soloIncompletos', e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
          />
          <span>
            <span className="text-sm font-semibold text-ink">
              Solo jornadas sin cerrar
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
              Jornadas con entrada pero sin salida (o al revés). Son las que hay
              que corregir antes de liquidar. No incluye a quien está trabajando
              en este momento.
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Boton
            variante="sutil"
            tamano="sm"
            onClick={() => {
              onRestablecer();
              onCerrar();
            }}
          >
            Restablecer
          </Boton>
          <div className="ml-auto flex gap-2">
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton onClick={aplicar}>Confirmar</Boton>
          </div>
        </div>
      </div>
    </Modal>
  );
};
