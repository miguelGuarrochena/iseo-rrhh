'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import {
  IconCashBanknote,
  IconCheck,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoTextarea } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  eliminarAdelanto,
  getAdelantos,
  resolverAdelanto,
  solicitarAdelanto,
} from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { formatearFecha, formatearPeriodo, hoyISO } from '@/lib/fechas';
import { Adelanto, Empleado } from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

const EstadoChip = ({ adelanto }: { adelanto: Adelanto }) => {
  if (adelanto.estado === 'aprobado')
    return (
      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
        Aprobado
        {adelanto.periodo ? ` · ${formatearPeriodo(adelanto.periodo)}` : ''}
      </span>
    );
  if (adelanto.estado === 'rechazado')
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
        Rechazado
      </span>
    );
  return (
    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
      Pendiente
    </span>
  );
};

/** Vista del empleado: pide adelantos y sigue el estado. */
export const AdelantosEmpleado = ({ empleadoId }: { empleadoId: string }) => {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pidiendo, setPidiendo] = useState(false);
  const [errorMonto, setErrorMonto] = useState<string | null>(null);

  const carga = useCarga(() => getAdelantos(empleadoId), [empleadoId], {
    contexto: 'adelantos/propios',
    inicial: [] as Adelanto[],
  });
  const adelantos = carga.datos;
  const cargar = carga.recargar;

  const pedir = async () => {
    const m = Number(monto);
    // El error se marca en el campo: un toast genérico obliga a volver a
    // buscar cuál de los dos campos estaba mal.
    if (!m || m <= 0) {
      setErrorMonto('Ingresá un monto mayor a cero.');
      return;
    }
    setErrorMonto(null);
    setPidiendo(true);
    try {
      await solicitarAdelanto(empleadoId, m, motivo);
      avisoExito(
        'Adelanto solicitado',
        'RRHH va a revisarlo y te llega el aviso.'
      );
      setMonto('');
      setMotivo('');
      setAbierto(false);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos enviar el pedido',
        err instanceof Error ? err.message : undefined
      );
    }
    setPidiendo(false);
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconCashBanknote size={18} className="text-ink-soft" />
          <h2 className="text-base font-bold text-ink">Adelantos</h2>
        </div>
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() => setAbierto(true)}
        >
          Pedir adelanto
        </Boton>
      </div>

      {carga.fase === 'error' && carga.error ? (
        <BloqueError error={carga.error} onReintentar={carga.recargar} />
      ) : adelantos.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No pediste adelantos. Si lo necesitás, pedilo acá y RRHH lo revisa.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {adelantos.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {formatearPesos(a.monto)}
                </p>
                <p className="truncate text-xs text-ink-soft">
                  {formatearFecha(a.creadoEn)}
                  {a.motivo ? ` · ${a.motivo}` : ''}
                </p>
              </div>
              <EstadoChip adelanto={a} />
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-soft">
        El adelanto aprobado se descuenta del neto del período que defina RRHH.
      </p>

      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title="Pedir un adelanto"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-3.5">
          <Campo
            etiqueta="Monto *"
            type="number"
            value={monto}
            onChange={(e) => {
              setMonto(e.target.value);
              if (errorMonto) setErrorMonto(null);
            }}
            placeholder="0"
            error={errorMonto ?? undefined}
          />
          <CampoTextarea
            etiqueta="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Contale a RRHH para qué lo necesitás."
          />
          <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
            RRHH recibe el pedido y te avisa cuando lo resuelva. Si se aprueba,
            se descuenta de tu sueldo del período indicado.
          </p>
          <Boton onClick={() => void pedir()} disabled={pidiendo}>
            {pidiendo ? 'Enviando…' : 'Enviar pedido'}
          </Boton>
        </div>
      </Modal>
    </Panel>
  );
};

