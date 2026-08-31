'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import {
  IconCashBanknote,
  IconCoins,
  IconPinned,
  IconGavel,
  IconPlus,
  IconReceipt2,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { DescuentosFijos } from '@/components/app/remuneraciones/DescuentosFijos';
import {
  cargarRemuneracion,
  getAdelantos,
  getDescuentosRecurrentes,
  getEmpresa,
  getHorasExtrasDelPeriodo,
} from '@/lib/services/rrhh';
import type { HorasExtrasPeriodo } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  calcularLiquidacion,
  advertenciaDeLimiteDescuentos,
  errorDeLimitesLiquidacion,
  APORTES_TOTAL,
  HORAS_MENSUALES,
  tieneAportesDeLey,
  errorDeTopeImponible,
  valorHorasExtras,
} from '@/lib/remuneraciones';
import { useModulos } from '@/lib/auth/useModulos';
import { moduloActivo } from '@/components/app/navItems';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo, hoyISO } from '@/lib/fechas';
import {
  Adelanto,
  DescuentoRecurrente,
  Empleado,
  RegimenLaboral,
  Remuneracion,
} from '@/types/rrhh';
import { useCarga } from '@/lib/useCarga';

interface RemuneracionModalProps {
  abierto: boolean;
  /** Fijo (desde la ficha) o elegible si se pasa `empleados`. */
  empleadoId?: string;
  /** Si se pasa, el modal arranca eligiendo el colaborador. */
  empleados?: Empleado[];
  /** Para precargar al editar un período existente. */
  inicial?: Remuneracion | null;
  convenioSugerido?: string;
  onCerrar: () => void;
  onGuardado: () => void;
}

const num = (v: string) => Number(v) || 0;

