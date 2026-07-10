'use client';

import { useRef, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconFileUpload, IconTrash } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { cargarRecibo } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { Empleado } from '@/types/rrhh';

interface Fila {
  archivo: File;
  empleadoId: string;
  estado: 'listo' | 'subido' | 'error';
  detalle?: string;
}

interface Props {
  abierto: boolean;
  empleados: Empleado[];
  onCerrar: () => void;
  onCargado: () => void;
}

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/**
 * Busca a quién pertenece el PDF por el CUIL (o DNI) presente en el
 * nombre del archivo. Ej: "recibo-20-30123456-7-junio.pdf".
 */
const detectarEmpleado = (
  nombreArchivo: string,
  empleados: Empleado[]
): string => {
  const digitos = soloDigitos(nombreArchivo);
  const porCuil = empleados.find((e) => {
    const cuil = soloDigitos(e.cuil ?? '');
    return cuil.length >= 10 && digitos.includes(cuil);
  });
  if (porCuil) return porCuil.id;
  const porDni = empleados.find((e) => {
    const dni = soloDigitos(e.dni ?? '');
    return dni.length >= 7 && digitos.includes(dni);
  });
  return porDni?.id ?? '';
};

/**
 * Carga masiva de recibos: se eligen varios PDF de una, cada uno se
 * asigna solo por el CUIL del nombre del archivo (con corrección
 * manual), y opcionalmente se firman como empleador al subir.
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
  const inputRef = useRef<HTMLInputElement>(null);

  const opciones = [
    { valor: '', etiqueta: 'Sin asignar — elegí…' },
    ...empleados.map((e) => ({
      valor: e.id,
      etiqueta: `${e.apellido}, ${e.nombre}`,
    })),
  ];

  const elegirArchivos = (lista: FileList | null) => {
    if (!lista) return;
    const nuevas: Fila[] = Array.from(lista)
      .filter((a) => a.type === 'application/pdf' || a.name.endsWith('.pdf'))
      .map((archivo) => ({
        archivo,
        empleadoId: detectarEmpleado(archivo.name, empleados),
        estado: 'listo' as const,
      }));
    setFilas((prev) => [...prev, ...nuevas]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const asignar = (i: number, empleadoId: string) =>
    setFilas((prev) =>
      prev.map((f, j) => (j === i ? { ...f, empleadoId } : f))
    );

  const quitar = (i: number) =>
    setFilas((prev) => prev.filter((_, j) => j !== i));

  const cerrar = () => {
    if (subiendo) return;
    setFilas([]);
    onCerrar();
  };

  const sinAsignar = filas.filter(
    (f) => f.estado !== 'subido' && !f.empleadoId
  ).length;
  const listas = filas.filter((f) => f.estado !== 'subido' && f.empleadoId);

  const subirTodo = async () => {
    if (listas.length === 0) return;
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
              onChange={(e) => elegirArchivos(e.target.files)}
            />
          </div>
        </div>

        <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
          Cada PDF se asigna solo si el nombre del archivo contiene el CUIL o
          DNI del colaborador (ej.{' '}
          <span className="font-semibold">20-30123456-7.pdf</span>). Lo que no
          se reconozca lo asignás a mano acá abajo.
        </p>

        {filas.length > 0 && (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {filas.map((f, i) => (
              <div
                key={`${f.archivo.name}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {f.archivo.name}
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
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                    Sin asignar
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
            disabled={subiendo || listas.length === 0}
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
