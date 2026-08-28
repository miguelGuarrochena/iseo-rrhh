'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconEye, IconFileUpload, IconTrash } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import {
  cargarRecibo,
  getEmpleadosConCuenta,
  getEmpresa,
} from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  MotivoSinAsignar,
  asignarPorNombre,
  idsDuplicados,
} from '@/lib/asignarRecibos';
import { analizarPdf, partirPorTramo } from '@/lib/pdfArchivos';
import { PistaTramo } from '@/lib/recibosPdf';
import { Empleado, ReciboSueldo, TipoRecibo } from '@/types/rrhh';
import { tipoReciboLabels } from '@/lib/etiquetas';
import { aOpciones } from '@/components/app/ui/Selector';
import { Falta, faltasDeEmpleado } from '@/lib/requisitos';
import { BloqueFaltasDeVarios, ChipsFaltas } from '@/components/app/Faltas';
import { mesEmpresa } from '@/lib/fechas';

interface Fila {
  /** Estable: la lista se reordena y el nombre se puede editar. */
  id: string;
  archivo: File;
  /**
   * Nombre que se muestra y se puede editar. Es sólo una etiqueta para
   * revisar la lista: el recibo se guarda por empleado y período, no por
   * nombre de archivo.
   */
  nombre: string;
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
  /** Nombre y documentos leídos del PDF cuando no se supo de quién es. */
  pista?: PistaTramo;
  /** El documento apuntó a una ficha, pero el recibo nombra a otra persona. */
  discrepancia?: { nombreImpreso: string };
}

