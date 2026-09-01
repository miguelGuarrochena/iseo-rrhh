'use client';

import Link from 'next/link';
import { IconCash, IconCheck, IconPencil } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { BotonIcono } from '@/components/app/ui/BotonIcono';
import { formatearPesos } from '@/lib/formato';
import { FacturacionEmpresa } from '@/types/rrhh';

export const faltaDeCuota = (f: FacturacionEmpresa): number =>
  Math.max(0, f.abonoMensual - f.cobradoEnPeriodo);

export type EstadoCuota =
  | 'paga'
  | 'parcial'
  | 'impaga'
  | 'sin_cuota'
  | 'suspendida';

export const estadoDeCuota = (f: FacturacionEmpresa): EstadoCuota => {
  if (f.estado === 'suspendida') return 'suspendida';
  if (f.abonoMensual <= 0) return 'sin_cuota';
  if (f.alDia) return 'paga';
  if (f.cobradoEnPeriodo > 0) return 'parcial';
  return 'impaga';
};

const PESO: Record<EstadoCuota, number> = {
  impaga: 0,
  parcial: 1,
  paga: 2,
  sin_cuota: 3,
  suspendida: 4,
};

export const ordenarPorCuota = (a: FacturacionEmpresa, b: FacturacionEmpresa) =>
  PESO[estadoDeCuota(a)] - PESO[estadoDeCuota(b)] ||
  a.nombre.localeCompare(b.nombre, 'es');

const CHIP: Record<EstadoCuota, { etiqueta: string; clase: string }> = {
  paga: {
    etiqueta: 'Pagó',
    clase: 'bg-emerald-100 text-emerald-800',
  },
  parcial: {
    etiqueta: 'Pago parcial',
    clase: 'border border-line bg-surface text-ink',
  },
  impaga: {
    etiqueta: 'No pagó',
    clase: 'border border-line bg-surface text-ink',
  },
  sin_cuota: {
    etiqueta: 'Sin cuota',
    clase: 'border border-line bg-surface text-ink-soft',
  },
  suspendida: {
    etiqueta: 'Suspendida',
    clase: 'border border-line bg-surface text-ink-soft',
  },
};

const Cifra = ({
  etiqueta,
  valor,
  suave = false,
}: {
  etiqueta: string;
  valor: string;
  suave?: boolean;
}) => (
  <div className="min-w-0 rounded-xl bg-surface px-3 py-2">
    <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
      {etiqueta}
    </p>
    <p
      className={`mt-0.5 break-words text-sm font-semibold tabular-nums ${
        suave ? 'text-ink-soft' : 'text-ink'
      }`}
    >
      {valor}
    </p>
  </div>
);

interface Props {
  factura: FacturacionEmpresa;
  mostrarNombre?: boolean;
  onEditarCuota?: () => void;
  onRegistrarPago?: () => void;
}

/**
 * Una empresa, una cuota, un vistazo: cuánto tiene que pagar, cuánto
 * ya llegó y cuánto falta. El estado no se lee en jerga (abono,
 * cobrado, cubierto): se lee en la barra y en el número grande.
 */
export const TarjetaCuota = ({
  factura,
  mostrarNombre = true,
  onEditarCuota,
  onRegistrarPago,
}: Props) => {
  const estado = estadoDeCuota(factura);
  const falta = faltaDeCuota(factura);
  const cuota = factura.abonoMensual;
  const recibido = factura.cobradoEnPeriodo;
  const pct =
    cuota <= 0 ? 0 : Math.min(100, Math.round((recibido / cuota) * 100));
  const chip = CHIP[estado];
  const seCobra =
    estado === 'paga' || estado === 'parcial' || estado === 'impaga';

  const hero =
    estado === 'paga'
      ? { etiqueta: 'Ya te pagó', valor: formatearPesos(recibido) }
      : estado === 'parcial'
        ? { etiqueta: 'Todavía falta', valor: formatearPesos(falta) }
        : estado === 'impaga'
          ? { etiqueta: 'Todavía no pagó', valor: formatearPesos(cuota) }
          : estado === 'sin_cuota'
            ? { etiqueta: 'Cuota mensual', valor: 'Sin definir' }
            : { etiqueta: 'Cuota mensual', valor: formatearPesos(cuota) };

  return (
    <article className="rounded-2xl border border-line bg-paper px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {mostrarNombre ? (
            <Link
              href={`/empresas/${factura.empresaId}`}
              className="truncate font-semibold text-ink no-underline hover:text-brand-700 hover:underline"
            >
              {factura.nombre}
            </Link>
          ) : (
            <p className="font-semibold text-ink">Cuota de este mes</p>
          )}
          <p className="mt-0.5 text-xs text-ink-soft">
            {factura.empleados}{' '}
            {factura.empleados === 1 ? 'empleado' : 'empleados'}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${chip.clase}`}
        >
          {estado === 'paga' && <IconCheck size={13} />}
          {chip.etiqueta}
        </span>
      </div>

      <p className="mt-3 text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
        {hero.etiqueta}
      </p>
      <p className="break-words text-xl font-bold tabular-nums tracking-tight text-ink">
        {hero.valor}
      </p>

      {seCobra && (
        <>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${pct}% de la cuota recibida`}
          >
            <div
              className={`h-full rounded-full ${
                estado === 'paga' ? 'bg-emerald-500' : 'bg-brand-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className={`mt-3 grid gap-2 ${
              estado === 'paga' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            <Cifra etiqueta="Cuota" valor={formatearPesos(cuota)} />
            <Cifra etiqueta="Recibido" valor={formatearPesos(recibido)} />
            {estado !== 'paga' && (
              <Cifra etiqueta="Falta" valor={formatearPesos(falta)} />
            )}
          </div>
        </>
      )}

      {estado === 'sin_cuota' && (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Definí cuánto te paga por mes para poder seguir si ya te depositó.
        </p>
      )}
      {estado === 'suspendida' && (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Está dada de baja: este mes no se le cobra cuota.
        </p>
      )}

      {(onEditarCuota || onRegistrarPago) && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {onEditarCuota && (
            <BotonIcono etiqueta="Cambiar la cuota" onClick={onEditarCuota}>
              <IconPencil size={16} />
            </BotonIcono>
          )}
          {onRegistrarPago && (estado === 'impaga' || estado === 'parcial') && (
            <Boton tamano="sm" onClick={onRegistrarPago}>
              <IconCash size={14} />
              Registrar {formatearPesos(falta)}
            </Boton>
          )}
        </div>
      )}
    </article>
  );
};
