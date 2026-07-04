'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBeach,
  IconCheck,
  IconFileText,
  IconPlus,
  IconTrash,
  IconClockExclamation,
  IconClockPlus,
  IconPencil,
  IconPlaneDeparture,
  IconUser,
  IconUserOff,
  IconX,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { avisoExito } from '@/lib/avisos';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoArchivo } from '@/components/app/ui/CampoArchivo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { Breadcrumbs } from '@/components/app/ui/Breadcrumbs';
import { hoyISO } from '@/lib/fechas';
import { CampoSelect } from '@/components/app/ui/Campo';
import { aOpciones } from '@/components/app/ui/Selector';
import { categoriaDocumentoLabels } from '@/lib/etiquetas';
import {
  abrirDocumento,
  agregarDocumento,
  darDeBajaEmpleado,
  getDocumentosDeEmpleado,
  quitarDocumento,
  toggleChecklistItem,
} from '@/lib/services/rrhh';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { EstadoBadge } from '@/components/app/EstadoBadge';
import { formatearFecha } from '@/lib/fechas';
import { tipoAusenciaIconos, tipoAusenciaLabels } from '@/lib/etiquetas';
import {
  getAusenciasDeEmpleado,
  getEmpleado,
  getMiMes,
  getSaldoVacaciones,
  MiMes,
} from '@/lib/services/rrhh';
import {
  Ausencia,
  CategoriaDocumento,
  DocumentoLegajo,
  Empleado,
  SaldoVacaciones,
} from '@/types/rrhh';

const ANIO_ACTUAL = new Date().getFullYear();

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor?: string }) => (
  <div className="min-w-0">
    <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
      {etiqueta}
    </p>
    <p className="mt-0.5 truncate text-sm font-semibold text-ink">
      {valor || '—'}
    </p>
  </div>
);

