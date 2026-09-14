'use client';

import {
  ResultadoVerificacion,
  TEXTO_VERIFICACION,
} from '@/lib/constanciaFirma';
import {
  AVISO_FIRMA_SIN_SELLO,
  claseVerificacion,
  ETIQUETA_FIRMA_PENDIENTE,
  etiquetaFirmaConfirmada,
} from '@/lib/firmaReciboUi';
import { ReciboSueldo } from '@/types/rrhh';

export const FirmaBadge = ({
  recibo,
  fecha,
}: {
  recibo: ReciboSueldo;
  fecha?: string;
}) =>
  recibo.estadoFirma === 'firmado' ? (
    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
      {etiquetaFirmaConfirmada(fecha)}
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
      {ETIQUETA_FIRMA_PENDIENTE}
    </span>
  );

export const AvisoFirmaSinSello = () => (
  <p className="rounded-xl bg-paper px-4 py-3 text-xs leading-relaxed text-ink-soft">
    {AVISO_FIRMA_SIN_SELLO}
  </p>
);

const CLASE: Record<'ok' | 'alerta' | 'neutro', string> = {
  ok: 'bg-emerald-50 text-emerald-900',
  alerta: 'bg-red-50 text-red-800',
  neutro: 'bg-amber-50 text-amber-900',
};

/** Resultado de comparar el PDF actual con el hash guardado al firmar. */
export const ResultadoConstancia = ({
  resultado,
}: {
  resultado: ResultadoVerificacion;
}) => {
  const texto = TEXTO_VERIFICACION[resultado.estado];
  return (
    <div
      role="status"
      className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${CLASE[claseVerificacion(resultado.estado)]}`}
    >
      <p className="font-bold">{texto.titulo}</p>
      <p className="mt-1 text-xs">{texto.detalle}</p>
    </div>
  );
};
