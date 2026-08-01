'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconBell,
  IconClockPlay,
  IconFileCertificate,
  IconFileCheck,
  IconHome,
  IconId,
  IconMenu2,
  IconMessages,
  IconPlaneDeparture,
} from '@tabler/icons-react';
import { DashboardMockup } from './DashboardMockup';

/** Accesos rápidos con los mismos nombres que usa la app. */
const accesos = [
  { icono: IconClockPlay, etiqueta: 'Fichar ingreso' },
  { icono: IconPlaneDeparture, etiqueta: 'Mis ausencias' },
  { icono: IconFileCertificate, etiqueta: 'Recibos' },
  { icono: IconMessages, etiqueta: 'Comunicaciones' },
  { icono: IconFileCheck, etiqueta: 'A firmar' },
  { icono: IconId, etiqueta: 'Mi legajo' },
];

const Telefono: React.FC = () => (
  <div className="flex h-full flex-col rounded-[1.1rem] bg-white">
    {/* Barra de estado */}
    <div className="flex items-center justify-between px-3 pt-2">
      <span className="text-[0.38rem] font-semibold text-navy">9:41</span>
      <span className="flex items-center gap-0.5">
        <span className="h-0.5 w-0.5 rounded-full bg-ink-soft" />
        <span className="h-0.5 w-0.5 rounded-full bg-ink-soft" />
        <span className="h-1 w-2 rounded-[1px] border border-ink-soft" />
      </span>
    </div>

    <div className="flex-1 px-3 pt-2">
      <p className="text-[0.5rem] font-extrabold leading-tight text-navy">
        ¡Hola, María!
      </p>
      <p className="text-[0.38rem] text-ink-soft">¿Qué querés hacer hoy?</p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {accesos.map(({ icono: Icono, etiqueta }, i) => (
          <motion.span
            key={etiqueta}
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.55 + i * 0.05 }}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-line bg-paper/60 px-1 py-2"
          >
            <Icono size={11} stroke={1.9} className="text-brand-600" />
            <span className="text-center text-[0.34rem] font-semibold leading-tight text-navy">
              {etiqueta}
            </span>
          </motion.span>
        ))}
      </div>
    </div>

    {/* Barra inferior */}
    <div className="flex items-center justify-around border-t border-line px-2 py-1.5">
      {[
        { icono: IconHome, etiqueta: 'Inicio', activo: true },
        { icono: IconBell, etiqueta: 'Notificaciones', activo: false },
        { icono: IconMenu2, etiqueta: 'Menú', activo: false },
      ].map(({ icono: Icono, etiqueta, activo }) => (
        <span
          key={etiqueta}
          className={`flex flex-col items-center gap-0.5 ${
            activo ? 'text-brand-600' : 'text-ink-soft'
          }`}
        >
          <Icono size={9} stroke={2} />
          <span className="text-[0.3rem] font-semibold">{etiqueta}</span>
        </span>
      ))}
    </div>
  </div>
);

/**
 * Notebook + celular con la app dibujada en HTML. No usa video ni
 * capturas: escala nítido en cualquier pantalla y pesa 0 KB.
 */
export const MockupHero: React.FC = () => (
  <div className="relative">
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* Notebook */}
      <div className="rounded-[0.9rem] bg-gradient-to-b from-[#2b3550] to-[#161d31] p-[0.35rem] shadow-lift ring-1 ring-black/10">
        <div className="aspect-[16/10] overflow-hidden rounded-[0.55rem] bg-white">
          <DashboardMockup />
        </div>
      </div>
      {/* Base */}
      <div className="relative mx-auto -mt-px h-2 w-[112%] -translate-x-[5.35%] rounded-b-[0.5rem] bg-gradient-to-b from-[#c9cfdd] to-[#9aa3b8] shadow-soft">
        <span className="absolute left-1/2 top-0 h-[0.28rem] w-[14%] -translate-x-1/2 rounded-b-full bg-[#7d879e]" />
      </div>
    </motion.div>

    {/* Celular */}
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="absolute -bottom-6 right-2 hidden w-[21%] min-w-[104px] sm:block lg:-right-2"
    >
      <div className="aspect-[9/18] rounded-[1.35rem] bg-gradient-to-b from-[#2b3550] to-[#161d31] p-[0.22rem] shadow-lift ring-1 ring-black/10">
        <div className="h-full overflow-hidden rounded-[1.15rem] bg-white">
          <Telefono />
        </div>
      </div>
    </motion.div>
  </div>
);
