'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { faltasDeEmpleado } from '@/lib/requisitos';
import { BloqueFaltas } from '@/components/app/Faltas';
import { avisoError, avisoExito } from '@/lib/avisos';
import { interpretarError } from '@/lib/errores';
import {
  cerrarComunicacion,
  crearComunicacion,
  getComunicaciones,
  getComunicacionesDeEmpleado,
  getComunicacionesSinLeer,
  getEmpleados,
  getEmpleadosConCuenta,
  getMensajesComunicacion,
  getUsuariosDeEmpresa,
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
  Usuario,
} from '@/types/rrhh';
import { RequireModulo } from '@/components/app/RequireModulo';
import { ChatColaborador } from '@/components/app/comunicaciones/ChatColaborador';
import { HiloMensajes } from '@/components/app/comunicaciones/HiloMensajes';
import { Redactor } from '@/components/app/comunicaciones/Redactor';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { refrescarPendientes } from '@/lib/pendientes';

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

const ComunicacionesPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  // La campanita linkea a la conversación concreta (`?c=<id>`).
  const idDeAviso = useSearchParams().get('c');
  const esEmpleado = rolEfectivo === 'empleado';
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [seleccion, setSeleccion] = useState<Comunicacion | null>(null);
  const [sinLeer, setSinLeer] = useState<Set<string>>(new Set());
  const [mensajes, setMensajes] = useState<ComunicacionMensaje[]>([]);
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
    // El numerito del menú tiene que bajar al leer, no en la próxima
    // recarga de la página: es justamente lo que se ve mal.
    void marcarComunicacionLeida(c.id).then(refrescarPendientes);
  };

  /**
   * Abre sola la conversación que traía el aviso, una vez que llegó la
   * lista. Una sola vez: después de eso manda lo que elija la persona,
   * si no volver a otra conversación te devolvía a ésta.
   */
  const [avisoAbierto, setAvisoAbierto] = useState(false);
  useEffect(() => {
    if (avisoAbierto || !idDeAviso) return;
    const c = lista.find((x) => x.id === idDeAviso);
    if (!c) return;
    setAvisoAbierto(true);
    setSeleccion(c);
    setSinLeer((previo) => {
      const copia = new Set(previo);
      copia.delete(c.id);
      return copia;
    });
    void marcarComunicacionLeida(c.id).then(refrescarPendientes);
  }, [idDeAviso, lista, avisoAbierto]);

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

  // Para firmar cada mensaje con quién lo escribió de verdad. Sin esto
  // toda respuesta ajena llevaba el nombre del colaborador del tema,
  // aunque la hubiera escrito otra persona de RRHH.
  const cUsuarios = useCarga(() => getUsuariosDeEmpresa(), [soloMias], {
    activo: !soloMias && Boolean(usuario),
    contexto: 'comunicaciones/usuarios',
    inicial: [] as Usuario[],
  });

  const nombreDeAutor = (autorId: string): string => {
    const u = cUsuarios.datos.find((x) => x.id === autorId);
    if (!u) {
      // Puede ser alguien de ISEO entrando a la empresa: no figura en la
      // lista de usuarios y no hay forma de nombrarlo desde acá. Decir
      // "RRHH" es genérico, pero no le pone el nombre de otra persona.
      return 'RRHH';
    }
    return seleccion && u.empleadoId === seleccion.empleadoId
      ? nombreEmpleado(seleccion.empleadoId)
      : u.nombreCompleto;
  };

  const cCuentas = useCarga(() => getEmpleadosConCuenta(), [soloMias], {
    activo: !soloMias && Boolean(usuario),
    contexto: 'comunicaciones/cuentas',
    inicial: [] as string[],
  });
  const faltasDe = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    if (!e) return [];
    return faltasDeEmpleado(
      e,
      {
        // Si la consulta falló, no se afirma nada.
        tieneCuenta:
          cCuentas.fase === 'ok' ? cCuentas.datos.includes(id) : undefined,
      },
      'comunicaciones'
    );
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
      refrescarPendientes();
    } catch (err) {
      avisoError(
        'No pudimos enviar',
        err instanceof Error ? err.message : undefined
      );
    }
    setEnviando(false);
  };

  const responder = async (texto: string) => {
    if (!seleccion) return;
    try {
      await responderComunicacion(seleccion.id, texto);
      const msgs = await getMensajesComunicacion(seleccion.id);
      setMensajes(msgs);
      cargar();
      refrescarPendientes();
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
      refrescarPendientes();
    } catch (err) {
      avisoError(
        'No pudimos cerrar',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Comunicaciones
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Consultas, reclamos y pedidos de tu equipo, con historial.
          </p>
        </div>
        <Boton variante="negro" onClick={open}>
          <IconPlus size={18} />
          Escribir a un colaborador
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

        <div className="rounded-2xl border border-line bg-paper p-4">
          {!seleccion ? (
            <p className="text-sm text-ink-soft">
              Elegí una conversación para ver el detalle y responder.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
                    {seleccion.asunto}
                  </h2>
                  {/* De quién es el tema, arriba de todo. En la bandeja
                      se elige por asunto y el panel no decía con quién
                      se estaba hablando: con dos temas parecidos de dos
                      personas distintas es fácil contestarle al que no
                      era. */}
                  {!esEmpleado && (
                    <p className="text-sm font-semibold text-ink">
                      {nombreEmpleado(seleccion.empleadoId)}
                    </p>
                  )}
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
              <div className="max-h-[24rem] overflow-y-auto pr-1">
                <HiloMensajes
                  comunicacion={seleccion}
                  mensajes={mensajes}
                  usuarioId={usuario.id}
                  nombreDeAutor={nombreDeAutor}
                  autoScroll
                />
              </div>
              <Redactor
                onEnviar={responder}
                placeholder="Escribí una respuesta…"
                cerrado={
                  seleccion.estado === 'cerrada'
                    ? 'Diste el tema por cerrado. El colaborador puede abrir uno nuevo si necesita algo más.'
                    : undefined
                }
              />
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
            <>
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
              {/* Escribirle a alguien que no puede entrar es hablarle a
                  una pared: el mensaje queda guardado y nadie lo lee. */}
              <BloqueFaltas faltas={faltasDe(empleadoId)} />
            </>
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

/**
 * El colaborador y RRHH usan la misma sección con formas distintas: uno
 * habla con RRHH (chat), el otro gestiona muchos temas (bandeja). Meter
 * a los dos en la bandeja hacía que el colaborador viera una lista al
 * costado con un solo elemento y un panel que le pedía "elegí una
 * conversación".
 */
const ComunicacionesSegunRol = () => {
  const { usuario, rolEfectivo } = useAuth();
  if (!usuario) return null;
  if (rolEfectivo === 'empleado' && usuario.empleadoId) {
    return <ChatColaborador empleadoId={usuario.empleadoId} />;
  }
  return <ComunicacionesPage />;
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const ComunicacionesPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="comunicaciones">
      <ComunicacionesSegunRol />
    </RequireModulo>
  </RequireEmpresa>
);

export default ComunicacionesPageProtegida;
