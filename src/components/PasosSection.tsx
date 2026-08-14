'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconArrowRight,
  IconCalendarCheck,
  IconChartBar,
  IconHeartHandshake,
  IconHeadset,
  IconRocket,
  IconShieldCheck,
  IconUsers,
} from '@tabler/icons-react';

interface Paso {
  numero: string;
  icono: React.ElementType;
  tonoIcono: string;
  titulo: string;
  detalle: string;
  nota: string;
  iconoNota: React.ElementType;
}

const pasos: Paso[] = [
  {
    numero: '01',
    icono: IconCalendarCheck,
    tonoIcono: 'bg-brand-50 text-brand-600',
    titulo: 'Solicitá una demo',
    detalle:
      'Completá el formulario y coordinamos una demo personalizada para mostrarte cómo ISEO RH puede ayudar a tu empresa.',
    nota: 'Demo gratuita y sin compromiso',
    iconoNota: IconShieldCheck,
  },
  {
    numero: '02',
    icono: IconUsers,
    tonoIcono: 'bg-brand-50 text-brand-600',
    titulo: 'Te acompañamos en la implementación',
    detalle:
      'Nuestro equipo te guía en la configuración y carga inicial de datos para que empieces a usar la plataforma sin complicaciones.',
    nota: 'Acompañamiento dedicado en cada paso',
    iconoNota: IconHeadset,
  },
  {
    numero: '03',
    icono: IconRocket,
    tonoIcono: 'bg-brand-50 text-brand-600',
    titulo: 'Empezá a gestionar sin límites',
    detalle:
      'Tu equipo listo, tu información organizada y todos los procesos de RR.HH. en un solo lugar para que ahorres tiempo y tomes mejores decisiones.',
    nota: 'Más eficiencia desde el primer día',
    iconoNota: IconChartBar,
  },
];

const irAContacto = () =>
  document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });

export const PasosSection: React.FC = () => (
  <section id="pasos" className="bg-paper px-2 py-2 sm:px-3">
    <div className="mx-auto max-w-7xl">
      <div className="rounded-2xl border border-line bg-white px-5 py-14 sm:px-10 sm:py-20">
        {/* Encabezado */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-sm font-bold uppercase tracking-widest text-brand-600">
            Cómo empezar
          </span>
          <h2 className="text-balance mt-4 text-[2rem] font-extrabold leading-[1.12] tracking-tight text-navy sm:text-[2.7rem]">
            Empezá a transformar la gestión de tu equipo en{' '}
            <span className="text-brand-600">3 simples pasos</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-ink-soft">
            Rápido, fácil y acompañado en todo el proceso.
          </p>
        </div>

        {/*
          Tres tarjetas a la misma altura: el número marca la secuencia,
          la nota queda anclada abajo y el conector las une en desktop
          sin chevrones sueltos en el medio.
        */}
        <div className="relative mt-14">
          <div
            aria-hidden
            className="pointer-events-none absolute left-[16%] right-[16%] top-[1.375rem] hidden h-px bg-line lg:block"
          />

          <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
            {pasos.map(
              (
                {
                  numero,
                  icono: Icono,
                  tonoIcono,
                  titulo,
                  detalle,
                  nota,
                  iconoNota: IconoNota,
                },
                i
              ) => (
                <motion.article
                  key={numero}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.45, delay: i * 0.12 }}
                  className="flex h-full flex-col"
                >
                  <span className="relative z-10 mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-[0.8rem] font-extrabold tracking-wide text-brand-600">
                    {numero}
                  </span>

                  <div className="flex flex-1 flex-col rounded-2xl border border-line bg-paper/70 px-6 py-7 sm:px-7">
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tonoIcono}`}
                    >
                      <Icono size={24} stroke={1.7} />
                    </span>
                    <h3 className="mt-5 min-h-[3.5rem] text-lg font-extrabold leading-snug text-navy sm:text-xl">
                      {titulo}
                    </h3>
                    <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-ink-soft">
                      {detalle}
                    </p>
                    <span className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-[0.82rem] font-semibold leading-snug text-navy">
                      <IconoNota
                        size={16}
                        stroke={1.9}
                        className="mt-0.5 shrink-0 text-brand-600"
                      />
                      {nota}
                    </span>
                  </div>
                </motion.article>
              )
            )}
          </div>
        </div>

        {/* Cierre */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45 }}
          className="mt-8 flex flex-col items-start gap-6 rounded-2xl bg-brand-50/70 px-6 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-start gap-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-soft">
              <IconHeartHandshake size={24} stroke={1.7} />
            </span>
            <div>
              <p className="text-base font-bold text-navy sm:text-lg">
                No estás solo, estamos para ayudarte.
              </p>
              <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-ink-soft">
                Más que una plataforma, somos tu aliado estratégico en Recursos
                Humanos.
              </p>
            </div>
          </div>

          <div className="w-full shrink-0 lg:w-auto lg:text-right">
            <button
              onClick={irAContacto}
              className="presionable group inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-brand-600 px-7 py-3.5 text-base font-semibold text-white hover:bg-brand-700 lg:w-auto"
            >
              Solicitá tu demo gratuita
              <IconArrowRight
                size={18}
                stroke={2.2}
                className="transition-transform duration-150 ease-out group-hover:translate-x-1"
              />
            </button>
            <p className="mt-2.5 text-center text-[0.8rem] text-ink-soft lg:text-right">
              Te respondemos en el día
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);
