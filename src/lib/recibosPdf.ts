/**
 * Identifica de quién es cada página de un PDF de recibos, leyendo el
 * CUIL o el DNI que figura impreso adentro.
 *
 * Por qué mirar el contenido y no el nombre del archivo: el nombre lo
 * pone el sistema de sueldos y cambia de empresa en empresa, mientras que
 * el CUIL impreso en el recibo es el dato correcto por definición. Y es
 * la única forma de detectar el caso peligroso: el export con toda la
 * nómina en un solo archivo, que si se sube entero termina mostrándole a
 * una persona el recibo de sus compañeros.
 *
 * Este módulo es lógica pura sobre texto ya extraído; leer el PDF y
 * cortarlo viven en `pdfArchivos.ts`, que sí depende de librerías.
 */

import { soloDigitosDoc } from '@/lib/validaciones';

/** Datos mínimos de cada colaborador para poder reconocerlo. */
export interface CandidatoRecibo {
  id: string;
  dni?: string;
  cuil?: string;
}

/**
 * Un CUIT/CUIL impreso: 11 dígitos, con o sin guiones o puntos. Se pide
 * que no venga pegado a otros números para no cortar por la mitad un
 * importe largo.
 */
const RE_CUIL = /(?<!\d)(\d{2})[-.\s]?(\d{8})[-.\s]?(\d)(?!\d)/g;

/**
 * Un DNI suelto: 7 u 8 dígitos, opcionalmente con puntos de miles.
 *
 * Los dos filtros del final hacen falta y son distintos:
 *
 * - `(?!\d)` corta los números más largos. Sin esto, de `112025000`
 *   (un período pegado a un código) se leen los primeros 8 dígitos.
 * - `(?![.,]\d)` corta los importes. En un recibo argentino un monto se
 *   escribe `1.707.317,07`, que tiene exactamente la misma forma que un
 *   DNI con puntos; sin esto, cada importe se lee como un documento.
 *
 * El lookbehind cumple la función simétrica: descarta lo que sea la cola
 * de un número más largo o venga precedido por `$`.
 */
const RE_DNI = /(?<![\d$.,])(\d{1,3}\.\d{3}\.\d{3}|\d{7,8})(?!\d)(?![.,]\d)/g;

/** Todos los CUIL que aparecen en el texto, normalizados a 11 dígitos. */
export const cuilsEnTexto = (texto: string): string[] => {
  const encontrados = new Set<string>();
  for (const m of texto.matchAll(RE_CUIL)) {
    encontrados.add(`${m[1]}${m[2]}${m[3]}`);
  }
  return [...encontrados];
};

/** Todos los DNI que aparecen en el texto, sin puntos. */
export const dnisEnTexto = (texto: string): string[] => {
  const encontrados = new Set<string>();
  for (const m of texto.matchAll(RE_DNI)) {
    encontrados.add(soloDigitosDoc(m[1]));
  }
  return [...encontrados];
};

/**
 * Etiquetas con las que los sistemas de sueldos rotulan a la persona.
 * Se corta en dos espacios seguidos o en la etiqueta siguiente, porque
 * el texto extraído del PDF viene todo en una línea.
 */
const RE_NOMBRE =
  /(?:apellido\s*y\s*nombres?|apellido\/nombre|nombre\s*y\s*apellido|empleado|trabajador|nombre)\s*[:\-]\s*([^:]{3,60}?)(?:\s{2,}|\s+(?:cuil|cuit|dni|documento|legajo|categor|secci|fecha|ingreso|periodo|período)\b|$)/i;

/**
 * Nombre de la persona tal como figura impreso, si se puede leer.
 *
 * Sirve para que RRHH sepa de quién es una página que no pudimos
 * atribuir: sin esto sólo ve "sin identificar" y tiene que abrir el PDF.
 */
export const nombreEnTexto = (texto: string): string | null => {
  const m = texto.match(RE_NOMBRE);
  if (!m) return null;
  const limpio = m[1]
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
    .trim();
  // Descarta capturas que son sólo números o quedaron demasiado cortas.
  if (limpio.length < 3 || !/[a-záéíóúñ]/i.test(limpio)) return null;
  return limpio;
};

