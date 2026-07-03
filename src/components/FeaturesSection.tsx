'use client';

import React from 'react';
import {
  IconZoomQuestion,
  IconTool,
  IconUserCheck,
  IconChartPie,
} from '@tabler/icons-react';
import { motion } from 'framer-motion';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <IconZoomQuestion size={24} stroke={1.7} />,
    title: 'Diagnóstico inicial',
    description:
      'Entendemos cómo funciona tu empresa hoy, qué problemas existen y dónde están las oportunidades de mejora.',
  },
  {
    icon: <IconTool size={24} stroke={1.7} />,
    title: 'Implementación de nuestra herramienta online',
    description:
      'Centralizamos licencias, ausencias, horas trabajadas, recibos de sueldo, datos del personal, uniformes y mucho más.',
  },
  {
    icon: <IconUserCheck size={24} stroke={1.7} />,
    title: 'Visitas programadas',
    description:
      'Acompañamos a tu equipo en persona, resolvemos dudas, revisamos avances y proponemos mejoras continuas.',
  },
  {
    icon: <IconChartPie size={24} stroke={1.7} />,
    title: 'Procesos claros y a medida',
    description:
      'Diseñamos políticas, reportes, encuestas y evaluaciones de desempeño que se ajustan a la realidad de tu empresa.',
  },
];

export const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="bg-paper px-2 py-2 sm:px-3">
      <div className="mx-auto max-w-7xl">
        {/* Bloque */}
        <div className="rounded-2xl border border-line bg-white px-6 py-12 sm:px-12 sm:py-16">
          <div className="max-w-2xl">
            <span className="text-sm font-bold uppercase tracking-widest text-brand-600">
              ¿Qué ofrecemos?
            </span>
            <p className="mt-4 text-2xl font-bold leading-snug text-ink sm:text-3xl">
              Herramientas y procesos a medida para que tu empresa gane en
              claridad, previsibilidad y cultura organizacional.
            </p>
          </div>

          {/* Tarjetas anidadas */}
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lift"
              >
                {/* Glow sutil en hover */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-100/0 blur-2xl transition-colors duration-300 group-hover:bg-brand-100/70"
                />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ring-1 ring-inset ring-white/15 transition-transform duration-300 group-hover:scale-105">
                  {feature.icon}
                </div>
                <h3 className="relative mt-5 text-base font-bold leading-snug text-ink">
                  {feature.title}
                </h3>
                <p className="relative mt-2.5 text-[0.9rem] leading-relaxed text-ink-soft">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
