'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import {
  IconCashBanknote,
  IconCoins,
  IconPinned,
  IconReceipt2,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import {
  cargarRemuneracion,
  getAdelantos,
  getDescuentosRecurrentes,
} from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { calcularLiquidacion, APORTES_TOTAL } from '@/lib/remuneraciones';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo, hoyISO } from '@/lib/fechas';
import {
  Adelanto,
  DescuentoRecurrente,
  Empleado,
  Remuneracion,
} from '@/types/rrhh';

interface RemuneracionModalProps {
  abierto: boolean;
  /** Fijo (desde la ficha) o elegible si se pasa `empleados`. */
  empleadoId?: string;
  /** Si se pasa, el modal arranca eligiendo el colaborador. */
  empleados?: Empleado[];
  /** Para precargar al editar un período existente. */
  inicial?: Remuneracion | null;
  convenioSugerido?: string;
  onCerrar: () => void;
  onGuardado: () => void;
}

const num = (v: string) => Number(v) || 0;

/** Renglón del desglose de la liquidación. */
const Renglon = ({
  etiqueta,
  valor,
  resta,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  resta?: boolean;
  detalle?: string;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <span className="min-w-0 text-sm text-ink-soft">
      {etiqueta}
      {detalle && <span className="ml-1.5 text-xs opacity-70">{detalle}</span>}
    </span>
    <span
      className={`shrink-0 text-sm font-semibold ${resta ? 'text-red-700' : 'text-ink'}`}
    >
      {resta ? '−' : ''} {valor}
    </span>
  </div>
);

/** Título chico de cada bloque del formulario. */
const TituloBloque = ({
  icono: Icono,
  texto,
}: {
  icono: typeof IconCoins;
  texto: string;
}) => (
  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-ink-soft">
    <Icono size={14} />
    {texto}
  </p>
);

/**
 * Carga de la remuneración de un período, con el desglose completo:
 * haberes, descuentos fijos y adelantos (se aplican solos) y el neto
 * calculado en vivo.
 */
export const RemuneracionModal = ({
  abierto,
  empleadoId,
  empleados,
  inicial,
  convenioSugerido,
  onCerrar,
  onGuardado,
}: RemuneracionModalProps) => {
  const [elegido, setElegido] = useState(empleadoId ?? '');
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [bruto, setBruto] = useState('');
  const [noRem, setNoRem] = useState('');
  const [adicional, setAdicional] = useState('');
  const [convenio, setConvenio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurrentes, setRecurrentes] = useState<DescuentoRecurrente[]>([]);
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);

  const empleadoActual = empleadoId ?? elegido;

  useEffect(() => {
    if (abierto) {
      setElegido(empleadoId ?? '');
      setPeriodo(inicial?.periodo ?? hoyISO().slice(0, 7));
      setBruto(inicial ? String(inicial.montoBruto) : '');
      setNoRem(inicial?.noRemunerativo ? String(inicial.noRemunerativo) : '');
      setConvenio(inicial?.convenio ?? convenioSugerido ?? '');
      setError(null);
      setRecurrentes([]);
      setAdelantos([]);
    }
  }, [abierto, inicial, convenioSugerido, empleadoId]);

  // Los descuentos fijos y adelantos son del colaborador elegido.
  useEffect(() => {
    if (abierto && empleadoActual) {
      void getDescuentosRecurrentes(empleadoActual).then(setRecurrentes);
      void getAdelantos(empleadoActual).then(setAdelantos);
    }
  }, [abierto, empleadoActual]);

  /** Descuentos que entran solos: fijos + adelantos aprobados del período. */
  const automaticos = useMemo(() => {
    const partes: { etiqueta: string; detalle: string; monto: number }[] =
      recurrentes.map((d) => ({
        etiqueta: d.concepto,
        detalle: 'descuento fijo',
        monto: d.monto,
      }));
    adelantos
      .filter((a) => a.estado === 'aprobado' && a.periodo === periodo)
      .forEach((a) =>
        partes.push({
          etiqueta: 'Adelanto de sueldo',
          detalle: 'aprobado por RRHH',
          monto: a.monto,
        })
      );
    return { partes, total: partes.reduce((acc, p) => acc + p.monto, 0) };
  }, [recurrentes, adelantos, periodo]);

  // Al editar, lo guardado que exceda a los automáticos es el adicional.
  useEffect(() => {
    if (!abierto) return;
    if (inicial) {
      const resto = (inicial.otrosDescuentos ?? 0) - automaticos.total;
      setAdicional(resto > 0 ? String(resto) : '');
    } else {
      setAdicional('');
    }
  }, [abierto, inicial, automaticos.total]);

  const otrosTotal = automaticos.total + num(adicional);
  const { aportes, neto } = calcularLiquidacion({
    montoBruto: num(bruto),
    noRemunerativo: num(noRem),
    otrosDescuentos: otrosTotal,
  });

  const guardar = async () => {
    if (!empleadoActual) {
      setError('Elegí el colaborador.');
      return;
    }
    if (!periodo) {
      setError('El período es obligatorio.');
      return;
    }
    if (num(bruto) <= 0) {
      setError('El sueldo bruto debe ser mayor a cero.');
      return;
    }
    if (num(noRem) < 0 || num(adicional) < 0) {
      setError('Los importes no pueden ser negativos.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await cargarRemuneracion({
        empleadoId: empleadoActual,
        periodo,
        montoBruto: num(bruto),
        noRemunerativo: num(noRem) || undefined,
        otrosDescuentos: otrosTotal || undefined,
        convenio: convenio.trim() || undefined,
      });
      avisoExito(
        'Remuneración guardada',
        `${formatearPeriodo(periodo)} quedó con neto de ${formatearPesos(neto)}.`
      );
      onGuardado();
      onCerrar();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={inicial ? 'Editar remuneración' : 'Cargar remuneración'}
      radius="lg"
      centered
      size="lg"
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-5">
        {!empleadoId && empleados && (
          <CampoSelect
            etiqueta="Colaborador *"
            value={elegido}
            onChange={setElegido}
            opciones={[
              { valor: '', etiqueta: 'Elegí un colaborador…' },
              ...empleados.map((e) => ({
                valor: e.id,
                etiqueta: `${e.apellido}, ${e.nombre}`,
              })),
            ]}
          />
        )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <CampoMes etiqueta="Período" value={periodo} onChange={setPeriodo} />
          <Campo
            etiqueta="Convenio (opcional)"
            value={convenio}
            onChange={(e) => setConvenio(e.target.value)}
            placeholder="CCT 130/75 — Comercio"
          />
        </div>

        {/* Haberes */}
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper/50 p-4">
          <TituloBloque icono={IconCoins} texto="Haberes" />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo
              etiqueta="Sueldo bruto (remunerativo)"
              type="number"
              value={bruto}
              onChange={(e) => setBruto(e.target.value)}
              placeholder="0"
              ayuda="Base de aportes y cargas."
              error={error?.includes('bruto') ? error : undefined}
            />
            <Campo
              etiqueta="No remunerativo (opcional)"
              type="number"
              value={noRem}
              onChange={(e) => setNoRem(e.target.value)}
              placeholder="0"
              ayuda="Adicionales fuera de la base de aportes."
            />
          </div>
        </div>

        {/* Descuentos */}
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper/50 p-4">
          <TituloBloque icono={IconReceipt2} texto="Descuentos del período" />

          {automaticos.partes.length > 0 ? (
            <div className="flex flex-col divide-y divide-line/60 rounded-xl border border-line bg-surface px-4 py-1">
              {automaticos.partes.map((p, i) => (
                <div
                  key={`${p.etiqueta}-${i}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                    <IconPinned size={15} className="shrink-0 text-brand-600" />
                    <span className="truncate font-medium">{p.etiqueta}</span>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-brand-700">
                      {p.detalle}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-ink">
                    − {formatearPesos(p.monto)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-soft">
              Este colaborador no tiene descuentos fijos ni adelantos aprobados
              para {formatearPeriodo(periodo)}. Los descuentos fijos se cargan
              desde su ficha y quedan para todos los meses.
            </p>
          )}

          <Campo
            etiqueta="Descuento adicional del mes (opcional)"
            type="number"
            value={adicional}
            onChange={(e) => setAdicional(e.target.value)}
            placeholder="0"
            ayuda="Solo para algo puntual de este período; lo repetitivo va como descuento fijo en la ficha."
          />
        </div>

        {/* Liquidación resultante */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-4">
          <TituloBloque icono={IconCashBanknote} texto="Liquidación estimada" />
          <div className="mt-2 flex flex-col divide-y divide-brand-200/60">
            <Renglon
              etiqueta="Remunerativo"
              valor={formatearPesos(num(bruto))}
            />
            {num(noRem) > 0 && (
              <Renglon
                etiqueta="No remunerativo"
                valor={formatearPesos(num(noRem))}
              />
            )}
            <Renglon
              etiqueta="Aportes del empleado"
              detalle={`jubilación + PAMI + obra social (${Math.round(APORTES_TOTAL * 100)}%)`}
              valor={formatearPesos(aportes)}
              resta
            />
            {otrosTotal > 0 && (
              <Renglon
                etiqueta="Descuentos del período"
                valor={formatearPesos(otrosTotal)}
                resta
              />
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t-2 border-brand-300 pt-3">
            <span className="text-sm font-bold text-ink">Neto a cobrar</span>
            <span className="text-2xl font-extrabold tracking-tight text-ink">
              {formatearPesos(neto)}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Estimación para gestión interna; la liquidación oficial la hace tu
            contador.
          </p>
        </div>

        {error && !error.includes('bruto') && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            className="flex-1"
            onClick={() => void guardar()}
            disabled={guardando || num(bruto) <= 0 || !empleadoActual}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
