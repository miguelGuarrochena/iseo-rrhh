/**
 * Mapear las columnas de una planilla ajena a los campos de la app.
 *
 * Ninguna PyME —ni ningún estudio contable— usa los mismos encabezados.
 * "DNI", "Documento", "Nro Documento" y "doc" son la misma columna, y
 * pedirle a RRHH que renombre el Excel antes de subirlo es pedirle que
 * no lo use.
 *
 * Así que se adivina por nombre y **se deja corregir**: el mapeo
 * automático es una comodidad, no una autoridad. Lo que no se reconoce
 * queda en `IGNORAR` y la persona decide.
 *
 * Esto salió de la importación de colaboradores, que lo tenía adentro
 * del componente. La importación de liquidaciones necesitaba lo mismo.
 */

/** Valor del mapeo para una columna que no se importa. */
export const IGNORAR = '__ignorar__';

/**
 * Encabezado comparable: sin acentos, sin mayúsculas, sin puntuación y
 * con los espacios colapsados. "Nro. Documento" y "nro documento" tienen
 * que dar lo mismo, porque para quien armó el Excel son lo mismo.
 */
export const normalizarEncabezado = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface CampoImportable {
  clave: string;
  etiqueta: string;
  /** Encabezados típicos, ya normalizados. */
  alias: string[];
}

/**
 * Adivina qué campo es cada columna.
 *
 * Un campo se asigna **una sola vez**: si el archivo trae "Sueldo" y
 * "Sueldo básico", las dos matchean el mismo alias y sumarlas dos veces
 * daría el doble. Gana la primera y la segunda queda para que la persona
 * la mapee a mano si corresponde.
 */
export const autoMapear = (
  columnas: string[],
  campos: CampoImportable[]
): Record<string, string> => {
  const usados = new Set<string>();
  const mapeo: Record<string, string> = {};
  columnas.forEach((columna) => {
    const n = normalizarEncabezado(columna);
    const campo = campos.find(
      (c) =>
        !usados.has(c.clave) &&
        (c.alias.includes(n) || normalizarEncabezado(c.etiqueta) === n)
    );
    if (campo) usados.add(campo.clave);
    mapeo[columna] = campo?.clave ?? IGNORAR;
  });
  return mapeo;
};

/** Los campos que quedaron sin ninguna columna asignada. */
export const camposSinMapear = (
  mapeo: Record<string, string>,
  campos: CampoImportable[]
): CampoImportable[] => {
  const asignados = new Set(Object.values(mapeo));
  return campos.filter((c) => !asignados.has(c.clave));
};