/** Vista del admin: aprueba o rechaza los pedidos del equipo. */
export const AdelantosAdmin = ({ empleados }: { empleados: Empleado[] }) => {
  const [aAprobar, setAAprobar] = useState<Adelanto | null>(null);
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [resolviendo, setResolviendo] = useState(false);
  const { rolEfectivo } = useAuth();
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();
  const puedeBorrar =
    rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin';

  const carga = useCarga(() => getAdelantos(), [], {
    contexto: 'adelantos',
    inicial: [] as Adelanto[],
  });
  const adelantos = carga.datos;
  const cargar = carga.recargar;

  const nombre = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  const resolver = async (adelanto: Adelanto, aprobar: boolean) => {
    setResolviendo(true);
    try {
      await resolverAdelanto(
        adelanto.id,
        aprobar,
        aprobar ? periodo : undefined
      );
      avisoExito(
        aprobar ? 'Adelanto aprobado' : 'Adelanto rechazado',
        aprobar
          ? `Se descuenta del neto de ${formatearPeriodo(periodo)}.`
          : 'El colaborador recibe el aviso.'
      );
      setAAprobar(null);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos resolverlo',
        err instanceof Error ? err.message : undefined
      );
    }
    setResolviendo(false);
  };

  /**
   * Sólo para lo que se cargó por error (una prueba, un monto mal
   * tipeado). Si el pedido existió de verdad, rechazarlo es lo correcto:
   * deja el registro y el colaborador recibe el aviso.
   */
  const borrar = async (a: Adelanto) => {
    const ok = await confirmar({
      titulo: 'Eliminar pedido de adelanto',
      detalle: (
        <>
          Vas a eliminar el pedido de {formatearPesos(a.monto)} de{' '}
          {nombre(a.empleadoId)}. Desaparece del listado y deja de sugerirse
          como descuento. No se puede deshacer.
          <br />
          <br />
          Si el pedido existió y no corresponde, mejor rechazalo: así queda el
          registro y el colaborador recibe el aviso.
        </>
      ),
      confirmar: 'Eliminar',
      peligrosa: true,
    });
    if (!ok) return;
    try {
      await eliminarAdelanto(a.id);
      avisoExito('Pedido eliminado');
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos eliminarlo',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const pendientes = adelantos.filter((a) => a.estado === 'pendiente');
  const resueltos = adelantos.filter((a) => a.estado !== 'pendiente');

  return (
    <Panel>
      <div className="flex items-center gap-2">
        <IconCashBanknote size={18} className="text-ink-soft" />
        <h2 className="text-base font-bold text-ink">Adelantos</h2>
        {pendientes.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
            {pendientes.length} por resolver
          </span>
        )}
      </div>

      {carga.fase === 'error' && carga.error ? (
        <BloqueError error={carga.error} onReintentar={carga.recargar} />
      ) : adelantos.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No hay pedidos de adelanto.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {[...pendientes, ...resueltos].slice(0, 8).map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {nombre(a.empleadoId)} — {formatearPesos(a.monto)}
                </p>
                <p className="truncate text-xs text-ink-soft">
                  {formatearFecha(a.creadoEn)}
                  {a.motivo ? ` · ${a.motivo}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.estado === 'pendiente' ? (
                  <>
                    <Boton
                      tamano="sm"
                      onClick={() => {
                        setPeriodo(hoyISO().slice(0, 7));
                        setAAprobar(a);
                      }}
                    >
                      <IconCheck size={14} />
                      Aprobar
                    </Boton>
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => void resolver(a, false)}
                      disabled={resolviendo}
                    >
                      <IconX size={14} />
                      Rechazar
                    </Boton>
                  </>
                ) : (
                  <EstadoChip adelanto={a} />
                )}
                {puedeBorrar && (
                  <button
                    type="button"
                    onClick={() => void borrar(a)}
                    aria-label="Eliminar pedido de adelanto"
                    title="Eliminar: usá esto sólo si se cargó por error"
                    className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 sm:h-9 sm:w-9"
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-soft">
        Al aprobar, el adelanto aparece como descuento sugerido al cargar la
        remuneración del período elegido.
      </p>

      <Modal
        opened={aAprobar !== null}
        onClose={() => setAAprobar(null)}
        title="Aprobar adelanto"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        {aAprobar && (
          <div className="flex flex-col gap-3.5">
            <p className="text-sm leading-relaxed text-ink-soft">
              {nombre(aAprobar.empleadoId)} pidió{' '}
              <strong className="text-ink">
                {formatearPesos(aAprobar.monto)}
              </strong>
              . Elegí en qué período se descuenta del neto.
            </p>
            <CampoMes
              etiqueta="Se descuenta en"
              value={periodo}
              onChange={setPeriodo}
            />
            <Boton
              onClick={() => void resolver(aAprobar, true)}
              disabled={resolviendo}
            >
              {resolviendo ? 'Aprobando…' : 'Aprobar adelanto'}
            </Boton>
          </div>
        )}
      </Modal>

      {dialogoConfirmar}
    </Panel>
  );
};
