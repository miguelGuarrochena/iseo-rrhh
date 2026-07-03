import { EstadoAusencia } from '@/types/rrhh';

const estilos: Record<EstadoAusencia, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-red-100 text-red-700',
};

const etiquetas: Record<EstadoAusencia, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export const EstadoBadge = ({ estado }: { estado: EstadoAusencia }) => (
  <span
    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${estilos[estado]}`}
  >
    {etiquetas[estado]}
  </span>
);
