'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconMessages, IconPlus } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect, CampoTextarea } from '@/components/app/ui/Campo';
import { juntarErrores, validarRequerido } from '@/lib/validaciones';
import { aOpciones, Selector } from '@/components/app/ui/Selector';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { avisoError, avisoExito } from '@/lib/avisos';
import { interpretarError } from '@/lib/errores';
import {
  cerrarComunicacion,
  crearComunicacion,
  getComunicaciones,
  getComunicacionesDeEmpleado,
  getComunicacionesSinLeer,
  getEmpleados,
  getMensajesComunicacion,
  marcarComunicacionLeida,
  responderComunicacion,
  suscribirMensajes,
} from '@/lib/services/rrhh';
import {
  Comunicacion,
  ComunicacionMensaje,
  Empleado,
  EstadoComunicacion,
  TipoComunicacion,
} from '@/types/rrhh';
import { RequireModulo } from '@/components/app/RequireModulo';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';

const tipoLabels: Record<TipoComunicacion, string> = {
  consulta: 'Consulta',
  reclamo: 'Reclamo',
  pedido: 'Pedido',
};

const estadoLabels: Record<EstadoComunicacion, string> = {
  abierta: 'Abierta',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
};

const POR_PAGINA = 8;

const campoClase =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600';

const ComunicacionesPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const esEmpleado = rolEfectivo === 'empleado';
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [seleccion, setSeleccion] = useState<Comunicacion | null>(null);
  const [sinLeer, setSinLeer] = useState<Set<string>>(new Set());
  const [mensajes, setMensajes] = useState<ComunicacionMensaje[]>([]);
  const [respuesta, setRespuesta] = useState('');
  const [modal, { open, close }] = useDisclosure(false);
  const [tipo, setTipo] = useState<TipoComunicacion>('consulta');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [empleadoId, setEmpleadoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const miId = usuario?.empleadoId;
  const soloMias = esEmpleado && Boolean(miId);

  const cLista = useCarga(
    () => (soloMias ? getComunicacionesDeEmpleado(miId!) : getComunicaciones()),
    [soloMias, miId],
    {
      activo: Boolean(usuario),
      contexto: 'comunicaciones',
      inicial: [] as Comunicacion[],
    }
  );
  const lista = cLista.datos;

  const cEmpleados = useCarga(() => getEmpleados(), [soloMias], {
    activo: !soloMias && Boolean(usuario),
    contexto: 'comunicaciones/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cEmpleados.datos;

  // Los "sin leer" son un adorno del listado: si fallan, las
  // conversaciones se abren igual.
  const cSinLeer = useCarga(() => getComunicacionesSinLeer(), [], {
    activo: Boolean(usuario),
    contexto: 'comunicaciones/sin-leer',
    inicial: [] as string[],
  });

  useEffect(() => {
    setSinLeer(new Set(cSinLeer.datos));
  }, [cSinLeer.datos]);

  const cargar = useCallback(() => {
    cLista.recargar();
    cEmpleados.recargar();
    cSinLeer.recargar();
  }, [cLista, cEmpleados, cSinLeer]);

  const listaFiltrada = useMemo(
    () =>
      filtroEmpleado
        ? lista.filter((c) => c.empleadoId === filtroEmpleado)
        : lista,
    [lista, filtroEmpleado]
  );

  const {
    pagina,
    setPagina,
    totalPaginas,
    visibles: listaVisible,
  } = usePaginacion(listaFiltrada, POR_PAGINA);

  /**
   * Abrir la conversación la marca como leída. Vuelve a quedar sin leer
   * sola si después llega un mensaje nuevo.
   */
  const abrir = (c: Comunicacion) => {
    setSeleccion(c);
    if (!sinLeer.has(c.id)) return;
    setSinLeer((previo) => {
      const copia = new Set(previo);
      copia.delete(c.id);
      return copia;
    });
    void marcarComunicacionLeida(c.id);
  };

  useEffect(() => {
    if (!seleccion) {
      setMensajes([]);
      return;
    }
    const id = seleccion.id;
    const traer = () => {
      void getMensajesComunicacion(id)
        .then(setMensajes)
        .catch((err) => {
          const { titulo, detalle } = interpretarError(err);
          avisoError(titulo, detalle);
        });
    };
    traer();

    // Mientras la conversación está abierta, los mensajes del otro lado
    // entran solos. Sin esto había que salir y volver a entrar para ver
    // una respuesta que ya estaba escrita.
    const cortar = suscribirMensajes(id, traer);
    return cortar;
  }, [seleccion]);

  const nombreEmpleado = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.apellido}, ${e.nombre}` : 'Colaborador';
  };

  // No hay forma de resolver el nombre exacto del autor de cada mensaje sin
  // exponer la tabla de usuarios (RLS no deja a un empleado leer a otros
  // usuarios). Alcanza con distinguir "lo mío" de "lo del otro lado": el
  // empleado ve "RRHH" y el admin ve al colaborador dueño del hilo.
  const esMio = (autorId: string) => autorId === usuario?.id;
  const autorDe = (autorId: string, empleadoId: string) => {
    if (esMio(autorId)) return 'Vos';
    return esEmpleado ? 'RRHH' : nombreEmpleado(empleadoId);
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    const empId = esEmpleado ? usuario?.empleadoId : empleadoId;
    // El error va en cada campo, no en un aviso flotante: así se ve cuál
    // falta sin tener que adivinar.
    const nuevos = juntarErrores({
      empleado: esEmpleado
        ? null
        : validarRequerido(empId ?? '', 'El colaborador'),
      asunto: validarRequerido(asunto, 'El asunto'),
      cuerpo: validarRequerido(cuerpo, 'El mensaje'),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0 || !empId) return;
    setEnviando(true);
    try {
      await crearComunicacion({
        empleadoId: empId,
        tipo,
        asunto: asunto.trim(),
        cuerpo: cuerpo.trim(),
      });
      avisoExito('Enviado', 'Tu mensaje quedó registrado.');
      setAsunto('');
      setCuerpo('');
      setErrores({});
      close();
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos enviar',
        err instanceof Error ? err.message : undefined
      );
    }
    setEnviando(false);
  };

  const responder = async () => {
    if (!seleccion || !respuesta.trim()) return;
    try {
      await responderComunicacion(seleccion.id, respuesta.trim());
      setRespuesta('');
      const msgs = await getMensajesComunicacion(seleccion.id);
      setMensajes(msgs);
      cargar();
      avisoExito('Respuesta enviada');
    } catch (err) {
      avisoError(
        'No pudimos responder',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const cerrar = async () => {
    if (!seleccion) return;
    try {
      await cerrarComunicacion(seleccion.id);
      avisoExito('Conversación cerrada');
      setSeleccion(null);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos cerrar',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Comunicaciones
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Consultas, reclamos y pedidos en un solo lugar (sin WhatsApp).
          </p>
        </div>
        <Boton variante="negro" onClick={open}>
          <IconPlus size={18} />
          Nuevo
        </Boton>
      </div>

      {!esEmpleado && empleados.length > 0 && (
        <Selector
          valor={filtroEmpleado}
          onCambiar={setFiltroEmpleado}
          opciones={[
            { valor: '', etiqueta: 'Todos los colaboradores' },
            ...empleados.map((e) => ({
              valor: e.id,
              etiqueta: `${e.apellido}, ${e.nombre}`,
            })),
          ]}
        />
      )}

      {cLista.fase === 'error' && cLista.error && (
        <BloqueError error={cLista.error} onReintentar={cLista.recargar} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaCard
          titulo={
            cLista.fase === 'ok'
              ? `Conversaciones (${listaFiltrada.length})`
              : 'Conversaciones'
          }
          cargando={cLista.fase === 'cargando'}
          vacio={
            filtroEmpleado
              ? 'Este colaborador todavía no tiene comunicaciones.'
              : 'Todavía no hay comunicaciones.'
          }
        >
          {listaVisible.map((c) => (
            <ListaItem
              key={c.id}
              icono={IconMessages}
              principal={c.asunto}
              secundario={`${tipoLabels[c.tipo]} · ${estadoLabels[c.estado]}${
                !esEmpleado ? ` · ${nombreEmpleado(c.empleadoId)}` : ''
              }`}
              extremo={
                sinLeer.has(c.id) ? (
                  <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">
                    Sin leer
                  </span>
                ) : undefined
              }
              onClick={() => abrir(c)}
            />
          ))}
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            onCambiar={setPagina}
          />
        </ListaCard>

        <div className="rounded-2xl border border-line bg-surface p-4">
          {!seleccion ? (
            <p className="text-sm text-ink-soft">
              Elegí una conversación para ver el detalle y responder.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-ink">
                    {seleccion.asunto}
                  </h2>
                  <p className="text-xs text-ink-soft">
                    {tipoLabels[seleccion.tipo]} ·{' '}
                    {estadoLabels[seleccion.estado]}
                  </p>
                </div>
                {!esEmpleado && seleccion.estado !== 'cerrada' && (
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => void cerrar()}
                  >
                    Cerrar
                  </Boton>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {[
                  {
                    id: seleccion.id,
                    autorId: seleccion.autorId,
                    cuerpo: seleccion.cuerpo,
                    creadoEn: seleccion.creadoEn,
                  },
                  ...mensajes,
                ].map((m) => {
                  const mio = esMio(m.autorId);
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-0.5 ${mio ? 'items-end' : 'items-start'}`}
                    >
                      <span className="px-1 text-[0.65rem] font-bold text-ink-soft">
                        {autorDe(m.autorId, seleccion.empleadoId)}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                          mio
                            ? 'bg-brand-600 text-white'
                            : 'border border-line bg-paper text-ink'
                        }`}
                      >
                        {m.cuerpo}
                      </div>
                      <p className="px-1 text-[0.6rem] text-ink-soft">
                        {new Date(m.creadoEn).toLocaleString('es-AR')}
                      </p>
                    </div>
                  );
                })}
              </div>
              {seleccion.estado !== 'cerrada' && (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value)}
                    rows={2}
                    placeholder="Escribí una respuesta…"
                    aria-label={`Responder a ${seleccion.asunto}`}
                    className={campoClase}
                  />
                  <Boton onClick={() => void responder()} className="self-end">
                    Responder
                  </Boton>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        opened={modal}
        onClose={close}
        title="Nueva comunicación"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <form onSubmit={crear} className="flex flex-col gap-3.5">
          {!esEmpleado && (
            <CampoSelect
              etiqueta="Colaborador *"
              value={empleadoId}
              onChange={setEmpleadoId}
              error={errores.empleado}
              opciones={[
                { valor: '', etiqueta: 'Elegí…' },
                ...empleados.map((e) => ({
                  valor: e.id,
                  etiqueta: `${e.apellido}, ${e.nombre}`,
                })),
              ]}
            />
          )}
          <CampoSelect
            etiqueta="Tipo"
            value={tipo}
            onChange={(v) => setTipo(v as TipoComunicacion)}
            opciones={aOpciones(tipoLabels)}
          />
          <Campo
            etiqueta="Asunto *"
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            error={errores.asunto}
            placeholder="Ej. Consulta sobre vacaciones"
          />
          <CampoTextarea
            etiqueta="Mensaje *"
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            error={errores.cuerpo}
          />
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </Boton>
        </form>
      </Modal>
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const ComunicacionesPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="comunicaciones">
      <ComunicacionesPage />
    </RequireModulo>
  </RequireEmpresa>
);

export default ComunicacionesPageProtegida;
