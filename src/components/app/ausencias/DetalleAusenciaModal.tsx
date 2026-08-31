'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconClock,
  IconUser,
} from '@tabler/icons-react';
import { EstadoBadge } from '@/components/app/EstadoBadge';
import {
  tipoAusenciaColores,
  tipoAusenciaIconos,
  tipoAusenciaLabels,
} from '@/lib/etiquetas';
import { formatearFechaCivil } from '@/lib/fechas';
import { capitalizar } from '@/lib/calendario';
import { advertenciasDeAusencia, hayAdvertenciaAlta } from '@/lib/advertencias';
import { Ausencia, SaldoVacaciones } from '@/types/rrhh';

/**
 * Con qué mirar la ausencia para saber si se aparta de la regla general.
 *
 * Son las mismas dos entradas que usa el modal de carga, y por eso van
 * juntas en un solo objeto: si el detalle recibiera una y no la otra,
 * mostraría advertencias distintas de las que vio quien la registró.
 *
 *  - `feriados`: los NO laborables con los que se cuenta (los que
 *    devuelve `getFeriadosParaCalculo`). Vacío cuando la empresa cuenta
 *    en días corridos, igual que en la carga: ahí los feriados no entran
 *    en la cuenta.
 *  - `vacacionesEnHabiles`: el régimen de la empresa.
 *
 * Sin este contexto el detalle no muestra advertencias, en vez de
 * calcularlas con datos a medias.
 */
export interface ContextoLegal {
  feriados: Set<string>;
  vacacionesEnHabiles: boolean;
  /**
   * Cómo pedir el saldo del colaborador, para la advertencia de
   * acumulación del art. 164. Es `getSaldoVacaciones` tal cual: el saldo
   * lo calcula el servicio, acá no se recalcula nada.
   *
   * Va inyectado y es opcional a propósito. Los días arrastrados salen
   * de `vacaciones_pendientes`, que sólo puede leer RRHH (migración 50):
   * para un supervisor la consulta devuelve vacío, y un cero prestado no
   * es "no acumula", es "no sé". En ese caso la pantalla no lo pregunta
   * y la advertencia sencillamente no se evalúa.
   */
  saldoVacaciones?: (
    empleadoId: string,
    anio: number
  ) => Promise<SaldoVacaciones | null>;
}

interface DetalleAusenciaModalProps {
  ausencia: Ausencia | null;
  nombreEmpleado: (empleadoId: string) => string;
  onCerrar: () => void;
  /**
   * Botones de la pantalla que abre el detalle (aprobar, rechazar, ver
   * certificado). Los arma quien sabe qué puede hacer este usuario: el
   * calendario no repite esa decisión. Recibe `cerrar` para que, después
   * de resolver, no quede a la vista el estado viejo.
   */
  acciones?: (a: Ausencia, cerrar: () => void) => ReactNode;
  /** Si se pasa, el detalle muestra las advertencias legales. */
  contextoLegal?: ContextoLegal;
}

