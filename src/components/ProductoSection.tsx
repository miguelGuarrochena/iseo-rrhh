'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { plataformaLanzada } from '@/lib/lanzamiento';
import {
  IconAlertTriangle,
  IconBeach,
  IconCalendarEvent,
  IconChartBar,
  IconClockCheck,
  IconFileCertificate,
  IconHome,
  IconInbox,
  IconPlaneDeparture,
  IconSignature,
  IconUsers,
} from '@tabler/icons-react';

/** Ítems del menú lateral, igual que en la app real (rol gestión). */
const navMock = [
  { icono: IconHome, etiqueta: 'Inicio', activo: true },
  { icono: IconUsers, etiqueta: 'Colaboradores', activo: false },
  { icono: IconPlaneDeparture, etiqueta: 'Ausencias', activo: false },
  { icono: IconClockCheck, etiqueta: 'Fichaje', activo: false },
  { icono: IconFileCertificate, etiqueta: 'Recibos', activo: false },
  { icono: IconCalendarEvent, etiqueta: 'Agenda', activo: false },
  { icono: IconChartBar, etiqueta: 'Reportes', activo: false },
];

/** Indicadores del dashboard, con los mismos textos que la app. */
const statsMock = [
  { icono: IconInbox, etiqueta: 'Por aprobar', valor: '2' },
  { icono: IconClockCheck, etiqueta: 'Presentes hoy', valor: '11/12' },
  { icono: IconAlertTriangle, etiqueta: 'Vencimientos', valor: '1' },
  { icono: IconUsers, etiqueta: 'Colaboradores', valor: '12' },
];

const features = [
  {
    icono: IconClockCheck,
    titulo: 'Fichaje sin papeles',
    detalle:
      'Reconocimiento facial en planta o desde el celular con foto y ubicación. Horas extras y llegadas tarde se calculan solas.',
  },
  {
    icono: IconBeach,
    titulo: 'Vacaciones y licencias',
    detalle:
      'El empleado pide desde su teléfono, el supervisor aprueba con un click. Los días por ley se calculan automáticamente.',
  },
  {
    icono: IconSignature,
    titulo: 'Recibos con firma digital',
    detalle:
      'Cada empleado recibe y firma su recibo en la plataforma. Constancia de recepción con fecha y hora.',
  },
  {
    icono: IconChartBar,
    titulo: 'Reportes que se entienden',
    detalle:
      'Ausentismo, puntualidad y novedades listas para el contador. Los números del equipo, sin planillas.',
  },
];

/**
 * Sección "La plataforma": mockup del dashboard dibujado con el
 * mismo lenguaje visual de la app + features clave.
 */
export const ProductoSection: React.FC = () => (
  <section id="producto" className="bg-paper px-2 py-2 sm:px-3">
    <div className="mx-auto max-w-7xl">
      <div className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-white via-brand-50/50 to-white px-6 py-12 sm:px-12 sm:py-16">
        <div className="max-w-2xl">
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-widest text-brand-600">
              La plataforma
            </span>
            {!plataformaLanzada && (
              <span className="rounded-full border border-peach/60 bg-peach/15 px-3 py-1 text-xs font-bold text-ink">
                Próximamente
              </span>
            )}
          </span>
          <p className="mt-4 text-2xl font-bold leading-snug text-ink sm:text-3xl">
            Tan simple que tu equipo la usa desde el primer día.
          </p>
          <p className="mt-3 text-base leading-relaxed text-ink-soft">
            Sin capacitaciones eternas ni planillas: cada persona ve lo suyo y
            vos ves todo.
          </p>
        </div>

        <div className="mt-10 grid items-center gap-8 lg:grid-cols-2">
          {/* Mockup del dashboard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            aria-hidden
            className="relative"
          >
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
              {/* Barra del navegador */}
              <div className="flex items-center gap-1.5 border-b border-line bg-paper px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                <span className="ml-3 hidden rounded-md bg-white px-3 py-0.5 text-[0.6rem] text-ink-soft sm:block">
                  app.iseo-rh.com
                </span>
              </div>

              {/* App: menú lateral + panel, tal cual la plataforma */}
              <div className="flex">
                {/* Sidebar */}
                <div className="hidden w-36 shrink-0 flex-col gap-0.5 border-r border-line bg-paper/60 p-2.5 sm:flex">
                  <p className="px-1.5 pb-2 text-[0.72rem] font-extrabold tracking-tight text-ink">
                    ISEO <span className="text-brand-600">RH</span>
                  </p>
                  {navMock.map(({ icono: Icono, etiqueta, activo }) => (
                    <span
                      key={etiqueta}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.62rem] font-semibold ${
                        activo
                          ? 'border border-brand-300 bg-brand-100 text-brand-800'
                          : 'text-ink-soft'
                      }`}
                    >
                      <Icono size={13} stroke={1.9} />
                      {etiqueta}
                    </span>
                  ))}
                </div>

                {/* Panel principal */}
                <div className="min-w-0 flex-1 p-4">
                  <p className="text-sm font-bold text-ink">Hola, Carolina</p>
                  <p className="text-[0.65rem] text-ink-soft">
                    El resumen de tu equipo hoy.
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {statsMock.map(({ icono: Icono, etiqueta, valor }) => (
                      <div
                        key={etiqueta}
                        className="rounded-xl border border-line bg-white p-2.5"
                      >
                        <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                          <Icono size={13} stroke={2.2} />
                        </span>
                        <p className="text-[0.5rem] font-bold uppercase tracking-wider text-ink-soft">
                          {etiqueta}
                        </p>
                        <p className="text-base font-bold text-ink">{valor}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-line bg-white p-2.5">
                    <p className="mb-1.5 text-[0.6rem] font-bold text-ink">
                      Solicitudes por aprobar
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {[
                        ['Lucas P.', 'Vacaciones · 20 al 24 jul'],
                        ['Sofía A.', 'Estudio · 6 al 7 jul'],
                      ].map(([n, d]) => (
                        <div
                          key={n}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[0.68rem] font-semibold text-ink">
                              {n}
                            </p>
                            <p className="truncate text-[0.58rem] text-ink-soft">
                              {d}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.55rem] font-bold text-amber-800">
                            Pendiente
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Chips flotantes */}
            <div className="absolute -right-3 top-16 rounded-xl border border-line bg-white px-3 py-2 shadow-lift sm:-right-6">
              <p className="text-[0.6rem] font-bold text-emerald-700">
                ✓ Recibo firmado
              </p>
              <p className="text-[0.55rem] text-ink-soft">Junio 2026</p>
            </div>
            <div className="absolute -left-2 bottom-8 rounded-xl border border-line bg-white px-3 py-2 shadow-lift sm:-left-5">
              <p className="text-[0.6rem] font-bold text-brand-700">
                ⏰ Fichaje registrado
              </p>
              <p className="text-[0.55rem] text-ink-soft">07:58 · en planta</p>
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col gap-4"
          >
            {features.map((f) => {
              const Icono = f.icono;
              return (
                <div
                  key={f.titulo}
                  className="flex gap-4 rounded-2xl border border-line bg-white px-5 py-4"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <Icono size={20} stroke={1.9} />
                  </span>
                  <div>
                    <p className="text-base font-bold text-ink">{f.titulo}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                      {f.detalle}
                    </p>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  </section>
);
