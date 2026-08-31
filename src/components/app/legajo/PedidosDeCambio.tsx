'use client';

import { useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import {
  CAMPOS,
  esCampoAutogestionable,
  etiquetaDeCampo,
  mostrarValor,
  SolicitudDatoLegajo,
} from '@/lib/autoservicioLegajo';
import { resolverSolicitudDeLegajo } from '@/lib/services/rrhh';
import { formatearFechaCivil } from '@/lib/fechas';

const fecha = (iso: string) =>
  formatearFechaCivil(iso.slice(0, 10), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/**
 * Los cambios que los colaboradores proponen sobre su propio legajo.
 *
 * Aparece sólo si hay algo esperando: un panel vacío que dice "0
 * pendientes" ocupa lugar todos los días para avisar de nada.
 *
 * Cada fila muestra el valor viejo y el nuevo juntos. Aprobar sin ver de
 * qué a qué es cómo se aprueba mal un CBU.
 */
export const PedidosDeCambio = ({
  solicitudes,
  onCambio,
}: {
  solicitudes: SolicitudDatoLegajo[];
  onCambio: () => void;
}) => {
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  if (solicitudes.length === 0) return null;

  const resolver = async (
    s: SolicitudDatoLegajo,
    aprobar: boolean,
    motivoTexto?: string
  ) => {
    setTrabajando(s.id);
    setError(undefined);
    try {
      await resolverSolicitudDeLegajo(s.id, aprobar, motivoTexto);
      setRechazando(null);
      setMotivo('');
      onCambio();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No pudimos resolver el pedido.'
      );
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4">
      <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
        {solicitudes.length === 1
          ? '1 colaborador pidió corregir un dato'
          : `${solicitudes.length} colaboradores pidieron corregir datos`}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Los datos no cambian hasta que los apruebes.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {solicitudes.map((s) => {
          const advertencia = esCampoAutogestionable(s.campo)
            ? CAMPOS[s.campo].advertencia
            : undefined;
          const ocupado = trabajando === s.id;

          return (
            <div
              key={s.id}
              className="rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-ink">
                  {s.empleadoNombre ?? 'Colaborador'}
                </span>
                <span className="text-xs text-ink-soft">
                  Pedido el {fecha(s.creadaEn)}
                </span>
              </div>

              <p className="mt-1.5 text-sm text-ink-soft">
                <span className="font-semibold text-ink">
                  {etiquetaDeCampo(s.campo)}:
                </span>{' '}
                <span className="line-through">
                  {mostrarValor(s.campo, s.valorActual)}
                </span>{' '}
                →{' '}
                <span className="font-semibold text-ink">
                  {mostrarValor(s.campo, s.valorPropuesto)}
                </span>
              </p>

              {s.comentario && (
                <p className="mt-1.5 text-sm italic text-ink-soft">
                  “{s.comentario}”
                </p>
              )}

              {advertencia && (
                <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
                  <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {advertencia}
                </p>
              )}

              {rechazando === s.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Campo
                    etiqueta="Por qué no se aprueba"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    ayuda="Lo va a leer la persona en su legajo."
                    placeholder="Ej.: falta la constancia del banco."
                  />
                  <div className="flex justify-end gap-2">
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => {
                        setRechazando(null);
                        setMotivo('');
                      }}
                    >
                      Volver
                    </Boton>
                    <Boton
                      variante="rechazar"
                      tamano="sm"
                      disabled={ocupado}
                      onClick={() => void resolver(s, false, motivo)}
                    >
                      {ocupado ? 'Rechazando…' : 'Confirmar rechazo'}
                    </Boton>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex justify-end gap-2">
                  <Boton
                    variante="rechazar"
                    tamano="sm"
                    disabled={ocupado}
                    onClick={() => {
                      setRechazando(s.id);
                      setMotivo('');
                    }}
                  >
                    Rechazar
                  </Boton>
                  <Boton
                    variante="aprobar"
                    tamano="sm"
                    disabled={ocupado}
                    onClick={() => void resolver(s, true)}
                  >
                    {ocupado ? 'Aplicando…' : 'Aprobar y aplicar'}
                  </Boton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
