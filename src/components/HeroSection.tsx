'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

export const HeroSection: React.FC = () => {
  const scrollToContact = () => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="bg-paper px-2 pb-2 pt-24 sm:px-3 sm:pt-28">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="grid grid-cols-1 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-brand-50/80 via-white to-white lg:grid-cols-2"
        >
          {/* Texto */}
          <div className="relative flex flex-col justify-center px-7 py-12 sm:px-12 sm:py-16 lg:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -left-10 h-72 w-72 rounded-full bg-brand-200/50 blur-[100px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 right-0 h-64 w-64 rounded-full bg-peach/20 blur-[90px]"
            />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-1.5 text-sm font-semibold text-ink-soft">
                <span className="h-2 w-2 rounded-full bg-brand-600" />
                Recursos Humanos para PyMEs
              </span>

              <h1 className="text-balance mt-6 text-[2.3rem] font-extrabold leading-[1.07] tracking-tight text-ink sm:text-5xl">
                Organizá tu empresa y tu equipo con nuestro servicio de{' '}
                <span className="text-brand-600">Recursos Humanos</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft">
                Muchas pequeñas y medianas empresas no cuentan con un área de
                Recursos Humanos, pero igualmente necesitan orden, procesos
                claros y una gestión profesional que les permita crecer sin
                perder el control de su equipo.
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
                En ISEO RH acompañamos a las empresas en la gestión integral de
                Recursos Humanos, adaptándonos a cada necesidad. Nos convertimos
                en el área de RRHH de tu empresa de forma flexible, sin
                necesidad de incorporar una estructura interna.
              </p>

              <ul className="mt-4 max-w-xl space-y-2 text-base leading-relaxed text-ink-soft">
                {[
                  'Administración de personal y control horario.',
                  'Gestión de ausencias, vacaciones y legajos.',
                  'Búsqueda y selección de personal.',
                  'Relaciones laborales y gestión de conflictos.',
                  'Capacitación y desarrollo.',
                  'Implementación de procesos e indicadores de RRHH.',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                    {item}
                  </li>
                ))}
              </ul>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
                Te ayudamos a ordenar la gestión de personas para que puedas
                enfocarte en hacer crecer tu negocio.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button
                  onClick={scrollToContact}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-ink px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Contactanos
                </button>
                <button
                  onClick={scrollToContact}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-8 py-4 text-base font-semibold text-brand-700 transition-colors hover:border-brand-600 hover:text-brand-600"
                >
                  Pedir una demo
                </button>
              </div>
            </div>
          </div>

          {/* Foto */}
          <div className="relative min-h-[280px] sm:min-h-[360px] lg:min-h-full">
            <Image
              src="/images/work.jpg"
              alt="Equipo de trabajo organizando su empresa"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
};
