/**
 * Parámetros legales con vigencia.
 *
 * Un valor legal que cambia en el tiempo no es un número: es un número
 * **con un período en el que rige**. Si alguien carga el tope de octubre
 * y después se recalcula una liquidación de agosto, agosto tiene que
 * seguir usando el valor de agosto.
 *
 * Este módulo resuelve esa pregunta —"¿cuánto valía en tal período?"—
 * sobre una lista de vigencias, sin base y sin React.
 *
 * Qué NO está acá: los valores que no cambian. Los aportes (11/3/3), el
 * tope de deducciones del art. 133, el del adelanto del art. 130, los
 * recargos de extras del art. 201 y la jornada de 192 horas siguen como
 * constantes en `remuneraciones.ts`, al lado del cálculo que las usa.
 * Moverlas acá sería esconderlas detrás de una tabla que nadie va a
 * editar nunca.
 *
 * **Tampoco está el tope imponible de aportes.** Se pensó para acá, pero
 * el cliente decidió que ese valor lo carga cada empresa y es
 * obligatorio: vive en `empresas.config.topeImponibleAportes` y lo
 * resuelve `remuneraciones.ts`. Traerlo a esta tabla pondría a ISEO a
 * mantenerlo al día para todas las empresas, que es exactamente lo
 * contrario de lo que se pidió.
 *
 * Hoy, entonces, no hay ningún parámetro central en uso. La tabla y
 * estas funciones quedan porque la pregunta que resuelven —"¿cuánto
 * valía en tal período?"— va a volver a hacer falta; ningún valor se
 * siembra desde el código.
 */

export interface ParametroLegal {
  id: string;
  clave: string;
  valor: number;
  /** YYYY-MM, inclusive. */
  vigenciaDesde: string;
  /** YYYY-MM, inclusive. `undefined` = sigue vigente. */
  vigenciaHasta?: string;
  fuente?: string;
  observacion?: string;
  actualizadoEn?: string;
  actualizadoPor?: string;
}

export interface NuevoParametroLegal {
  clave: string;
  valor: number;
  vigenciaDesde: string;
  vigenciaHasta?: string;
  fuente?: string;
  observacion?: string;
}

/**
 * ¿Ese parámetro rige en ese período?
 *
 * Los dos extremos son inclusivos y se comparan como texto: "YYYY-MM"
 * ordena lexicográficamente igual que cronológicamente, y así no entra
 * ningún huso horario en una pregunta que es de calendario.
 */
export const rigeEn = (p: ParametroLegal, periodo: string): boolean =>
  p.vigenciaDesde <= periodo &&
  (p.vigenciaHasta === undefined || p.vigenciaHasta >= periodo);

/**
 * El valor que regía en un período, o `undefined` si no hay ninguno.
 *
 * Espejo exacto de `parametro_legal_vigente()` en la base (migración
 * 104): si hubiera más de un rango que contiene al período, gana el de
 * `vigenciaDesde` más alto — el último cargado.
 *
 * **Nunca devuelve un default.** Quien llama decide qué hacer con la
 * ausencia; inventar un número acá sería inventar una regla legal.
 */
export const valorVigente = (
  parametros: ParametroLegal[],
  clave: string,
  periodo: string
): number | undefined => {
  const candidatos = parametros
    .filter((p) => p.clave === clave && rigeEn(p, periodo))
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
  return candidatos[0]?.valor;
};

/**
 * Solapamientos entre vigencias del mismo parámetro.
 *
 * No se bloquea cargarlos —a veces se corrige un rango cargando otro
 * encima— pero conviene decirlo: dos rangos que se pisan significan que
 * el período compartido se resuelve por "el último desde gana", y eso
 * es una decisión que quien carga debería tomar a propósito.
 */
export const solapamientos = (
  parametros: ParametroLegal[],
  nuevo: NuevoParametroLegal
): ParametroLegal[] =>
  parametros.filter(
    (p) =>
      p.clave === nuevo.clave &&
      p.vigenciaDesde <= (nuevo.vigenciaHasta ?? '9999-12') &&
      (p.vigenciaHasta ?? '9999-12') >= nuevo.vigenciaDesde
  );

/** El error de un rango mal armado, o null. */
export const errorDeVigencia = (p: NuevoParametroLegal): string | null => {
  const formato = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
  if (!formato.test(p.vigenciaDesde)) {
    return 'La vigencia desde tiene que ser un período válido (YYYY-MM).';
  }
  if (p.vigenciaHasta && !formato.test(p.vigenciaHasta)) {
    return 'La vigencia hasta tiene que ser un período válido (YYYY-MM).';
  }
  if (p.vigenciaHasta && p.vigenciaHasta < p.vigenciaDesde) {
    return 'La vigencia hasta no puede ser anterior a la vigencia desde.';
  }
  if (!Number.isFinite(p.valor) || p.valor <= 0) {
    return 'El valor tiene que ser mayor a cero.';
  }
  return null;
};
