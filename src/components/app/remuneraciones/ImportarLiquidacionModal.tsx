'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconAlertTriangle, IconFileSpreadsheet } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { Selector } from '@/components/app/ui/Selector';
import { avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { mesEmpresa } from '@/lib/fechas';
import {
  ACCEPT_PLANILLA,
  ArchivoNoSoportado,
  FORMATOS_PERMITIDOS_TEXTO,
  leerFilasDeArchivo,
} from '@/lib/planillas';
import { autoMapear, camposSinMapear, IGNORAR } from '@/lib/mapeoDeColumnas';
import {
  armarFilasDeLiquidacion,
  CAMPOS_LIQUIDACION,
  errorDeArchivo,
  filasImportables,
  FilaLiquidacion,
  resumirImportacion,
} from '@/lib/importarLiquidacion';
import {
  importarRemuneraciones,
  remuneracionesExistentes,
} from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

/** Tamaño máximo: una nómina razonable pesa muchísimo menos. */
const MAX_MB = 10;

interface Props {
  abierto: boolean;
  empleados: Empleado[];
  /** Mensaje si la empresa todavía no configuró el tope de aportes. */
  bloqueo?: string | null;
  onCerrar: () => void;
  onImportado: () => void;
}

type Paso = 'archivo' | 'revisar';

/**
 * Importar la liquidación del mes desde el Excel del estudio contable.
 *
 * El orden es archivo → mapeo → preview → confirmar, y no se puede
 * saltear: nada se guarda hasta que la persona vio cuántas filas entran,
 * cuántas tienen error y qué se va a pisar. Un archivo mal armado es lo
 * normal la primera vez, y descubrirlo después de haber escrito medio
 * mes es el peor momento.
 */
export const ImportarLiquidacionModal = ({
  abierto,
  empleados,
  bloqueo,
  onCerrar,
  onImportado,
}: Props) => {
  const [paso, setPaso] = useState<Paso>('archivo');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [columnas, setColumnas] = useState<string[]>([]);
  const [crudas, setCrudas] = useState<Record<string, unknown>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [periodo, setPeriodo] = useState(() => mesEmpresa());
  const [yaCargadas, setYaCargadas] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [verErrores, setVerErrores] = useState(false);
  const [importando, setImportando] = useState(false);

  const reiniciar = () => {
    setPaso('archivo');
    setNombreArchivo('');
    setColumnas([]);
    setCrudas([]);
    setMapeo({});
    setYaCargadas(new Set());
    setError(null);
    setVerErrores(false);
  };

  const cerrar = () => {
    reiniciar();
    onCerrar();
  };

  /** Sólo lo que hace falta para reconocer a cada persona. */
  const paraImportar = useMemo(
    () =>
      empleados.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        apellido: e.apellido,
        dni: e.dni,
        cuil: e.cuil,
        numeroLegajo: e.numeroLegajo,
        activo: e.activo,
      })),
    [empleados]
  );

  const filas: FilaLiquidacion[] = useMemo(() => {
    if (crudas.length === 0) return [];
    return armarFilasDeLiquidacion({
      filas: crudas,
      mapeo,
      empleados: paraImportar,
      periodoPorDefecto: periodo,
      yaCargadas,
    });
  }, [crudas, mapeo, paraImportar, periodo, yaCargadas]);

  const resumen = useMemo(() => resumirImportacion(filas), [filas]);
  const problemaDelArchivo = useMemo(
    () => (filas.length > 0 ? errorDeArchivo({ filas, mapeo }) : null),
    [filas, mapeo]
  );
  const faltantes = useMemo(
    () => camposSinMapear(mapeo, CAMPOS_LIQUIDACION),
    [mapeo]
  );

  const leerArchivo = async (archivo: File) => {
    setError(null);
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo pesa demasiado (máximo ${MAX_MB}MB).`);
      return;
    }
    try {
      const datos = await leerFilasDeArchivo(archivo);
      if (datos.length === 0) {
        setError('El archivo no tiene filas con datos.');
        return;
      }
      const cols = Object.keys(datos[0]);
      const auto = autoMapear(cols, CAMPOS_LIQUIDACION);
      setColumnas(cols);
      setCrudas(datos);
      setMapeo(auto);
      setNombreArchivo(archivo.name);

      /*
       * Se pregunta qué hay cargado antes de mostrar el preview, para que
       * "se reemplazan 12" aparezca junto al resto y no como una sorpresa
       * al confirmar.
       *
       * Los períodos salen de armar las filas una vez: el archivo puede
       * traer su propia columna de mes, y entonces no alcanza con
       * preguntar por el que eligió la persona.
       */
      const primeraPasada = armarFilasDeLiquidacion({
        filas: datos,
        mapeo: auto,
        empleados: paraImportar,
        periodoPorDefecto: periodo,
      });
      setYaCargadas(
        await remuneracionesExistentes(
          resumirImportacion(primeraPasada).periodos
        )
      );
      setPaso('revisar');
    } catch (e) {
      setError(
        e instanceof ArchivoNoSoportado
          ? e.message
          : 'No pudimos leer el archivo: puede estar dañado. Probá abrirlo y volver a guardarlo.'
      );
    }
  };

  const importar = async () => {
    setImportando(true);
    setError(null);
    try {
      const r = await importarRemuneraciones(filasImportables(filas));
      avisoExito(
        'Liquidación importada',
        `${r.guardadas} ${r.guardadas === 1 ? 'registro' : 'registros'} en ${r.periodos.join(', ')}.`
      );
      onImportado();
      cerrar();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No pudimos importar la liquidación.'
      );
    } finally {
      setImportando(false);
    }
  };

  const conErrores = filas.filter((f) => f.errores.length > 0);
  const puedeImportar =
    !bloqueo && !problemaDelArchivo && resumen.validas > 0 && !importando;

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title="Importar liquidación"
      radius="lg"
      centered
      size="xl"
      styles={{ title: { fontWeight: 800 } }}
    >
      {bloqueo ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold leading-relaxed text-amber-900">
            {bloqueo}
          </p>
          <div className="flex justify-end">
            <Boton variante="secundario" onClick={cerrar}>
              Cerrar
            </Boton>
          </div>
        </div>
      ) : paso === 'archivo' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Subí la planilla que te manda el estudio contable. Vas a poder
            revisar todo antes de que se guarde nada.
          </p>

          <CampoMes
            etiqueta="Período a importar"
            value={periodo}
            onChange={setPeriodo}
            ayuda="Se usa para las filas cuyo archivo no traiga una columna de período."
          />

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-6 py-8 text-center transition-colors hover:border-brand-400">
            <IconFileSpreadsheet size={28} className="text-brand-600" />
            <span className="text-sm font-semibold text-ink">
              Elegí el archivo
            </span>
            <span className="text-xs text-ink-soft">
              Formatos permitidos: {FORMATOS_PERMITIDOS_TEXTO}
            </span>
            <input
              type="file"
              accept={ACCEPT_PLANILLA}
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                // Se limpia el input para que elegir el mismo archivo dos
                // veces seguidas vuelva a disparar el onChange.
                e.target.value = '';
                if (archivo) void leerArchivo(archivo);
              }}
            />
          </label>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">{nombreArchivo}</span> ·{' '}
            {resumen.total} {resumen.total === 1 ? 'fila' : 'filas'}
          </p>

          {/* ---------- Mapeo ---------- */}
          <div>
            <h3 className="text-sm font-bold text-ink">Qué es cada columna</h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              Lo adivinamos por el nombre. Corregí lo que haga falta.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {columnas.map((col) => (
                <div key={col} className="flex items-center gap-2">
                  <span
                    className="w-32 shrink-0 truncate text-xs font-semibold text-ink"
                    title={col}
                  >
                    {col}
                  </span>
                  <Selector
                    valor={mapeo[col] ?? IGNORAR}
                    onCambiar={(v) => setMapeo({ ...mapeo, [col]: v })}
                    className="flex-1"
                    opciones={[
                      { valor: IGNORAR, etiqueta: 'No importar' },
                      ...CAMPOS_LIQUIDACION.map((c) => ({
                        valor: c.clave,
                        etiqueta: c.etiqueta,
                      })),
                    ]}
                  />
                </div>
              ))}
            </div>
            {faltantes.length > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                Sin columna asignada:{' '}
                {faltantes.map((c) => c.etiqueta).join(', ')}. Si tu planilla no
                los trae, está bien.
              </p>
            )}
          </div>

          {problemaDelArchivo && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-900">
              {problemaDelArchivo}
            </p>
          )}

          {/* ---------- Resumen ---------- */}
          {!problemaDelArchivo && (
            <div className="rounded-2xl border border-line bg-paper px-4 py-3">
              <p className="text-sm text-ink">
                <span className="font-bold">{resumen.total}</span> registros
                encontrados ·{' '}
                <span className="font-bold text-emerald-700">
                  {resumen.validas} válidos
                </span>
                {resumen.conErrores > 0 && (
                  <>
                    {' · '}
                    <span className="font-bold text-red-700">
                      {resumen.conErrores} con errores
                    </span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Período: {resumen.periodos.join(', ') || '—'}
              </p>

              {resumen.aSobrescribir > 0 && (
                <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>
                    <b>{resumen.aSobrescribir}</b>{' '}
                    {resumen.aSobrescribir === 1
                      ? 'colaborador ya tiene'
                      : 'colaboradores ya tienen'}{' '}
                    una remuneración cargada en ese período. Se
                    {resumen.aSobrescribir === 1
                      ? ' reemplaza'
                      : ' reemplazan'}{' '}
                    por lo que traiga el archivo.
                  </span>
                </p>
              )}

              {resumen.conErrores > 0 && (
                <>
                  <p className="mt-2 text-xs text-ink-soft">
                    Las filas con errores no se importan. Las demás sí.
                  </p>
                  <button
                    type="button"
                    onClick={() => setVerErrores(!verErrores)}
                    className="mt-1 text-xs font-bold text-brand-700 underline"
                  >
                    {verErrores ? 'Ocultar errores' : 'Ver errores'}
                  </button>
                </>
              )}
            </div>
          )}

          {verErrores && conErrores.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              {conErrores.map((f) => (
                <p
                  key={f.fila}
                  className="text-xs leading-relaxed text-red-900"
                >
                  <b>Fila {f.fila}</b>
                  {f.identificador && ` (${f.identificador})`}:{' '}
                  {f.errores.join('; ')}
                </p>
              ))}
            </div>
          )}

          {/* ---------- Preview ---------- */}
          {!problemaDelArchivo && resumen.validas > 0 && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead className="bg-paper">
                  <tr>
                    <th className="px-3 py-2 font-bold text-ink">
                      Colaborador
                    </th>
                    <th className="px-3 py-2 font-bold text-ink">Período</th>
                    <th className="px-3 py-2 text-right font-bold text-ink">
                      Bruto
                    </th>
                    <th className="px-3 py-2 text-right font-bold text-ink">
                      No rem.
                    </th>
                    <th className="px-3 py-2 text-right font-bold text-ink">
                      Desc.
                    </th>
                    <th className="px-3 py-2 font-bold text-ink" />
                  </tr>
                </thead>
                <tbody>
                  {filasImportables(filas)
                    .slice(0, 12)
                    .map((f) => (
                      <tr key={f.fila} className="border-t border-line">
                        <td className="px-3 py-2 text-ink">
                          {f.empleadoNombre}
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{f.periodo}</td>
                        <td className="px-3 py-2 text-right text-ink">
                          {formatearPesos(f.montoBruto)}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-soft">
                          {formatearPesos(f.noRemunerativo)}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-soft">
                          {formatearPesos(f.otrosDescuentos)}
                        </td>
                        <td className="px-3 py-2 text-[0.7rem] text-amber-800">
                          {f.pisa && 'reemplaza'}
                          {f.advertencias.length > 0 && (
                            <div>{f.advertencias.join('; ')}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {resumen.validas > 12 && (
                <p className="border-t border-line px-3 py-2 text-xs text-ink-soft">
                  y {resumen.validas - 12} más.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={reiniciar}>
              Otro archivo
            </Boton>
            <Boton variante="secundario" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton disabled={!puedeImportar} onClick={() => void importar()}>
              {importando
                ? 'Importando…'
                : `Importar ${resumen.validas} ${resumen.validas === 1 ? 'registro' : 'registros'}`}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
};
