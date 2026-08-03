'use client';

import { useMemo, useState } from 'react';
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
  IconUpload,
  IconUser,
  IconUserOff,
  IconX,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { avisoError, avisoExito } from '@/lib/avisos';
import { abrirArchivo } from '@/lib/archivosUi';
import { Panel } from '@/components/app/Panel';
import { EnrolamientoFacial } from '@/components/app/facial/EnrolamientoFacial';
import { NotasInternas } from '@/components/app/colaboradores/NotasInternas';
import { RemuneracionesEmpleado } from '@/components/app/remuneraciones/RemuneracionesEmpleado';
import { MonotributoPanel } from '@/components/app/remuneraciones/MonotributoPanel';
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
  getEmpleadosConCuenta,
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
  getRemuneraciones,
  getSaldoVacaciones,
} from '@/lib/services/rrhh';
import { analizarSalario } from '@/lib/remuneraciones';
import { armarLiquidacionFinal } from '@/lib/liquidacionFinal';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { formatearPesos } from '@/lib/formato';
import {
  categoriaDeChecklist,
  documentoDeChecklist,
} from '@/lib/checklistAlta';
import {
  Ausencia,
  CategoriaDocumento,
  ChecklistItem,
  DocumentoLegajo,
  Remuneracion,
} from '@/types/rrhh';
import { faltasDeEmpleado } from '@/lib/requisitos';
import { BloqueFaltas } from '@/components/app/Faltas';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';

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

  const cEmpleado = useCarga(() => getEmpleado(id), [id], {
    activo: Boolean(id),
    contexto: 'ficha/empleado',
  });
  const empleado = cEmpleado.datos ?? null;
  /** Tras tildar el checklist, el servidor ya devuelve la ficha nueva. */
  const setEmpleado = cEmpleado.actualizar;

  const cSaldo = useCarga(() => getSaldoVacaciones(id, ANIO_ACTUAL), [id], {
    activo: Boolean(id),
    contexto: 'ficha/saldo',
  });
  const saldo = cSaldo.datos ?? null;

  const cControl = useCarga(() => getMiMes(id), [id], {
    activo: Boolean(id),
    contexto: 'ficha/control',
  });
  const control = cControl.datos ?? null;

  const cAusencias = useCarga(() => getAusenciasDeEmpleado(id), [id], {
    activo: Boolean(id),
    contexto: 'ficha/ausencias',
    inicial: [] as Ausencia[],
  });
  const ausencias = cAusencias.datos;

  const cDocumentos = useCarga(() => getDocumentosDeEmpleado(id), [id], {
    activo: Boolean(id),
    contexto: 'ficha/documentos',
    inicial: [] as DocumentoLegajo[],
  });
  const documentos = cDocumentos.datos;
  const [docAbierto, { open: abrirDoc, close: cerrarDoc }] =
    useDisclosure(false);
  const [docNombre, setDocNombre] = useState('');
  const [docCategoria, setDocCategoria] = useState<CategoriaDocumento>('otro');
  const [docVencimiento, setDocVencimiento] = useState('');
  const [docArchivo, setDocArchivo] = useState<File | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docGuardando, setDocGuardando] = useState(false);
  /** Ítem del checklist que disparó la subida, para tildarlo al guardar. */
  const [checklistPendiente, setChecklistPendiente] = useState<string | null>(
    null
  );
  const [bajaAbierta, { open: abrirBaja, close: cerrarBaja }] =
    useDisclosure(false);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [fechaBaja, setFechaBaja] = useState(hoyISO());
  const [errorBaja, setErrorBaja] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cRemuneraciones = useCarga(() => getRemuneraciones(id), [id], {
    activo: Boolean(id),
    contexto: 'ficha/remuneraciones',
    inicial: [] as Remuneracion[],
  });
  const remuneraciones = cRemuneraciones.datos;

  // Panorama completo de esta persona: sin ámbito, para que la ficha sea
  // el lugar donde se ve todo junto y no haya que recorrer secciones
  // para descubrir qué le falta.
  const cCuentas = useCarga(() => getEmpleadosConCuenta(), [], {
    activo: rolEfectivo === 'admin_rrhh',
    contexto: 'ficha/cuentas',
    inicial: [] as string[],
  });
  const faltas = useMemo(
    () =>
      empleado
        ? faltasDeEmpleado(empleado, {
            // Si la consulta falló no se afirma nada.
            tieneCuenta:
              cCuentas.fase === 'ok' ? cCuentas.datos.includes(id) : undefined,
          })
        : [],
    [empleado, cCuentas.fase, cCuentas.datos, id]
  );

  /**
   * Borrador de lo que hay que pagarle al irse. Se muestra al dar de
   * baja porque es el momento en que se decide, y hasta ahora la baja no
   * disparaba ningún cálculo: quedaba todo a que alguien se acordara.
   */
  const borradorBaja = useMemo(() => {
    if (!empleado || !fechaBaja) return null;
    const analisis = analizarSalario(
      remuneraciones,
      new Date(`${fechaBaja}T00:00:00`),
      empleado.fechaIngreso
    );
    return armarLiquidacionFinal({
      fechaIngreso: empleado.fechaIngreso,
      fechaBaja,
      brutoMensual: analisis.ultima?.montoBruto ?? 0,
      mejorBrutoSemestre: analisis.mejorSemestreBruto,
      diasVacacionesGozados: saldo?.diasUtilizados ?? 0,
    });
  }, [empleado, fechaBaja, remuneraciones, saldo]);

  if (!usuario || rolEfectivo === 'empleado') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  // Un fallo se veía como "Cargando ficha…" para siempre: la persona
  // esperaba algo que no iba a llegar.
  if (cEmpleado.fase === 'error' && cEmpleado.error) {
    return (
      <BloqueError error={cEmpleado.error} onReintentar={cEmpleado.recargar} />
    );
  }

  if (!empleado) {
    return <p className="text-sm text-ink-soft">Cargando ficha…</p>;
  }

  const esAdmin = rolEfectivo === 'admin_rrhh';

  const recargarDocs = cDocumentos.recargar;

  const alternarChecklist = async (itemId: string) => {
    if (!esAdmin) return;
    const actualizado = await toggleChecklistItem(empleado.id, itemId);
    if (actualizado) setEmpleado({ ...actualizado });
  };

  /**
   * Abre el modal ya apuntando al ítem del checklist que falta: con la
   * categoría y el nombre puestos, subirlo es elegir el archivo y listo.
   */
  const abrirDocDeChecklist = (item: ChecklistItem) => {
    const categoria = categoriaDeChecklist(item);
    if (!categoria) return;
    setDocCategoria(categoria);
    setDocNombre(item.etiqueta);
    setDocVencimiento('');
    setDocArchivo(null);
    setDocError(null);
    setChecklistPendiente(item.id);
    abrirDoc();
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
      // Si el documento venía de un ítem pendiente, se tilda solo: el
      // documento está, tildarlo aparte era un paso manual que se olvida
      // y deja el legajo marcado como incompleto sin serlo.
      if (checklistPendiente) {
        const item = empleado.checklistAlta.find(
          (c) => c.id === checklistPendiente
        );
        if (item && !item.completo) {
          const actualizado = await toggleChecklistItem(
            empleado.id,
            checklistPendiente
          );
          if (actualizado) setEmpleado({ ...actualizado });
        }
      }
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
    setChecklistPendiente(null);
    cerrarDoc();
    recargarDocs();
  };

  const verDocumento = (doc: DocumentoLegajo) =>
    abrirArchivo(() => abrirDocumento(doc), {
      titulo: 'No pudimos abrir el documento',
    });

  const eliminarDocumento = async (documentoId: string) => {
    try {
      await quitarDocumento(documentoId);
      avisoExito('Documento eliminado');
    } catch (err) {
      avisoError(
        'No pudimos eliminarlo',
        err instanceof Error ? err.message : undefined
      );
    }
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
    router.push('/colaboradores');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Breadcrumbs
            items={[
              { etiqueta: 'Colaboradores', href: '/colaboradores' },
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
              href={`/colaboradores/${empleado.id}/editar`}
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

      {/* Arriba de los indicadores: si a esta persona le falta un dato
          que le impide cobrar, firmar o fichar, es más urgente que
          cuántas llegadas tarde tuvo. Se muestra sólo a RRHH: el
          colaborador no puede resolver ninguna de estas cosas. */}
      {rolEfectivo === 'admin_rrhh' && empleado.activo && (
        <BloqueFaltas faltas={faltas} titulo="Qué le falta a esta ficha" />
      )}

      {/* Indicadores de control del empleado */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          etiqueta="Vacaciones"
          valor={saldo ? `${saldo.diasDisponibles}` : '…'}
          detalle={`disponibles de ${saldo?.diasCorresponden ?? '—'}`}
          href={`/ausencias?empleado=${empleado.id}`}
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
          href="/reportes"
          icono={IconClockExclamation}
        />
        <StatCard
          etiqueta="Horas extras"
          valor={control ? `${control.horasExtras} hs` : '…'}
          detalle="última semana"
          href="/reportes"
          icono={IconClockPlus}
        />
        <StatCard
          etiqueta="Ausencias"
          valor={ausencias.length}
          detalle="en el año"
          href={`/ausencias?empleado=${empleado.id}`}
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
          <p className="mt-1 text-sm text-ink-soft">
            Lo que falta se puede subir desde acá: no hace falta ir a otra
            pantalla y volver.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {empleado.checklistAlta.map((item) => {
              const doc = documentoDeChecklist(item, documentos);
              const categoria = categoriaDeChecklist(item);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl bg-paper px-4 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => void alternarChecklist(item.id)}
                    disabled={!esAdmin}
                    aria-label={`Marcar ${item.etiqueta} como ${item.completo ? 'pendiente' : 'completo'}`}
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-0 text-white ${esAdmin ? 'cursor-pointer' : ''} ${
                      item.completo ? 'bg-emerald-500' : 'bg-ink-soft/40'
                    }`}
                  >
                    {item.completo ? (
                      <IconCheck size={14} />
                    ) : (
                      <IconX size={14} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${item.completo ? 'text-ink' : 'text-ink-soft'}`}
                    >
                      {item.etiqueta}
                    </p>
                    {doc ? (
                      <button
                        type="button"
                        onClick={() => verDocumento(doc)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-xs text-brand-700 underline-offset-2 hover:underline"
                      >
                        {doc.nombre}
                      </button>
                    ) : (
                      item.completo &&
                      categoria && (
                        // Tildado pero sin nada adjunto: no es un error,
                        // pero es lo que va a faltar el día que alguien
                        // pida el legajo completo.
                        <p className="text-xs text-amber-700">
                          Sin documento adjunto
                        </p>
                      )
                    )}
                  </div>
                  {esAdmin && !doc && categoria && (
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => abrirDocDeChecklist(item)}
                    >
                      <IconUpload size={14} />
                      Subir
                    </Boton>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        {empleado.activo && (
          <Panel>
            <EnrolamientoFacial
              empleado={empleado}
              onActualizado={(e) => setEmpleado({ ...e })}
            />
          </Panel>
        )}

        {/* El detalle salarial es de RRHH. Al supervisor la base ya no le
            devuelve nada (políticas `remuneraciones_select` y
            `facturas_mono_select`), así que estos paneles le quedaban
            vacíos: mejor no mostrárselos y evitar que parezca que la
            ficha está incompleta. */}
        {esAdmin && (
          <>
            <RemuneracionesEmpleado
              empleadoId={empleado.id}
              puedeEditar={esAdmin}
              convenioEmpleado={empleado.convenio}
            />

            {empleado.modalidadContratacion === 'monotributista' && (
              <Panel>
                <h2 className="text-base font-bold text-ink">
                  Costo monotributo
                </h2>
                <MonotributoPanel
                  empleadoId={empleado.id}
                  puedeEditar={esAdmin}
                />
              </Panel>
            )}
          </>
        )}

        {esAdmin && (
          <Panel>
            <NotasInternas empleadoId={empleado.id} />
          </Panel>
        )}

        <ListaCard
          titulo="Ausencias del año"
          vacio="Sin ausencias este año."
          accion={{
            etiqueta: 'Ver en Ausencias',
            href: `/ausencias?empleado=${empleado.id}`,
          }}
        >
          {ausencias.length > 0 &&
            ausencias.map((a) => (
              <ListaItem
                key={a.id}
                href={`/ausencias?empleado=${empleado.id}`}
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

          {borradorBaja && borradorBaja.conceptos.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Borrador de liquidación final
              </p>
              <div className="mt-2 flex flex-col divide-y divide-amber-200/70">
                {borradorBaja.conceptos.map((c) => (
                  <div key={c.concepto} className="py-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 text-xs text-amber-900">
                        {c.concepto}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-amber-900">
                        {formatearPesos(c.monto)}
                      </span>
                    </div>
                    <p className="text-[0.65rem] text-amber-900/70">
                      {c.detalle}
                    </p>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 pt-2">
                  <span className="text-xs font-bold text-amber-900">
                    Total
                  </span>
                  <span className="text-sm font-extrabold text-amber-900">
                    {formatearPesos(borradorBaja.total)}
                  </span>
                </div>
              </div>
              <p className="mt-2.5 text-[0.7rem] leading-relaxed text-amber-900/80">
                Son solo los conceptos que salen de una cuenta con fechas y
                sueldos.{' '}
                <strong>
                  No incluye preaviso ni indemnización por antigüedad
                </strong>
                : eso depende de la causal y lo tiene que definir tu contador o
                abogado.
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
              No podemos estimar la liquidación final porque no hay
              remuneraciones cargadas para este colaborador. Cargá al menos un
              período en Remuneraciones y va a aparecer acá.
            </p>
          )}

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

/** Trabaja sobre una empresa concreta: sin una activa no hay qué pedir. */
const FichaColaboradorPageConEmpresa = () => (
  <RequireEmpresa>
    <FichaColaboradorPage />
  </RequireEmpresa>
);

export default FichaColaboradorPageConEmpresa;
