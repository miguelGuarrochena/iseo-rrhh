'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect, CampoTextarea } from '@/components/app/ui/Campo';
import { CampoArchivo } from '@/components/app/ui/CampoArchivo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { aOpciones } from '@/components/app/ui/Selector';
import { diasAusencia, formatearFecha, hoyISO } from '@/lib/fechas';
import { TIPOS_AUSENCIA_JORNADA, tipoAusenciaLabels } from '@/lib/etiquetas';
import { juntarErrores, validarRequerido } from '@/lib/validaciones';
import {
  getEmpresa,
  getFeriados,
  getSaldoVacaciones,
  getSaldosLicencia,
} from '@/lib/services/rrhh';
import { unidadVacacionesDe, UNIDAD_VACACIONES_LABELS } from '@/lib/vacaciones';
import {
  Ausencia,
  Empleado,
  SaldoLicencia,
  SaldoVacaciones,
  TIPOS_LICENCIA_CON_CUPO,
  TipoAusencia,
} from '@/types/rrhh';

interface NuevaAusenciaModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (datos: {
    empleadoId?: string;
    tipo: TipoAusencia;
    fechaDesde: string;
    fechaHasta: string;
    comentario?: string;
    archivo?: File;
    aprobarAutomaticamente?: boolean;
  }) => Promise<void>;
  vacacionesSector?: Ausencia[];
  nombreEmpleado?: (empleadoId: string) => string;
  /** Carga desde Admin/RRHH: elige colaborador y queda aprobada. */
  modoAdmin?: boolean;
  empleados?: Empleado[];
  /** Quién pide, cuando no es carga de admin: para controlar su saldo. */
  empleadoIdActual?: string;
}