interface Props {
  abierto: boolean;
  empleados: Empleado[];
  /** Los ya cargados, para avisar antes de pisar uno existente. */
  recibosExistentes: ReciboSueldo[];
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
  recibosExistentes,
  onCerrar,
  onCargado,
}: Props) => {
  // `mesEmpresa()` y no `toISOString().slice(0, 7)`, que es UTC: el último
  // día del mes después de las 21:00 ART el formulario abría en el mes
  // siguiente y la carga masiva iba al período equivocado.
  const [periodo, setPeriodo] = useState(mesEmpresa());
  const [filas, setFilas] = useState<Fila[]>([]);
  const [tipo, setTipo] = useState<TipoRecibo>('mensual');
  const [publicar, setPublicar] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [ignorados, setIgnorados] = useState(0);
  const [analizando, setAnalizando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [cuitEmpresa, setCuitEmpresa] = useState<string | undefined>();
  const [conCuenta, setConCuenta] = useState<Set<string> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // El CUIT de la empresa aparece en el encabezado de cada hoja del
  // recibo; hay que conocerlo para no confundirlo con el de una persona.
  useEffect(() => {
    if (!abierto || cuitEmpresa) return;
    void getEmpresa()
      .then((e) => setCuitEmpresa(e.cuit))
      .catch(() => setCuitEmpresa(undefined));
  }, [abierto, cuitEmpresa]);

  // Quién tiene cuenta. Subir un recibo para alguien que no la tiene no
  // falla —el PDF se guarda y queda asignado—, pero esa persona no lo ve
  // ni recibe el aviso. Si no se sabe (la consulta falló), no se muestra
  // nada: inventar una advertencia es peor que no darla.
  useEffect(() => {
    if (!abierto || conCuenta) return;
    void getEmpleadosConCuenta()
      .then((ids) => setConCuenta(new Set(ids)))
      .catch(() => setConCuenta(null));
  }, [abierto, conCuenta]);

  /**
   * Qué le falta a esa persona para que el recibo le sirva. Si todavía
   * no se sabe quién tiene cuenta, `tieneCuenta` va undefined y la regla
   * no dispara: una advertencia inventada es peor que ninguna.
   */
  const faltasDe = (empleadoId: string): Falta[] => {
    const e = empleados.find((x) => x.id === empleadoId);
    if (!e) return [];
    return faltasDeEmpleado(
      e,
      { tieneCuenta: conCuenta ? conCuenta.has(empleadoId) : undefined },
      'recibos'
    );
  };

  const sinCuenta = (empleadoId: string): boolean =>
    faltasDe(empleadoId).some((f) => f.clave === 'sin_cuenta');

  const opciones = [
    { valor: '', etiqueta: 'Sin asignar — elegí…' },
    ...empleados.map((e) => ({
      valor: e.id,
      etiqueta: `${e.apellido}, ${e.nombre}`,
    })),
  ];

  const sinExt = (n: string) => n.replace(/\.pdf$/i, '');

  const nuevoId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

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
          id: nuevoId(),
          archivo,
          nombre: sinExt(archivo.name),
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
          id: nuevoId(),
          archivo,
          nombre: nombreArchivoDe(analisis.clase.empleadoId),
          empleadoId: analisis.clase.empleadoId,
          estado: 'listo',
          lectura: 'ok',
          paginas: analisis.paginas,
          discrepancia: analisis.tramos.find((t) => t.discrepancia)
            ?.discrepancia,
        },
      ];
    }

    if (analisis.clase.tipo === 'consolidado') {
      // Se recortan todos los tramos, incluidos los que no se pudieron
      // atribuir: así la fila "sin asignar" lleva sólo sus páginas y
      // elegirle un colaborador a mano no le sube la nómina entera.
      const partes = await partirPorTramo(
        archivo,
        analisis.tramos,
        nombreArchivoDe
      );
      return partes.map((p) => ({
        id: nuevoId(),
        archivo: p.archivo,
        nombre: sinExt(p.archivo.name),
        empleadoId: p.empleadoId,
        estado: 'listo' as const,
        lectura: p.empleadoId ? ('ok' as const) : ('desconocido' as const),
        motivo: p.empleadoId
          ? undefined
          : ('sin_coincidencia' as MotivoSinAsignar),
        paginas: p.paginas,
        vieneDe: archivo.name,
        pista: p.pista,
        discrepancia: p.discrepancia,
      }));
    }

    // Ilegible (escaneado) o con documentos que no son de nadie de la
    // empresa: se deja para asignar a mano, con el motivo a la vista.
    const a = asignarPorNombre(archivo.name, empleados);
    return [
      {
        id: nuevoId(),
        archivo,
        nombre: sinExt(archivo.name),
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

  /**
   * Al elegir el colaborador se renombra el archivo con su nombre. El
   * nombre no cambia dónde se guarda el recibo (eso va por empleado y
   * período), pero es lo único que RRHH ve en la lista mientras revisa.
   */
  const asignar = (i: number, empleadoId: string) =>
    setFilas((prev) =>
      prev.map((f, j) =>
        j === i
          ? {
              ...f,
              empleadoId,
              // Al elegir a la persona, el nombre pasa a ser el de ella.
              nombre: empleadoId ? nombreArchivoDe(empleadoId) : f.nombre,
            }
          : f
      )
    );

  const renombrar = (i: number, nombre: string) =>
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, nombre } : f)));

  /** Abre el recorte en otra pestaña para ver de quién es. */
  const ver = (f: Fila) => {
    const url = URL.createObjectURL(f.archivo);
    window.open(url, '_blank', 'noopener');
    // Se libera después: si se revoca ya, la pestaña queda en blanco.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

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
  /**
   * Recibos que ya existen para el período elegido. Cargar encima de uno
   * lo rectifica: el anterior queda archivado con su firma intacta y el
   * nuevo arranca pendiente de firma. Se avisa porque implica que esa
   * gente tiene que volver a firmar.
   */
  const yaCargado = new Map(
    recibosExistentes
      .filter((r) => r.periodo === periodo && r.tipo === tipo)
      .map((r) => [r.empleadoId, r])
  );
  const rectifica = listas.filter((f) => yaCargado.has(f.empleadoId));
  const rectificaFirmado = listas.filter(
    (f) => yaCargado.get(f.empleadoId)?.estadoFirma === 'firmado'
  );

  /** Asignados a alguien al que le falta algo para poder usarlo. */
  const faltantes = [...new Set(listas.map((f) => f.empleadoId))]
    .map((id) => ({ nombre: nombreDe(id), faltas: faltasDe(id) }))
    .filter((x) => x.faltas.length > 0);

  const partidos = filas.filter((f) => f.vieneDe && f.empleadoId).length;
  const nominasPartidas = new Set(
    filas.filter((f) => f.vieneDe && f.empleadoId).map((f) => f.vieneDe)
  );

  const subirTodo = async () => {
    if (listas.length === 0 || repetidos.size > 0) return;
    setSubiendo(true);
    let ok = 0;
    let fallas = 0;
    let sinAvisar = 0;
    for (const fila of filas) {
      if (fila.estado === 'subido' || !fila.empleadoId) continue;
      if (sinCuenta(fila.empleadoId)) sinAvisar += 1;
      try {
        await cargarRecibo(
          fila.empleadoId,
          periodo,
          fila.archivo,
          publicar,
          tipo
        );
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
      const avisados = ok - sinAvisar;
      avisoExito(
        `${ok} recibo${ok === 1 ? '' : 's'} cargado${ok === 1 ? '' : 's'}`,
        !publicar
          ? 'Quedaron sin publicar: falta tu firma como empleador.'
          : sinAvisar > 0
            ? `Le avisamos a ${avisados}. ${sinAvisar === 1 ? '1 no tiene cuenta y no se enteró' : `${sinAvisar} no tienen cuenta y no se enteraron`}: invitá a esa gente desde Permisos.`
            : 'Quedaron firmados por el empleador y visibles para el equipo.'
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
      <div
        className="flex flex-col gap-4"
        onDragOver={(e) => {
          // Hay que cancelar dragover, si no el navegador abre el PDF
          // en la pestaña en vez de dejarnos manejar el drop.
          e.preventDefault();
          if (!arrastrando) setArrastrando(true);
        }}
        onDragLeave={(e) => {
          // Sólo cuando el puntero sale del modal entero: los hijos
          // disparan dragleave todo el tiempo y titilaría.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setArrastrando(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void elegirArchivos(e.dataTransfer.files);
        }}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <CampoMes
            etiqueta="Período *"
            value={periodo}
            onChange={setPeriodo}
          />
          <CampoSelect
            etiqueta="Concepto *"
            value={tipo}
            onChange={(v) => setTipo(v as TipoRecibo)}
            opciones={aOpciones(tipoReciboLabels)}
          />
        </div>

        {/* La zona de drop es lo primero que hay que entender, así que
            lleva el peso visual: ícono, una línea, y el detalle chico
            abajo. El texto largo de antes nadie lo leía. */}
        <label
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors ${
            arrastrando
              ? 'border-brand-400 bg-brand-50'
              : 'border-line bg-paper/60 hover:border-brand-300'
          }`}
        >
          <IconFileUpload size={34} stroke={1.5} className="text-brand-600" />
          <span className="text-sm font-semibold text-ink">
            {arrastrando
              ? 'Soltá los PDF acá'
              : 'Arrastrá los PDF o hacé clic para elegirlos'}
          </span>
          <span className="text-xs text-ink-soft">
            Uno por persona o la nómina completa · máx. {MAX_MB}MB c/u
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => void elegirArchivos(e.target.files)}
          />
        </label>

        <p className="text-xs leading-relaxed text-ink-soft">
          Leemos el CUIL impreso en cada recibo para saber de quién es. Si
          vienen varios en un mismo archivo, lo cortamos. Lo que no podamos leer
          con certeza queda sin asignar.
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

        {rectifica.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <span className="font-bold">
              {rectifica.length === 1
                ? 'Ya había un recibo de este concepto y período.'
                : `Ya había ${rectifica.length} recibos de este concepto y período.`}
            </span>{' '}
            El nuevo lo rectifica: el anterior queda archivado con su firma como
            respaldo.
            {rectificaFirmado.length > 0 &&
              ` ${
                rectificaFirmado.length === 1
                  ? 'Uno ya estaba firmado, así que esa persona'
                  : `${rectificaFirmado.length} ya estaban firmados, así que esas personas`
              } va a tener que firmar de nuevo.`}
          </p>
        )}

        <BloqueFaltasDeVarios
          items={faltantes}
          titulo={
            faltantes.length === 1
              ? 'A 1 persona le falta algo para poder ver su recibo'
              : `A ${faltantes.length} personas les falta algo para poder ver su recibo`
          }
        />

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
              ? 'Recortamos el recibo de quien pudimos identificar. Las páginas que no reconocimos quedan aparte, para que las asignes vos.'
              : `Lo cortamos en ${partidos} recibos, uno por persona, así cada una ve solo el suyo.`}
          </p>
        )}

        {filas.length > 0 && (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {filas.map((f, i) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  {/* El nombre es editable: se escribe encima y listo. */}
                  <input
                    value={f.nombre}
                    onChange={(e) => renombrar(i, e.target.value)}
                    aria-label="Nombre del archivo"
                    disabled={f.estado === 'subido'}
                    className="w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-ink outline-none transition-colors hover:border-line focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(74,122,245,0.18)] focus:bg-surface disabled:hover:border-transparent"
                  />
                  <span className="mt-0.5 block px-1.5 text-xs text-ink-soft">
                    {/* Lo más útil primero: de quién parece ser. */}
                    {f.discrepancia ? (
                      <span className="text-amber-800">
                        Ojo: el recibo está a nombre de{' '}
                        <strong className="font-semibold">
                          {f.discrepancia.nombreImpreso}
                        </strong>
                        , pero el CUIL es el de {nombreDe(f.empleadoId)}. Revisá
                        cuál de las dos fichas tiene mal el dato.
                      </span>
                    ) : !f.empleadoId && f.pista?.nombre ? (
                      <>
                        El recibo dice{' '}
                        <strong className="font-semibold text-ink">
                          {f.pista.nombre}
                        </strong>
                        {f.pista.documentos[0]
                          ? ` · ${f.pista.documentos[0]}, que no está en el sistema`
                          : ''}
                      </>
                    ) : !f.empleadoId && f.pista?.documentos[0] ? (
                      `Leímos ${f.pista.documentos[0]}, que no es de nadie cargado`
                    ) : f.lectura === 'ilegible' ? (
                      'No pudimos leer el texto del PDF (¿está escaneado?)'
                    ) : f.vieneDe ? (
                      `${f.paginas} ${f.paginas === 1 ? 'página' : 'páginas'} de ${f.vieneDe}`
                    ) : f.lectura === 'ok' ? (
                      'Reconocido por lo que dice el recibo'
                    ) : (
                      'Asignalo a mano'
                    )}
                  </span>
                </span>
                <div className="w-full sm:w-56">
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
                ) : yaCargado.has(f.empleadoId) ? (
                  <span
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"
                    title={
                      yaCargado.get(f.empleadoId)?.estadoFirma === 'firmado'
                        ? 'Ya hay uno firmado. El nuevo lo rectifica y va a tener que firmarlo otra vez.'
                        : 'Ya hay uno cargado de este concepto y período. El nuevo lo rectifica.'
                    }
                  >
                    Rectifica
                  </span>
                ) : f.discrepancia ? (
                  <span
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"
                    title="El documento del recibo apunta a esta ficha, pero el recibo está a nombre de otra persona."
                  >
                    Revisar
                  </span>
                ) : (
                  <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-800">
                    Listo
                  </span>
                )}
                {/* Chip aparte y no dentro de la cadena de estados: una
                    fila puede rectificar un recibo Y ser de alguien sin
                    cuenta, y esconder una atrás de la otra fue lo que
                    hizo que esto pasara desapercibido. */}
                {f.estado !== 'subido' && (
                  <ChipsFaltas faltas={faltasDe(f.empleadoId)} />
                )}
                <button
                  type="button"
                  onClick={() => ver(f)}
                  aria-label={`Ver ${f.nombre}`}
                  title="Abrir el PDF para ver de quién es"
                  className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper hover:text-ink sm:h-9 sm:w-9"
                >
                  <IconEye size={16} />
                </button>
                {f.estado !== 'subido' && (
                  <button
                    type="button"
                    onClick={() => quitar(i)}
                    aria-label="Quitar archivo"
                    className="presionable inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-ink-soft hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:h-10 sm:w-10"
                  >
                    <IconTrash size={17} />
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

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
