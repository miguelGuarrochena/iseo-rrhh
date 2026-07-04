'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconFileCertificate,
  IconSignature,
  IconEye,
  IconUpload,
} from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { formatearFecha, formatearPeriodo } from '@/lib/fechas';
import {
  abrirRecibo,
  cargarRecibo,
  firmarRecibo,
  getEmpleados,
  getRecibos,
  getRecibosTodos,
} from '@/lib/services/rrhh';
import { Empleado, ReciboSueldo } from '@/types/rrhh';

const FirmaBadge = ({ recibo }: { recibo: ReciboSueldo }) =>
  recibo.estadoFirma === 'firmado' ? (
    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
      Firmado {recibo.firmadoEn ? `· ${formatearFecha(recibo.firmadoEn)}` : ''}
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
      Pendiente de firma
    </span>
  );

const RecibosPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const esEmpleado = rolEfectivo === 'empleado';

  const [recibos, setRecibos] = useState<ReciboSueldo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [aFirmar, setAFirmar] = useState<ReciboSueldo | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [cargaAbierta, { open: abrirCarga, close: cerrarCarga }] =
    useDisclosure(false);
  const [cargaEmpleado, setCargaEmpleado] = useState('');
  const [cargaPeriodo, setCargaPeriodo] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [cargaArchivo, setCargaArchivo] = useState<File | null>(null);
  const [cargaError, setCargaError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (esEmpleado && usuario.empleadoId) {
      void getRecibos(usuario.empleadoId).then(setRecibos);
    } else {
      void getRecibosTodos().then(setRecibos);
      void getEmpleados().then(setEmpleados);
    }
  }, [usuario, esEmpleado]);

  useEffect(cargar, [cargar]);

  if (!usuario) return null;

  const nombreEmpleado = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  const abrirFirma = (recibo: ReciboSueldo) => {
    setAFirmar(recibo);
    open();
  };

  const verRecibo = async (recibo: ReciboSueldo) => {
    const url = await abrirRecibo(recibo);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const subirRecibo = async () => {
    if (!cargaEmpleado) {
      setCargaError('Elegí el colaborador.');
      return;
    }
    if (!cargaArchivo) {
      setCargaError('Adjuntá el PDF del recibo.');
      return;
    }
    setCargaError(null);
    setCargando(true);
    try {
      await cargarRecibo(cargaEmpleado, cargaPeriodo, cargaArchivo);
    } catch (err) {
      setCargaError(
        err instanceof Error ? err.message : 'No pudimos cargar el recibo.'
      );
      setCargando(false);
      return;
    }
    setCargando(false);
    setCargaArchivo(null);
    cerrarCarga();
    cargar();
  };

  const confirmarFirma = async () => {
    if (!aFirmar) return;
    setFirmando(true);
    await firmarRecibo(aFirmar.id);
    setFirmando(false);
    close();
    setAFirmar(null);
    cargar();
  };

  const pendientes = recibos.filter((r) => r.estadoFirma === 'pendiente');
  const firmados = recibos.filter((r) => r.estadoFirma === 'firmado');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Recibos de sueldo
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {esEmpleado
              ? 'Consultá y firmá tus recibos con validez digital.'
              : 'Estado de firmas del equipo.'}
          </p>
        </div>
        {rolEfectivo === 'admin_rrhh' && (
          <Boton variante="negro" onClick={abrirCarga}>
            <IconUpload size={18} />
            Cargar recibo
          </Boton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          etiqueta="Por firmar"
          valor={pendientes.length}
          detalle={esEmpleado ? 'tuyos' : 'en el equipo'}
          icono={IconSignature}
        />
        <StatCard
          etiqueta="Firmados"
          valor={firmados.length}
          detalle="al día"
          icono={IconFileCertificate}
        />
      </div>

      <ListaCard
        titulo={esEmpleado ? 'Mis recibos' : 'Recibos del equipo'}
        vacio="No hay recibos cargados todavía."
      >
        {recibos.length > 0 &&
          [...recibos]
            .sort((a, b) => b.periodo.localeCompare(a.periodo))
            .map((r) => (
              <ListaItem
                key={r.id}
                href={
                  esEmpleado ? undefined : `/app/colaboradores/${r.empleadoId}`
                }
                icono={IconFileCertificate}
                principal={
                  esEmpleado
                    ? formatearPeriodo(r.periodo)
                    : `${nombreEmpleado(r.empleadoId)} — ${formatearPeriodo(r.periodo)}`
                }
                secundario="Recibo de sueldo"
                extremo={
                  <div className="flex shrink-0 items-center gap-2">
                    <FirmaBadge recibo={r} />
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => void verRecibo(r)}
                    >
                      <IconEye size={14} />
                      Ver
                    </Boton>
                    {esEmpleado && r.estadoFirma === 'pendiente' && (
                      <Boton tamano="sm" onClick={() => abrirFirma(r)}>
                        <IconSignature size={14} />
                        Firmar
                      </Boton>
                    )}
                  </div>
                }
              />
            ))}
      </ListaCard>

      <Modal
        opened={cargaAbierta}
        onClose={cerrarCarga}
        title="Cargar recibo de sueldo"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-3.5">
          <CampoSelect
            etiqueta="Colaborador *"
            value={cargaEmpleado}
            onChange={setCargaEmpleado}
            opciones={[
              { valor: '', etiqueta: 'Elegí un colaborador…' },
              ...empleados.map((e) => ({
                valor: e.id,
                etiqueta: `${e.apellido}, ${e.nombre}`,
              })),
            ]}
          />
          <Campo
            etiqueta="Período *"
            type="month"
            value={cargaPeriodo}
            onChange={(e) => setCargaPeriodo(e.target.value)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">PDF *</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setCargaArchivo(e.target.files?.[0] ?? null)}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
            />
          </label>
          {cargaError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {cargaError}
            </p>
          )}
          <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
            El colaborador lo va a ver en su sección Recibos y podrá firmarlo
            digitalmente. Si el período ya tenía un recibo, se reemplaza.
          </p>
          <Boton onClick={() => void subirRecibo()} disabled={cargando}>
            {cargando ? 'Cargando…' : 'Cargar recibo'}
          </Boton>
        </div>
      </Modal>

      <Modal
        opened={modalAbierto}
        onClose={close}
        title="Firma de recibo"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Estás por firmar digitalmente tu recibo de{' '}
            <strong className="text-ink">
              {aFirmar ? formatearPeriodo(aFirmar.periodo) : ''}
            </strong>
            . La firma deja constancia de recepción con fecha y hora, con el
            mismo valor que la firma del recibo en papel.
          </p>
          <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
            Declaro haber recibido el recibo de sueldo correspondiente al
            período indicado.
          </p>
          <div className="flex gap-2">
            <Boton
              onClick={() => void confirmarFirma()}
              disabled={firmando}
              className="flex-1"
            >
              {firmando ? 'Firmando…' : 'Firmar recibo'}
            </Boton>
            <Boton variante="secundario" onClick={close}>
              Cancelar
            </Boton>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RecibosPage;
