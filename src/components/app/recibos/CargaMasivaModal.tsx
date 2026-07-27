'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconFileUpload, IconTrash } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { cargarRecibo, getEmpresa } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  MotivoSinAsignar,
  asignarPorNombre,
  idsDuplicados,
} from '@/lib/asignarRecibos';
import { analizarPdf, partirPorTramo } from '@/lib/pdfArchivos';
import { Empleado } from '@/types/rrhh';

interface Fila {
  archivo: File;
  empleadoId: string;
  estado: 'listo' | 'subido' | 'error';
  detalle?: string;
  /** Por qué no se pudo asignar solo (para explicarlo en la fila). */
  motivo?: MotivoSinAsignar;
  /** Qué se leyó adentro del PDF. Vacío = todavía no se analizó. */
  lectura?: 'leyendo' | 'ok' | 'ilegible' | 'desconocido';
  /** De qué archivo salió, cuando vino de partir una nómina. */
  vieneDe?: string;
  paginas?: number;
}

interface Props {
  abierto: boolean;
  empleados: Empleado[];
  onCerrar: () => void;
  onCargado: () => void;
}

/** Tamaño máximo por PDF: un recibo de sueldo no debería superar esto. */
const MAX_MB = 15;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/**
 * Carga masiva de recibos.
 *
 * Cada PDF se abre en el navegador y se leen los CUIL impresos adentro
 * para saber de quién es. Eso resuelve dos cosas de una: asignar bien
 * (el CUIL del recibo es el dato correcto, el nombre del archivo depende
 * de cómo exporte cada sistema de sueldos) y detectar el export con toda
 * la nómina junta, que subido entero le mostraría a una persona el
 * recibo de sus compañeros. Ese archivo se corta solo, uno por persona.
 */
