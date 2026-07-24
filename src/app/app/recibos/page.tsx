'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconFileCertificate,
  IconFiles,
  IconSignature,
  IconEye,
  IconTrash,
  IconUpload,
  IconWritingSign,
} from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { CampoArchivo } from '@/components/app/ui/CampoArchivo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { formatearFecha, formatearPeriodo } from '@/lib/fechas';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  abrirRecibo,
  cargarRecibo,
  eliminarRecibo,
  firmarRecibo,
  firmarReciboEmpleador,
  getEmpleados,
  getRecibos,
  getRecibosTodos,
} from '@/lib/services/rrhh';
import { CargaMasivaModal } from '@/components/app/recibos/CargaMasivaModal';
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
  const [cargaPublicar, setCargaPublicar] = useState(true);
  const [cargaError, setCargaError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [masivaAbierta, setMasivaAbierta] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const [cargandoLista, setCargandoLista] = useState(true);

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (esEmpleado && usuario.empleadoId) {
      void getRecibos(usuario.empleadoId)
        .then(setRecibos)
        .finally(() => setCargandoLista(false));
    } else {
      void getRecibosTodos()
        .then(setRecibos)
        .finally(() => setCargandoLista(false));
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
      await cargarRecibo(
        cargaEmpleado,
        cargaPeriodo,
        cargaArchivo,
        cargaPublicar
      );
      avisoExito(
        'Recibo cargado',
        cargaPublicar
          ? 'El colaborador ya lo ve en su sección Recibos.'
          : 'Quedó sin publicar: firmalo como empleador cuando quieras.'
      );
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
    try {
      await firmarRecibo(aFirmar.id);
      avisoExito(
        'Recibo firmado',
        `${formatearPeriodo(aFirmar.periodo)} quedó con constancia de recepción.`
      );
    } catch (err) {
      avisoError(
        'No pudimos firmar el recibo',
        err instanceof Error ? err.message : undefined
      );
    }
    setFirmando(false);
    close();
    setAFirmar(null);
    cargar();
  };

  const publicarRecibo = async (r: ReciboSueldo) => {
    setPublicando(true);
    try {
      await firmarReciboEmpleador(r.id);
      avisoExito(
        'Recibo publicado',
        `${formatearPeriodo(r.periodo)} de ${nombreEmpleado(r.empleadoId)} ya está disponible para firmar.`
      );
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos publicar',
        err instanceof Error ? err.message : undefined
      );
    }
    setPublicando(false);
  };

  const borrarRecibo = async (r: ReciboSueldo) => {
    if (
      !window.confirm(
        `¿Eliminar el recibo de ${formatearPeriodo(r.periodo)}${
          esEmpleado ? '' : ` de ${nombreEmpleado(r.empleadoId)}`
        }? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    try {
      await eliminarRecibo(r.id);
      avisoExito('Recibo eliminado');
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos eliminar el recibo',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const publicarTodos = async (lista: ReciboSueldo[]) => {
    setPublicando(true);
    let ok = 0;
    for (const r of lista) {
      try {
        await firmarReciboEmpleador(r.id);
        ok += 1;
      } catch {
        // sigue con el resto
      }
    }
    setPublicando(false);
    avisoExito(
      `${ok} recibo${ok === 1 ? '' : 's'} publicado${ok === 1 ? '' : 's'}`,
      'El equipo ya los ve para firmar.'
    );
    cargar();
  };

  // Para el admin: los sin firma del empleador van aparte (borradores).
  const borradores = esEmpleado
    ? []
    : recibos.filter((r) => !r.firmadoEmpleadorEn);
  const publicados = esEmpleado
    ? recibos
    : recibos.filter((r) => r.firmadoEmpleadorEn);
  const pendientes = publicados.filter((r) => r.estadoFirma === 'pendiente');
  const firmados = publicados.filter((r) => r.estadoFirma === 'firmado');

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
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={() => setMasivaAbierta(true)}>
              <IconFiles size={18} />
              Carga masiva
            </Boton>
            <Boton variante="negro" onClick={abrirCarga}>
              <IconUpload size={18} />
              Cargar recibo
            </Boton>
          </div>
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
        {!esEmpleado && borradores.length > 0 && (
          <StatCard
            etiqueta="Sin publicar"
            valor={borradores.length}
            detalle="falta tu firma"
            icono={IconWritingSign}
          />
        )}
      </div>

      {!esEmpleado && borradores.length > 0 && (
        <ListaCard
          titulo="Sin publicar — falta la firma del empleador"
          vacio=""
        >
          {borradores.length > 1 && (
            <div className="flex justify-end">
              <Boton
                variante="secundario"
                tamano="sm"
                onClick={() => void publicarTodos(borradores)}
                disabled={publicando}
              >
                <IconWritingSign size={14} />
                Firmar y publicar todos
              </Boton>
            </div>
          )}
          {[...borradores]
            .sort((a, b) => b.periodo.localeCompare(a.periodo))
            .map((r) => (
              <ListaItem
                key={r.id}
                icono={IconFileCertificate}
                principal={`${nombreEmpleado(r.empleadoId)} — ${formatearPeriodo(r.periodo)}`}
                secundario="El colaborador todavía no lo ve"
                extremo={
                  <div className="flex shrink-0 items-center gap-2">
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => void verRecibo(r)}
                    >
                      <IconEye size={14} />
                      Ver
                    </Boton>
                    <Boton
                      tamano="sm"
                      onClick={() => void publicarRecibo(r)}
                      disabled={publicando}
                    >
                      <IconWritingSign size={14} />
                      Firmar y publicar
                    </Boton>
                    {rolEfectivo === 'admin_rrhh' && (
                      <Boton
                        variante="rechazar"
                        tamano="sm"
                        onClick={() => void borrarRecibo(r)}
                      >
                        <IconTrash size={14} />
                      </Boton>
                    )}
                  </div>
                }
              />
            ))}
        </ListaCard>
      )}

      <ListaCard
        titulo={esEmpleado ? 'Pendientes de firma' : 'Pendientes del equipo'}
        cargando={cargandoLista}
        vacio={
          esEmpleado
            ? 'No tenés recibos pendientes de firma.'
            : 'No hay recibos pendientes de firma.'
        }
      >
        {pendientes.length > 0 &&
          [...pendientes]
            .sort((a, b) => b.periodo.localeCompare(a.periodo))
            .map((r) => (
              <ListaItem
                key={r.id}
                href={esEmpleado ? undefined : `/colaboradores/${r.empleadoId}`}
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
                    {rolEfectivo === 'admin_rrhh' && (
                      <Boton
                        variante="rechazar"
                        tamano="sm"
                        onClick={() => void borrarRecibo(r)}
                        aria-label="Eliminar recibo"
                      >
                        <IconTrash size={14} />
                      </Boton>
                    )}
                  </div>
                }
              />
            ))}
      </ListaCard>

      <ListaCard
        titulo={esEmpleado ? 'Historial de recibos' : 'Historial firmado'}
        cargando={cargandoLista}
        vacio="Todavía no hay recibos firmados."
      >
        {firmados.length > 0 &&
          [...firmados]
            .sort((a, b) => b.periodo.localeCompare(a.periodo))
            .map((r) => (
              <ListaItem
                key={r.id}
                href={esEmpleado ? undefined : `/colaboradores/${r.empleadoId}`}
                icono={IconFileCertificate}
                principal={
                  esEmpleado
                    ? formatearPeriodo(r.periodo)
                    : `${nombreEmpleado(r.empleadoId)} — ${formatearPeriodo(r.periodo)}`
                }
                secundario="Recibo de sueldo firmado"
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
                    {rolEfectivo === 'admin_rrhh' && (
                      <Boton
                        variante="rechazar"
                        tamano="sm"
                        onClick={() => void borrarRecibo(r)}
                      >
                        <IconTrash size={14} />
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
          <CampoMes
            etiqueta="Período *"
            value={cargaPeriodo}
            onChange={setCargaPeriodo}
          />
          <CampoArchivo
            etiqueta="PDF *"
            accept=".pdf,application/pdf"
            onArchivo={setCargaArchivo}
          />
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-paper px-4 py-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={cargaPublicar}
              onChange={(e) => setCargaPublicar(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="text-xs">
              <span className="font-semibold">
                Firmar como empleador y publicar ahora.
              </span>{' '}
              <span className="text-ink-soft">
                Si lo destildás, queda como borrador.
              </span>
            </span>
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

      <CargaMasivaModal
        abierto={masivaAbierta}
        empleados={empleados}
        onCerrar={() => setMasivaAbierta(false)}
        onCargado={cargar}
      />

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
