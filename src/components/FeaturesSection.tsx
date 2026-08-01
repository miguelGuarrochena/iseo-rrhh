'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconArrowRight,
  IconCloudComputing,
  IconCoin,
  IconHeadset,
  IconStar,
  IconUsersGroup,
} from '@tabler/icons-react';

interface Ventaja {
  icono: React.ElementType;
  tono: string;
  titulo: string;
  detalle: string;
}

const ventajas: Ventaja[] = [
  {
    icono: IconCoin,
    tono: 'bg-brand-50 text-brand-600',
    titulo: 'Ahorra tiempo y recursos',
    detalle:
      'Automatizá tareas administrativas y reducí costos operativos. Más eficiencia, menos trabajo manual.',
  },
  {
    icono: IconCloudComputing,
    tono: 'bg-emerald-50 text-emerald-600',
    titulo: 'Todo en la nube, siempre disponible',
    detalle:
      'Accedé a la información de tu equipo desde cualquier lugar y dispositivo, de manera segura.',
  },
  {
    icono: IconUsersGroup,
    tono: 'bg-violet-50 text-violet-600',
    titulo: 'Adaptado a tu empresa',
    detalle:
      'Ya seas una PyME en crecimiento o una empresa consolidada, ISEO RH se adapta a tus necesidades.',
  },
  {
    icono: IconStar,
    tono: 'bg-orange-50 text-orange-500',
    titulo: 'Probalo sin compromiso',
    detalle:
      'Conocé todos los beneficios de nuestra plataforma con una demo gratuita y descubrí cómo podemos ayudarte a crecer.',
  },
];

const irAContacto = () =>
  document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });

export const FeaturesSection: React.FC = () => (
  <section id="features" className="bg-paper px-2 py-2 sm:px-3">
    <div className="mx-auto max-w-7xl">
      <div className="rounded-2xl border border-line bg-white px-6 py-14 sm:px-12 sm:py-20">
        {/* Encabezado */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-[0.72rem] font-bold uppercase tracking-widest text-brand-600">
            <IconUsersGroup size={14} stroke={2} />
            Hecho para PyMEs
          </span>
          <h2 className="text-balance mt-6 text-[2rem] font-extrabold leading-[1.12] tracking-tight text-navy sm:text-[2.7rem]">
            Una plataforma simple, pensada{' '}
            <span className="text-brand-600">para tu negocio.</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-ink-soft">
            Herramientas esenciales para gestionar tu equipo de forma eficiente,
            sin complicaciones y al mejor costo.
          </p>
        </div>

        {/* Filas */}
        <div className="mx-auto mt-12 max-w-4xl">
          {ventajas.map(({ icono: Icono, tono, titulo, detalle }, i) => (
            <motion.div
              key={titulo}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: i * 0.07 }}
              className={`group flex items-start gap-5 rounded-2xl px-4 py-7 transition-colors hover:bg-paper/60 sm:gap-7 sm:px-6 ${
                i > 0 ? 'border-t border-line' : ''
              }`}
            >
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl duration-150 ease-out transition-transform group-hover:scale-105 ${tono}`}
              >
                <Icono size={26} stroke={1.7} />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-snug text-navy sm:text-xl">
                  {titulo}
                </span>
                <span className="mt-2 block max-w-xl text-[0.95rem] leading-relaxed text-ink-soft">
                  {detalle}
                </span>
              </span>
            </motion.div>
          ))}
        </div>

        {/* Cierre con llamada a la acción */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45 }}
          className="mx-auto mt-10 flex max-w-4xl flex-col items-start gap-6 rounded-2xl bg-brand-50/70 px-6 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-start gap-5 sm:gap-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft">
              <IconHeadset size={22} stroke={1.8} />
            </span>
            <div>
              <p className="text-base font-bold leading-snug text-navy sm:text-lg">
                Más que software, somos tu aliado estratégico en RR.HH.
              </p>
              <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-soft">
                Te acompañamos en la gestión diaria de tu equipo para que vos te
                enfoques en lo más importante: hacer crecer tu negocio.
              </p>
            </div>
          </div>
          <button
            onClick={irAContacto}
            className="presionable group inline-flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-6 py-3.5 text-[0.95rem] font-semibold text-brand-600 hover:bg-brand-600 hover:text-white lg:w-auto"
          >
            Hablá con un asesor
            <IconArrowRight
              size={17}
              stroke={2.2}
              className="transition-transform duration-150 ease-out group-hover:translate-x-1"
            />
          </button>
        </motion.div>
      </div>
    </div>
  </section>
);
