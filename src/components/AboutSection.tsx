import React from 'react';
import { motion } from 'framer-motion';
import { IconCheck } from '@tabler/icons-react';

const reasons = [
  'Tenés un área de RRHH profesional sin sumarlo a tu estructura.',
  'Ahorrás tiempo y evitás errores administrativos.',
  'Lográs procesos claros y previsibles que mejoran la comunicación interna.',
  'Contás con diagnóstico, visitas mensuales y un servicio adaptado a tu empresa.',
  'Usás una herramienta práctica y online, respaldada por nuestro acompañamiento humano.',
];

export const AboutSection: React.FC = () => {
  return (
    <section id="about" className="bg-paper px-2 py-2 sm:px-3">
      <div className="mx-auto max-w-7xl">
        {/* Bloque */}
        <div className="rounded-2xl border border-line bg-white px-6 py-12 sm:px-12 sm:py-16">
          <div className="max-w-2xl">
            <span className="text-sm font-bold uppercase tracking-widest text-brand-600">
              ¿Por qué elegirnos?
            </span>
            <p className="mt-4 text-2xl font-bold leading-snug text-ink sm:text-3xl">
              Porque transformamos el desorden en claridad.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
            {/* Razones anidadas */}
            <motion.ul
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="flex flex-col gap-3 lg:col-span-7"
            >
              {reasons.map((reason) => (
                <li
                  key={reason}
                  className="flex items-center gap-4 rounded-xl border border-line bg-paper/60 px-5 py-4"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <IconCheck size={18} stroke={2.4} />
                  </span>
                  <span className="text-base font-medium text-ink">
                    {reason}
                  </span>
                </li>
              ))}
            </motion.ul>

            {/* Panel destacado anidado */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-5"
            >
              <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-2xl bg-ink p-8 text-white sm:p-9">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-600/40 blur-3xl"
                />
                <div className="relative">
                  <h3 className="text-balance text-2xl font-extrabold leading-tight">
                    Tu empresa, con orden y claridad
                  </h3>
                  <p className="mt-5 text-[0.95rem] leading-relaxed text-white/70">
                    Nuestro objetivo es que sientas que tenés un área de
                    Recursos Humanos propio, sin necesidad de sumarlo a tu
                    estructura.
                  </p>
                  <p className="mt-4 text-[0.95rem] leading-relaxed text-white/70">
                    Cada empresa es distinta, y por eso trabajamos con un
                    diagnóstico personalizado y soluciones concretas, para que
                    tu equipo trabaje mejor, se comunique mejor y vos tengas
                    siempre información confiable para decidir.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
