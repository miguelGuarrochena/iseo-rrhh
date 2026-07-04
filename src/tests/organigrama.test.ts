import { construirOrganigrama } from '@/lib/organigrama';
import { Empleado } from '@/types/rrhh';

const emp = (
  id: string,
  apellido: string,
  supervisorId: string | null,
  activo = true
): Empleado =>
  ({
    id,
    apellido,
    supervisorId,
    activo,
    nombre: id,
  }) as Empleado;

describe('construirOrganigrama', () => {
  const empleados = [
    emp('1', 'Ana', null),
    emp('2', 'Beto', '1'),
    emp('3', 'Cora', '1'),
    emp('4', 'Dino', '2'),
  ];

  it('arma el árbol desde reporta a', () => {
    const org = construirOrganigrama(empleados);
    expect(org).toHaveLength(1);
    expect(org[0].empleado.id).toBe('1');
    expect(org[0].hijos.map((h) => h.empleado.id)).toEqual(['2', '3']);
    expect(org[0].hijos[0].hijos[0].empleado.id).toBe('4');
  });

  it('trata como raíz a quien reporta a alguien inexistente', () => {
    const org = construirOrganigrama([emp('9', 'Zoe', 'inexistente')]);
    expect(org).toHaveLength(1);
    expect(org[0].empleado.id).toBe('9');
  });

  it('ignora empleados inactivos', () => {
    const org = construirOrganigrama([
      emp('1', 'Ana', null),
      emp('2', 'Beto', '1', false),
    ]);
    expect(org[0].hijos).toHaveLength(0);
  });
});
