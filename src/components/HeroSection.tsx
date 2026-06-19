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
        {/* Bloque hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-white lg:grid-cols-2"
        >
          {/* Texto */}
          <div className="relative flex flex-col justify-center px-7 py-12 sm:px-12 sm:py-16 lg:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -left-10 h-72 w-72 rounded-full bg-brand-200/40 blur-[100px]"
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

              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
                Muchas pequeñas y medianas empresas no cuentan con un área de
                Recursos Humanos, pero igualmente necesitan orden, procesos
                claros y una mirada profesional que les permita crecer sin
                perder el control de su equipo.
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
                Nuestro servicio está pensado justamente para eso: ser tu aliado
                en la gestión y organización del personal, creando herramientas
                y procesos a medida para que tu empresa gane en claridad,
                previsibilidad y cultura organizacional.
              </p>

              <div className="mt-9">
                <button
                  onClick={scrollToContact}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-ink px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Contactanos
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
