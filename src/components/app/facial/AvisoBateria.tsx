'use client';

import { IconBattery1, IconBatteryCharging2 } from '@tabler/icons-react';
import { AlertaBateria, textoAvisoBateria } from '@/lib/dispositivo/bateria';

/**
 * Banner para cuando el dispositivo no da para reconocer la cara.
 * No bloquea el fichaje: avisa y manda a RRHH a cargarlo a mano.
 */
export const AvisoBateria = ({
  bateria,
  className = '',
}: {
  bateria: { alerta: AlertaBateria; nivel: number | null };
  className?: string;
}) => {
  if (bateria.nivel == null) return null;
  const texto = textoAvisoBateria(bateria.alerta, bateria.nivel);
  if (!texto) return null;

  const Icono =
    bateria.alerta === 'cargando' ? IconBatteryCharging2 : IconBattery1;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex w-full items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-left text-amber-900 ${className}`}
    >
      <Icono size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-bold">{texto.titulo}</p>
        <p className="mt-0.5 text-xs font-medium leading-relaxed">
          {texto.detalle}
        </p>
      </div>
    </div>
  );
};