export type MotivoSinDueno =
  | 'sin_documento' // no se leyó ningún CUIL/DNI (¿PDF escaneado?)
  | 'desconocido' // se leyó un documento, pero no es de nadie de la empresa
  | 'varios'; // la página menciona a más de un colaborador

export type DuenoDePagina =
  | { ok: true; empleadoId: string; por: 'cuil' | 'dni' }
  | { ok: false; motivo: MotivoSinDueno };

/**
 * De quién es una página, según los documentos que aparecen impresos.
 *
 * El CUIL manda sobre el DNI: es más específico y es el que el recibo
 * lleva siempre. Si la página nombra a dos personas distintas se
 * devuelve `varios` en vez de elegir una: prefiero que RRHH lo resuelva
 * a mano antes que mandarle a alguien el recibo de otro.
 *
 * `cuitEmpleador` se descuenta antes de mirar nada. Todas las hojas del
 * recibo llevan el CUIT de la empresa en el encabezado, incluido el
 * duplicado; si no se excluye, una hoja de continuación parece tener un
 * documento "de alguien desconocido" y se rompe el agrupado.
 */
export const duenoDePagina = (
  texto: string,
  candidatos: CandidatoRecibo[],
  cuitEmpleador?: string
): DuenoDePagina => {
  const porCuil = new Map<string, string>();
  const porDni = new Map<string, string>();
  for (const c of candidatos) {
    const cuil = soloDigitosDoc(c.cuil ?? '');
    if (cuil.length === 11) porCuil.set(cuil, c.id);
    const dni = soloDigitosDoc(c.dni ?? '');
    if (dni.length >= 7) porDni.set(dni, c.id);
  }

  const cuitEmpresa = soloDigitosDoc(cuitEmpleador ?? '');
  const cuils = cuilsEnTexto(texto).filter((c) => c !== cuitEmpresa);
  const dnis = dnisEnTexto(texto).filter(
    // El CUIT de la empresa también aparece "adentro" como si fuera un
    // DNI de 8 dígitos; no debe contar como documento de una persona.
    (d) => !cuitEmpresa || !cuitEmpresa.includes(d)
  );
  if (cuils.length === 0 && dnis.length === 0) {
    return { ok: false, motivo: 'sin_documento' };
  }

  const idsPorCuil = new Set(
    cuils.map((c) => porCuil.get(c)).filter((x): x is string => Boolean(x))
  );
  if (idsPorCuil.size === 1) {
    return { ok: true, empleadoId: [...idsPorCuil][0], por: 'cuil' };
  }
  if (idsPorCuil.size > 1) return { ok: false, motivo: 'varios' };

  const idsPorDni = new Set(
    dnis.map((d) => porDni.get(d)).filter((x): x is string => Boolean(x))
  );
  if (idsPorDni.size === 1) {
    return { ok: true, empleadoId: [...idsPorDni][0], por: 'dni' };
  }
  if (idsPorDni.size > 1) return { ok: false, motivo: 'varios' };

  return { ok: false, motivo: 'desconocido' };
};

/**
 * Lo que se pudo leer de un tramo que no se supo atribuir. Es lo que le
 * permite a RRHH resolverlo sin abrir el PDF.
 */
export interface PistaTramo {
  /** Nombre impreso en el recibo, si se pudo leer. */
  nombre?: string;
  /** CUIL/DNI encontrados que no son de nadie cargado en el sistema. */
  documentos: string[];
}

/** Un tramo de páginas contiguas que pertenecen a la misma persona. */
export interface TramoRecibo {
  empleadoId: string | null;
  /** Índices de página, base 0, en el orden del PDF original. */
  paginas: number[];
  motivo?: MotivoSinDueno;
  /** Sólo para los tramos sin dueño: de quién parece ser. */
  pista?: PistaTramo;
}

