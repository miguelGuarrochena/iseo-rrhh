/**
 * Puente entre el checklist de alta y el legajo.
 *
 * El checklist decía "falta el contrato" y ahí terminaba: había que ir a
 * otra parte, subirlo, volver y tildarlo a mano. Nada garantizaba que lo
 * tildado se correspondiera con un documento real.
 *
 * Con esto cada ítem sabe qué categoría de documento lo respalda, así la
 * pantalla puede mostrar el que ya está y ofrecer subir el que falta sin
 * salir de la ficha.
 */
import {
  CategoriaDocumento,
  ChecklistItem,
  DocumentoLegajo,
} from '@/types/rrhh';

/** Por id de ítem, que es lo que usa el alta por defecto. */
const POR_ID: Record<string, CategoriaDocumento> = {
  'chk-dni': 'dni',
  'chk-contrato': 'contrato',
  'chk-afip': 'alta_afip',
  'chk-medico': 'estudio_medico',
};

/**
 * Por texto, para los checklists que cada empresa haya armado a mano con
 * otros ids. Se compara sin acentos ni mayúsculas.
 */
const POR_TEXTO: [RegExp, CategoriaDocumento][] = [
  [/\bdni\b|documento de identidad/, 'dni'],
  [/contrato/, 'contrato'],
  [/afip|alta temprana/, 'alta_afip'],
  [/preocupacional|examen medico|estudio medico|apto medico/, 'estudio_medico'],
  [/titulo|certificado de estudios/, 'titulo'],
  [/curso|capacitacion/, 'curso'],
];

const normalizar = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Qué documento del legajo respalda este ítem, si es que alguno lo hace. */
export const categoriaDeChecklist = (
  item: ChecklistItem
): CategoriaDocumento | undefined => {
  const porId = POR_ID[item.id];
  if (porId) return porId;
  const texto = normalizar(item.etiqueta);
  return POR_TEXTO.find(([re]) => re.test(texto))?.[1];
};

/**
 * El documento cargado que respalda al ítem. Si hay varios de la misma
 * categoría se devuelve el más reciente, que es el que vale.
 */
export const documentoDeChecklist = (
  item: ChecklistItem,
  documentos: DocumentoLegajo[]
): DocumentoLegajo | undefined => {
  const categoria = categoriaDeChecklist(item);
  if (!categoria) return undefined;
  return [...documentos]
    .filter((d) => d.categoria === categoria)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0];
};

/**
 * Ítems tildados que no tienen ningún documento que los respalde.
 *
 * No es un error —el alta de AFIP puede haberse hecho por fuera— pero es
 * lo que aparece vacío el día que alguien pide el legajo completo, así
 * que conviene que se vea.
 */
export const tildadosSinRespaldo = (
  checklist: ChecklistItem[],
  documentos: DocumentoLegajo[]
): ChecklistItem[] =>
  checklist.filter(
    (item) =>
      item.completo &&
      categoriaDeChecklist(item) !== undefined &&
      documentoDeChecklist(item, documentos) === undefined
  );
