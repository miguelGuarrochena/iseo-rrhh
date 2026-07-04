/**
 * Arma el organigrama de la empresa a partir de la relación "reporta a"
 * (supervisorId) de cada empleado. Devuelve el bosque de raíces (quienes
 * no reportan a nadie dentro de la empresa) con sus subordinados anidados.
 */
import { Empleado } from '@/types/rrhh';

export interface NodoOrg {
  empleado: Empleado;
  hijos: NodoOrg[];
}

const porApellido = (a: Empleado, b: Empleado) =>
  a.apellido.localeCompare(b.apellido);

export const construirOrganigrama = (empleados: Empleado[]): NodoOrg[] => {
  const activos = empleados.filter((e) => e.activo);
  const ids = new Set(activos.map((e) => e.id));

  const hijosDe = new Map<string, Empleado[]>();
  const raices: Empleado[] = [];

  for (const e of activos) {
    if (e.supervisorId && ids.has(e.supervisorId)) {
      const arr = hijosDe.get(e.supervisorId) ?? [];
      arr.push(e);
      hijosDe.set(e.supervisorId, arr);
    } else {
      raices.push(e);
    }
  }

  const armar = (e: Empleado): NodoOrg => ({
    empleado: e,
    hijos: (hijosDe.get(e.id) ?? []).sort(porApellido).map(armar),
  });

  return raices.sort(porApellido).map(armar);
};
