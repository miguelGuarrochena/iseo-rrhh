'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import {
  IconCheck,
  IconFileSpreadsheet,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Selector } from '@/components/app/ui/Selector';
import { expandirAnio, hoyISO } from '@/lib/fechas';
import {
  normalizarCuit,
  soloDigitosDoc,
  validarCuit,
  validarDni,
  validarEmail,
} from '@/lib/validaciones';
import { crearEmpleado } from '@/lib/services/rrhh';
import { ArchivoNoSoportado, leerFilasDeArchivo } from '@/lib/planillas';

/** Campos importables y sus alias típicos en los Excel de las PyMEs. */
const CAMPOS: { clave: string; etiqueta: string; alias: string[] }[] = [
  { clave: 'nombre', etiqueta: 'Nombre', alias: ['nombre', 'nombres'] },
  { clave: 'apellido', etiqueta: 'Apellido', alias: ['apellido', 'apellidos'] },
  {
    clave: 'dni',
    etiqueta: 'DNI',
    alias: ['dni', 'documento', 'nro documento', 'numero de documento', 'doc'],
  },
  { clave: 'cuil', etiqueta: 'CUIL', alias: ['cuil', 'cuit'] },
  { clave: 'email', etiqueta: 'Email', alias: ['email', 'mail', 'correo'] },
  {
    clave: 'telefono',
    etiqueta: 'Teléfono',
    alias: ['telefono', 'tel', 'celular', 'movil'],
  },
  {
    clave: 'puesto',
    etiqueta: 'Puesto',
    alias: ['puesto', 'cargo', 'posicion', 'funcion'],
  },
  {
    clave: 'sector',
    etiqueta: 'Sector',
    alias: ['sector', 'area', 'departamento'],
  },
  {
    clave: 'fechaIngreso',
    etiqueta: 'Fecha de ingreso',
    alias: [
      'fecha ingreso',
      'fecha de ingreso',
      'ingreso',
      'alta',
      'fecha alta',
    ],
  },
  {
    clave: 'fechaNacimiento',
    etiqueta: 'Fecha de nacimiento',
    alias: ['fecha nacimiento', 'fecha de nacimiento', 'nacimiento'],
  },
  {
    clave: 'domicilio',
    etiqueta: 'Domicilio',
    alias: ['domicilio', 'direccion'],
  },
  { clave: 'banco', etiqueta: 'Banco', alias: ['banco'] },
  { clave: 'cbu', etiqueta: 'CBU', alias: ['cbu'] },
  {
    clave: 'obraSocial',
    etiqueta: 'Obra social',
    alias: ['obra social', 'os'],
  },
  { clave: 'art', etiqueta: 'ART', alias: ['art'] },
];

const IGNORAR = '__ignorar__';

