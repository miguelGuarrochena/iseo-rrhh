'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconFileCheck,
  IconPlus,
  IconSignature,
  IconTrash,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoTextarea } from '@/components/app/ui/Campo';
import { juntarErrores, validarRequerido } from '@/lib/validaciones';
import { CampoArchivo } from '@/components/app/ui/CampoArchivo';
import { avisoError, avisoExito } from '@/lib/avisos';
import { abrirArchivo } from '@/lib/archivosUi';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import {
  abrirDocumentoFirma,
  crearDocumentoFirma,
  eliminarDocumentoFirma,
  firmarDocumento,
  getDestinatariosDocumento,
  getDocumentosFirma,
  getDocumentosFirmaPendientes,
  getEmpleados,
} from '@/lib/services/rrhh';
import {
  DocumentoFirma,
  DocumentoFirmaDestinatario,
  Empleado,
} from '@/types/rrhh';
import { RequireModulo } from '@/components/app/RequireModulo';

const POR_PAGINA = 8;

const DocumentosFirmaPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const esAdmin = rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin';
  const esEmpleado = rolEfectivo === 'empleado';

  const [docs, setDocs] = useState<
    (DocumentoFirma & { pendientes: number; firmados: number })[]
  >([]);
  const [pendientes, setPendientes] = useState<
    (DocumentoFirma & { destinatarioId: string })[]
  >([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [detalleDoc, setDetalleDoc] = useState<
    (DocumentoFirma & { pendientes: number; firmados: number }) | null
  >(null);
  const [destinatarios, setDestinatarios] = useState<
    DocumentoFirmaDestinatario[]
  >([]);
  const [modal, { open, close }] = useDisclosure(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (esAdmin) {
      void getDocumentosFirma().then(setDocs);
      void getEmpleados().then(setEmpleados);
    }
    if (usuario.empleadoId) {
      void getDocumentosFirmaPendientes(usuario.empleadoId).then(setPendientes);
    }
  }, [usuario, esAdmin]);

  useEffect(cargar, [cargar]);

  const {
    pagina,
    setPagina,
    totalPaginas,
    visibles: docsVisibles,
  } = usePaginacion(docs, POR_PAGINA);

  const toggleEmpleado = (id: string) =>
    setElegidos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    // Cada faltante se marca en su campo. Antes salía un solo aviso con
    // los tres juntos y había que ir a buscar cuál era.
    const nuevos = juntarErrores({
      titulo: validarRequerido(titulo, 'El título'),
      archivo: archivo ? null : 'Adjuntá el PDF a firmar.',
      destinatarios:
        elegidos.length === 0 ? 'Elegí al menos un destinatario.' : null,
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0 || !archivo) return;
    setEnviando(true);
    try {
      await crearDocumentoFirma({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        archivo,
        empleadoIds: elegidos,
      });
      avisoExito('Documento enviado', 'Los destinatarios ya pueden firmarlo.');
      setTitulo('');
      setDescripcion('');
      setArchivo(null);
      setElegidos([]);
      close();
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos enviarlo',
        err instanceof Error ? err.message : undefined
      );
    }
    setEnviando(false);
  };

  const firmar = async (destinatarioId: string) => {
    try {
      await firmarDocumento(destinatarioId);
      avisoExito('Documento firmado');
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos firmar',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const ver = (doc: DocumentoFirma) =>
    abrirArchivo(() => abrirDocumentoFirma(doc), {
      titulo: 'No pudimos abrir el PDF',
    });

  const nombreEmpleado = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.apellido}, ${e.nombre}` : 'Colaborador';
  };

  const verDetalle = (
    doc: DocumentoFirma & { pendientes: number; firmados: number }
  ) => {
    setDetalleDoc(doc);
    void getDestinatariosDocumento(doc.id).then(setDestinatarios);
  };

  /**
   * Baja un documento que no debería estar circulando. Si alguien ya
   * firmó, se avisa: esa firma es una constancia y se va con él, así que
   * conviene que sea una decisión y no un click de más.
   */
  const borrar = async (doc: DocumentoFirma & { firmados: number }) => {
    const ok = await confirmar({
      titulo: 'Eliminar el documento',
      detalle:
        doc.firmados > 0
          ? `${doc.titulo} ya tiene ${doc.firmados} firma${doc.firmados === 1 ? '' : 's'}. Al eliminarlo se borran también esas constancias y el PDF. No se puede deshacer.`
          : `${doc.titulo} va a dejar de pedirse y se borra el PDF. No se puede deshacer.`,
      confirmar: 'Eliminar',
      peligrosa: true,
    });
    if (!ok) return;
    try {
      await eliminarDocumentoFirma(doc.id);
      avisoExito('Documento eliminado');
    } catch (err) {
      avisoError(
        'No pudimos eliminarlo',
        err instanceof Error ? err.message : undefined
      );
    }
    cargar();
  };

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Documentos a firmar
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Políticas, reglamentos y notificaciones con firma digital.
          </p>
        </div>
        {esAdmin && (
          <Boton variante="negro" onClick={open}>
            <IconPlus size={18} />
            Enviar documento
          </Boton>
        )}
      </div>

      {(esEmpleado || usuario.empleadoId) && (
        <ListaCard
          titulo={`Pendientes de tu firma (${pendientes.length})`}
          vacio="No tenés documentos pendientes."
        >
          {pendientes.map((d) => (
            <ListaItem
              key={d.destinatarioId}
              icono={IconFileCheck}
              principal={d.titulo}
              secundario={d.descripcion || 'Documento para firmar'}
              extremo={
                <div className="flex gap-2">
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => void ver(d)}
                  >
                    Ver PDF
                  </Boton>
                  <Boton
                    tamano="sm"
                    onClick={() => void firmar(d.destinatarioId)}
                  >
                    <IconSignature size={14} />
                    Firmar
                  </Boton>
                </div>
              }
            />
          ))}
        </ListaCard>
      )}

      {esAdmin && (
        <ListaCard
          titulo={`Enviados (${docs.length})`}
          vacio="Todavía no enviaste documentos a firmar."
        >
          {docsVisibles.map((d) => (
            <ListaItem
              key={d.id}
              icono={IconFileCheck}
              principal={d.titulo}
              secundario={`${d.firmados} firmados · ${d.pendientes} pendientes · tocá para ver quién falta`}
              onClick={() => verDetalle(d)}
              extremo={
                <div className="flex shrink-0 items-center gap-2">
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => void ver(d)}
                  >
                    Ver PDF
                  </Boton>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => void borrar(d)}
                    aria-label={`Eliminar el documento ${d.titulo}`}
                  >
                    <IconTrash size={14} />
                  </Boton>
                </div>
              }
            />
          ))}
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            onCambiar={setPagina}
          />
        </ListaCard>
      )}

      <Modal
        opened={modal}
        onClose={close}
        title="Enviar documento para firma"
        radius="lg"
        centered
        size="lg"
        styles={{ title: { fontWeight: 800 } }}
      >
        <form onSubmit={enviar} className="flex flex-col gap-3.5">
          <Campo
            etiqueta="Título *"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            error={errores.titulo}
            placeholder="Política de seguridad…"
          />
          <CampoTextarea
            etiqueta="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
          />
          <CampoArchivo
            etiqueta="PDF *"
            accept=".pdf,application/pdf"
            onArchivo={setArchivo}
            error={errores.archivo}
          />
          <div {...(errores.destinatarios ? { 'data-error-campo': '' } : {})}>
            <p className="mb-2 text-sm font-semibold text-ink">
              Destinatarios *
            </p>
            <div
              className={`max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2 ${
                errores.destinatarios ? 'border-red-300' : 'border-line'
              }`}
            >
              {empleados.map((e) => (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper"
                >
                  <input
                    type="checkbox"
                    checked={elegidos.includes(e.id)}
                    onChange={() => toggleEmpleado(e.id)}
                  />
                  {e.apellido}, {e.nombre}
                </label>
              ))}
            </div>
            {errores.destinatarios && (
              <span className="mt-1.5 block text-xs font-medium text-red-600">
                {errores.destinatarios}
              </span>
            )}
          </div>
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar para firma'}
          </Boton>
        </form>
      </Modal>

      <Modal
        opened={Boolean(detalleDoc)}
        onClose={() => setDetalleDoc(null)}
        title={detalleDoc?.titulo}
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-2">
          {destinatarios.length === 0 ? (
            <p className="text-sm text-ink-soft">Cargando…</p>
          ) : (
            destinatarios
              .slice()
              .sort((a, b) =>
                nombreEmpleado(a.empleadoId).localeCompare(
                  nombreEmpleado(b.empleadoId)
                )
              )
              .map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <span className="text-sm font-semibold text-ink">
                    {nombreEmpleado(d.empleadoId)}
                  </span>
                  {d.firmadoEn ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      Firmado
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                      Pendiente
                    </span>
                  )}
                </div>
              ))
          )}
        </div>
      </Modal>

      {dialogoConfirmar}
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const DocumentosFirmaPageProtegida = () => (
  <RequireModulo modulo="documentos-firma">
    <DocumentosFirmaPage />
  </RequireModulo>
);

export default DocumentosFirmaPageProtegida;
