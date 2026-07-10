'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconReportMoney } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { RemuneracionModal } from './RemuneracionModal';
import { DescuentosFijos } from './DescuentosFijos';
import { getRemuneraciones } from '@/lib/services/rrhh';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo } from '@/lib/fechas';
import { Remuneracion } from '@/types/rrhh';

interface Props {
  empleadoId: string;
  puedeEditar: boolean;
  /** Convenio del empleado (se arrastra a cada remuneración). */
  convenioEmpleado?: string;
}

export const RemuneracionesEmpleado = ({
  empleadoId,
  puedeEditar,
  convenioEmpleado,
}: Props) => {
  const [rems, setRems] = useState<Remuneracion[]>([]);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Remuneracion | null>(null);

  const cargar = useCallback(() => {
    void getRemuneraciones(empleadoId).then((lista) =>
      setRems([...lista].sort((a, b) => (a.periodo < b.periodo ? 1 : -1)))
    );
  }, [empleadoId]);

  useEffect(cargar, [cargar]);

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

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconReportMoney size={18} className="text-ink-soft" />
          <h2 className="text-base font-bold text-ink">Remuneraciones</h2>
        </div>
        {puedeEditar && (
          <Boton variante="secundario" tamano="sm" onClick={abrirNuevo}>
            <IconPlus size={14} />
            Cargar remuneración
          </Boton>
        )}
      </div>

      <DescuentosFijos empleadoId={empleadoId} puedeEditar={puedeEditar} />

      {rems.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          {puedeEditar
            ? 'Sin remuneraciones cargadas. Usá “Cargar remuneración” para el sueldo del período.'
            : 'Todavía no hay remuneraciones cargadas.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                <th className="pb-2 pr-4">Período</th>
                <th className="pb-2 pr-4 text-right">Bruto</th>
                <th className="pb-2 pr-4 text-right">Aportes</th>
                <th className="pb-2 pr-4 text-right">Neto</th>
                <th className="pb-2">Convenio</th>
              </tr>
            </thead>
            <tbody>
              {rems.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => abrirEditar(r)}
                  className={`border-b border-line/60 ${
                    puedeEditar ? 'cursor-pointer hover:bg-paper' : ''
                  }`}
                >
                  <td className="py-2.5 pr-4 font-semibold text-ink">
                    {formatearPeriodo(r.periodo)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ink">
                    {formatearPesos(r.montoBruto)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ink-soft">
                    − {formatearPesos(r.aportes ?? 0)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-bold text-ink">
                    {formatearPesos(r.montoNeto)}
                  </td>
                  <td className="py-2.5 text-ink-soft">{r.convenio || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </Panel>
  );
};
