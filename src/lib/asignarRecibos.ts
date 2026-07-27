/**
 * Asignación de PDFs de recibo a colaboradores por el nombre del archivo.
 *
 * Regla de oro: **ante la duda, sin asignar**. Un recibo que le llega a
 * la persona equivocada es una filtración de datos salariales; uno sin
 * asignar es un minuto de trabajo de RRHH. Por eso, cuando el nombre del
 * archivo da más de un candidato posible, se devuelve vacío y la
 * pantalla pide que lo asignen a mano.
 */

/** Datos mínimos que necesita el matcher de cada colaborador. */
export interface CandidatoRecibo {
  id: string;
  dni?: string;
  cuil?: string;
  numeroLegajo?: string;
}

const soloDigitos = (s: string): string => s.replace(/\D/g, '');

/**
 * Números "sueltos" del nombre del archivo: se corta por cualquier cosa
 * que no sea dígito. `27341555138-11. Noviembre 2025.pdf` da
 * ["27341555138", "11", "2025"].
 */
export const tokensNumericos = (nombreArchivo: string): string[] =>
  nombreArchivo.split(/\D+/).filter(Boolean);

/**
 * Los mismos tokens más las uniones de tokens contiguos, para tolerar
 * los CUIL escritos con guiones (`20-30123456-7` → también `20301234567`).
 */
const tokensYUniones = (nombreArchivo: string): Set<string> => {
  const tokens = tokensNumericos(nombreArchivo);
  const todos = new Set(tokens);
  for (let i = 0; i < tokens.length; i++) {
    let unido = tokens[i];
    for (let j = i + 1; j < tokens.length && j <= i + 3; j++) {
      unido += tokens[j];
      todos.add(unido);
    }
  }
  return todos;
};

/** Los candidatos cuyo campo `clave` coincide exactamente con algún token. */
const coincidencias = (
  candidatos: CandidatoRecibo[],
  tokens: Set<string>,
  valorDe: (c: CandidatoRecibo) => string,
  largoMinimo: number
): CandidatoRecibo[] =>
  candidatos.filter((c) => {
    const valor = soloDigitos(valorDe(c) ?? '');
    return valor.length >= largoMinimo && tokens.has(valor);
  });

export type MotivoSinAsignar = 'sin_coincidencia' | 'ambiguo';

export type AsignacionRecibo =
  | { empleadoId: string; por: 'cuil' | 'dni' | 'legajo' }
  | { empleadoId: ''; por: null; motivo: MotivoSinAsignar };

/**
 * Busca a quién pertenece el PDF por CUIL, DNI o legajo en el nombre del
 * archivo. Ej: `recibo-20-30123456-7-junio.pdf`.
 *
 * Se prueba en orden de confiabilidad (CUIL > DNI > legajo) y cada nivel
 * exige coincidencia **exacta** contra un número suelto del nombre. Antes
 * se buscaba el valor como subcadena de todos los dígitos concatenados,
 * y un legajo de un solo dígito matcheaba contra cualquier archivo que
 * tuviera ese número en la fecha: el recibo terminaba en el legajo
 * equivocado.
 */
export const asignarPorNombre = (
  nombreArchivo: string,
  candidatos: CandidatoRecibo[]
): AsignacionRecibo => {
  const tokens = tokensYUniones(nombreArchivo);

  const niveles: {
    por: 'cuil' | 'dni' | 'legajo';
    valorDe: (c: CandidatoRecibo) => string;
    largoMinimo: number;
  }[] = [
    { por: 'cuil', valorDe: (c) => c.cuil ?? '', largoMinimo: 11 },
    { por: 'dni', valorDe: (c) => c.dni ?? '', largoMinimo: 7 },
    // El legajo se acepta solo si tiene al menos 3 dígitos: los legajos
    // "1", "2", "13" son indistinguibles del mes o del día en el nombre.
    {
      por: 'legajo',
      valorDe: (c) => c.numeroLegajo ?? '',
      largoMinimo: 3,
    },
  ];

  for (const nivel of niveles) {
    const encontrados = coincidencias(
      candidatos,
      tokens,
      nivel.valorDe,
      nivel.largoMinimo
    );
    if (encontrados.length === 1) {
      return { empleadoId: encontrados[0].id, por: nivel.por };
    }
    if (encontrados.length > 1) {
      return { empleadoId: '', por: null, motivo: 'ambiguo' };
    }
  }

  return { empleadoId: '', por: null, motivo: 'sin_coincidencia' };
};

/**
 * Marca los archivos que quedaron asignados a la misma persona. Suele
 * pasar cuando el sistema de sueldos exporta un PDF único con toda la
 * nómina, o cuando el nombre del archivo no distingue a nadie: en los
 * dos casos alguien terminaría viendo el recibo de un compañero.
 */
export const idsDuplicados = (
  asignaciones: { empleadoId: string }[]
): Set<string> => {
  const cuenta = new Map<string, number>();
  for (const a of asignaciones) {
    if (!a.empleadoId) continue;
    cuenta.set(a.empleadoId, (cuenta.get(a.empleadoId) ?? 0) + 1);
  }
  return new Set(
    [...cuenta.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  );
};
