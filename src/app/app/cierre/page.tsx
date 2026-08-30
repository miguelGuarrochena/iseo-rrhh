'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  IconAlertTriangle,
  IconArchive,
  IconDownload,
  IconLock,
  IconLockOpen,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { Boton } from '@/components/app/ui/Boton';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { CampoTextarea } from '@/components/app/ui/Campo';
import { BloqueError } from '@/components/app/EstadoCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { CategoriaCard } from '@/components/app/cierre/CategoriaCard';
import { useCarga } from '@/lib/useCarga';
import { useModulos } from '@/lib/auth/useModulos';
import { avisoError, avisoExito } from '@/lib/avisos';
import { descargarCSV } from '@/lib/csv';
import { formatearInstante, mesEmpresa } from '@/lib/fechas';
import { armarNovedades, filasDeExportacion } from '@/lib/novedades';
import {
  cerrarPeriodo,
  getCierrePeriodo,
  getDatosNovedades,
  getEmpresa,
  marcarCategoriaRevisada,
  reabrirPeriodo,
} from '@/lib/services/rrhh';

/**
 * Cierre de novedades del mes.
 *
 * La idea es que RRHH entre a fin de mes y encuentre en un solo lugar
 * todo lo que puede afectar la liquidación: qué pasó, qué falta revisar
 * y, cuando está todo mirado, el acto de cerrar.
 *
 * No liquida nada. No calcula sueldos. Junta lo que ya está cargado y lo
 * ordena por categoría para poder mandárselo al contador.
 *
 * Cerrar y reabrir los resuelve la base (RPC de la migración 99), que es
 * la que valida rol y tenant y deja el rastro en la auditoría. Acá se
 * pide y se muestra el resultado.
 */
