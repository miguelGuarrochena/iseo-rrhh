'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconMessages, IconPlus } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { aOpciones } from '@/components/app/ui/Selector';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  cerrarComunicacion,
  crearComunicacion,
  getComunicaciones,
  getComunicacionesDeEmpleado,
  getEmpleados,
  getMensajesComunicacion,
  responderComunicacion,
} from '@/lib/services/rrhh';
import {
  Comunicacion,
  ComunicacionMensaje,
  Empleado,
  EstadoComunicacion,
  TipoComunicacion,
} from '@/types/rrhh';

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

const campoClase =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600';

const ComunicacionesPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const esEmpleado = rolEfectivo === 'empleado';
  const [lista, setLista] = useState<Comunicacion[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [seleccion, setSeleccion] = useState<Comunicacion | null>(null);
  const [mensajes, setMensajes] = useState<ComunicacionMensaje[]>([]);
  const [respuesta, setRespuesta] = useState('');
  const [modal, { open, close }] = useDisclosure(false);
  const [tipo, setTipo] = useState<TipoComunicacion>('consulta');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [empleadoId, setEmpleadoId] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (esEmpleado && usuario.empleadoId) {
      void getComunicacionesDeEmpleado(usuario.empleadoId).then(setLista);
    } else {
      void getComunicaciones().then(setLista);
      void getEmpleados().then(setEmpleados);
    }
  }, [usuario, esEmpleado]);

  useEffect(cargar, [cargar]);

  useEffect(() => {
    if (!seleccion) {
      setMensajes([]);
      return;
    }
    void getMensajesComunicacion(seleccion.id).then(setMensajes);
  }, [seleccion]);

  const nombreEmpleado = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.apellido}, ${e.nombre}` : 'Colaborador';
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    const empId = esEmpleado ? usuario?.empleadoId : empleadoId;
    if (!empId || !asunto.trim() || !cuerpo.trim()) {
      avisoError('Completá los datos', 'Asunto y mensaje son obligatorios.');
      return;
    }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaCard
          titulo={`Conversaciones (${lista.length})`}
          vacio="Todavía no hay comunicaciones."
        >
          {lista.map((c) => (
            <ListaItem
              key={c.id}
              icono={IconMessages}
              principal={c.asunto}
              secundario={`${tipoLabels[c.tipo]} · ${estadoLabels[c.estado]}${
                !esEmpleado ? ` · ${nombreEmpleado(c.empleadoId)}` : ''
              }`}
              onClick={() => setSeleccion(c)}
            />
          ))}
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
              <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink">
                {seleccion.cuerpo}
              </p>
              <div className="flex flex-col gap-2">
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-line px-3 py-2 text-sm text-ink"
                  >
                    {m.cuerpo}
                    <p className="mt-1 text-[0.65rem] text-ink-soft">
                      {new Date(m.creadoEn).toLocaleString('es-AR')}
                    </p>
                  </div>
                ))}
              </div>
              {seleccion.estado !== 'cerrada' && (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value)}
                    rows={2}
                    placeholder="Escribí una respuesta…"
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
              etiqueta="Colaborador"
              value={empleadoId}
              onChange={setEmpleadoId}
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
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Asunto</span>
            <input
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              className={campoClase}
              placeholder="Ej. Consulta sobre vacaciones"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Mensaje</span>
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={4}
              className={campoClase}
            />
          </label>
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </Boton>
        </form>
      </Modal>
    </div>
  );
};

export default ComunicacionesPage;
