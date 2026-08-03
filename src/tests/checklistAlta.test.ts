import {
  categoriaDeChecklist,
  documentoDeChecklist,
  tildadosSinRespaldo,
} from '@/lib/checklistAlta';
import { ChecklistItem, DocumentoLegajo } from '@/types/rrhh';

const item = (
  id: string,
  etiqueta: string,
  completo = false
): ChecklistItem => ({
  id,
  etiqueta,
  completo,
});

const doc = (
  id: string,
  categoria: DocumentoLegajo['categoria'],
  nombre: string,
  creadoEn: string
): DocumentoLegajo => ({
  id,
  empleadoId: 'e1',
  categoria,
  nombre,
  archivoUrl: `/x/${id}.pdf`,
  creadoEn,
});

describe('categoriaDeChecklist', () => {
  it('mapea por id los ítems del alta por defecto', () => {
    expect(categoriaDeChecklist(item('chk-dni', 'DNI'))).toBe('dni');
    expect(categoriaDeChecklist(item('chk-contrato', 'Contrato firmado'))).toBe(
      'contrato'
    );
    expect(categoriaDeChecklist(item('chk-afip', 'Alta AFIP'))).toBe(
      'alta_afip'
    );
    expect(
      categoriaDeChecklist(item('chk-medico', 'Examen preocupacional'))
    ).toBe('estudio_medico');
  });

  it('cae al texto cuando la empresa usa ids propios', () => {
    expect(categoriaDeChecklist(item('x1', 'Copia del DNI'))).toBe('dni');
    expect(categoriaDeChecklist(item('x2', 'Contrato de trabajo'))).toBe(
      'contrato'
    );
  });

  it('tolera acentos y mayúsculas', () => {
    expect(categoriaDeChecklist(item('x3', 'EXAMEN MÉDICO'))).toBe(
      'estudio_medico'
    );
    expect(categoriaDeChecklist(item('x4', 'Capacitación inicial'))).toBe(
      'curso'
    );
  });

  it('no inventa categoría para un ítem sin correlato documental', () => {
    // "Entrega de notebook" es del checklist pero no es un papel del
    // legajo: no debe ofrecer subir nada.
    expect(categoriaDeChecklist(item('x5', 'Entrega de notebook'))).toBe(
      undefined
    );
  });
});

describe('documentoDeChecklist', () => {
  const docs = [
    doc('d1', 'dni', 'DNI viejo', '2024-01-01'),
    doc('d2', 'dni', 'DNI nuevo', '2026-01-01'),
  ];

  it('si hay varios de la categoría, vale el más reciente', () => {
    expect(documentoDeChecklist(item('chk-dni', 'DNI'), docs)?.nombre).toBe(
      'DNI nuevo'
    );
  });

  it('sin documento de esa categoría devuelve undefined', () => {
    expect(documentoDeChecklist(item('chk-afip', 'Alta AFIP'), docs)).toBe(
      undefined
    );
  });
});

describe('tildadosSinRespaldo', () => {
  it('marca lo tildado que no tiene documento detrás', () => {
    const docs = [doc('d1', 'dni', 'DNI', '2026-01-01')];
    const checklist = [
      item('chk-dni', 'DNI', true),
      item('chk-afip', 'Alta AFIP', true),
      item('chk-medico', 'Examen preocupacional', false),
    ];
    expect(tildadosSinRespaldo(checklist, docs).map((i) => i.id)).toEqual([
      'chk-afip',
    ]);
  });

  it('no marca ítems que no esperan documento', () => {
    const checklist = [item('x5', 'Entrega de notebook', true)];
    expect(tildadosSinRespaldo(checklist, [])).toEqual([]);
  });
});
