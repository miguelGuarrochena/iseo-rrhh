'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  IconArrowLeft,
  IconCash,
  IconCheck,
  IconClockExclamation,
  IconLogin2,
  IconPencil,
  IconReceipt2,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { Boton } from '@/components/app/ui/Boton';
import { BarrasMensuales } from '@/components/app/finanzas/BarrasMensuales';
import { EditarEmpresaModal } from '@/components/app/empresas/EditarEmpresaModal';
import { formatearPesos } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import {
  cambiarEstadoEmpresa,
  getEmpresaPorId,
  getMovimientosDeEmpresa,
  getResumenFinanzas,
} from '@/lib/services/rrhh';
import {
  Empresa,
  FacturacionEmpresa,
  MovimientoFinanciero,
} from '@/types/rrhh';

const periodoActual = hoyISO().slice(0, 7);
const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** Últimos 6 períodos (YYYY-MM) terminando en el actual. */
const ultimosPeriodos = (): string[] => {
  const base = new Date(`${periodoActual}-01T00:00:00`);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
};

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor?: string }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
      {etiqueta}
    </p>
    <p className="mt-0.5 text-sm text-ink">{valor || '—'}</p>
  </div>
);

const EmpresaDetallePage = () => {
  const { usuario, entrarAEmpresa } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [factura, setFactura] = useState<FacturacionEmpresa | null>(null);
  const [movs, setMovs] = useState<MovimientoFinanciero[]>([]);
  const [editar, setEditar] = useState(false);
  const [noExiste, setNoExiste] = useState(false);

  const cargar = useCallback(() => {
    void getEmpresaPorId(id).then((e) => {
      if (!e) setNoExiste(true);
      else setEmpresa(e);
    });
    void getResumenFinanzas(periodoActual).then((r) =>
      setFactura(r.facturacion.find((f) => f.empresaId === id) ?? null)
    );
    void getMovimientosDeEmpresa(id).then(setMovs);
  }, [id]);

  useEffect(cargar, [cargar]);

  if (!usuario) return null;
  if (usuario.rol !== 'superadmin') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }
  if (noExiste) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">No encontramos esa empresa.</p>
        <Link href="/empresas" className="text-sm font-semibold text-brand-700">
          ← Volver a Empresas
        </Link>
      </div>
    );
  }
  if (!empresa) {
    return <p className="text-sm text-ink-soft">Cargando…</p>;
  }

  const activa = empresa.estado === 'activa';
  const ingresos = movs.filter((m) => m.tipo === 'ingreso');
  const serie = ultimosPeriodos().map((p) => ({
    label: MESES[Number(p.slice(5, 7)) - 1],
    valor: ingresos
      .filter((m) => m.periodo === p)
      .reduce((a, m) => a + m.monto, 0),
  }));

  const ingresar = () => {
    entrarAEmpresa(empresa);
    router.push('/');
  };

  const cambiarEstado = async () => {
    await cambiarEstadoEmpresa(empresa.id, activa ? 'suspendida' : 'activa');
    cargar();
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/empresas"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-soft no-underline transition-colors hover:text-ink"
      >
        <IconArrowLeft size={16} />
        Empresas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {empresa.nombre}
            </h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                activa
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {activa ? 'Activa' : 'Suspendida'}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {empresa.plan ? `Plan ${empresa.plan} · ` : ''}CUIT {empresa.cuit}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setEditar(true)}>
            <IconPencil size={16} />
            Editar
          </Boton>
          {activa && (
            <Boton variante="negro" onClick={ingresar}>
              <IconLogin2 size={16} />
              Ingresar
            </Boton>
          )}
          <Boton
            variante={activa ? 'rechazar' : 'aprobar'}
            onClick={() => void cambiarEstado()}
          >
            {activa ? 'Dar de baja' : 'Reactivar'}
          </Boton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          etiqueta="Empleados"
          valor={factura?.empleados ?? '…'}
          detalle="activos"
          icono={IconUsers}
        />
        <StatCard
          etiqueta="Abono mensual"
          valor={formatearPesos(empresa.abonoMensual ?? 0)}
          icono={IconWallet}
        />
        <StatCard
          etiqueta="Cobrado este mes"
          valor={factura ? formatearPesos(factura.cobradoEnPeriodo) : '…'}
          icono={IconCash}
        />
        <StatCard
          etiqueta="Estado de pago"
          valor={
            !factura || factura.abonoMensual === 0
              ? '—'
              : factura.alDia
                ? 'Al día'
                : 'Pendiente'
          }
          detalle="este mes"
          icono={factura?.alDia ? IconCheck : IconClockExclamation}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="text-base font-bold text-ink">Datos de la empresa</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Dato etiqueta="Nombre comercial" valor={empresa.nombre} />
            <Dato etiqueta="Razón social" valor={empresa.razonSocial} />
            <Dato etiqueta="CUIT" valor={empresa.cuit} />
            <Dato etiqueta="Plan" valor={empresa.plan} />
            <div className="col-span-2">
              <Dato etiqueta="Domicilio" valor={empresa.domicilio} />
            </div>
            <Dato etiqueta="Responsable" valor={empresa.contactoNombre} />
            <Dato etiqueta="Teléfono" valor={empresa.contactoTelefono} />
            <div className="col-span-2">
              <Dato etiqueta="Email" valor={empresa.contactoEmail} />
            </div>
            <Dato etiqueta="Cliente desde" valor={empresa.creadaEn} />
          </div>
        </Panel>

        <Panel>
          <h2 className="text-base font-bold text-ink">
            Cobros de los últimos meses
          </h2>
          <BarrasMensuales datos={serie} />
        </Panel>
      </div>

      <Panel>
        <div className="flex items-center gap-2">
          <IconReceipt2 size={18} className="text-ink-soft" />
          <h2 className="text-base font-bold text-ink">
            Ingresos de esta empresa
          </h2>
        </div>
        {ingresos.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            Todavía no hay ingresos vinculados a esta empresa. Cargalos desde
            Finanzas eligiendo la empresa, o con “Registrar cobro”.
          </p>
        ) : (
          <div className="mt-3 flex flex-col divide-y divide-line">
            {ingresos.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {m.concepto}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {m.fecha}
                    {m.categoria ? ` · ${m.categoria}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-emerald-700">
                  +{formatearPesos(m.monto)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <EditarEmpresaModal
        empresa={editar ? empresa : null}
        empleados={factura?.empleados ?? 0}
        onCerrar={() => setEditar(false)}
        onGuardado={cargar}
        onIngresar={ingresar}
        onCambiarEstado={() => {
          void cambiarEstado();
          setEditar(false);
        }}
      />
    </div>
  );
};

export default EmpresaDetallePage;
