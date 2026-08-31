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
 * Y adivinar tiene grados. Una cosa es que el encabezado sea exactamente
 * un alias conocido, y otra que se le parezca. Lo segundo alcanza para
 * proponer, no para dar por hecho: un importe mapeado al campo
 * equivocado no se nota en la pantalla —los números están todos— y
 * aparece el día que alguien cobra de menos. Por eso `sugerirMapeo`
 * devuelve con qué certeza adivinó, y quien lo use decide qué exigir
 * confirmar.
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

/**
 * Con cuánta seguridad se reconoció una columna.
 *
 *  - `exacta`: el encabezado **es** un alias conocido. Se puede dar por
 *    bueno sin preguntar.
 *  - `aproximada`: se le parece. Sirve para proponer; no para decidir.
 *  - `ninguna`: no se reconoció. Queda en `IGNORAR` y decide la persona.
 */
export type Certeza = 'exacta' | 'aproximada' | 'ninguna';

export interface Sugerencia {
  campo: string;
  certeza: Certeza;
}

/** Las palabras del encabezado, para comparar por partes. */
const palabras = (s: string): string[] =>
  normalizarEncabezado(s).split(' ').filter(Boolean);

/**
 * ¿Se parecen lo bastante como para proponerlo?
 *
 * El criterio es de contención por palabras completas: "sueldo basico
 * del mes" contiene "sueldo basico", y "basico" está dentro de "sueldo
 * basico". No se usa distancia de edición ni nada por el estilo — con
 * encabezados de dos o tres palabras, "parecido" por letras confunde
 * más de lo que ayuda ("retenciones" y "retribuciones" difieren en tres
 * caracteres y son cosas opuestas).
 *
 * Las palabras cortas o de puros dígitos no cuentan: si no, "Hs 50" y
 * "Hs 100" se parecerían por el "hs".
 *
 * Y hacen falta **dos** palabras significativas en común. Con una sola
 * alcanzaba para que "Sueldo básico del mes" se pareciera al alias "mes"
 * del período: una palabra suelta adentro de un encabezado largo no es
 * evidencia de nada. Un encabezado de una sola palabra, entonces, o es
 * un alias exacto o no se propone.
 */
const seParecen = (encabezado: string, alias: string): boolean => {
  const significativa = (p: string) => p.length > 2 && !/^\d+$/.test(p);
  const a = palabras(encabezado).filter(significativa);
  const b = palabras(alias).filter(significativa);
  if (a.length < 2 || b.length < 2) return false;

  const enA = new Set(a);
  const enB = new Set(b);
  // El alias entero está en el encabezado, o el encabezado en el alias.
  return b.every((p) => enA.has(p)) || a.every((p) => enB.has(p));
};

/**
 * Propone un campo para cada columna, diciendo con qué certeza.
 *
 * Primero se resuelven todas las coincidencias exactas y recién después
 * las aproximadas: si el archivo trae "Sueldo" y "Sueldo del mes", la
 * exacta se queda con el campo y la otra no lo puede robar por haber
 * aparecido antes.
 *
 * Un campo se asigna **una sola vez**. Dos columnas al mismo campo se
 * sumarían dos veces, y es el error que da un bruto del doble sin que
 * nada se vea raro en pantalla.
 */
export const sugerirMapeo = (
  columnas: string[],
  campos: CampoImportable[]
): Record<string, Sugerencia> => {
  const usados = new Set<string>();
  const sugerencias: Record<string, Sugerencia> = {};

  const exacto = (n: string) =>
    campos.find(
      (c) =>
        !usados.has(c.clave) &&
        (c.alias.includes(n) || normalizarEncabezado(c.etiqueta) === n)
    );

  columnas.forEach((columna) => {
    const campo = exacto(normalizarEncabezado(columna));
    if (campo) {
      usados.add(campo.clave);
      sugerencias[columna] = { campo: campo.clave, certeza: 'exacta' };
    }
  });

  columnas.forEach((columna) => {
    if (sugerencias[columna]) return;
    const campo = campos.find(
      (c) =>
        !usados.has(c.clave) &&
        (c.alias.some((a) => seParecen(columna, a)) ||
          seParecen(columna, c.etiqueta))
    );
    if (campo) {
      usados.add(campo.clave);
      sugerencias[columna] = { campo: campo.clave, certeza: 'aproximada' };
    } else {
      sugerencias[columna] = { campo: IGNORAR, certeza: 'ninguna' };
    }
  });

  return sugerencias;
};

/** El mapeo suelto de un conjunto de sugerencias. */
export const mapeoDeSugerencias = (
  sugerencias: Record<string, Sugerencia>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(sugerencias).map(([col, s]) => [col, s.campo])
  );

/** Los campos que quedaron sin ninguna columna asignada. */
export const camposSinMapear = (
  mapeo: Record<string, string>,
  campos: CampoImportable[]
): CampoImportable[] => {
  const asignados = new Set(Object.values(mapeo));
  return campos.filter((c) => !asignados.has(c.clave));
};
