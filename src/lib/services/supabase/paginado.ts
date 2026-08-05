/**
 * Paginación de lecturas contra PostgREST.
 *
 * El problema que resuelve: un `select()` sin `range()` se corta en las
 * primeras 1000 filas (`db-max-rows`) **sin devolver error**. En una
 * empresa de 50 personas, un mes de fichajes son ~3000 filas, así que
 * el resumen y el Excel salían incompletos y nada fallaba. Un dato
 * incorrecto que no avisa es peor que un error.
 *
 * Vive en su propio módulo para poder testearlo sin base de datos.
 */

/**
 * Tamaño de página. Coincide con el tope del servidor: si algún día se
 * sube `db-max-rows`, esto sigue siendo correcto (sólo hace más viajes
 * de los necesarios).
 */
export const PAGINA = 1000;

/**
 * Tope duro de filas por consulta. Existe para que un rango absurdo
 * —diez años de fichajes— no se coma la memoria del navegador en un
 * bucle silencioso. Si se alcanza es un caso que hay que resolver
 * acotando el filtro, no tragando 200 MB.
 */
export const TOPE_FILAS = 50_000;

export interface RespuestaPagina<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Ejecuta una consulta paginada hasta traer todas las filas.
 *
 * `consulta(desde, hasta)` tiene que aplicar `.range(desde, hasta)` y
 * devolver el resultado de Supabase. El orden lo pone quien llama y
 * tiene que ser **total** (por ejemplo `ts` + `id`): sin desempate, dos
 * filas con la misma clave de orden pueden repetirse o saltearse entre
 * página y página, que es un bug bastante peor que el que se arregla.
 *
 * `alFallar` traduce el error; se inyecta para no atar este módulo al
 * manejo de errores de `real.ts` y poder testearlo aislado.
 */
export const traerTodo = async <T>(
  consulta: (desde: number, hasta: number) => PromiseLike<RespuestaPagina<T>>,
  contexto: string,
  alFallar: (mensaje: string, contexto?: string) => never
): Promise<T[]> => {
  const todas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) alFallar(error.message, contexto);
    const pagina = data ?? [];
    todas.push(...pagina);
    // Una página incompleta significa que no hay más: es la única señal
    // que da PostgREST sin pedir el `count`, que cuesta un scan aparte.
    if (pagina.length < PAGINA) return todas;
    if (todas.length >= TOPE_FILAS) {
      alFallar(
        `La consulta de ${contexto} superó las ${TOPE_FILAS.toLocaleString('es-AR')} filas. Acotá el rango de fechas o los filtros.`,
        contexto
      );
    }
  }
};