export const NuevaAusenciaModal = ({
  abierto,
  onCerrar,
  onCrear,
  vacacionesSector = [],
  nombreEmpleado,
  modoAdmin = false,
  empleados = [],
  empleadoIdActual,
}: NuevaAusenciaModalProps) => {
  const [empleadoId, setEmpleadoId] = useState('');
  const [tipo, setTipo] = useState<TipoAusencia>('vacaciones');
  const [fechaDesde, setFechaDesde] = useState(hoyISO());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [comentario, setComentario] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  /** Misma semántica que `crearAusencia` / trigger SQL: fuente `diasAusencia`. */
  const [vacacionesDiasHabiles, setVacacionesDiasHabiles] = useState(false);
  const [feriadosNoLaborables, setFeriadosNoLaborables] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (abierto) {
      setEmpleadoId('');
      setTipo('vacaciones');
      setFechaDesde(hoyISO());
      setFechaHasta(hoyISO());
      setComentario('');
      setArchivo(null);
      setError(null);
      setErrores({});
    }
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void Promise.all([getEmpresa(), getFeriados()])
      .then(([empresa, feriados]) => {
        if (!vigente) return;
        setVacacionesDiasHabiles(Boolean(empresa.config.vacacionesDiasHabiles));
        setFeriadosNoLaborables(
          new Set(feriados.filter((f) => f.noLaborable).map((f) => f.fecha))
        );
      })
      .catch(() => {
        if (!vigente) return;
        setVacacionesDiasHabiles(false);
        setFeriadosNoLaborables(new Set());
      });
    return () => {
      vigente = false;
    };
  }, [abierto]);

  const dias = useMemo(
    () =>
      diasAusencia(
        fechaDesde,
        fechaHasta,
        tipo,
        vacacionesDiasHabiles,
        feriadosNoLaborables
      ),
    [fechaDesde, fechaHasta, tipo, vacacionesDiasHabiles, feriadosNoLaborables]
  );
  const etiquetaUnidad =
    tipo === 'vacaciones'
      ? UNIDAD_VACACIONES_LABELS[unidadVacacionesDe({ vacacionesDiasHabiles })]
      : 'días';
  const superpuestas = useMemo(
    () =>
      tipo === 'vacaciones'
        ? vacacionesSector.filter(
            (a) => fechaDesde <= a.fechaHasta && fechaHasta >= a.fechaDesde
          )
        : [],
    [fechaDesde, fechaHasta, tipo, vacacionesSector]
  );

  /**
   * Saldo de vacaciones de quien va a usar los días. Sin este control se
   * podían pedir (y aprobar) 30 días teniendo 14: en una empresa con RRHH
   * alguien lo frena, en una sin RRHH no lo frena nadie.
   */
  const idParaSaldo = modoAdmin ? empleadoId : empleadoIdActual;
  const anioPedido = Number(fechaDesde.slice(0, 4));
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const [saldoLicencia, setSaldoLicencia] = useState<SaldoLicencia | null>(
    null
  );
  const esTipoConCupoLicencia = TIPOS_LICENCIA_CON_CUPO.includes(tipo);

  useEffect(() => {
    if (!abierto || tipo !== 'vacaciones' || !idParaSaldo || !anioPedido) {
      setSaldo(null);
      return;
    }
    let vigente = true;
    void getSaldoVacaciones(idParaSaldo, anioPedido)
      .then((s) => {
        if (vigente) setSaldo(s);
      })
      .catch(() => {
        if (vigente) setSaldo(null);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, tipo, idParaSaldo, anioPedido]);

  useEffect(() => {
    if (!abierto || !esTipoConCupoLicencia || !idParaSaldo || !anioPedido) {
      setSaldoLicencia(null);
      return;
    }
    let vigente = true;
    void getSaldosLicencia(idParaSaldo, anioPedido)
      .then((saldos) => {
        if (!vigente) return;
        // Sin fila de cupo → sin límite (no inventamos tope).
        setSaldoLicencia(saldos.find((s) => s.tipo === tipo) ?? null);
      })
      .catch(() => {
        if (vigente) setSaldoLicencia(null);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, esTipoConCupoLicencia, tipo, idParaSaldo, anioPedido]);

  /**
   * Los días pendientes de aprobación ya están descontados del
   * disponible: si no, pedir dos veces seguidas pasaría el control las
   * dos veces.
   */
  const excede = Boolean(
    saldo && tipo === 'vacaciones' && dias > saldo.diasDisponibles
  );
  /**
   * Licencias: solo las aprobadas consumen cupo (getSaldosLicencia).
   * UI frena el pedido/carga si no alcanzaría al aprobar; DB es la autoridad.
   * Sin override de gestor (a diferencia de vacaciones).
   */
  const excedeLicencia = Boolean(
    saldoLicencia && dias > saldoLicencia.diasDisponibles
  );
  const disponibleTrasLicencia =
    saldoLicencia != null
      ? Math.max(0, saldoLicencia.diasDisponibles - dias)
      : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // El faltante se marca en el campo, no sólo en el cartel de abajo:
    // el que más se olvida es el colaborador y estaba fuera de vista.
    const nuevos = juntarErrores({
      empleado: modoAdmin
        ? validarRequerido(empleadoId, 'El colaborador')
        : null,
      fechaHasta:
        dias < 1
          ? 'No puede ser anterior a la fecha de inicio.'
          : !modoAdmin && excede
            ? `Te quedan ${saldo?.diasDisponibles} días de vacaciones y estás pidiendo ${dias}.`
            : excedeLicencia
              ? `Cupo de ${tipoAusenciaLabels[tipo].toLowerCase()}: quedan ${saldoLicencia?.diasDisponibles} días y estás pidiendo ${dias}.`
              : null,
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    setError(null);
    setEnviando(true);
    try {
      await onCrear({
        empleadoId: modoAdmin ? empleadoId : undefined,
        tipo,
        fechaDesde,
        fechaHasta,
        comentario: comentario.trim() || undefined,
        archivo: archivo ?? undefined,
        aprobarAutomaticamente: modoAdmin,
      });
      setComentario('');
      setArchivo(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No pudimos guardar la ausencia.'
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={modoAdmin ? 'Cargar ausencia' : 'Nueva solicitud de ausencia'}
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        {modoAdmin && (
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
          onChange={(v) => setTipo(v as TipoAusencia)}
          opciones={aOpciones(tipoAusenciaLabels)}
        />

        {TIPOS_AUSENCIA_JORNADA.includes(tipo) && (
          <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
            Entrada tarde y salida anticipada también se detectan solas en{' '}
            <strong className="text-ink">Turnos</strong> según el fichaje. Acá
            podés registrarlas a mano cuando haga falta.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoFecha
            etiqueta="Desde"
            value={fechaDesde}
            onChange={setFechaDesde}
          />
          <CampoFecha
            etiqueta="Hasta"
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={setFechaHasta}
            error={errores.fechaHasta}
          />
        </div>

        {dias > 0 && (
          <p className="text-sm text-ink-soft">
            Total:{' '}
            <strong className="text-ink">
              {dias} {etiquetaUnidad}
            </strong>
          </p>
        )}

        {tipo === 'vacaciones' && saldo && (
          <div
            className={`rounded-xl px-4 py-3 text-xs ${
              excede ? 'bg-amber-50 text-amber-900' : 'bg-paper text-ink-soft'
            }`}
          >
            <p>
              Le corresponden{' '}
              <strong className="font-bold">
                {saldo.diasCorresponden} días
              </strong>{' '}
              en {saldo.anio} por antigüedad (art. 150 LCT). Ya usó{' '}
              {saldo.diasUtilizados}
              {saldo.diasPendientesAprobacion > 0 &&
                ` y tiene ${saldo.diasPendientesAprobacion} esperando aprobación`}
              : quedan{' '}
              <strong className="font-bold">
                {saldo.diasDisponibles} disponibles
              </strong>
              .
            </p>
            {excede && (
              <p className="mt-2 font-bold">
                {modoAdmin
                  ? `Estás cargando ${dias} días, ${dias - saldo.diasDisponibles} más de los que le quedan. Podés seguir, pero revisá que sea a propósito.`
                  : `Estás pidiendo ${dias} días.`}
              </p>
            )}
          </div>
        )}

        {saldoLicencia && (
          <div
            className={`rounded-xl px-4 py-3 text-xs ${
              excedeLicencia
                ? 'bg-amber-50 text-amber-900'
                : 'bg-paper text-ink-soft'
            }`}
          >
            <p>
              Cupo anual de {tipoAusenciaLabels[tipo].toLowerCase()}:{' '}
              <strong className="font-bold">{saldoLicencia.diasAnuales}</strong>
              . Ya usó {saldoLicencia.diasUtilizados} (solo aprobadas). Cupo
              disponible:{' '}
              <strong className="font-bold">
                {saldoLicencia.diasDisponibles}
              </strong>
              . Solicitado: <strong className="font-bold">{dias}</strong>.
              {disponibleTrasLicencia != null && (
                <>
                  {' '}
                  Disponible después:{' '}
                  <strong className="font-bold">
                    {disponibleTrasLicencia}
                  </strong>
                  .
                </>
              )}
            </p>
            {excedeLicencia && (
              <p className="mt-2 font-bold">
                Este pedido supera el cupo configurado.
              </p>
            )}
          </div>
        )}

        {tipo === 'vacaciones' && vacacionesSector.length > 0 && (
          <div
            className={`rounded-xl px-4 py-3 text-xs ${
              superpuestas.length > 0
                ? 'bg-amber-50 text-amber-900'
                : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {superpuestas.length > 0 ? (
              <>
                <p className="font-bold">
                  Hay vacaciones aprobadas del sector en esas fechas:
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {superpuestas.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      {nombreEmpleado?.(a.empleadoId) ?? 'Compañero'} ·{' '}
                      {formatearFecha(a.fechaDesde)} al{' '}
                      {formatearFecha(a.fechaHasta)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              'No hay vacaciones aprobadas del sector pisando este rango.'
            )}
          </div>
        )}

        <CampoTextarea
          etiqueta="Comentario (opcional)"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          placeholder={
            modoAdmin
              ? 'Motivo o detalle interno'
              : 'Motivo o detalle para tu supervisor'
          }
        />

        <CampoArchivo
          key={abierto ? 'abierto' : 'cerrado'}
          etiqueta="Certificado o comprobante (opcional)"
          accept=".pdf,image/*"
          onArchivo={setArchivo}
          ayuda={
            tipo === 'enfermedad'
              ? 'Adjuntá el certificado médico en PDF o foto.'
              : 'PDF o foto que respalde el pedido, si corresponde.'
          }
        />

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Boton
          type="submit"
          disabled={enviando}
          className="mt-1 py-3 text-base"
        >
          {enviando
            ? 'Guardando…'
            : modoAdmin
              ? 'Guardar ausencia'
              : 'Enviar solicitud'}
        </Boton>
      </form>
    </Modal>
  );
};
