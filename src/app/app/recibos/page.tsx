'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconFileCertificate,
  IconSignature,
  IconEye,
} from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { formatearFecha, formatearPeriodo } from '@/lib/fechas';
import {
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
                    <Boton variante="secundario" tamano="sm">
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
