'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconArrowRight,
  IconCalendarCheck,
  IconChartBar,
  IconChevronRight,
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
  tonoNumero: string;
  tonoLinea: string;
  titulo: string;
  detalle: string;
  nota: string;
  iconoNota: React.ElementType;
  tonoNota: string;
}

const pasos: Paso[] = [
  {
    numero: '01',
    icono: IconCalendarCheck,
    tonoIcono: 'bg-emerald-50 text-emerald-600',
    tonoNumero: 'bg-emerald-50 text-emerald-700',
    tonoLinea: 'bg-emerald-300',
    titulo: 'Solicitá una demo',
    detalle:
      'Completá el formulario y coordinamos una demo personalizada para mostrarte cómo ISEO RH puede ayudar a tu empresa.',
    nota: 'Demo gratuita y sin compromiso',
    iconoNota: IconShieldCheck,
    tonoNota: 'bg-emerald-50 text-emerald-700',
  },
  {
    numero: '02',
    icono: IconUsers,
    tonoIcono: 'bg-brand-50 text-brand-600',
    tonoNumero: 'bg-brand-50 text-brand-700',
    tonoLinea: 'bg-brand-300',
    titulo: 'Te acompañamos en la implementación',
    detalle:
      'Nuestro equipo te guía en la configuración y carga inicial de datos para que empieces a usar la plataforma sin complicaciones.',
    nota: 'Acompañamiento dedicado en cada paso',
    iconoNota: IconHeadset,
    tonoNota: 'bg-brand-50 text-brand-700',
  },
  {
    numero: '03',
    icono: IconRocket,
    tonoIcono: 'bg-violet-50 text-violet-600',
    tonoNumero: 'bg-violet-50 text-violet-700',
    tonoLinea: 'bg-violet-300',
    titulo: 'Empezá a gestionar sin límites',
    detalle:
      'Tu equipo listo, tu información organizada y todos los procesos de RR.HH. en un solo lugar para que ahorres tiempo y tomes mejores decisiones.',
    nota: 'Más eficiencia desde el primer día',
    iconoNota: IconChartBar,
    tonoNota: 'bg-violet-50 text-violet-700',
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
          <h2 className="text-balance text-[2rem] font-extrabold leading-[1.12] tracking-tight text-navy sm:text-[2.7rem]">
            Empezá a transformar la gestión de tu equipo en{' '}
            <span className="text-brand-600">3 simples pasos</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-ink-soft">
            Rápido, fácil y acompañado en todo el proceso.
          </p>
        </div>

        {/* Pasos */}
        <div className="mt-12 rounded-2xl border border-line bg-white p-6 shadow-soft sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-start lg:gap-0">
            {pasos.map(
              (
                {
                  numero,
                  icono: Icono,
                  tonoIcono,
                  tonoNumero,
                  tonoLinea,
                  titulo,
                  detalle,
                  nota,
                  iconoNota: IconoNota,
                  tonoNota,
                },
                i
              ) => (
                <React.Fragment key={numero}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.45, delay: i * 0.12 }}
                    className={`flex flex-col items-center px-2 text-center lg:px-8 ${
                      i > 0
                        ? 'border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pt-0'
                        : ''
                    }`}
                  >
                    <span
                      className={`flex h-16 w-16 items-center justify-center rounded-full ${tonoIcono}`}
                    >
                      <Icono size={30} stroke={1.6} />
                    </span>
                    <span
                      className={`mt-4 rounded-full px-3 py-1 text-[0.72rem] font-extrabold tracking-wide ${tonoNumero}`}
                    >
                      {numero}
                    </span>
                    <h3 className="text-balance mt-4 text-lg font-extrabold leading-snug text-navy sm:text-xl">
                      {titulo}
                    </h3>
                    <span
                      aria-hidden
                      className={`mt-4 block h-[3px] w-10 rounded-full ${tonoLinea}`}
                    />
                    <p className="mt-4 max-w-xs text-[0.92rem] leading-relaxed text-ink-soft">
                      {detalle}
                    </p>
                    <span
                      className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[0.85rem] font-semibold ${tonoNota}`}
                    >
                      <IconoNota size={16} stroke={1.9} />
                      {nota}
                    </span>
                  </motion.div>

                  {i < pasos.length - 1 && (
                    /*
                      El chevrón entra después de la tarjeta que lo
                      precede y antes de la siguiente, así el recorrido
                      1 → 2 → 3 se lee como un avance y no como tres
                      cosas que aparecen sueltas. Es una sección que se
                      ve una vez: acá el escalonado suma.
                    */
                    <motion.span
                      aria-hidden
                      initial={{ opacity: 0, x: -6 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: '-60px' }}
                      transition={{
                        duration: 0.35,
                        delay: 0.12 * i + 0.28,
                        ease: [0.23, 1, 0.32, 1],
                      }}
                      className="hidden items-center justify-center pt-10 lg:flex"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paper text-ink-soft">
                        <IconChevronRight size={16} stroke={2.4} />
                      </span>
                    </motion.span>
                  )}
                </React.Fragment>
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
