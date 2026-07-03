'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconDeviceAnalytics,
  IconSchool,
  IconHeartHandshake,
  IconArrowsShuffle,
} from '@tabler/icons-react';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    icon: <IconDeviceAnalytics size={24} stroke={1.7} />,
    title: 'Herramienta online simple y práctica',
    description:
      'Accesible desde cualquier dispositivo, para que puedas gestionar tu equipo donde estés.',
  },
  {
    icon: <IconSchool size={24} stroke={1.7} />,
    title: 'Implementación y capacitación',
    description:
      'Te acompañamos para que vos y tu equipo se adapten fácilmente, sin fricción.',
  },
  {
    icon: <IconHeartHandshake size={24} stroke={1.7} />,
    title: 'Seguimiento cercano',
    description:
      'A través de visitas y contacto directo, para que nunca sientas que estás solo.',
  },
  {
    icon: <IconArrowsShuffle size={24} stroke={1.7} />,
    title: 'Enfoque flexible',
    description:
      'Que crece y se adapta junto a tu empresa a medida que avanza.',
  },
];

export const HowWeDoItSection: React.FC = () => {
  const scrollToContact = () =>
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <section id="process" className="bg-white py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 lg:grid-cols-12 lg:gap-16">
        {/* Encabezado */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <span className="text-sm font-bold uppercase tracking-widest text-brand-600">
              Cómo lo hacemos
            </span>
            <h2 className="text-balance mt-3 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
              Un enfoque integral, paso a paso
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              Combinamos tecnología, acompañamiento y flexibilidad para que la
              transición sea simple y el resultado, duradero.
            </p>
            <button
              onClick={scrollToContact}
              className="mt-8 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-ink px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Empezá con un diagnóstico
            </button>
          </div>
        </div>

        {/* Pasos */}
        <div className="relative lg:col-span-7">
          <div
            aria-hidden
            className="absolute left-7 top-4 bottom-4 w-px bg-line"
          />
          <div className="flex flex-col gap-5">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="relative flex gap-5"
              >
                <div className="relative z-10 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-line bg-white text-brand-600 shadow-soft">
                  {step.icon}
                </div>
                <div className="flex-1 rounded-3xl border border-line bg-paper/50 p-6">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-brand-600">
                      Paso 0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-lg font-bold text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[0.975rem] leading-relaxed text-ink-soft">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
