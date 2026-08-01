'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconBell,
  IconCalendarEvent,
  IconChartBar,
  IconClockCheck,
  IconFileCertificate,
  IconFileCheck,
  IconHome,
  IconMessages,
  IconPlaneDeparture,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import { useContador } from './useContador';

/** Mismas secciones que el menú real de la app (`navItems`). */
const nav = [
  { icono: IconHome, etiqueta: 'Inicio', activo: true },
  { icono: IconUsers, etiqueta: 'Colaboradores', activo: false },
  { icono: IconPlaneDeparture, etiqueta: 'Ausencias', activo: false },
  { icono: IconClockCheck, etiqueta: 'Fichaje', activo: false },
  { icono: IconFileCertificate, etiqueta: 'Recibos', activo: false },
  { icono: IconCalendarEvent, etiqueta: 'Agenda', activo: false },
  { icono: IconMessages, etiqueta: 'Comunicaciones', activo: false },
  { icono: IconFileCheck, etiqueta: 'A firmar', activo: false },
  { icono: IconChartBar, etiqueta: 'Reportes', activo: false },
  { icono: IconSettings, etiqueta: 'Configuración', activo: false },
];

/** Mismos indicadores y textos que el inicio real de la app. */
const indicadores = [
  { etiqueta: 'Por aprobar', valor: 2, pie: 'solicitudes de ausencia' },
  {
    etiqueta: 'Presentes hoy',
    valor: 11,
    sufijo: '/12',
    pie: 'ficharon ingreso',
  },
  { etiqueta: 'Vencimientos', valor: 1, pie: 'próximos a vencer' },
  { etiqueta: 'Colaboradores', valor: 12, pie: 'activos' },
];

const ausencias = [
  { nombre: 'María López', tipo: 'Vacaciones', fecha: '17/06 - 21/06' },
  { nombre: 'Juan Pérez', tipo: 'Día personal', fecha: '18/06' },
  { nombre: 'Lucía Fernández', tipo: 'Vacaciones', fecha: '20/06 - 27/06' },
];

const eventos = [
  { nombre: 'Cumpleaños de Martín Gómez', fecha: '14 de junio' },
  { nombre: 'Capacitación de seguridad', fecha: '22 de junio' },
  { nombre: 'Vence libreta de Pedro Ruiz', fecha: '30 de junio' },
];

const tonos = [
  'bg-brand-100 text-brand-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
];

const iniciales = (nombre: string) =>
  nombre
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');

