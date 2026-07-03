'use client';

import { getUsuariosDemo } from '@/lib/services/rrhh';
import { Rol } from '@/types/rrhh';

const etiquetaRol: Record<Rol, string> = {
  superadmin: 'Superadmin',
  admin_rrhh: 'Admin RRHH',
  supervisor: 'Supervisor',
  empleado: 'Empleado',
};

interface DemoUserPickerProps {
  onElegir: (email: string) => void;
  deshabilitado?: boolean;
}

/**
 * Acceso rápido con usuarios de prueba (solo fase mock).
 * Se elimina cuando se conecte la autenticación real.
 */
export const DemoUserPicker = ({
  onElegir,
  deshabilitado,
}: DemoUserPickerProps) => (
  <div className="mt-6 rounded-2xl border border-dashed border-ink-soft/30 bg-surface/50 p-5">
    <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
      Modo demo — ingresá como
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      {getUsuariosDemo().map((u) => (
        <button
          key={u.id}
          onClick={() => onElegir(u.email)}
          disabled={deshabilitado}
          className="cursor-pointer rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-600 hover:text-brand-600 disabled:cursor-default disabled:opacity-60"
        >
          {etiquetaRol[u.rol]}
          <span className="ml-1.5 font-normal text-ink-soft">
            · {u.nombreCompleto.split(' ')[0]}
          </span>
        </button>
      ))}
    </div>
  </div>
);