/** Tamaño máximo del Excel/CSV a importar (evita colgar la pestaña con
 * archivos gigantes; una nómina razonable pesa muchísimo menos). */
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** dd/mm/yyyy, dd-mm-yyyy o Date de Excel → YYYY-MM-DD */
const aFechaISO = (valor: unknown): string => {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const s = String(valor ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    // "85" en una fecha de nacimiento es 1985, no 2085.
    const anio = m[3].length === 2 ? String(expandirAnio(Number(m[3]))) : m[3];
    return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
};

interface FilaImporte {
  datos: Record<string, string>;
  errores: string[];
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onImportado: () => void;
}

/**
 * Importador de colaboradores desde Excel/CSV: detecta las columnas
 * por nombre, deja corregir el mapeo, valida fila por fila e importa
 * las válidas. Lo que falte se completa después en cada ficha.
 */
export const ImportarEmpleadosModal = ({
  abierto,
  onCerrar,
  onImportado,
}: Props) => {
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [resultado, setResultado] = useState<{
    ok: number;
    fallas: { quien: string; motivo: string }[];
  } | null>(null);

  const reiniciar = () => {
    setColumnas([]);
    setFilas([]);
    setMapeo({});
    setError(null);
    setResultado(null);
  };

  const cerrar = () => {
    reiniciar();
    onCerrar();
  };

  const leerArchivo = async (archivo: File) => {
    setError(null);
    setResultado(null);
    if (archivo.size > MAX_BYTES) {
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
      // Mapeo automático por nombre de columna
      const auto: Record<string, string> = {};
      cols.forEach((col) => {
        const n = normalizar(col);
        const campo = CAMPOS.find(
          (c) => c.alias.includes(n) || normalizar(c.etiqueta) === n
        );
        auto[col] = campo?.clave ?? IGNORAR;
      });
      setColumnas(cols);
      setFilas(datos);
      setMapeo(auto);
    } catch (e) {
      setError(
        e instanceof ArchivoNoSoportado
          ? e.message
          : 'No pudimos leer el archivo. Probá con .xlsx o .csv.'
      );
    }
  };

  /** Filas convertidas al modelo + validación por fila. */
  const preparadas: FilaImporte[] = useMemo(() => {
    if (filas.length === 0) return [];
    const vistos = new Set<string>();
    return filas.map((fila) => {
      const datos: Record<string, string> = {};
      columnas.forEach((col) => {
        const campo = mapeo[col];
        if (!campo || campo === IGNORAR) return;
        const bruto = fila[col];
        const valor = campo.startsWith('fecha')
          ? aFechaISO(bruto)
          : String(bruto ?? '').trim();
        if (valor) datos[campo] = valor;
      });
      // DNI y CUIL se guardan ya normalizados: los Excel traen puntos,
      // guiones y espacios mezclados y así se comparan sin sorpresas.
      if (datos.dni) datos.dni = soloDigitosDoc(datos.dni);
      if (datos.cuil) datos.cuil = normalizarCuit(datos.cuil);

      const errores: string[] = [];
      if (!datos.nombre) errores.push('falta nombre');
      if (!datos.apellido) errores.push('falta apellido');
      if (!datos.dni) errores.push('falta DNI');
      else if (validarDni(datos.dni)) errores.push('DNI inválido');
      else if (vistos.has(datos.dni))
        errores.push('DNI repetido en el archivo');
      else vistos.add(datos.dni);
      if (datos.cuil && validarCuit(datos.cuil)) errores.push('CUIL inválido');
      if (datos.email && validarEmail(datos.email))
        errores.push('email inválido');
      return { datos, errores };
    });
  }, [filas, columnas, mapeo]);

  const validas = preparadas.filter((f) => f.errores.length === 0);
  const invalidas = preparadas.length - validas.length;

  const importar = async () => {
    setImportando(true);
    let ok = 0;
    const fallas: { quien: string; motivo: string }[] = [];
    for (const fila of validas) {
      try {
        await crearEmpleado({
          nombre: fila.datos.nombre,
          apellido: fila.datos.apellido,
          dni: fila.datos.dni,
          cuil: fila.datos.cuil,
          email: fila.datos.email,
          telefono: fila.datos.telefono,
          domicilio: fila.datos.domicilio,
          fechaNacimiento: fila.datos.fechaNacimiento,
          puesto: fila.datos.puesto || 'A definir',
          sector: fila.datos.sector || 'General',
          fechaIngreso: fila.datos.fechaIngreso || hoyISO(),
          modalidadContratacion: 'indeterminado',
          banco: fila.datos.banco,
          cbu: fila.datos.cbu,
          obraSocial: fila.datos.obraSocial,
          art: fila.datos.art,
        });
        ok += 1;
      } catch (e) {
        // Se guarda el motivo real de cada fila: sin esto, el importador
        // decía solo "N fallaron" y no había manera de saber por qué.
        fallas.push({
          quien: `${fila.datos.apellido ?? '¿?'}, ${fila.datos.nombre ?? '¿?'} (DNI ${fila.datos.dni ?? '—'})`,
          motivo:
            e instanceof Error ? e.message : 'No pudimos crear el colaborador.',
        });
      }
    }
    setImportando(false);
    setResultado({ ok, fallas });
    onImportado();
  };

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title="Importar colaboradores desde Excel"
      radius="lg"
      centered
      size="xl"
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        {resultado ? (
          <>
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              Se importaron {resultado.ok} colaboradores.
            </p>
            {resultado.fallas.length > 0 && (
              <div className="rounded-xl bg-red-50 px-4 py-3">
                <p className="text-sm font-bold text-red-800">
                  {resultado.fallas.length}{' '}
                  {resultado.fallas.length === 1
                    ? 'fila no se pudo importar'
                    : 'filas no se pudieron importar'}
                  :
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {resultado.fallas.map((f, i) => (
                    <li
                      key={i}
                      className="text-xs leading-relaxed text-red-700"
                    >
                      <strong className="font-semibold">{f.quien}</strong> —{' '}
                      {f.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-ink-soft">
              Los datos que falten (foto, contacto de emergencia, CBU…) se
              completan entrando a cada ficha con &quot;Editar&quot;.
            </p>
            <Boton variante="negro" onClick={cerrar}>
              Listo
            </Boton>
          </>
        ) : filas.length === 0 ? (
          <>
            <label
              onDragOver={(e) => {
                // Sin cancelar dragover, el navegador abre el Excel.
                e.preventDefault();
                if (!arrastrando) setArrastrando(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setArrastrando(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                const archivo = e.dataTransfer.files?.[0];
                if (archivo) void leerArchivo(archivo);
              }}
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors ${
                arrastrando
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-line bg-paper/60 hover:border-brand-300'
              }`}
            >
              <IconFileSpreadsheet
                size={34}
                stroke={1.5}
                className="text-brand-600"
              />
              <span className="text-sm font-semibold text-ink">
                {arrastrando
                  ? 'Soltá el archivo acá'
                  : 'Arrastrá el Excel o hacé clic para elegirlo'}
              </span>
              <span className="text-xs text-ink-soft">
                .xlsx o .csv · una fila por persona
              </span>
              <input
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) void leerArchivo(archivo);
                }}
              />
            </label>

            <p className="text-xs leading-relaxed text-ink-soft">
              Reconocemos las columnas por su nombre. Alcanza con nombre,
              apellido y DNI; lo que falte se completa después en cada ficha.
            </p>
            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-bold text-ink">
                1. Revisá el mapeo de columnas
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                Detectamos estas columnas en tu archivo. Corregí las que no
                coincidan o marcalas como &quot;No importar&quot;.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {columnas.map((col) => (
                  <div
                    key={col}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper/50 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">
                      {col}
                    </span>
                    <Selector
                      tamano="sm"
                      valor={mapeo[col] ?? IGNORAR}
                      onCambiar={(v) =>
                        setMapeo((prev) => ({ ...prev, [col]: v }))
                      }
                      opciones={[
                        { valor: IGNORAR, etiqueta: 'No importar' },
                        ...CAMPOS.map((c) => ({
                          valor: c.clave,
                          etiqueta: c.etiqueta,
                        })),
                      ]}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-ink">2. Vista previa</h3>
              <div className="mt-2 flex flex-col gap-1.5">
                {preparadas.slice(0, 6).map((f, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm ${
                      f.errores.length === 0
                        ? 'border-line bg-surface'
                        : 'border-red-200 bg-red-50/60'
                    }`}
                  >
                    {f.errores.length === 0 ? (
                      <IconCheck
                        size={15}
                        className="shrink-0 text-emerald-600"
                      />
                    ) : (
                      <IconX size={15} className="shrink-0 text-red-600" />
                    )}
                    <span className="min-w-0 truncate font-semibold text-ink">
                      {f.datos.apellido ?? '¿?'}, {f.datos.nombre ?? '¿?'}
                    </span>
                    <span className="min-w-0 truncate text-xs text-ink-soft">
                      {f.errores.length === 0
                        ? `DNI ${f.datos.dni}${f.datos.puesto ? ` · ${f.datos.puesto}` : ''}`
                        : f.errores.join(', ')}
                    </span>
                  </div>
                ))}
                {preparadas.length > 6 && (
                  <p className="px-1 text-xs text-ink-soft">
                    … y {preparadas.length - 6} filas más.
                  </p>
                )}
              </div>
            </div>

            <p
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                invalidas > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              {validas.length} filas listas para importar
              {invalidas > 0 && ` · ${invalidas} con errores (se omiten)`}
            </p>

            <div className="flex gap-2">
              <Boton
                variante="negro"
                onClick={() => void importar()}
                disabled={importando || validas.length === 0}
                className="flex-1"
              >
                <IconUpload size={16} />
                {importando
                  ? 'Importando…'
                  : `Importar ${validas.length} colaboradores`}
              </Boton>
              <Boton variante="secundario" onClick={reiniciar}>
                Otro archivo
              </Boton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