/**
 * Agrupa las páginas del PDF en tramos por persona.
 *
 * Un recibo suele ocupar más de una hoja (original y duplicado), y la
 * segunda no siempre repite el CUIL. Por eso, una página sin documento
 * propio se considera continuación de la anterior.
 *
 * Ojo con la sutileza: continúa sólo si la hoja no trae **ningún**
 * documento de persona. Si trae el CUIL de alguien que no está cargado
 * en el sistema, arranca un tramo nuevo sin dueño en vez de pegarse al
 * recibo anterior — si no, esa persona recibiría el recibo de un
 * desconocido, que es justo lo que estamos tratando de evitar.
 */
export const agruparPorDueno = (
  textosPorPagina: string[],
  candidatos: CandidatoRecibo[],
  cuitEmpleador?: string
): TramoRecibo[] => {
  const tramos: TramoRecibo[] = [];

  textosPorPagina.forEach((texto, i) => {
    const dueno = duenoDePagina(texto, candidatos, cuitEmpleador);
    const ultimo = tramos[tramos.length - 1];

    if (dueno.ok === true) {
      // Misma persona que la página anterior: es la continuación.
      if (ultimo && ultimo.empleadoId === dueno.empleadoId) {
        ultimo.paginas.push(i);
      } else {
        tramos.push({ empleadoId: dueno.empleadoId, paginas: [i] });
      }
      return;
    }

    // Sin documento legible: continúa el recibo anterior si lo hay. Es el
    // duplicado, que muchas veces no vuelve a imprimir el CUIL.
    if (dueno.motivo === 'sin_documento' && ultimo) {
      ultimo.paginas.push(i);
      // El duplicado sí suele repetir el nombre: si el tramo quedó sin
      // dueño y todavía no sabíamos de quién era, sirve como pista.
      if (ultimo.pista && !ultimo.pista.nombre) {
        ultimo.pista.nombre = nombreEnTexto(texto) ?? undefined;
      }
      return;
    }

    // Sin dueño: se guarda lo que se haya podido leer para mostrarlo.
    const cuitEmpresa = soloDigitosDoc(cuitEmpleador ?? '');
    tramos.push({
      empleadoId: null,
      paginas: [i],
      motivo: dueno.motivo,
      pista: {
        nombre: nombreEnTexto(texto) ?? undefined,
        documentos: [
          ...cuilsEnTexto(texto).filter((c) => c !== cuitEmpresa),
          ...dnisEnTexto(texto).filter(
            (d) => !cuitEmpresa || !cuitEmpresa.includes(d)
          ),
        ],
      },
    });
  });

  return tramos;
};

export type TipoDeArchivo =
  | { tipo: 'individual'; empleadoId: string }
  | { tipo: 'consolidado'; personas: number }
  | { tipo: 'ilegible' } // PDF escaneado o sin capa de texto
  | { tipo: 'desconocido' }; // se leyó, pero no matchea con nadie

/**
 * Qué clase de archivo nos dieron. Es la pregunta que la pantalla
 * necesita responder antes de dejar subir nada.
 *
 * Un archivo es `individual` sólo si **todas** sus páginas son de la
 * misma persona. Alcanza con que haya un tramo sin dueño para tratarlo
 * como consolidado y cortarlo: si no, esas páginas viajarían pegadas al
 * recibo de quien sí reconocimos, y esa persona terminaría viendo el
 * sueldo de un compañero que el sistema no supo identificar. Es el caso
 * exacto que apareció al probar con un PDF de tres personas donde sólo
 * una tenía el CUIL cargado en su ficha.
 */
export const clasificarArchivo = (tramos: TramoRecibo[]): TipoDeArchivo => {
  const personas = new Set(
    tramos.map((t) => t.empleadoId).filter((x): x is string => Boolean(x))
  );
  const hayPaginasSinDuenio = tramos.some((t) => !t.empleadoId);

  if (personas.size > 1 || (personas.size === 1 && hayPaginasSinDuenio)) {
    return { tipo: 'consolidado', personas: personas.size };
  }
  if (personas.size === 1) {
    return { tipo: 'individual', empleadoId: [...personas][0] };
  }
  // Nadie identificado: distinguimos "no había texto" de "había pero no
  // es de esta empresa", porque se arreglan de maneras distintas.
  const algoLegible = tramos.some((t) => t.motivo !== 'sin_documento');
  return algoLegible ? { tipo: 'desconocido' } : { tipo: 'ilegible' };
};
