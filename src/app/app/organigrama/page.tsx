'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useModulos } from '@/lib/auth/useModulos';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  actualizarEmpleado,
  getEmpleados,
  getEmpresa,
} from '@/lib/services/rrhh';
import {
  NodoOrgData,
  OrganigramaChart,
} from '@/components/app/organigrama/OrganigramaChart';
import { Empleado } from '@/types/rrhh';
import { RequireModulo } from '@/components/app/RequireModulo';

const RAIZ = '__root__';

const iniciales = (e: Empleado) =>
  `${e.nombre[0] ?? ''}${e.apellido[0] ?? ''}`.toUpperCase();

const OrganigramaPage = () => {
  const { rolEfectivo } = useAuth();
  const modulos = useModulos();
  const router = useRouter();
  const esAdmin = rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin';

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empresaNombre, setEmpresaNombre] = useState('Organización');
  const [selId, setSelId] = useState<string | null>(null);
  const [nuevoSupervisor, setNuevoSupervisor] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    void getEmpleados().then(setEmpleados);
  };

  useEffect(() => {
    cargar();
    void getEmpresa()
      .then((e) => e && setEmpresaNombre(e.nombre))
      .catch(() => {});
  }, []);

  const ids = useMemo(() => new Set(empleados.map((e) => e.id)), [empleados]);

  const data: NodoOrgData[] = useMemo(
    () => [
      {
        id: RAIZ,
        parentId: '',
        nombre: empresaNombre,
        puesto: '',
        iniciales: '',
        esRaiz: true,
      },
      ...empleados.map((e) => ({
        id: e.id,
        parentId:
          e.supervisorId && ids.has(e.supervisorId) ? e.supervisorId : RAIZ,
        nombre: `${e.nombre} ${e.apellido}`,
        puesto: e.puesto || '(sin puesto)',
        sector: e.sector || undefined,
        // Colgó de la raíz porque nunca tuvo supervisor (normal) vs porque
        // su supervisorId apunta a alguien que ya no está (dato roto: p.
        // ej. el supervisor fue dado de baja). Distinguirlo evita que se
        // vea como "gerencia general" algo que en realidad es un huérfano.
        supervisorRoto: Boolean(e.supervisorId && !ids.has(e.supervisorId)),
        iniciales: iniciales(e),
      })),
    ],
    [empleados, ids, empresaNombre]
  );

  const sinSector = useMemo(
    () => empleados.filter((e) => !e.sector).length,
    [empleados]
  );

  const sel = empleados.find((e) => e.id === selId) ?? null;

  /** Descendientes del empleado (para no crear ciclos al reasignar). */
  const descendientes = useMemo(() => {
    if (!selId) return new Set<string>();
    const hijos = new Map<string, string[]>();
    for (const e of empleados) {
      if (e.supervisorId) {
        const arr = hijos.get(e.supervisorId) ?? [];
        arr.push(e.id);
        hijos.set(e.supervisorId, arr);
      }
    }
    const res = new Set<string>();
    const pila = [selId];
    while (pila.length) {
      const actual = pila.pop()!;
      for (const h of hijos.get(actual) ?? []) {
        if (!res.has(h)) {
          res.add(h);
          pila.push(h);
        }
      }
    }
    return res;
  }, [selId, empleados]);

  const opcionesSupervisor = useMemo(() => {
    const posibles = empleados.filter(
      (e) => e.id !== selId && !descendientes.has(e.id)
    );
    return [
      { valor: '', etiqueta: 'Sin supervisor (reporta a la empresa)' },
      ...posibles.map((e) => ({
        valor: e.id,
        etiqueta: `${e.nombre} ${e.apellido} — ${e.puesto}`,
      })),
    ];
  }, [empleados, selId, descendientes]);

  const abrirNodo = (id: string) => {
    if (esAdmin) {
      const e = empleados.find((x) => x.id === id);
      setSelId(id);
      setNuevoSupervisor(e?.supervisorId ?? '');
    } else {
      router.push(`/colaboradores/${id}`);
    }
  };

  const reasignar = async () => {
    if (!selId) return;
    setGuardando(true);
    try {
      await actualizarEmpleado(selId, {
        supervisorId: nuevoSupervisor || null,
      });
      avisoExito('Organigrama actualizado', 'Se reasignó el reporte.');
      setSelId(null);
      cargar();
    } catch {
      avisoError('No pudimos reasignar', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // La sección se puede apagar por empresa desde Configuración. El menú
  // ya la esconde; esto cubre a quien llegue por la URL directa o por un
  // link viejo guardado en favoritos.
  if (modulos && modulos.organigrama === false) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Organigrama
        </h1>
        <p className="text-sm text-ink-soft">
          Esta empresa tiene el organigrama apagado.{' '}
          {esAdmin ? (
            <>
              Podés volver a prenderlo en{' '}
              <Link href="/configuracion" className="font-semibold underline">
                Configuración
              </Link>
              .
            </>
          ) : (
            'Consultalo con quien administra la empresa.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Organigrama
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          La estructura del equipo según quién reporta a quién.
          {esAdmin
            ? ' Tocá a una persona para cambiar su supervisor.'
            : ' Tocá a una persona para ver su ficha.'}
        </p>
      </div>

      <p className="flex items-center gap-2 rounded-xl bg-paper px-4 py-2.5 text-xs text-ink-soft">
        <IconInfoCircle size={14} className="shrink-0" />
        Arrastrá para moverte, usá la rueda para hacer zoom y tocá los botones
        de un nodo para plegar o desplegar sus ramas.
      </p>

      {esAdmin && sinSector > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          {sinSector}{' '}
          {sinSector === 1
            ? 'colaborador no tiene sector asignado'
            : 'colaboradores no tienen sector asignado'}
          . Se ven marcados en el organigrama.
        </p>
      )}

      {empleados.length === 0 ? (
        <Panel>
          <p className="text-sm text-ink-soft">
            No hay colaboradores para mostrar.
          </p>
        </Panel>
      ) : (
        <OrganigramaChart data={data} onNodo={abrirNodo} />
      )}

      <Modal
        opened={Boolean(sel)}
        onClose={() => setSelId(null)}
        title={sel ? `${sel.nombre} ${sel.apellido}` : ''}
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">
              Elegí a quién reporta {sel?.nombre}. El organigrama se reacomoda
              solo.
            </p>
            {sel && (
              <Link
                href={`/colaboradores/${sel.id}`}
                className="shrink-0 text-xs font-bold text-brand-700 underline"
              >
                Ver legajo
              </Link>
            )}
          </div>
          <CampoSelect
            etiqueta="Reporta a"
            value={nuevoSupervisor}
            onChange={setNuevoSupervisor}
            opciones={opcionesSupervisor}
          />
          <div className="flex gap-2">
            <Boton onClick={() => void reasignar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
            <Boton variante="secundario" onClick={() => setSelId(null)}>
              Cancelar
            </Boton>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const OrganigramaPageProtegida = () => (
  <RequireModulo modulo="organigrama">
    <OrganigramaPage />
  </RequireModulo>
);

export default OrganigramaPageProtegida;
