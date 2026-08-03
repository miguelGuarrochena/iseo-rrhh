'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconFileCertificate,
  IconFiles,
  IconSignature,
  IconDownload,
  IconEye,
  IconHistory,
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
import { abrirArchivo, descargarArchivo } from '@/lib/archivosUi';
import {
  abrirRecibo,
  cargarRecibo,
  eliminarRecibo,
  firmarRecibo,
  firmarReciboEmpleador,
  getEmpleados,
  getRecibos,
  getRecibosArchivados,
  getRecibosArchivadosTodos,
  getRecibosTodos,
} from '@/lib/services/rrhh';
import { CargaMasivaModal } from '@/components/app/recibos/CargaMasivaModal';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { Empleado, ReciboSueldo, TipoRecibo } from '@/types/rrhh';
import { tipoReciboLabels } from '@/lib/etiquetas';
import { aOpciones } from '@/components/app/ui/Selector';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';

const POR_PAGINA = 8;

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
  /**
   * Quién ve la sección en modo "mis recibos" y quién en modo "los del
   * equipo". El recibo tiene el sueldo impreso, así que el detalle es de
   * RRHH: el supervisor entra acá igual que un colaborador, a ver los
   * propios. Lo hace cumplir la política `recibos_select` de la base;
   * esto es sólo la pantalla acompañando.
   */
  const soloPropios = rolEfectivo !== 'admin_rrhh';

  const [recibos, setRecibos] = useState<ReciboSueldo[]>([]);
  // Versiones reemplazadas por una rectificación. No se listan sueltas:
  // cuelgan del recibo vigente, que es donde a alguien se le ocurre
  // preguntar "¿y esto qué firmó en su momento?".
  const [archivados, setArchivados] = useState<ReciboSueldo[]>([]);
  const [versionesDe, setVersionesDe] = useState<ReciboSueldo | null>(null);
  // Copia que sobrevive al cierre: si el contenido se leyera de
  // `versionesDe`, al cerrar se vaciaría de golpe y durante la animación
  // de salida se vería un cuadro con el título y nada adentro.
  const [versionesTexto, setVersionesTexto] = useState<ReciboSueldo | null>(
    null
  );

  const abrirVersiones = (r: ReciboSueldo) => {
    setVersionesTexto(r);
    setVersionesDe(r);
  };
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
  const [cargaTipo, setCargaTipo] = useState<TipoRecibo>('mensual');
  const [cargaPublicar, setCargaPublicar] = useState(true);
  const [cargaError, setCargaError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [masivaAbierta, setMasivaAbierta] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const [cargandoLista, setCargandoLista] = useState(true);
  const [anioFiltro, setAnioFiltro] = useState('todos');
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (soloPropios) {
      const id = usuario.empleadoId;
      // Sin legajo vinculado no hay recibos que mostrar. Antes este caso
      // se caía a la rama de RRHH y la lista quedaba cargando para
      // siempre, porque `setCargandoLista(false)` nunca llegaba.
      if (!id) {
        setRecibos([]);
        setArchivados([]);
        setCargandoLista(false);
        return;
      }
      void getRecibos(id)
        .then(setRecibos)
        .finally(() => setCargandoLista(false));
      void getRecibosArchivados(id).then(setArchivados);
      return;
    }
    void getRecibosTodos()
      .then(setRecibos)
      .finally(() => setCargandoLista(false));
    void getRecibosArchivadosTodos().then(setArchivados);
    void getEmpleados().then(setEmpleados);
  }, [usuario, soloPropios]);

  useEffect(cargar, [cargar]);

  const nombreEmpleado = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  const abrirFirma = (recibo: ReciboSueldo) => {
    setAFirmar(recibo);
    open();
  };

  const verRecibo = (recibo: ReciboSueldo) =>
    abrirArchivo(() => abrirRecibo(recibo), {
      titulo: 'No pudimos abrir el recibo',
    });

  /**
   * Descarga el PDF con un nombre que se entiende sin abrirlo. El pedido
   * del cliente era que la gente pueda guardarse sus recibos viejos sin
   * tener que pedírselos a RRHH.
   */
  const descargarRecibo = (recibo: ReciboSueldo) =>
    descargarArchivo(
      () => abrirRecibo(recibo),
      `recibo-${recibo.periodo}-${recibo.tipo}.pdf`,
      { titulo: 'No pudimos descargar el recibo' }
    );

  /** Las versiones que este recibo vino a reemplazar, de la más nueva a la más vieja. */
  const versionesPrevias = (r: ReciboSueldo): ReciboSueldo[] =>
    archivados.filter(
      (a) =>
        a.empleadoId === r.empleadoId &&
        a.periodo === r.periodo &&
        a.tipo === r.tipo
    );

  /**
   * Sólo aparece si hubo rectificación. Es una función y no un componente
   * a propósito: definido acá adentro, React lo remontaría en cada render.
   */
  const botonVersiones = (r: ReciboSueldo) => {
    const previas = versionesPrevias(r);
    if (previas.length === 0) return null;
    return (
      <Boton
        variante="secundario"
        tamano="sm"
        onClick={() => abrirVersiones(r)}
        aria-label={`Ver versiones anteriores del recibo de ${formatearPeriodo(r.periodo)}`}
      >
        <IconHistory size={14} />
        {previas.length} anterior{previas.length === 1 ? '' : 'es'}
      </Boton>
    );
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
    // Cargar sobre un recibo ya firmado reemplaza el PDF y deja la
    // constancia de firma apuntando a otro archivo. Se avisa y se corta.
    const existente = recibos.find(
      (r) =>
        r.empleadoId === cargaEmpleado &&
        r.periodo === cargaPeriodo &&
        r.tipo === cargaTipo
    );
    if (existente) {
      const ok = await confirmar({
        titulo: 'Rectificar el recibo existente',
        detalle: (
          <>
            {nombreEmpleado(cargaEmpleado)} ya tiene un{' '}
            <strong className="font-semibold text-ink">
              {tipoReciboLabels[cargaTipo].toLowerCase()}
            </strong>{' '}
            de {formatearPeriodo(cargaPeriodo)}
            {existente.estadoFirma === 'firmado' ? ', y ya lo firmó' : ''}. El
            nuevo lo reemplaza y el anterior queda archivado con su firma, como
            respaldo. {nombreEmpleado(cargaEmpleado)} va a tener que firmar el
            nuevo.
          </>
        ),
        confirmar: 'Rectificar',
      });
      if (!ok) return;
    }
    setCargaError(null);
    setCargando(true);
    try {
      await cargarRecibo(
        cargaEmpleado,
        cargaPeriodo,
        cargaArchivo,
        cargaPublicar,
        cargaTipo
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
    const previas = versionesPrevias(r);
    const ok = await confirmar({
      titulo: 'Eliminar recibo',
      detalle: `Vas a eliminar el recibo de ${formatearPeriodo(r.periodo)}${
        soloPropios ? '' : ` de ${nombreEmpleado(r.empleadoId)}`
      }.${
        previas.length === 0
          ? ''
          : previas.length === 1
            ? ' Se borra también la versión anterior, con su firma.'
            : ` Se borran también las ${previas.length} versiones anteriores, con sus firmas.`
      } Esta acción no se puede deshacer.`,
      confirmar: 'Eliminar',
      peligrosa: true,
    });
    if (!ok) return;
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
  const borradores = soloPropios
    ? []
    : recibos.filter((r) => !r.firmadoEmpleadorEn);
  const publicados = soloPropios
    ? recibos
    : recibos.filter((r) => r.firmadoEmpleadorEn);
  const pendientes = publicados.filter((r) => r.estadoFirma === 'pendiente');
  const firmados = publicados.filter((r) => r.estadoFirma === 'firmado');

  // Filtro por año del historial: con dos o tres años de recibos, la
  // lista completa deja de servir para encontrar uno puntual.
  const anios = [...new Set(firmados.map((r) => r.periodo.slice(0, 4)))].sort(
    (a, b) => b.localeCompare(a)
  );
  const historial = firmados
    .filter((r) => anioFiltro === 'todos' || r.periodo.startsWith(anioFiltro))
    .sort((a, b) => b.periodo.localeCompare(a.periodo));

  const {
    pagina,
    setPagina,
    totalPaginas,
    visibles: historialVisible,
  } = usePaginacion(historial, POR_PAGINA);

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Recibos de sueldo
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {soloPropios
              ? 'Consultá y firmá tus recibos con validez digital.'
              : 'Estado de firmas del equipo.'}
          </p>
        </div>
        {rolEfectivo === 'admin_rrhh' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
          detalle={soloPropios ? 'tuyos' : 'en el equipo'}
          icono={IconSignature}
        />
        <StatCard
          etiqueta="Firmados"
          valor={firmados.length}
          detalle="al día"
          icono={IconFileCertificate}
        />
        {!soloPropios && borradores.length > 0 && (
          <StatCard
            etiqueta="Sin publicar"
            valor={borradores.length}
            detalle="falta tu firma"
            icono={IconWritingSign}
          />
        )}
      </div>

      {!soloPropios && borradores.length > 0 && (
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
                secundario={`${tipoReciboLabels[r.tipo]} · el colaborador todavía no lo ve`}
                extremo={
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {botonVersiones(r)}
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
        titulo={soloPropios ? 'Pendientes de firma' : 'Pendientes del equipo'}
        cargando={cargandoLista}
        vacio={
          soloPropios
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
                href={
                  soloPropios ? undefined : `/colaboradores/${r.empleadoId}`
                }
                icono={IconFileCertificate}
                principal={
                  soloPropios
                    ? formatearPeriodo(r.periodo)
                    : `${nombreEmpleado(r.empleadoId)} — ${formatearPeriodo(r.periodo)}`
                }
                secundario={tipoReciboLabels[r.tipo]}
                extremo={
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <FirmaBadge recibo={r} />
                    {botonVersiones(r)}
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => void verRecibo(r)}
                    >
                      <IconEye size={14} />
                      Ver
                    </Boton>
                    {soloPropios && r.estadoFirma === 'pendiente' && (
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
        titulo={soloPropios ? 'Historial de recibos' : 'Historial firmado'}
        cargando={cargandoLista}
        vacio={
          anios.length > 0
            ? 'No hay recibos firmados en ese año.'
            : 'Todavía no hay recibos firmados.'
        }
      >
        {anios.length > 1 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-xs font-semibold text-ink-soft">Año:</span>
            {['todos', ...anios].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAnioFiltro(a)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  anioFiltro === a
                    ? 'border-brand-300 bg-brand-100 text-brand-800'
                    : 'border-line bg-surface text-ink-soft hover:border-brand-300'
                }`}
              >
                {a === 'todos' ? 'Todos' : a}
              </button>
            ))}
          </div>
        )}
        {historial.length > 0 &&
          historialVisible.map((r) => (
            <ListaItem
              key={r.id}
              href={soloPropios ? undefined : `/colaboradores/${r.empleadoId}`}
              icono={IconFileCertificate}
              principal={
                soloPropios
                  ? formatearPeriodo(r.periodo)
                  : `${nombreEmpleado(r.empleadoId)} — ${formatearPeriodo(r.periodo)}`
              }
              secundario={`${tipoReciboLabels[r.tipo]} · firmado`}
              extremo={
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <FirmaBadge recibo={r} />
                  {botonVersiones(r)}
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => void verRecibo(r)}
                  >
                    <IconEye size={14} />
                    Ver
                  </Boton>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => void descargarRecibo(r)}
                    aria-label={`Descargar recibo de ${formatearPeriodo(r.periodo)}`}
                  >
                    <IconDownload size={14} />
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
        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          onCambiar={setPagina}
        />
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
          <CampoSelect
            etiqueta="Concepto *"
            value={cargaTipo}
            onChange={(v) => setCargaTipo(v as TipoRecibo)}
            opciones={aOpciones(tipoReciboLabels)}
            ayuda="Un mismo mes puede tener el sueldo y el aguinaldo, por ejemplo."
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
        recibosExistentes={recibos}
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

      <Modal
        opened={versionesDe !== null}
        onClose={() => setVersionesDe(null)}
        title="Versiones anteriores"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        {versionesTexto && (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-ink-soft">
              {soloPropios
                ? ''
                : `${nombreEmpleado(versionesTexto.empleadoId)} — `}
              <strong className="text-ink">
                {tipoReciboLabels[versionesTexto.tipo]} de{' '}
                {formatearPeriodo(versionesTexto.periodo)}
              </strong>
              . Cada versión guarda el PDF y la firma tal como estaban cuando se
              la reemplazó.
            </p>
            {versionesPrevias(versionesTexto).map((v, i, arr) => (
              <div
                key={v.id}
                className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    Versión {arr.length - i}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {v.estadoFirma === 'firmado'
                      ? `Firmada${v.firmadoEn ? ` el ${formatearFecha(v.firmadoEn)}` : ''}`
                      : 'Nunca se firmó'}
                    {v.archivadoEn
                      ? ` · reemplazada el ${formatearFecha(v.archivadoEn)}`
                      : ''}
                  </p>
                </div>
                {/* Ver y descargar, igual que en la lista: una versión
                    archivada es la prueba de lo que se firmó, y a RRHH
                    se la pide un contador o un abogado como archivo. */}
                <div className="flex shrink-0 gap-2">
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => void verRecibo(v)}
                  >
                    <IconEye size={14} />
                    Ver PDF
                  </Boton>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() =>
                      void descargarArchivo(
                        () => abrirRecibo(v),
                        `recibo-${v.periodo}-${v.tipo}-v${arr.length - i}.pdf`,
                        { titulo: 'No pudimos descargar el recibo' }
                      )
                    }
                    aria-label={`Descargar la versión ${arr.length - i}`}
                  >
                    <IconDownload size={14} />
                    Descargar
                  </Boton>
                </div>
              </div>
            ))}
            <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
              La versión {versionesPrevias(versionesTexto).length + 1} es la
              vigente, la que figura en la lista.
            </p>
          </div>
        )}
      </Modal>

      {dialogoConfirmar}
    </div>
  );
};

export default RecibosPage;
