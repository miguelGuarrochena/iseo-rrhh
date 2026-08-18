'use client';

import type { ReactNode } from 'react';
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCircleCheck,
  IconEye,
  IconFocus2,
  IconHandStop,
  IconSun,
  IconSunOff,
  IconUser,
  IconUsers,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import type { MotivoRechazo } from '@/lib/facial/calidad';
import type { Fase } from '@/lib/facial/motor';
import type { Exigencia, Lado } from '@/lib/facial/liveness';

const iconoMotivo = (motivo: MotivoRechazo | null): ReactNode => {
  const props = { size: 22, stroke: 2 } as const;
  switch (motivo) {
    case 'lejos':
      return <IconZoomIn {...props} />;
    case 'cerca':
      return <IconZoomOut {...props} />;
    case 'descentrado':
      return <IconFocus2 {...props} />;
    case 'inclinado':
      return <IconUser {...props} />;
    case 'de_perfil':
      return <IconUser {...props} />;
    case 'cabeza_baja':
      return <IconArrowUp {...props} />;
    case 'ojos_cerrados':
      return <IconEye {...props} />;
    case 'oscuro':
      return <IconSun {...props} />;
    case 'quemado':
      return <IconSunOff {...props} />;
    case 'sin_contraste':
      return <IconSun {...props} />;
    case 'movido':
      return <IconHandStop {...props} />;
    case 'borroso':
      return <IconFocus2 {...props} />;
    case 'varios_rostros':
      return <IconUsers {...props} />;
    case 'sin_rostro':
      return <IconUser {...props} />;
    default:
      return <IconUser {...props} />;
  }
};

const colorAro = (fase: Fase, alineado: boolean): string => {
  if (fase === 'listo') return 'border-emerald-400';
  if (fase === 'capturando') return 'border-emerald-300';
  if (fase === 'desafio') return 'border-sky-300';
  if (fase === 'encuadrando' && alineado) return 'border-emerald-300';
  if (fase === 'encuadrando') return 'border-amber-300';
  return 'border-white/70';
};

const pasoActivo = (fase: Fase, procesando: boolean): 1 | 2 | 3 => {
  if (procesando || fase === 'listo') return 3;
  if (fase === 'capturando' || fase === 'desafio') return 2;
  return 1;
};

const etiquetasPaso = (exigencia: Exigencia): [string, string, string] => {
  if (exigencia === 'parpadeo_y_desafio') {
    return ['Encuadrar', 'Gesto', 'Listo'];
  }
  if (exigencia === 'parpadeo') {
    return ['Encuadrar', 'Parpadear', 'Listo'];
  }
  return ['Encuadrar', 'Capturar', 'Listo'];
};

const Paso = ({
  n,
  etiqueta,
  activo,
}: {
  n: number;
  etiqueta: string;
  activo: boolean;
}) => (
  <span
    className={`rounded-full px-2.5 py-1 text-[0.7rem] font-bold tracking-wide ${
      activo ? 'bg-white text-ink' : 'bg-white/15 text-white/70'
    }`}
  >
    {n}. {etiqueta}
  </span>
);

/** Silueta de referencia: dónde tiene que quedar la cara. */
const Silueta = () => (
  <svg
    viewBox="0 0 100 140"
    className="h-full w-full"
    aria-hidden
    fill="none"
    stroke="white"
    strokeWidth="2.2"
    strokeLinecap="round"
  >
    <ellipse cx="50" cy="52" rx="26" ry="34" opacity="0.85" />
    <circle cx="40" cy="48" r="3.2" fill="white" stroke="none" opacity="0.8" />
    <circle cx="60" cy="48" r="3.2" fill="white" stroke="none" opacity="0.8" />
    <path d="M40 64 Q50 72 60 64" opacity="0.7" />
    <path d="M24 96 Q50 128 76 96" opacity="0.75" />
  </svg>
);

const Esquina = ({ className }: { className: string }) => (
  <span aria-hidden className={`absolute h-5 w-5 border-white ${className}`} />
);