export const CargaMasivaModal = ({
  abierto,
  empleados,
  onCerrar,
  onCargado,
}: Props) => {
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [filas, setFilas] = useState<Fila[]>([]);
  const [publicar, setPublicar] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [ignorados, setIgnorados] = useState(0);
  const [analizando, setAnalizando] = useState(false);
  const [cuitEmpresa, setCuitEmpresa] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  // El CUIT de la empresa aparece en el encabezado de cada hoja del
  // recibo; hay que conocerlo para no confundirlo con el de una persona.
  useEffect(() => {
    if (!abierto || cuitEmpresa) return;
    void getEmpresa()
      .then((e) => setCuitEmpresa(e.cuit))
      .catch(() => setCuitEmpresa(undefined));
  }, [abierto, cuitEmpresa]);

  const opciones = [
    { valor: '', etiqueta: 'Sin asignar — elegí…' },
    ...empleados.map((e) => ({
      valor: e.id,
      etiqueta: `${e.apellido}, ${e.nombre}`,
    })),
  ];

  const nombreArchivoDe = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.apellido}-${e.nombre}`.replace(/\s+/g, '') : id;
  };

  /**
   * Analiza un PDF y devuelve las filas que le corresponden: una si es
   * de una sola persona, varias si era la nómina entera y hubo que
   * cortarla.
   */
  const filasDeArchivo = async (archivo: File): Promise<Fila[]> => {
    let analisis;
    try {
      analisis = await analizarPdf(archivo, empleados, cuitEmpresa);
    } catch (e) {
      // No se pudo abrir: se cae a la asignación por nombre de archivo,
      // que es peor pero deja seguir trabajando.
      const a = asignarPorNombre(archivo.name, empleados);
      return [
        {
          archivo,
          empleadoId: a.empleadoId,
          estado: 'listo',
          motivo: a.por === null ? a.motivo : undefined,
          lectura: 'ilegible',
          detalle: e instanceof Error ? e.message : undefined,
        },
      ];
    }

    if (analisis.clase.tipo === 'individual') {
      return [
        {
          archivo,
          empleadoId: analisis.clase.empleadoId,
          estado: 'listo',
          lectura: 'ok',
          paginas: analisis.paginas,
        },
      ];
    }

    if (analisis.clase.tipo === 'consolidado') {
      const partes = await partirPorTramo(
        archivo,
        analisis.tramos,
        nombreArchivoDe
      );
      const sinDuenio = analisis.tramos.filter((t) => !t.empleadoId).length;
      return [
        ...partes.map((p) => ({
          archivo: p.archivo,
          empleadoId: p.empleadoId,
          estado: 'listo' as const,
          lectura: 'ok' as const,
          vieneDe: archivo.name,
        })),
        // Las páginas que no se pudieron atribuir no se suben, pero se
        // muestran para que RRHH sepa que quedaron afuera.
        ...(sinDuenio > 0
          ? [
              {
                archivo,
                empleadoId: '',
                estado: 'listo' as const,
                lectura: 'desconocido' as const,
                motivo: 'sin_coincidencia' as MotivoSinAsignar,
                paginas: sinDuenio,
                vieneDe: archivo.name,
              },
            ]
          : []),
      ];
    }

    // Ilegible (escaneado) o con documentos que no son de nadie de la
    // empresa: se deja para asignar a mano, con el motivo a la vista.
    const a = asignarPorNombre(archivo.name, empleados);
    return [
      {
        archivo,
        empleadoId: a.empleadoId,
        estado: 'listo',
        motivo: a.por === null ? a.motivo : undefined,
        lectura:
          analisis.clase.tipo === 'ilegible' ? 'ilegible' : 'desconocido',
        paginas: analisis.paginas,
      },
    ];
  };

  const elegirArchivos = async (lista: FileList | null) => {
    if (!lista) return;
    const pdfs = Array.from(lista).filter(
      (a) => a.type === 'application/pdf' || a.name.endsWith('.pdf')
    );
    const dentroDeLimite = pdfs.filter((a) => a.size <= MAX_BYTES);
    setIgnorados(pdfs.length - dentroDeLimite.length);
    if (inputRef.current) inputRef.current.value = '';
    if (dentroDeLimite.length === 0) return;

    setAnalizando(true);
    for (const archivo of dentroDeLimite) {
      const nuevas = await filasDeArchivo(archivo);
      setFilas((prev) => [...prev, ...nuevas]);
    }
    setAnalizando(false);
  };

  const asignar = (i: number, empleadoId: string) =>
    setFilas((prev) =>
      prev.map((f, j) => (j === i ? { ...f, empleadoId } : f))
    );

  const quitar = (i: number) =>
    setFilas((prev) => prev.filter((_, j) => j !== i));

  const cerrar = () => {
    if (subiendo || analizando) return;
    setFilas([]);
    onCerrar();
  };

  const sinAsignar = filas.filter(
    (f) => f.estado !== 'subido' && !f.empleadoId
  ).length;
  const listas = filas.filter((f) => f.estado !== 'subido' && f.empleadoId);

  // Dos PDFs para la misma persona en el mismo período: uno pisa al otro
  // y, si en realidad son de personas distintas, alguien termina viendo
  // el recibo de un compañero. Se bloquea la subida hasta corregirlo.
  const repetidos = idsDuplicados(listas);
  const nombreDe = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.apellido}, ${e.nombre}` : 'un colaborador';
  };
  const partidos = filas.filter((f) => f.vieneDe && f.empleadoId).length;
  const nominasPartidas = new Set(
    filas.filter((f) => f.vieneDe && f.empleadoId).map((f) => f.vieneDe)
  );

  const subirTodo = async () => {
    if (listas.length === 0 || repetidos.size > 0) return;
    setSubiendo(true);
    let ok = 0;
    let fallas = 0;
    for (const fila of filas) {
      if (fila.estado === 'subido' || !fila.empleadoId) continue;
      try {
        await cargarRecibo(fila.empleadoId, periodo, fila.archivo, publicar);
        fila.estado = 'subido';
        ok += 1;
      } catch (err) {
        fila.estado = 'error';
        fila.detalle = err instanceof Error ? err.message : 'Error al subir.';
        fallas += 1;
      }
      setFilas((prev) => [...prev]);
    }
    setSubiendo(false);
    if (ok > 0) {
      avisoExito(
        `${ok} recibo${ok === 1 ? '' : 's'} cargado${ok === 1 ? '' : 's'}`,
        publicar
          ? 'Quedaron firmados por el empleador y visibles para el equipo.'
          : 'Quedaron sin publicar: falta tu firma como empleador.'
      );
      onCargado();
    }
    if (fallas > 0) {
      avisoError(
        `${fallas} con error`,
        'Revisá las filas marcadas y reintentá.'
      );
    } else if (ok > 0) {
      cerrar();
    }
  };

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title="Carga masiva de recibos"
      radius="lg"
      centered
      size="xl"
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <CampoMes
            etiqueta="Período *"
            value={periodo}
            onChange={setPeriodo}
          />
          <div className="flex items-end">
            <Boton
              variante="secundario"
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full"
            >
              <IconFileUpload size={16} />
              Elegir PDFs…
            </Boton>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => void elegirArchivos(e.target.files)}
            />
          </div>
        </div>

        <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
          Subí los PDF como te los da el sistema de sueldos: uno por persona o
          el archivo con toda la nómina junta, da igual. Leemos el CUIL impreso
          adentro de cada recibo para saber de quién es, y si viene todo en un
          archivo lo cortamos solos. Lo que no podamos leer con certeza queda
          sin asignar, para que no le llegue a quien no corresponde. Máximo{' '}
          {MAX_MB}MB por archivo.
        </p>

        {analizando && (
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-xs font-semibold text-brand-800">
            Leyendo los PDF… se procesan en tu computadora, no se suben todavía.
          </p>
        )}

        {ignorados > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
            {ignorados} archivo{ignorados === 1 ? '' : 's'} no se{' '}
            {ignorados === 1 ? 'agregó' : 'agregaron'} por superar los {MAX_MB}
            MB.
          </p>
        )}

        {repetidos.size > 0 && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-800">
            <span className="font-bold">
              Hay más de un PDF asignado a la misma persona.
            </span>{' '}
            Revisá {[...repetidos].map(nombreDe).slice(0, 3).join(', ')}: si son
            recibos de personas distintas, esa persona vería el de su compañero.
            Corregí la asignación antes de subir.
          </p>
        )}

        {partidos > 0 && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            <span className="font-bold">
              {nominasPartidas.size === 1
                ? 'Detectamos un archivo con recibos de más de una persona.'
                : `Detectamos ${nominasPartidas.size} archivos con recibos de más de una persona.`}
            </span>{' '}
            {partidos === 1
              ? 'Recortamos el recibo de quien pudimos identificar; el resto de las páginas queda sin subir.'
              : `Lo cortamos en ${partidos} recibos, uno por persona, así cada una ve solo el suyo.`}
          </p>
        )}

        {filas.length > 0 && (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {filas.map((f, i) => (
              <div
                key={`${f.archivo.name}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {f.archivo.name}
                  </span>
                  {(f.vieneDe || f.lectura) && (
                    <span className="block truncate text-xs text-ink-soft">
                      {f.vieneDe && f.empleadoId
                        ? `Recortado de ${f.vieneDe}`
                        : f.lectura === 'ok'
                          ? 'Identificado por el CUIL impreso en el recibo'
                          : f.lectura === 'ilegible'
                            ? 'No pudimos leer el texto del PDF (¿está escaneado?)'
                            : f.paginas
                              ? `${f.paginas} ${f.paginas === 1 ? 'página' : 'páginas'} sin colaborador reconocido`
                              : 'No reconocimos a nadie de la empresa adentro'}
                    </span>
                  )}
                </span>
                <div className="w-56">
                  <CampoSelect
                    etiqueta=""
                    value={f.empleadoId}
                    onChange={(v) => asignar(i, v)}
                    opciones={opciones}
                  />
                </div>
                {f.estado === 'subido' ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    Subido
                  </span>
                ) : f.estado === 'error' ? (
                  <span
                    className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800"
                    title={f.detalle}
                  >
                    Error
                  </span>
                ) : !f.empleadoId ? (
                  <span
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"
                    title={
                      f.lectura === 'ilegible'
                        ? 'El PDF no tiene texto para leer. Asignalo a mano o pedí el archivo sin escanear.'
                        : f.motivo === 'ambiguo'
                          ? 'El nombre del archivo coincide con más de un colaborador. Elegilo a mano.'
                          : 'No reconocimos a nadie de la empresa. Revisá que el CUIL esté cargado en su ficha.'
                    }
                  >
                    {f.motivo === 'ambiguo' ? 'Ambiguo' : 'Sin asignar'}
                  </span>
                ) : repetidos.has(f.empleadoId) ? (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                    Repetido
                  </span>
                ) : (
                  <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-800">
                    Listo
                  </span>
                )}
                {f.estado !== 'subido' && (
                  <button
                    type="button"
                    onClick={() => quitar(i)}
                    aria-label="Quitar archivo"
                    className="cursor-pointer text-ink-soft transition-colors hover:text-red-600"
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-paper px-4 py-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={publicar}
            onChange={(e) => setPublicar(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          <span>
            <span className="font-semibold">
              Firmar como empleador y publicar al subir.
            </span>{' '}
            <span className="text-ink-soft">
              Si lo destildás, quedan como borrador hasta que los firmes desde
              el listado.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-soft">
            {filas.length === 0
              ? 'Todavía no elegiste archivos.'
              : `${listas.length} para subir${sinAsignar > 0 ? ` · ${sinAsignar} sin asignar` : ''}.`}
          </span>
          <Boton
            onClick={() => void subirTodo()}
            disabled={
              subiendo ||
              analizando ||
              listas.length === 0 ||
              repetidos.size > 0
            }
          >
            {subiendo
              ? 'Subiendo…'
              : `Subir ${listas.length > 0 ? listas.length : ''} recibo${listas.length === 1 ? '' : 's'}`}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