const Avatar: React.FC<{ nombre: string; indice: number }> = ({
  nombre,
  indice,
}) => (
  <span
    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.4rem] font-bold ${
      tonos[indice % tonos.length]
    }`}
  >
    {iniciales(nombre)}
  </span>
);

const Indicador: React.FC<{
  etiqueta: string;
  valor: number;
  sufijo?: string;
  pie: string;
}> = ({ etiqueta, valor, sufijo, pie }) => {
  const { ref, valor: actual } = useContador(valor);
  return (
    <div className="rounded-md border border-line bg-white px-2 py-1.5">
      <p className="truncate text-[0.38rem] font-bold uppercase tracking-wide text-ink-soft">
        {etiqueta}
      </p>
      <p
        ref={ref as React.RefObject<HTMLParagraphElement>}
        className="mt-0.5 text-[0.95rem] font-extrabold leading-none tracking-tight text-navy tabular-nums"
      >
        {actual}
        {sufijo}
      </p>
      <p className="mt-0.5 truncate text-[0.36rem] text-ink-soft">{pie}</p>
    </div>
  );
};

/** Pantalla del panel de gestión, dibujada en HTML (no es una captura). */
export const DashboardMockup: React.FC = () => (
  <div className="flex h-full bg-paper/70 font-sans">
    {/* Menú lateral */}
    <div className="hidden w-[26%] shrink-0 flex-col gap-px border-r border-line bg-white px-1.5 py-2 sm:flex">
      <p className="px-1.5 pb-2 text-[0.5rem] font-extrabold tracking-tight text-navy">
        ISEO <span className="text-brand-600">RH</span>
      </p>
      {nav.map(({ icono: Icono, etiqueta, activo }) => (
        <span
          key={etiqueta}
          className={`flex items-center gap-1 rounded px-1.5 py-[0.22rem] text-[0.44rem] font-medium ${
            activo ? 'bg-brand-50 text-brand-700' : 'text-ink-soft'
          }`}
        >
          <Icono size={8} stroke={2} className="shrink-0" />
          {etiqueta}
        </span>
      ))}
    </div>

    {/* Panel */}
    <div className="min-w-0 flex-1 px-2 py-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[0.62rem] font-extrabold leading-tight text-navy">
            Hola, María
          </p>
          <p className="text-[0.42rem] text-ink-soft">
            El resumen de tu equipo hoy.
          </p>
        </div>
        <span className="flex items-center gap-1.5">
          <span className="relative text-ink-soft">
            <IconBell size={9} stroke={2} />
            <motion.span
              className="absolute -right-0.5 -top-0.5 h-1 w-1 rounded-full bg-peach"
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </span>
          <span className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-peach to-brand-400" />
        </span>
      </div>

      {/* Indicadores */}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {indicadores.map((indicador, i) => (
          <motion.div
            key={indicador.etiqueta}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.1 + i * 0.07 }}
          >
            <Indicador {...indicador} />
          </motion.div>
        ))}
      </div>

      {/* Dos paneles */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-line bg-white px-2 py-1.5">
          <p className="text-[0.46rem] font-bold text-navy">
            Solicitudes por aprobar
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {ausencias.map((fila, i) => (
              <motion.span
                key={fila.nombre}
                initial={{ opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: 0.35 + i * 0.1 }}
                className="flex items-center gap-1"
              >
                <Avatar nombre={fila.nombre} indice={i} />
                <span className="min-w-0 flex-1 truncate text-[0.42rem] font-semibold text-navy">
                  {fila.nombre}
                </span>
                <span className="hidden text-[0.4rem] text-ink-soft sm:inline">
                  {fila.tipo}
                </span>
                <span className="text-[0.4rem] tabular-nums text-ink-soft">
                  {fila.fecha}
                </span>
              </motion.span>
            ))}
          </div>
          <p className="mt-1.5 text-[0.4rem] font-semibold text-brand-600">
            Ver todas
          </p>
        </div>

        <div className="relative overflow-hidden rounded-md border border-line bg-white px-2 py-1.5">
          <p className="text-[0.46rem] font-bold text-navy">Próximos eventos</p>
          <div className="mt-1 flex flex-col gap-1">
            {eventos.map((fila, i) => (
              <motion.span
                key={fila.nombre}
                initial={{ opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: 0.45 + i * 0.1 }}
                className="flex items-center gap-1"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <IconCalendarEvent size={8} stroke={2.2} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.42rem] font-semibold text-navy">
                  {fila.nombre}
                </span>
                <span className="text-[0.4rem] text-ink-soft">
                  {fila.fecha}
                </span>
              </motion.span>
            ))}
          </div>
          <p className="mt-1.5 text-[0.4rem] font-semibold text-brand-600">
            Ver agenda
          </p>
        </div>
      </div>

      {/* Franja inferior insinuada, para que la pantalla no termine seca */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {['Vencimientos próximos', 'Recibos por firmar', 'Comunicaciones'].map(
          (titulo) => (
            <div
              key={titulo}
              className="rounded-md border border-line bg-white px-2 py-1.5"
            >
              <p className="truncate text-[0.42rem] font-bold text-navy">
                {titulo}
              </p>
              <span className="mt-1 block h-[0.15rem] w-full rounded-full bg-line" />
              <span className="mt-0.5 block h-[0.15rem] w-2/3 rounded-full bg-line" />
            </div>
          )
        )}
      </div>
    </div>
  </div>
);
