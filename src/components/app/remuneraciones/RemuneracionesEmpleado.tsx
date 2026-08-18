'use client';

import { useState } from 'react';
import { IconPlus, IconReportMoney, IconTrash } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { RemuneracionModal } from './RemuneracionModal';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { eliminarRemuneracion, getRemuneraciones } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo } from '@/lib/fechas';
import { tipoReciboLabels } from '@/lib/etiquetas';
import { Remuneracion } from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

interface Props {
  empleadoId: string;
  puedeEditar: boolean;
  /** Convenio del empleado (se arrastra a cada remuneración). */
  convenioEmpleado?: string;
}

const Cifra = ({
  etiqueta,
  valor,
  resta = false,
}: {
  etiqueta: string;
  valor: number;
  resta?: boolean;
}) => (
  <div className="min-w-0 rounded-xl bg-surface px-3 py-2">
    <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
      {etiqueta}
    </p>
    <p
      className={`mt-0.5 break-words text-sm font-semibold tabular-nums ${
        resta ? 'text-ink-soft' : 'text-ink'
      }`}
    >
      {resta ? '− ' : ''}
      {formatearPesos(valor)}
    </p>
  </div>
);

export const RemuneracionesEmpleado = ({
  empleadoId,
  puedeEditar,
  convenioEmpleado,
}: Props) => {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Remuneracion | null>(null);
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

  const carga = useCarga(
    async () => {
      const lista = await getRemuneraciones(empleadoId);
      return [...lista].sort((a, b) => (a.periodo < b.periodo ? 1 : -1));
    },
    [empleadoId],
    { contexto: 'ficha/remuneraciones', inicial: [] as Remuneracion[] }
  );
  const rems = carga.datos;
  const cargar = carga.recargar;

  const convenioSugerido =
    convenioEmpleado || rems.find((r) => r.convenio)?.convenio;

  const abrirNuevo = () => {
    setEditando(null);
    setModal(true);
  };
  const abrirEditar = (r: Remuneracion) => {
    if (!puedeEditar) return;
    setEditando(r);
    setModal(true);
  };

  const borrar = async (r: Remuneracion, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmar({
      titulo: 'Eliminar remuneración',
      detalle: `Vas a eliminar la remuneración de ${formatearPeriodo(r.periodo)}.`,
      confirmar: 'Eliminar',
      peligrosa: true,
    });
    if (!ok) return;
    try {
      await eliminarRemuneracion(r.id);
      avisoExito('Remuneración eliminada');
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos eliminarla',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <IconReportMoney size={18} className="shrink-0 text-ink-soft" />
          <h2 className="text-base font-bold text-ink">Remuneraciones</h2>
        </div>
        {puedeEditar && (
          <Boton variante="secundario" tamano="sm" onClick={abrirNuevo}>
            <IconPlus size={14} />
            <span className="sm:hidden">Cargar</span>
            <span className="hidden sm:inline">Cargar remuneración</span>
          </Boton>
        )}
      </div>

      {carga.fase === 'error' && carga.error ? (
        <BloqueError error={carga.error} onReintentar={carga.recargar} />
      ) : rems.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          {puedeEditar
            ? 'Sin remuneraciones cargadas. Usá “Cargar remuneración” para el sueldo del período.'
            : 'Todavía no hay remuneraciones cargadas.'}
        </p>
      ) : (
        <ul className="mt-4 flex max-h-[28rem] flex-col gap-2 overflow-y-auto overscroll-contain">
          {rems.map((r) => {
            const subtitulo = [
              r.tipo !== 'mensual' ? tipoReciboLabels[r.tipo] : null,
              r.convenio || null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={r.id}>
                <div
                  role={puedeEditar ? 'button' : undefined}
                  tabIndex={puedeEditar ? 0 : undefined}
                  onClick={() => abrirEditar(r)}
                  onKeyDown={(e) => {
                    if (!puedeEditar) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      abrirEditar(r);
                    }
                  }}
                  className={`rounded-2xl border border-line bg-paper px-4 py-3 ${
                    puedeEditar
                      ? 'hover-bloque cursor-pointer transition-[background-color,border-color] duration-150 hover:border-brand-300'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {formatearPeriodo(r.periodo)}
                      </p>
                      {subtitulo && (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {subtitulo}
                        </p>
                      )}
                    </div>
                    {puedeEditar && (
                      <button
                        type="button"
                        onClick={(e) => void borrar(r, e)}
                        aria-label="Eliminar"
                        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 sm:h-9 sm:w-9"
                      >
                        <IconTrash size={16} />
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                    Neto
                  </p>
                  <p className="break-words text-xl font-bold tabular-nums tracking-tight text-ink">
                    {formatearPesos(r.montoNeto)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Cifra etiqueta="Bruto" valor={r.montoBruto} />
                    <Cifra etiqueta="Aportes" valor={r.aportes ?? 0} resta />
                    {(r.noRemunerativo ?? 0) > 0 && (
                      <Cifra
                        etiqueta="No remunerativo"
                        valor={r.noRemunerativo ?? 0}
                      />
                    )}
                    {(r.otrosDescuentos ?? 0) > 0 && (
                      <Cifra
                        etiqueta="Otros descuentos"
                        valor={r.otrosDescuentos ?? 0}
                        resta
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {puedeEditar && (
        <RemuneracionModal
          abierto={modal}
          empleadoId={empleadoId}
          inicial={editando}
          convenioSugerido={convenioSugerido}
          onCerrar={() => setModal(false)}
          onGuardado={cargar}
        />
      )}

      {dialogoConfirmar}
    </Panel>
  );
};
