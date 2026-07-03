import { IconBarrierBlock } from '@tabler/icons-react';

/**
 * Placeholder para módulos aún no desarrollados.
 */
export const EnConstruccion = ({ titulo }: { titulo: string }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-soft/30 bg-surface/60 px-6 py-20 text-center">
    <IconBarrierBlock size={40} stroke={1.5} className="text-ink-soft" />
    <h1 className="mt-4 text-xl font-bold tracking-tight text-ink">{titulo}</h1>
    <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">
      Este módulo está en desarrollo. Muy pronto vas a poder usarlo desde acá.
    </p>
  </div>
);