export const GuiaEncuadre = ({
  fase,
  mensaje,
  progreso,
  muestras,
  motivo,
  lado,
  procesando,
  exigencia = 'ninguna',
}: {
  fase: Fase;
  mensaje: string;
  progreso: number;
  muestras: number;
  motivo: MotivoRechazo | null;
  lado: Lado | null;
  procesando: boolean;
  exigencia?: Exigencia;
}) => {
  const tomas = Math.min(muestras, Math.round(progreso * muestras));
  const alineado = fase === 'encuadrando' && !motivo;
  const capturando = fase === 'capturando' || alineado;
  const mostrarSilueta =
    fase === 'buscando' || (fase === 'encuadrando' && !!motivo);
  const paso = pasoActivo(fase, procesando);
  const [p1, p2, p3] = etiquetasPaso(exigencia);
  const listo = procesando || fase === 'listo';
  const pideParpadeo = /parpade/i.test(mensaje);
  const enDesafio = fase === 'desafio';

  const icono =
    enDesafio && lado === 'izquierda' ? (
      <IconArrowLeft size={22} stroke={2} />
    ) : enDesafio && lado === 'derecha' ? (
      <IconArrowRight size={22} stroke={2} />
    ) : pideParpadeo ? (
      <IconEye size={22} stroke={2} />
    ) : capturando || listo ? (
      <IconCircleCheck size={22} stroke={2} />
    ) : (
      iconoMotivo(motivo)
    );

  const detalle = listo
    ? 'Ya está. Un segundo…'
    : enDesafio
      ? lado === 'izquierda'
        ? 'Girá hacia tu izquierda y volvé al frente.'
        : 'Girá hacia tu derecha y volvé al frente.'
      : pideParpadeo
        ? 'Un parpadeo natural alcanza. No hace falta apretar nada.'
        : capturando
          ? `Toma ${Math.max(1, tomas)} de ${muestras}. Quedate así.`
          : 'Poné la cara en el óvalo, de frente y quieto.';

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Oscurece fuera del óvalo para que el blanco sea la cara. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 25% 37.5% at 50% 50%, transparent 70%, rgba(15, 18, 28, 0.55) 71%)',
        }}
      />

      {enDesafio && (
        <div
          aria-hidden
          className={`absolute top-1/2 -translate-y-1/2 text-sky-200 ${
            lado === 'izquierda' ? 'left-3' : 'right-3'
          }`}
        >
          {lado === 'izquierda' ? (
            <IconArrowLeft size={52} stroke={2.2} />
          ) : (
            <IconArrowRight size={52} stroke={2.2} />
          )}
        </div>
      )}

      <div
        className={`absolute left-1/2 top-1/2 h-3/4 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] transition-colors duration-200 ${colorAro(
          fase,
          alineado
        )} ${capturando ? 'shadow-[0_0_0_6px_rgba(52,211,153,0.25)]' : ''} ${
          enDesafio ? 'shadow-[0_0_0_6px_rgba(56,189,248,0.3)]' : ''
        }`}
      >
        <Esquina className="left-[-6px] top-[-6px] rounded-tl-md border-l-[3px] border-t-[3px]" />
        <Esquina className="right-[-6px] top-[-6px] rounded-tr-md border-r-[3px] border-t-[3px]" />
        <Esquina className="bottom-[-6px] left-[-6px] rounded-bl-md border-b-[3px] border-l-[3px]" />
        <Esquina className="bottom-[-6px] right-[-6px] rounded-br-md border-b-[3px] border-r-[3px]" />
        {mostrarSilueta && (
          <div className="absolute inset-[12%] opacity-50">
            <Silueta />
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 top-0 flex justify-center gap-1.5 bg-gradient-to-b from-ink/70 to-transparent px-3 pb-8 pt-3">
        <Paso n={1} etiqueta={p1} activo={paso === 1} />
        <Paso n={2} etiqueta={p2} activo={paso === 2} />
        <Paso n={3} etiqueta={p3} activo={paso === 3} />
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-4 pb-3 pt-10">
        <div className="mb-3 flex justify-center gap-1.5">
          {Array.from({ length: muestras }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i < tomas ? 'bg-emerald-400' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-2.5 text-white">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
            {listo ? <IconCircleCheck size={22} stroke={2} /> : icono}
          </span>
          <div className="min-w-0 text-left">
            <p aria-live="polite" className="text-sm font-bold leading-snug">
              {mensaje}
            </p>
            <p className="text-xs font-medium text-white/75">{detalle}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
