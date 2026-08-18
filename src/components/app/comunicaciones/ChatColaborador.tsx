'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Modal } from '@mantine/core';
import { IconMessagePlus, IconMessages } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect, CampoTextarea } from '@/components/app/ui/Campo';
import { BloqueError } from '@/components/app/EstadoCarga';
import { HiloMensajes } from './HiloMensajes';
import { Redactor } from './Redactor';
import { useCarga } from '@/lib/useCarga';
import { refrescarPendientes } from '@/lib/pendientes';
import { avisoError, avisoExito } from '@/lib/avisos';
import { interpretarError } from '@/lib/errores';
import { juntarErrores, validarRequerido } from '@/lib/validaciones';
import { aOpciones } from '@/components/app/ui/Selector';
import {
  crearComunicacion,
  getComunicacionesDeEmpleado,
  getMensajesComunicacion,
  marcarComunicacionLeida,
  responderComunicacion,
  suscribirMensajes,
} from '@/lib/services/rrhh';
import {
  Comunicacion,
  ComunicacionMensaje,
  TipoComunicacion,
} from '@/types/rrhh';

const tipoLabels: Record<TipoComunicacion, string> = {
  consulta: 'Consulta',
  reclamo: 'Reclamo',
  pedido: 'Pedido',
};

/**
 * Comunicaciones vistas por el colaborador: una conversación con RRHH.
 *
 * No usa la bandeja de dos columnas de RRHH a propósito. El colaborador
 * tiene cero, uno o dos temas en toda su vida en la empresa: mostrarle
 * una lista al costado con un solo elemento —y un panel que dice "elegí
 * una conversación"— es darle una bandeja de entrada a alguien que no
 * tiene bandeja. Acá entra directo a hablar.
 *
 * El tema y el estado no desaparecen: siguen guardados y RRHH los usa
 * para saber qué quedó sin responder. Sólo que del lado del colaborador
 * se ven como lo que son: el título de la conversación.
 */