const CierrePage = () => {
  const { rolEfectivo } = useAuth();
  const esAdmin = rolEfectivo === 'admin_rrhh';
  const modulos = useModulos();

  const [periodo, setPeriodo] = useState(() => mesEmpresa());
  const [notas, setNotas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [reabriendo, setReabriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cEmpresa = useCarga(() => getEmpresa(), [], {
    activo: esAdmin,
    contexto: 'cierre/empresa',
  });

  const cDatos = useCarga(() => getDatosNovedades(periodo), [periodo], {
    activo: esAdmin,
    contexto: 'cierre/novedades',
  });

  const cCierre = useCarga(() => getCierrePeriodo(periodo), [periodo], {
    activo: esAdmin,
    contexto: 'cierre/estado',
  });

  const cierre = cCierre.datos ?? null;
  const cerrado = cierre?.estado === 'cerrado';
  /*
   * Un mes que todavía no terminó no se cierra: no hay novedades que
   * revisar. La base ya lo rechaza (`assert_periodo_valido`), pero
   * ofrecer el botón para que después salte un error es peor que no
   * ofrecerlo y decir por qué.
   */
  const esFuturo = periodo > mesEmpresa();
  const revisadas = useMemo(
    () => new Set(cierre?.categoriasRevisadas ?? []),
    [cierre]
  );

  const novedades = useMemo(
    () => (cDatos.datos ? armarNovedades({ ...cDatos.datos, modulos }) : null),
    [cDatos.datos, modulos]
  );

  const pendientesDeRevisar = novedades
    ? novedades.categorias.filter((c) => !revisadas.has(c.clave)).length
    : 0;
  const requierenAtencion = novedades?.requierenAtencion ?? 0;

  const alternarRevisada = useCallback(
    async (clave: string, valor: boolean) => {
      try {
        const actualizado = await marcarCategoriaRevisada(
          periodo,
          clave,
          valor
        );
        cCierre.actualizar(actualizado);
      } catch (err) {
        avisoError(
          'No pudimos guardar la revisión',
          err instanceof Error ? err.message : undefined
        );
      }
    },
    [periodo, cCierre]
  );

  const confirmarCierre = async () => {
    setGuardando(true);
    try {
      const actualizado = await cerrarPeriodo(periodo, notas);
      cCierre.actualizar(actualizado);
      setNotas('');
      avisoExito(
        `Período ${periodo} cerrado`,
        'Quedó registrado quién lo cerró y cuándo.'
      );
    } catch (err) {
      avisoError(
        'No pudimos cerrar el período',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const confirmarReapertura = async () => {
    if (!motivo.trim()) {
      avisoError('Falta el motivo', 'Decí por qué hace falta reabrirlo.');
      return;
    }
    setGuardando(true);
    try {
      const actualizado = await reabrirPeriodo(periodo, motivo);
      cCierre.actualizar(actualizado);
      setMotivo('');
      setReabriendo(false);
      avisoExito(`Período ${periodo} reabierto`, 'Quedó el motivo asentado.');
    } catch (err) {
      avisoError(
        'No pudimos reabrir el período',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const exportar = () => {
    if (!novedades) return;
    descargarCSV(
      `novedades-${periodo}.csv`,
      filasDeExportacion(novedades, cEmpresa.datos?.nombre ?? '')
    );
  };

  if (!esAdmin) {
    return (
      <p className="text-sm text-ink-soft">
        El cierre del mes lo hace quien administra Recursos Humanos en la
        empresa.
      </p>
    );
  }

  return (
    <RequireEmpresa>
      <div className="flex flex-col gap-6 sm:gap-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Cierre del mes
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Todas las novedades del período que conviene revisar antes de
            mandárselas al contador. No es una liquidación: acá no se calcula
            ningún sueldo, se junta lo que ya está cargado.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="w-full sm:w-56">
            <CampoMes
              etiqueta="Período"
              value={periodo}
              onChange={setPeriodo}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Boton
              variante="secundario"
              onClick={exportar}
              disabled={!novedades || novedades.total === 0}
            >
              <IconDownload size={16} />
              Exportar para el contador
            </Boton>
          </div>
        </div>

        {cDatos.fase === 'error' && cDatos.error ? (
          <BloqueError error={cDatos.error} onReintentar={cDatos.recargar} />
        ) : cDatos.fase === 'cargando' || !novedades ? (
          <Panel>
            <p className="text-sm text-ink-soft">
              Juntando las novedades de {periodo}…
            </p>
          </Panel>
        ) : (
          <>
            {/* Estado del período: lo primero que hay que saber. */}
            {cerrado && (
              <div className="flex flex-wrap items-start gap-3.5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <IconLock size={20} stroke={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-ink">
                    Período {periodo} cerrado
                  </p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
                    {cierre?.cerradoEn
                      ? `Se cerró el ${formatearInstante(cierre.cerradoEn)}. `
                      : ''}
                    Mientras esté cerrado no se pueden cargar ni modificar
                    remuneraciones ni adelantos de este mes. Se puede seguir
                    mirando todo.
                  </p>
                  {cierre?.notas && (
                    <p className="mt-2 rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink-soft">
                      {cierre.notas}
                    </p>
                  )}
                </div>
                <Boton
                  variante="secundario"
                  onClick={() => setReabriendo((v) => !v)}
                >
                  <IconLockOpen size={16} />
                  Reabrir
                </Boton>
              </div>
            )}

            {cerrado && reabriendo && (
              <Panel
                titulo="Reabrir el período"
                descripcion="Reabrir un mes que ya se informó es una excepción. El motivo queda asentado en la auditoría junto con tu nombre."
              >
                <div className="flex flex-col gap-3">
                  <CampoTextarea
                    etiqueta="Por qué hace falta reabrirlo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej: el estudio devolvió el sueldo de Pérez con un error en las extras."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Boton
                      onClick={() => void confirmarReapertura()}
                      disabled={guardando || !motivo.trim()}
                    >
                      {guardando ? 'Reabriendo…' : 'Confirmar reapertura'}
                    </Boton>
                    <Boton
                      variante="secundario"
                      onClick={() => {
                        setReabriendo(false);
                        setMotivo('');
                      }}
                    >
                      Cancelar
                    </Boton>
                  </div>
                </div>
              </Panel>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                etiqueta="Novedades"
                valor={novedades.total}
                detalle="en el período"
              />
              <StatCard
                etiqueta="Categorías"
                valor={novedades.categorias.length}
                detalle={`${novedades.categorias.length - pendientesDeRevisar} revisadas`}
              />
              <StatCard
                etiqueta="Por revisar"
                valor={pendientesDeRevisar}
                detalle="categorías sin tildar"
              />
              <StatCard
                etiqueta="Requieren atención"
                valor={requierenAtencion}
                detalle={
                  requierenAtencion > 0 ? 'datos que faltan' : 'nada pendiente'
                }
              />
            </div>

            {requierenAtencion > 0 && !cerrado && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <IconAlertTriangle
                  size={19}
                  className="mt-0.5 shrink-0 text-amber-700"
                />
                <p className="text-sm leading-relaxed text-amber-900">
                  Hay {requierenAtencion}{' '}
                  {requierenAtencion === 1 ? 'categoría' : 'categorías'} con
                  datos incompletos. Podés cerrar igual —a veces no hay más
                  información que la que hay—, pero conviene resolverlo antes:
                  lo que falta ahí no le llega al contador.
                </p>
              </div>
            )}

            <Panel
              titulo={`Novedades de ${periodo}`}
              descripcion="Sólo aparecen las categorías de las secciones que tu empresa usa. Tildá cada una a medida que la revisás."
            >
              <div className="flex flex-col gap-3">
                {novedades.categorias.map((c) => (
                  <CategoriaCard
                    key={c.clave}
                    categoria={c}
                    revisada={revisadas.has(c.clave)}
                    bloqueada={cerrado}
                    onRevisar={(valor) => void alternarRevisada(c.clave, valor)}
                  />
                ))}
              </div>
            </Panel>

            {!cerrado && esFuturo && (
              <Panel titulo="Todavía no terminó">
                <p className="text-sm leading-relaxed text-ink-soft">
                  {periodo} es un período futuro: no hay nada que cerrar hasta
                  que el mes termine. Podés mirar lo que ya está cargado, pero
                  el cierre se habilita recién entonces.
                </p>
              </Panel>
            )}

            {!cerrado && !esFuturo && (
              <Panel
                titulo="Cerrar el período"
                descripcion="Al cerrar queda registrado quién lo hizo y cuándo, y las remuneraciones y adelantos de este mes se bloquean para que nadie los cambie sin querer."
              >
                <div className="flex flex-col gap-3">
                  <CampoTextarea
                    etiqueta="Notas del cierre (opcional)"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Ej: extras de septiembre aprobadas por Marcelo. Adelanto de Gómez va contra octubre."
                  />
                  <div>
                    <Boton
                      onClick={() => void confirmarCierre()}
                      disabled={guardando}
                    >
                      <IconArchive size={16} />
                      {guardando ? 'Cerrando…' : `Cerrar ${periodo}`}
                    </Boton>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Se puede reabrir después explicando el motivo. No se borra
                    ni se pierde nada.
                  </p>
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </RequireEmpresa>
  );
};

export default CierrePage;