const fechaLarga = (iso: string) =>
  capitalizar(
    formatearFechaCivil(iso, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  );

const Fila = ({
  icono: Icono,
  etiqueta,
  children,
}: {
  icono: typeof IconUser;
  etiqueta: string;
  children: ReactNode;
}) => (
  <div className="flex items-start gap-3 rounded-xl border border-line bg-paper px-3.5 py-3">
    <Icono size={17} className="mt-0.5 shrink-0 text-ink-soft" />
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-soft">
        {etiqueta}
      </p>
      <div className="mt-0.5 text-sm font-semibold text-ink">{children}</div>
    </div>
  </div>
);

/**
 * Detalle de una ausencia: quién, qué, cuándo, en qué estado y qué se
 * puede hacer con ella.
 *
 * Los días los muestra tal como vinieron (`a.dias`), no los recalcula:
 * quien cuenta es la base (migración 58), y una segunda cuenta acá sería
 * otra fuente de verdad que puede decir algo distinto.
 */
export const DetalleAusenciaModal = ({
  ausencia,
  nombreEmpleado,
  onCerrar,
  acciones,
  contextoLegal,
}: DetalleAusenciaModalProps) => {
  const Icono = ausencia ? tipoAusenciaIconos[ausencia.tipo] : null;

  /**
   * Saldo del colaborador para el año de la ausencia. Sólo hace falta
   * para vacaciones y sólo si hay con qué pedirlo.
   *
   * El año se toma del inicio del período: es al que se le imputan los
   * días y el que compara el art. 164 contra lo arrastrado.
   */
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const pedirSaldo = contextoLegal?.saldoVacaciones;

  useEffect(() => {
    setSaldo(null);
    if (!ausencia || ausencia.tipo !== 'vacaciones' || !pedirSaldo) return;
    let vigente = true;
    void (async () => {
      try {
        const s = await pedirSaldo(
          ausencia.empleadoId,
          Number(ausencia.fechaDesde.slice(0, 4))
        );
        if (vigente) setSaldo(s);
      } catch {
        // Si el saldo no se puede leer, la advertencia de acumulación no
        // se muestra. Inventarla con los días en cero diría que no
        // acumula nada, que es justamente lo que no sabemos.
        if (vigente) setSaldo(null);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [ausencia, pedirSaldo]);

  /**
   * Las mismas advertencias que ya calcula el sistema, no unas nuevas:
   * `advertenciasDeAusencia` es el punto de entrada que `lib/advertencias`
   * expone justo para una solicitud ya guardada (mide la anticipación
   * contra el día en que se pidió, no contra hoy). Acá sólo se dibujan:
   * no frenan nada ni cambian ningún dato.
   */
  const advertencias = useMemo(
    () =>
      ausencia && contextoLegal
        ? advertenciasDeAusencia(ausencia, {
            feriados: contextoLegal.feriados,
            vacacionesEnHabiles: contextoLegal.vacacionesEnHabiles,
            // Los dos juntos o ninguno: `advertenciasDeSolicitud` sólo
            // evalúa el art. 164 cuando tiene el período y lo arrastrado.
            ...(saldo
              ? {
                  diasDelPeriodo: saldo.diasCorresponden,
                  diasArrastrados: saldo.diasAjuste,
                }
              : {}),
          })
        : [],
    [ausencia, contextoLegal, saldo]
  );
  return (
    <Modal
      opened={Boolean(ausencia)}
      onClose={onCerrar}
      radius="lg"
      centered
      title="Detalle de la ausencia"
      styles={{ title: { fontWeight: 800 } }}
    >
      {ausencia && Icono && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${tipoAusenciaColores[ausencia.tipo]}`}
            >
              <Icono size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-bold text-ink">
                {nombreEmpleado(ausencia.empleadoId)}
              </p>
              <p className="text-sm text-ink-soft">
                {tipoAusenciaLabels[ausencia.tipo]}
              </p>
            </div>
            <EstadoBadge estado={ausencia.estado} />
          </div>

          <Fila icono={IconCalendarEvent} etiqueta="Período">
            {ausencia.fechaDesde === ausencia.fechaHasta
              ? fechaLarga(ausencia.fechaDesde)
              : `${fechaLarga(ausencia.fechaDesde)} → ${fechaLarga(ausencia.fechaHasta)}`}
          </Fila>

          <Fila icono={IconClock} etiqueta="Duración">
            {ausencia.dias} {ausencia.dias === 1 ? 'día' : 'días'}
          </Fila>

          {ausencia.comentarioEmpleado && (
            <Fila icono={IconUser} etiqueta="Observaciones">
              <span className="font-normal">{ausencia.comentarioEmpleado}</span>
            </Fila>
          )}

          {ausencia.comentarioResolucion && (
            <Fila icono={IconUser} etiqueta="Respuesta de RRHH">
              <span className="font-normal">
                {ausencia.comentarioResolucion}
              </span>
            </Fila>
          )}

          {/* Informan, no frenan: los botones de abajo no las miran, igual
              que en el modal de carga. Mismo cartel y mismos niveles. */}
          {advertencias.length > 0 && (
            <div
              className={`rounded-xl border px-4 py-3 ${
                hayAdvertenciaAlta(advertencias)
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-line bg-paper'
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <IconAlertTriangle
                  size={14}
                  className={
                    hayAdvertenciaAlta(advertencias)
                      ? 'text-amber-700'
                      : 'text-ink-soft'
                  }
                />
                {advertencias.length === 1
                  ? 'Advertencia'
                  : `Advertencias (${advertencias.length})`}
              </p>
              <ul className="mt-2 flex list-none flex-col gap-2">
                {advertencias.map((a) => (
                  <li key={a.clave} className="text-xs leading-relaxed">
                    <span className="font-semibold text-ink">{a.titulo}.</span>{' '}
                    <span className="text-ink-soft">{a.detalle}</span>{' '}
                    <span className="text-ink-soft">{a.queHacer}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.6875rem] font-semibold text-ink-soft">
                Ninguna de estas impide registrar la solicitud.
              </p>
            </div>
          )}

          {acciones && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {acciones(ausencia, onCerrar)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
