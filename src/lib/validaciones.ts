/**
 * Validaciones de formularios (formatos argentinos incluidos).
 * Devuelven un mensaje de error o null si el valor es válido.
 */

export const validarRequerido = (
  valor: string,
  etiqueta: string
): string | null => (valor.trim() ? null : `${etiqueta} es obligatorio.`);

export const validarEmail = (valor: string): string | null => {
  if (!valor.trim()) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim())
    ? null
    : 'El email no tiene un formato válido.';
};

/** Deja solo los dígitos: tolera puntos, guiones, espacios y barras. */
export const soloDigitosDoc = (valor: string): string =>
  valor.replace(/\D/g, '');

/**
 * Normaliza un CUIT/CUIL a sus 11 dígitos. Los Excel de las PyMEs traen
 * guiones, puntos, espacios o una mezcla de los tres según quién cargó
 * la fila; se guarda siempre el mismo formato para poder compararlos.
 */
export const normalizarCuit = (valor: string): string => soloDigitosDoc(valor);

export const validarDni = (valor: string): string | null => {
  if (!valor.trim()) return null;
  return /^\d{7,8}$/.test(soloDigitosDoc(valor))
    ? null
    : 'El DNI debe tener 7 u 8 números.';
};

/**
 * CUIT/CUIL con dígito verificador (módulo 11). Tolera cualquier
 * separador (guiones, puntos, espacios) porque los Excel de las PyMEs
 * vienen con los tres mezclados.
 */
export const validarCuit = (valor: string): string | null => {
  if (!valor.trim()) return null;
  const digitos = normalizarCuit(valor);
  if (!/^\d{11}$/.test(digitos)) {
    return 'El CUIT/CUIL debe tener 11 números (ej: 30-12345678-9).';
  }
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce(
    (acc, peso, i) => acc + peso * Number(digitos[i]),
    0
  );
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(digitos[10])
    ? null
    : 'El CUIT/CUIL no es válido (dígito verificador incorrecto).';
};

export const validarCbu = (valor: string): string | null => {
  if (!valor.trim()) return null;
  return /^\d{22}$/.test(valor.replace(/\s/g, ''))
    ? null
    : 'El CBU debe tener 22 números.';
};

export const validarTelefono = (valor: string): string | null => {
  if (!valor.trim()) return null;
  return /^[\d\s\-+()]{6,20}$/.test(valor.trim())
    ? null
    : 'El teléfono no tiene un formato válido.';
};

/** Junta errores de varios campos: devuelve solo los que fallaron. */
export const juntarErrores = (
  campos: Record<string, string | null>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(campos).filter(([, v]) => v !== null)
  ) as Record<string, string>;
