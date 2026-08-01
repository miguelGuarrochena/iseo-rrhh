'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconAlertTriangle,
  IconBell,
  IconCalendarEvent,
  IconClockCheck,
  IconHome,
  IconId,
  IconInbox,
  IconMenu2,
  IconMoon,
  IconPlaneDeparture,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import { DashboardMockup } from './DashboardMockup';

/** Los mismos indicadores que muestra el inicio de la app. */
const indicadores = [
  {
    icono: IconInbox,
    etiqueta: 'Por aprobar',
    valor: '2',
    pie: 'solicitudes de ausencia',
  },
  {
    icono: IconClockCheck,
    etiqueta: 'Presentes hoy',
    valor: '11/12',
    pie: 'ficharon ingreso',
  },
  {
    icono: IconAlertTriangle,
    etiqueta: 'Vencimientos',
    valor: '1',
    pie: 'próximos a vencer',
  },
  {
    icono: IconUsers,
    etiqueta: 'Colaboradores',
    valor: '12',
    pie: 'activos',
  },
];

/** Barra inferior, igual que `BottomNav` en la app. */
const barraInferior = [
  { icono: IconHome, etiqueta: 'Inicio', activo: true },
  { icono: IconUsers, etiqueta: 'Colaboradores', activo: false },
  { icono: IconId, etiqueta: 'Mi legajo', activo: false },
  { icono: IconPlaneDeparture, etiqueta: 'Ausencias', activo: false },
  { icono: IconMenu2, etiqueta: 'Más', activo: false },
];

const Telefono: React.FC = () => (
  <div className="flex h-full flex-col bg-paper/60">
    {/* Encabezado de la app */}
    <div className="m-1.5 flex items-center justify-between rounded-lg bg-white px-2 py-1.5">
      <span className="min-w-0">
        <span className="block truncate text-[0.42rem] font-bold leading-tight text-navy">
          María López
        </span>
        <span className="block truncate text-[0.32rem] text-ink-soft">
          Recursos Humanos
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-ink-soft">
        <IconSearch size={7} stroke={2} />
        <IconMoon size={7} stroke={2} />
        <IconBell size={7} stroke={2} />
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-100 text-[0.3rem] font-bold text-brand-700">
          ML
        </span>
      </span>
    </div>

    <div className="min-h-0 flex-1 px-1.5">
      <p className="text-[0.52rem] font-extrabold leading-tight text-navy">
        Hola, María
      </p>
      <p className="text-[0.34rem] text-ink-soft">
        El resumen de tu equipo hoy.
      </p>

      {/* Indicadores */}
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {indicadores.map(({ icono: Icono, etiqueta, valor, pie }, i) => (
          <motion.span
            key={etiqueta}
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.55 + i * 0.06 }}
            className="block rounded-lg bg-white px-1.5 py-1.5"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-100 text-brand-600">
              <Icono size={7} stroke={2} />
            </span>
            <span className="mt-1 block truncate text-[0.3rem] font-bold uppercase tracking-wide text-ink-soft">
              {etiqueta}
            </span>
            <span className="block text-[0.6rem] font-extrabold leading-none text-navy">
              {valor}
            </span>
            <span className="mt-0.5 block truncate text-[0.28rem] text-ink-soft">
              {pie}
            </span>
          </motion.span>
        ))}
      </div>

      {/* Listados */}
      <div className="mt-1 rounded-lg bg-white px-1.5 py-1.5">
        <span className="flex items-center justify-between">
          <span className="text-[0.36rem] font-bold text-navy">
            Solicitudes por aprobar
          </span>
          <span className="text-[0.3rem] font-semibold text-brand-600">
            Ver todas →
          </span>
        </span>
        {[
          ['María López', 'Vacaciones · 17/06 - 21/06'],
          ['Juan Pérez', 'Día personal · 18/06'],
        ].map(([nombre, detalle]) => (
          <span key={nombre} className="mt-1 flex items-center gap-1">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-100" />
            <span className="min-w-0">
              <span className="block truncate text-[0.32rem] font-semibold text-navy">
                {nombre}
              </span>
              <span className="block truncate text-[0.28rem] text-ink-soft">
                {detalle}
              </span>
            </span>
          </span>
        ))}
      </div>

      <div className="mt-1 rounded-lg bg-white px-1.5 py-1.5">
        <span className="flex items-center justify-between">
          <span className="text-[0.36rem] font-bold text-navy">
            Próximos eventos
          </span>
          <span className="text-[0.3rem] font-semibold text-brand-600">
            Ver agenda →
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1">
          <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <IconCalendarEvent size={5} stroke={2.4} />
          </span>
          <span className="truncate text-[0.32rem] font-semibold text-navy">
            Cumpleaños de Martín Gómez
          </span>
        </span>
      </div>
    </div>

    {/* Barra inferior */}
    <div className="flex items-end justify-around border-t border-line bg-white px-1 py-1">
      {barraInferior.map(({ icono: Icono, etiqueta, activo }) => (
        <span
          key={etiqueta}
          className={`relative flex min-w-0 flex-col items-center gap-0.5 ${
            activo ? 'text-brand-600' : 'text-ink-soft'
          }`}
        >
          <Icono size={8} stroke={activo ? 2.2 : 1.8} />
          <span className="max-w-[2.4rem] truncate text-[0.26rem] font-semibold">
            {etiqueta}
          </span>
          {etiqueta === 'Más' && (
            <span className="absolute -right-0.5 -top-1 flex h-1.5 w-1.5 items-center justify-center rounded-full bg-red-500 text-[0.2rem] font-bold text-white">
              1
            </span>
          )}
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
      className="absolute -bottom-6 right-2 hidden w-[25%] min-w-[124px] sm:block lg:-right-3"
    >
      <div className="aspect-[9/17] rounded-[1.35rem] bg-gradient-to-b from-[#2b3550] to-[#161d31] p-[0.22rem] shadow-lift ring-1 ring-black/10">
        <div className="h-full overflow-hidden rounded-[1.15rem] bg-white">
          <Telefono />
        </div>
      </div>
    </motion.div>
  </div>
);