export const ChatColaborador = ({ empleadoId }: { empleadoId: string }) => {
  const { usuario } = useAuth();
  // La campanita linkea a la conversación concreta (`?c=<id>`).
  const idDeAviso = useSearchParams().get('c');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<ComunicacionMensaje[]>([]);
  const [modal, setModal] = useState(false);
  const [tipo, setTipo] = useState<TipoComunicacion>('consulta');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const carga = useCarga(
    () => getComunicacionesDeEmpleado(empleadoId),
    [empleadoId],
    {
      contexto: 'comunicaciones/colaborador',
      inicial: [] as Comunicacion[],
    }
  );
  const hilos = carga.datos;

  // Se abre solo el que traía el aviso; si no vino de un aviso, el más
  // reciente. Con un solo tema la pantalla ya es el chat sin elegir nada.
  useEffect(() => {
    if (abiertoId || hilos.length === 0) return;
    const deAviso = idDeAviso && hilos.find((h) => h.id === idDeAviso);
    setAbiertoId(deAviso ? deAviso.id : hilos[0].id);
  }, [hilos, abiertoId, idDeAviso]);

  const abierto = hilos.find((h) => h.id === abiertoId) ?? null;

  useEffect(() => {
    if (!abiertoId) {
      setMensajes([]);
      return;
    }
    const traer = () => {
      void getMensajesComunicacion(abiertoId)
        .then(setMensajes)
        .catch((err) => {
          const { titulo, detalle } = interpretarError(err);
          avisoError(titulo, detalle);
        });
    };
    traer();
    // Abrir el hilo lo da por leído y baja el numerito del menú en el
    // acto, sin esperar a la próxima recarga.
    void marcarComunicacionLeida(abiertoId).then(refrescarPendientes);
    return suscribirMensajes(abiertoId, traer);
  }, [abiertoId]);

  const responder = async (texto: string) => {
    if (!abiertoId) return;
    try {
      await responderComunicacion(abiertoId, texto);
      const msgs = await getMensajesComunicacion(abiertoId);
      setMensajes(msgs);
      carga.recargar();
      refrescarPendientes();
    } catch (err) {
      const { titulo, detalle } = interpretarError(err);
      avisoError(titulo, detalle);
      throw err;
    }
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      asunto: validarRequerido(asunto, 'El tema'),
      cuerpo: validarRequerido(cuerpo, 'El mensaje'),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setEnviando(true);
    try {
      const creada = await crearComunicacion({
        empleadoId,
        tipo,
        asunto: asunto.trim(),
        cuerpo: cuerpo.trim(),
      });
      avisoExito('Enviado', 'RRHH ya lo puede ver.');
      setAsunto('');
      setCuerpo('');
      setErrores({});
      setModal(false);
      carga.recargar();
      refrescarPendientes();
      setAbiertoId(creada.id);
    } catch (err) {
      const { detalle } = interpretarError(err);
      setErrores({ cuerpo: detalle });
    }
    setEnviando(false);
  };

  const botonNuevo = (
    <Boton variante="negro" onClick={() => setModal(true)}>
      <IconMessagePlus size={18} />
      Escribir a RRHH
    </Boton>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Comunicaciones
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Tu canal directo con RRHH. Queda todo registrado con fecha.
          </p>
        </div>
        {hilos.length > 0 && botonNuevo}
      </div>

      {carga.fase === 'error' && carga.error && (
        <BloqueError error={carga.error} onReintentar={carga.recargar} />
      )}

      {/* Sin conversaciones: se explica para qué sirve, en vez del
          "Todavía no hay comunicaciones" de antes, que no invitaba a nada. */}
      {carga.fase === 'ok' && hilos.length === 0 && (
        <Panel className="flex flex-col items-start gap-3.5 py-10 text-center sm:items-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <IconMessages size={26} stroke={1.6} />
          </span>
          <div className="sm:max-w-md">
            <p className="text-[1.0625rem] font-bold tracking-tight text-ink">
              Escribile a RRHH desde acá
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Una duda con tu recibo, un pedido de certificado, un reclamo. A
              diferencia de un mensaje suelto, acá queda registrado con fecha y
              vas a poder ver la respuesta.
            </p>
          </div>
          {botonNuevo}
        </Panel>
      )}

      {/* Con más de un tema abierto, se elige arriba. Con uno solo no
          aparece nada: no hay nada que elegir. */}
      {hilos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {hilos.map((h) => {
            const activo = h.id === abiertoId;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => setAbiertoId(h.id)}
                className={`presionable max-w-full truncate rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  activo
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-line bg-surface text-ink-soft hover:border-brand-300'
                }`}
              >
                {h.asunto}
                {h.estado === 'cerrada' && ' · cerrada'}
              </button>
            );
          })}
        </div>
      )}

      {abierto && (
        <Panel className="flex flex-col gap-4">
          <div>
            <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
              {abierto.asunto}
            </h2>
            <p className="text-xs text-ink-soft">
              {tipoLabels[abierto.tipo]}
              {abierto.estado === 'cerrada' && ' · cerrada por RRHH'}
            </p>
          </div>

          <div className="max-h-[26rem] overflow-y-auto pr-1">
            <HiloMensajes
              comunicacion={abierto}
              mensajes={mensajes}
              usuarioId={usuario?.id}
              /* Del lado del colaborador todo lo que no es suyo es
                 RRHH. El nombre de quién contestó no se puede mostrar:
                 no tiene permiso para leer la tabla de usuarios, y
                 tampoco le aporta —le contesta el área, no una
                 persona en particular. */
              nombreDeAutor={() => 'RRHH'}
              autoScroll
            />
          </div>

          <Redactor
            onEnviar={responder}
            placeholder="Escribí tu mensaje…"
            cerrado={
              abierto.estado === 'cerrada'
                ? 'RRHH dio el tema por resuelto. Si necesitás algo más, escribí una consulta nueva.'
                : undefined
            }
          />
        </Panel>
      )}

      <Modal
        opened={modal}
        onClose={() => setModal(false)}
        title="Escribir a RRHH"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <form onSubmit={crear} className="flex flex-col gap-3.5">
          <CampoSelect
            etiqueta="¿De qué se trata?"
            value={tipo}
            onChange={(v) => setTipo(v as TipoComunicacion)}
            opciones={aOpciones(tipoLabels)}
            ayuda="Ayuda a RRHH a priorizar. Podés cambiarlo hablando con ellos."
          />
          <Campo
            etiqueta="Tema *"
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="Ej. Certificado de trabajo"
            error={errores.asunto}
          />
          <CampoTextarea
            etiqueta="Mensaje *"
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            rows={4}
            placeholder="Contá con detalle qué necesitás."
            error={errores.cuerpo}
          />
          <div className="flex gap-2">
            <Boton type="submit" disabled={enviando} className="flex-1">
              {enviando ? 'Enviando…' : 'Enviar'}
            </Boton>
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setModal(false)}
            >
              Cancelar
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