/** Renglón del desglose de la liquidación. */
const Renglon = ({
  etiqueta,
  valor,
  resta,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  resta?: boolean;
  detalle?: string;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <span className="min-w-0 text-sm text-ink-soft">
      {etiqueta}
      {detalle && <span className="ml-1.5 text-xs opacity-70">{detalle}</span>}
    </span>
    <span
      className={`shrink-0 text-sm font-semibold ${resta ? 'text-red-700' : 'text-ink'}`}
    >
      {resta ? '−' : ''} {valor}
    </span>
  </div>
);

/** Título chico de cada bloque del formulario. */
const TituloBloque = ({
  icono: Icono,
  texto,
}: {
  icono: typeof IconCoins;
  texto: string;
}) => (
  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-ink-soft">
    <Icono size={14} />
    {texto}
  </p>
);

/**
 * Carga de la remuneración de un período, con el desglose completo:
 * haberes, descuentos fijos y adelantos (se aplican solos) y el neto
 * calculado en vivo.
 */
export const RemuneracionModal = ({
  abierto,
  empleadoId,
  empleados,
  inicial,
  convenioSugerido,
  onCerrar,
  onGuardado,
}: RemuneracionModalProps) => {
  const [elegido, setElegido] = useState(empleadoId ?? '');
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [bruto, setBruto] = useState('');
  const [noRem, setNoRem] = useState('');
  const [adicional, setAdicional] = useState('');
  const [convenio, setConvenio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modulos = useModulos();
  const [extras, setExtras] = useState<HorasExtrasPeriodo>({
    detectadas: 0,
    aprobadas: 0,
  });
  const [horasMensuales, setHorasMensuales] = useState(HORAS_MENSUALES);
  /** Tope de la base imponible del período; sin configurar, sin tope. */
  const [topeImponible, setTopeImponible] = useState<number | undefined>(
    undefined
  );
  const [regimen, setRegimen] = useState<RegimenLaboral>(
    'relacion_dependencia'
  );

  const empleadoActual = empleadoId ?? elegido;

  useEffect(() => {
    if (abierto) {
      setElegido(empleadoId ?? '');
      setPeriodo(inicial?.periodo ?? hoyISO().slice(0, 7));
      setBruto(inicial ? String(inicial.montoBruto) : '');
      setNoRem(inicial?.noRemunerativo ? String(inicial.noRemunerativo) : '');
      setConvenio(inicial?.convenio ?? convenioSugerido ?? '');
      setError(null);
    }
  }, [abierto, inicial, convenioSugerido, empleadoId]);

  // Los descuentos fijos y adelantos son del colaborador elegido.
  const cRecurrentes = useCarga(
    () => getDescuentosRecurrentes(empleadoActual),
    [abierto, empleadoActual],
    {
      activo: abierto && Boolean(empleadoActual),
      contexto: 'remuneracion/descuentos',
      inicial: [] as DescuentoRecurrente[],
    }
  );
  const recurrentes = cRecurrentes.datos;
  const recargarRecurrentes = cRecurrentes.recargar;

  const cAdelantos = useCarga(
    () => getAdelantos(empleadoActual),
    [abierto, empleadoActual],
    {
      activo: abierto && Boolean(empleadoActual),
      contexto: 'remuneracion/adelantos',
      inicial: [] as Adelanto[],
    }
  );
  const adelantos = cAdelantos.datos;

  /**
   * Horas extras del período. Se venían calculando y mostrando en
   * Reportes, Fichaje y el legajo, pero no llegaban hasta acá: había que
   * mirarlas en otra pantalla y sumarlas a mano al bruto.
   */
  useEffect(() => {
    const vacio = { detectadas: 0, aprobadas: 0 };
    if (!abierto || !empleadoActual || !periodo) {
      setExtras(vacio);
      return;
    }
    let vigente = true;
    void getHorasExtrasDelPeriodo(empleadoActual, periodo)
      .then((h) => {
        if (vigente) setExtras(h);
      })
      .catch(() => {
        if (vigente) setExtras(vacio);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, empleadoActual, periodo]);

  useEffect(() => {
    if (!abierto) return;
    void getEmpresa()
      .then((e) => {
        setHorasMensuales(e.config.horasMensuales ?? HORAS_MENSUALES);
        setTopeImponible(e.config.topeImponibleAportes);
        setRegimen(e.regimen ?? 'relacion_dependencia');
      })
      .catch(() => {
        setHorasMensuales(HORAS_MENSUALES);
        setTopeImponible(undefined);
        setRegimen('relacion_dependencia');
      });
  }, [abierto]);

  /** En el régimen simplificado no hay jubilación, PAMI ni obra social. */
  const conAportes = tieneAportesDeLey(regimen);

  /**
   * Sólo se ofrece sumar al bruto lo que el supervisor aprobó en Turnos.
   * Las detectadas sin aprobar se muestran, pero no se pagan solas.
   *
   * Salvo que la empresa no use Turnos: ahí no existe la pantalla donde
   * se aprueba, `aprobadas` sería cero para siempre y la sugerencia
   * quedaba clavada en cero — había que calcular las extras aparte y
   * cargarlas a mano, que es justo lo que este bloque vino a evitar. Sin
   * Turnos no hay nada que aprobar, así que se toman las detectadas.
   *
   * Mientras la config todavía no llegó, `moduloActivo` responde que sí:
   * el default seguro es el conservador, no sugerir de más.
   */
  const conTurnos = moduloActivo('turnos', modulos);
  const extrasASumar = conTurnos ? extras.aprobadas : extras.detectadas;
  const sugeridoExtras = valorHorasExtras(
    num(bruto),
    extrasASumar,
    horasMensuales
  );

  // Al elegir un colaborador desde el dropdown (acceso directo), el convenio
  // se autocompleta con el suyo, igual que cuando se carga desde la ficha.
  useEffect(() => {
    if (!abierto || inicial || !empleados || !elegido) return;
    const emp = empleados.find((e) => e.id === elegido);
    setConvenio(emp?.convenio ?? '');
  }, [abierto, inicial, empleados, elegido]);

  /** Descuentos que entran solos: fijos + adelantos aprobados del período. */
  const automaticos = useMemo(() => {
    const brutoNum = num(bruto);
    const partes: { etiqueta: string; detalle: string; monto: number }[] =
      recurrentes.map((d) => {
        const esPct = d.modo === 'porcentaje';
        const monto = esPct
          ? Math.round(brutoNum * ((d.porcentaje ?? 0) / 100) * 100) / 100
          : d.monto;
        return {
          etiqueta: d.concepto,
          detalle: esPct ? `descuento fijo ${d.porcentaje}%` : 'descuento fijo',
          monto,
        };
      });
    adelantos
      .filter((a) => a.estado === 'aprobado' && a.periodo === periodo)
      .forEach((a) =>
        partes.push({
          etiqueta: 'Adelanto de sueldo',
          detalle: 'aprobado por RRHH',
          monto: a.monto,
        })
      );
    return { partes, total: partes.reduce((acc, p) => acc + p.monto, 0) };
  }, [recurrentes, adelantos, periodo, bruto]);

  // Al editar, lo guardado que exceda a los automáticos es el adicional.
  useEffect(() => {
    if (!abierto) return;
    if (inicial) {
      const resto = (inicial.otrosDescuentos ?? 0) - automaticos.total;
      setAdicional(resto > 0 ? String(resto) : '');
    } else {
      setAdicional('');
    }
  }, [abierto, inicial, automaticos.total]);

  const otrosTotal = automaticos.total + num(adicional);
  const { aportes, neto } = calcularLiquidacion({
    montoBruto: num(bruto),
    noRemunerativo: num(noRem),
    otrosDescuentos: otrosTotal,
    regimen,
    topeImponible,
  });
  /**
   * Art. 133 LCT (tope del 20%) y neto negativo. Se avisa mientras se
   * escribe y se frena al guardar: antes el único freno era la constraint
   * de Postgres, que aparecía como "violates check constraint".
   */
  /*
   * El embargo sale de los descuentos fijos que ya se cargaron para esta
   * persona: no hace falta otra consulta. La autoridad sigue estando en
   * el servicio, que lo vuelve a mirar contra la base al guardar.
   */
  const conEmbargo = recurrentes.some((d) => d.esEmbargo);
  const errorLimites = errorDeLimitesLiquidacion({
    montoBruto: num(bruto),
    noRemunerativo: num(noRem),
    otrosDescuentos: otrosTotal,
    aportes,
    conEmbargo,
  });
  /*
   * Con embargo el tope no frena, pero se sigue diciendo: "no bloquea"
   * no es "no se informa". Sin embargo, el aviso repite el error y por
   * eso sólo se muestra uno de los dos.
   */
  const avisoLimites = errorLimites
    ? null
    : advertenciaDeLimiteDescuentos({
        montoBruto: num(bruto),
        noRemunerativo: num(noRem),
        otrosDescuentos: otrosTotal,
        conEmbargo,
      });

  const guardar = async () => {
    if (!empleadoActual) {
      setError('Elegí el colaborador.');
      return;
    }
    if (!periodo) {
      setError('El período es obligatorio.');
      return;
    }
    if (num(bruto) <= 0 && num(noRem) <= 0) {
      setError('Informá al menos el bruto o un concepto no remunerativo.');
      return;
    }
    if (num(noRem) < 0 || num(adicional) < 0) {
      setError('Los importes no pueden ser negativos.');
      return;
    }
    // El tope pasó a ser obligatorio. Frenar acá evita el viaje, pero
    // no es el freno: el servicio lo vuelve a mirar y la base tiene el
    // trigger `exigir_tope_de_aportes`.
    const sinTope = errorDeTopeImponible(topeImponible, regimen);
    if (sinTope) {
      setError(sinTope);
      return;
    }
    if (errorLimites) {
      setError(errorLimites);
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await cargarRemuneracion({
        empleadoId: empleadoActual,
        periodo,
        montoBruto: num(bruto),
        noRemunerativo: num(noRem) || undefined,
        otrosDescuentos: otrosTotal || undefined,
        convenio: convenio.trim() || undefined,
      });
      avisoExito(
        'Remuneración guardada',
        `${formatearPeriodo(periodo)} quedó con neto de ${formatearPesos(neto)}.`
      );
      onGuardado();
      onCerrar();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={inicial ? 'Editar remuneración' : 'Cargar remuneración'}
      radius="lg"
      centered
      size="lg"
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-5">
        {!empleadoId && empleados && (
          <CampoSelect
            etiqueta="Colaborador *"
            value={elegido}
            onChange={setElegido}
            opciones={[
              { valor: '', etiqueta: 'Elegí un colaborador…' },
              ...empleados.map((e) => ({
                valor: e.id,
                etiqueta: `${e.apellido}, ${e.nombre}`,
              })),
            ]}
          />
        )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <CampoMes etiqueta="Período" value={periodo} onChange={setPeriodo} />
          <Campo
            etiqueta="Convenio (opcional)"
            value={convenio}
            onChange={(e) => setConvenio(e.target.value)}
            placeholder="CCT 130/75 — Comercio"
          />
        </div>

        {/* Haberes */}
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper/50 p-4">
          <TituloBloque icono={IconCoins} texto="Haberes" />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo
              etiqueta={conAportes ? 'Sueldo bruto (remunerativo)' : 'Sueldo'}
              type="number"
              value={bruto}
              onChange={(e) => setBruto(e.target.value)}
              placeholder="0"
              ayuda={
                conAportes
                  ? 'Podés dejarlo en 0 si solo cargás no remunerativo.'
                  : 'Lo que se le paga por el mes, antes de descuentos.'
              }
              error={
                error?.includes('bruto') || error?.includes('no remunerativo')
                  ? error
                  : undefined
              }
            />
            <Campo
              etiqueta={
                conAportes
                  ? 'No remunerativo (opcional)'
                  : 'Adicional (opcional)'
              }
              type="number"
              value={noRem}
              onChange={(e) => setNoRem(e.target.value)}
              placeholder="0"
              ayuda={
                conAportes
                  ? 'Adicionales fuera de la base de aportes.'
                  : 'Premios, viáticos u otros pagos del mes.'
              }
            />
          </div>

          {extras.detectadas > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-900">
                Tiene{' '}
                <strong className="font-bold">
                  {extras.detectadas} horas extras
                </strong>{' '}
                registradas en {formatearPeriodo(periodo)} según su fichaje.
                {!conTurnos ? (
                  <>
                    {' '}
                    La empresa no usa Turnos, así que no hay aprobación por día:
                    se toman las detectadas.
                  </>
                ) : extras.aprobadas > 0 ? (
                  <>
                    {' '}
                    Están aprobadas{' '}
                    <strong className="font-bold">{extras.aprobadas} hs</strong>
                    .
                  </>
                ) : (
                  <>
                    {' '}
                    <strong className="font-bold">
                      Todavía no hay ninguna aprobada
                    </strong>
                    , así que no se pueden sumar al bruto desde acá. Se aprueban
                    en Turnos, en el día que corresponda — también en los días
                    que no tengan un turno asignado.
                  </>
                )}
                {sugeridoExtras > 0 && (
                  <>
                    {' '}
                    Al 50%, con una base de {horasMensuales} hs mensuales, son{' '}
                    <strong className="font-bold">
                      {formatearPesos(sugeridoExtras)}
                    </strong>
                    .
                  </>
                )}
              </p>
              {sugeridoExtras > 0 && (
                <>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    className="mt-2.5"
                    onClick={() =>
                      setBruto(String(num(bruto) + sugeridoExtras))
                    }
                  >
                    <IconPlus size={14} />
                    Sumar al bruto
                  </Boton>
                  <p className="mt-2 text-[0.7rem] leading-relaxed text-amber-900/80">
                    Es una sugerencia para no tener que calcularlo aparte. No
                    separa las extras al 100% (sábado después de las 13,
                    domingos y feriados) ni los adicionales del convenio:
                    revisalo con tu contador antes de liquidar.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Descuentos fijos del colaborador: se gestionan acá para poder
            cargar todo desde un solo lugar, sin salir del modal. */}
        {empleadoActual && (
          <DescuentosFijos
            empleadoId={empleadoActual}
            puedeEditar
            onCambio={recargarRecurrentes}
          />
        )}

        {/* Descuentos */}
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper/50 p-4">
          <TituloBloque icono={IconReceipt2} texto="Descuentos del período" />

          {automaticos.partes.length > 0 ? (
            <div className="flex flex-col divide-y divide-line/60 rounded-xl border border-line bg-paper px-4 py-1">
              {automaticos.partes.map((p, i) => (
                <div
                  key={`${p.etiqueta}-${i}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                    <IconPinned size={15} className="shrink-0 text-brand-600" />
                    <span className="truncate font-medium">{p.etiqueta}</span>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-brand-700">
                      {p.detalle}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-ink">
                    − {formatearPesos(p.monto)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-soft">
              Este colaborador no tiene descuentos fijos ni adelantos aprobados
              para {formatearPeriodo(periodo)}. Los descuentos fijos se cargan
              desde su ficha y quedan para todos los meses.
            </p>
          )}

          <Campo
            etiqueta="Descuento adicional del mes (opcional)"
            type="number"
            value={adicional}
            onChange={(e) => setAdicional(e.target.value)}
            placeholder="0"
            ayuda="Solo para algo puntual de este período; lo repetitivo va como descuento fijo en la ficha."
          />
        </div>

        {/* Liquidación resultante */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-4">
          <TituloBloque icono={IconCashBanknote} texto="Liquidación estimada" />
          <div className="mt-2 flex flex-col divide-y divide-brand-200/60">
            <Renglon
              etiqueta={conAportes ? 'Remunerativo' : 'Sueldo'}
              valor={formatearPesos(num(bruto))}
            />
            {num(noRem) > 0 && (
              <Renglon
                etiqueta={conAportes ? 'No remunerativo' : 'Adicional'}
                valor={formatearPesos(num(noRem))}
              />
            )}
            {/* En régimen simplificado el renglón directamente no va: un
                "aportes: $0" invita a pensar que falta configurar algo. */}
            {conAportes && (
              <Renglon
                etiqueta="Aportes del empleado"
                detalle={
                  topeImponible && num(bruto) > topeImponible
                    ? `jubilación + PAMI + obra social (${Math.round(APORTES_TOTAL * 100)}% sobre el tope de ${formatearPesos(topeImponible)})`
                    : `jubilación + PAMI + obra social (${Math.round(APORTES_TOTAL * 100)}%)`
                }
                valor={formatearPesos(aportes)}
                resta
              />
            )}
            {otrosTotal > 0 && (
              <Renglon
                etiqueta="Descuentos del período"
                valor={formatearPesos(otrosTotal)}
                resta
              />
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t-2 border-brand-300 pt-3">
            <span className="text-sm font-bold text-ink">
              {conAportes ? 'Neto a cobrar' : 'A pagar'}
            </span>
            <span className="text-2xl font-extrabold tracking-tight text-ink">
              {formatearPesos(neto)}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {conAportes
              ? 'Estimación para gestión interna; la liquidación oficial la hace tu contador. No incluye la retención de Ganancias ni aportes de convenio: el neto real puede ser menor.'
              : 'Esta empresa está configurada como régimen simplificado: no se retienen aportes de ley. Si la empresa paga el monotributo, cargalo en la ficha del colaborador para que entre en el costo del mes.'}
          </p>
          {conAportes && !topeImponible && (
            <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-900">
              Falta el tope de base imponible para aportes. Cargalo en
              Configuración → Remuneraciones: sin ese dato no se puede guardar
              la liquidación, porque los aportes saldrían sobre el bruto
              completo y el neto quedaría más bajo que el que se cobra (art. 9,
              Ley 24.241).
            </p>
          )}
          {errorLimites && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
              {errorLimites}
            </p>
          )}
          {avisoLimites && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
              <IconGavel size={15} className="mt-0.5 shrink-0" />
              <span>{avisoLimites}</span>
            </p>
          )}
        </div>

        {error &&
          !error.includes('bruto') &&
          !error.includes('no remunerativo') && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

        <div className="flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            className="flex-1"
            onClick={() => void guardar()}
            disabled={
              guardando ||
              (num(bruto) <= 0 && num(noRem) <= 0) ||
              !empleadoActual
            }
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