const FichaColaboradorPage = () => {
  const { id } = useParams<{ id: string }>();
  const { usuario, rolEfectivo } = useAuth();
  const router = useRouter();

  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const [control, setControl] = useState<MiMes | null>(null);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoLegajo[]>([]);
  const [docAbierto, { open: abrirDoc, close: cerrarDoc }] =
    useDisclosure(false);
  const [docNombre, setDocNombre] = useState('');
  const [docCategoria, setDocCategoria] = useState<CategoriaDocumento>('otro');
  const [docVencimiento, setDocVencimiento] = useState('');
  const [docArchivo, setDocArchivo] = useState<File | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docGuardando, setDocGuardando] = useState(false);
  const [bajaAbierta, { open: abrirBaja, close: cerrarBaja }] =
    useDisclosure(false);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [fechaBaja, setFechaBaja] = useState(hoyISO());
  const [errorBaja, setErrorBaja] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (!id) return;
    void getEmpleado(id).then(setEmpleado);
    void getSaldoVacaciones(id, ANIO_ACTUAL).then(setSaldo);
    void getMiMes(id).then(setControl);
    void getAusenciasDeEmpleado(id).then(setAusencias);
    void getDocumentosDeEmpleado(id).then(setDocumentos);
  }, [id]);

  if (!usuario || rolEfectivo === 'empleado') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  if (!empleado) {
    return <p className="text-sm text-ink-soft">Cargando ficha…</p>;
  }

  const esAdmin = rolEfectivo === 'admin_rrhh';

  const recargarDocs = () =>
    void getDocumentosDeEmpleado(empleado.id).then(setDocumentos);

  const alternarChecklist = async (itemId: string) => {
    if (!esAdmin) return;
    const actualizado = await toggleChecklistItem(empleado.id, itemId);
    if (actualizado) setEmpleado({ ...actualizado });
  };

  const guardarDocumento = async () => {
    if (!docNombre.trim()) {
      setDocError('Poné un nombre al documento.');
      return;
    }
    setDocError(null);
    setDocGuardando(true);
    try {
      await agregarDocumento({
        empleadoId: empleado.id,
        nombre: docNombre.trim(),
        categoria: docCategoria,
        fechaVencimiento: docVencimiento || undefined,
        archivo: docArchivo ?? undefined,
      });
      avisoExito('Documento guardado en el legajo');
    } catch (err) {
      setDocError(
        err instanceof Error ? err.message : 'No pudimos guardar el documento.'
      );
      setDocGuardando(false);
      return;
    }
    setDocGuardando(false);
    setDocNombre('');
    setDocVencimiento('');
    setDocArchivo(null);
    cerrarDoc();
    recargarDocs();
  };

  const verDocumento = async (doc: DocumentoLegajo) => {
    const url = await abrirDocumento(doc);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const eliminarDocumento = async (documentoId: string) => {
    await quitarDocumento(documentoId);
    recargarDocs();
  };

  const confirmarBaja = async () => {
    if (!motivoBaja.trim()) {
      setErrorBaja('Indicá el motivo de la baja.');
      return;
    }
    setErrorBaja(null);
    setProcesando(true);
    await darDeBajaEmpleado(empleado.id, motivoBaja.trim(), fechaBaja);
    setProcesando(false);
    cerrarBaja();
    router.push('/app/colaboradores');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Breadcrumbs
            items={[
              { etiqueta: 'Colaboradores', href: '/app/colaboradores' },
              { etiqueta: `${empleado.nombre} ${empleado.apellido}` },
            ]}
          />
          <div className="flex items-center gap-3.5">
            {empleado.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={empleado.fotoUrl}
                alt={empleado.nombre}
                className="h-14 w-14 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <IconUser size={26} stroke={1.8} />
              </div>
            )}
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-ink">
                {empleado.nombre} {empleado.apellido}
                {!empleado.activo && (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                    Baja{' '}
                    {empleado.fechaBaja
                      ? `· ${formatearFecha(empleado.fechaBaja)}`
                      : ''}
                  </span>
                )}
              </h1>
              <p className="mt-0.5 text-sm text-ink-soft">
                {empleado.puesto} · {empleado.sector} · Ingreso{' '}
                {new Date(
                  `${empleado.fechaIngreso}T00:00:00`
                ).toLocaleDateString('es-AR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {rolEfectivo === 'admin_rrhh' && empleado.activo && (
          <div className="flex gap-2">
            <Link
              href={`/app/colaboradores/${empleado.id}/editar`}
              className="no-underline"
            >
              <Boton type="button" variante="secundario">
                <IconPencil size={16} />
                Editar
              </Boton>
            </Link>
            <Boton type="button" variante="rechazar" onClick={abrirBaja}>
              <IconUserOff size={16} />
              Dar de baja
            </Boton>
          </div>
        )}
      </div>

      {/* Indicadores de control del empleado */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          etiqueta="Vacaciones"
          valor={saldo ? `${saldo.diasDisponibles}` : '…'}
          detalle={`disponibles de ${saldo?.diasCorresponden ?? '—'}`}
          href={`/app/ausencias?empleado=${empleado.id}`}
          icono={IconBeach}
        />
        <StatCard
          etiqueta="Llegadas tarde"
          valor={control?.llegadasTarde ?? '…'}
          detalle={
            control && control.minutosTarde > 0
              ? `${control.minutosTarde} min (semana)`
              : 'última semana'
          }
          href="/app/reportes"
          icono={IconClockExclamation}
        />
        <StatCard
          etiqueta="Horas extras"
          valor={control ? `${control.horasExtras} hs` : '…'}
          detalle="última semana"
          href="/app/reportes"
          icono={IconClockPlus}
        />
        <StatCard
          etiqueta="Ausencias"
          valor={ausencias.length}
          detalle="en el año"
          href={`/app/ausencias?empleado=${empleado.id}`}
          icono={IconPlaneDeparture}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="text-base font-bold text-ink">Datos personales</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Dato etiqueta="DNI" valor={empleado.dni} />
            <Dato etiqueta="CUIL" valor={empleado.cuil} />
            <Dato etiqueta="Teléfono" valor={empleado.telefono} />
            <Dato etiqueta="Email" valor={empleado.email} />
            <Dato etiqueta="Domicilio" valor={empleado.domicilio} />
            <Dato
              etiqueta="Contacto de emergencia"
              valor={
                empleado.contactoEmergencia.nombreCompleto
                  ? `${empleado.contactoEmergencia.nombreCompleto} (${empleado.contactoEmergencia.telefono})`
                  : undefined
              }
            />
          </div>
        </Panel>

        <Panel>
          <h2 className="text-base font-bold text-ink">Datos laborales</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Dato etiqueta="Puesto" valor={empleado.puesto} />
            <Dato etiqueta="Sector" valor={empleado.sector} />
            <Dato
              etiqueta="Modalidad"
              valor={empleado.modalidadContratacion.replace('_', ' ')}
            />
            <Dato
              etiqueta="Fin de contrato"
              valor={
                empleado.fechaFinContrato
                  ? formatearFecha(empleado.fechaFinContrato)
                  : undefined
              }
            />
            <Dato etiqueta="Obra social" valor={empleado.obraSocial} />
            <Dato etiqueta="ART" valor={empleado.art} />
            <Dato etiqueta="Banco" valor={empleado.banco} />
            <Dato etiqueta="CBU" valor={empleado.cbu} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="text-base font-bold text-ink">Checklist del legajo</h2>
          <div className="mt-4 flex flex-col gap-2">
            {empleado.checklistAlta.map((item) => (
              <div
                key={item.id}
                onClick={() => void alternarChecklist(item.id)}
                className={`flex items-center gap-3 rounded-xl bg-paper px-4 py-2.5 ${esAdmin ? 'cursor-pointer transition-colors hover:bg-brand-50/60' : ''}`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white ${
                    item.completo ? 'bg-emerald-500' : 'bg-ink-soft/40'
                  }`}
                >
                  {item.completo ? (
                    <IconCheck size={14} />
                  ) : (
                    <IconX size={14} />
                  )}
                </span>
                <span
                  className={`text-sm font-medium ${item.completo ? 'text-ink' : 'text-ink-soft'}`}
                >
                  {item.etiqueta}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <ListaCard
          titulo="Ausencias del año"
          vacio="Sin ausencias este año."
          accion={{
            etiqueta: 'Ver en Ausencias',
            href: `/app/ausencias?empleado=${empleado.id}`,
          }}
        >
          {ausencias.length > 0 &&
            ausencias.map((a) => (
              <ListaItem
                key={a.id}
                href={`/app/ausencias?empleado=${empleado.id}`}
                icono={tipoAusenciaIconos[a.tipo]}
                principal={tipoAusenciaLabels[a.tipo]}
                secundario={`${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)} · ${a.dias} días`}
                extremo={<EstadoBadge estado={a.estado} />}
              />
            ))}
        </ListaCard>
      </div>

      <ListaCard
        titulo={`Documentos del legajo (${documentos.length})`}
        vacio="Sin documentos cargados todavía."
      >
        {documentos.length > 0 &&
          documentos.map((d) => (
            <ListaItem
              key={d.id}
              icono={IconFileText}
              principal={d.nombre}
              secundario={`${categoriaDocumentoLabels[d.categoria]}${d.fechaVencimiento ? ` · vence ${formatearFecha(d.fechaVencimiento)}` : ''}`}
              extremo={
                <div className="flex shrink-0 items-center gap-2">
                  {d.archivoUrl && (
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => void verDocumento(d)}
                    >
                      Ver
                    </Boton>
                  )}
                  {esAdmin && (
                    <Boton
                      variante="rechazar"
                      tamano="sm"
                      onClick={() => void eliminarDocumento(d.id)}
                    >
                      <IconTrash size={14} />
                      Quitar
                    </Boton>
                  )}
                </div>
              }
            />
          ))}
        {esAdmin && (
          <div>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={abrirDoc}
              type="button"
            >
              <IconPlus size={14} />
              Agregar documento
            </Boton>
          </div>
        )}
      </ListaCard>

      <Modal
        opened={docAbierto}
        onClose={cerrarDoc}
        title="Agregar documento"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-3.5">
          <Campo
            etiqueta="Nombre *"
            value={docNombre}
            onChange={(e) => setDocNombre(e.target.value)}
            placeholder="Contrato firmado, certificado…"
            error={docError ?? undefined}
          />
          <CampoSelect
            etiqueta="Categoría"
            value={docCategoria}
            onChange={(v) => setDocCategoria(v as CategoriaDocumento)}
            opciones={aOpciones(categoriaDocumentoLabels)}
          />
          <CampoFecha
            etiqueta="Vencimiento (opcional)"
            value={docVencimiento}
            onChange={setDocVencimiento}
            ayuda="Si tiene vencimiento, genera una alerta automática."
          />
          <CampoArchivo
            etiqueta="Archivo (PDF o foto)"
            accept=".pdf,image/*"
            onArchivo={setDocArchivo}
          />
          <Boton
            onClick={() => void guardarDocumento()}
            disabled={docGuardando}
          >
            {docGuardando ? 'Guardando…' : 'Guardar documento'}
          </Boton>
        </div>
      </Modal>

      <Modal
        opened={bajaAbierta}
        onClose={cerrarBaja}
        title="Dar de baja"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-sm leading-relaxed text-ink-soft">
            Vas a dar de baja a{' '}
            <strong className="text-ink">
              {empleado.nombre} {empleado.apellido}
            </strong>
            . Deja de aparecer en los listados activos, pero su historial y
            legajo se conservan.
          </p>
          <Campo
            etiqueta="Motivo *"
            value={motivoBaja}
            onChange={(e) => setMotivoBaja(e.target.value)}
            placeholder="Renuncia, fin de contrato, despido…"
            error={errorBaja ?? undefined}
          />
          <CampoFecha
            etiqueta="Fecha de baja"
            value={fechaBaja}
            onChange={setFechaBaja}
          />
          <div className="flex gap-2">
            <Boton
              variante="rechazar"
              onClick={() => void confirmarBaja()}
              disabled={procesando}
              className="flex-1"
            >
              {procesando ? 'Procesando…' : 'Confirmar baja'}
            </Boton>
            <Boton variante="secundario" onClick={cerrarBaja}>
              Cancelar
            </Boton>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FichaColaboradorPage;
