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
        <div className="rounded-2xl border border-line bg-white px-6 py-12 sm:px-12 sm:py-16">
          <div className="max-w-2xl">
            <span className="text-sm font-bold uppercase tracking-widest text-brand-600">
              ¿Por qué elegirnos?
            </span>
            <p className="mt-4 text-2xl font-bold leading-snug text-ink sm:text-3xl">
              Porque transformamos el desorden en claridad.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Lista de razones */}
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
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-paper px-5 py-4 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ring-1 ring-inset ring-white/15 transition-transform duration-300 group-hover:scale-105">
                    <IconCheck size={18} stroke={2.6} />
                  </span>
                  <span className="text-base font-medium text-ink">
                    {reason}
                  </span>
                </li>
              ))}
            </motion.ul>

            {/* Panel oscuro */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-5"
            >
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[#1c1b22] via-ink to-[#14131a] p-8 text-white shadow-lift ring-1 ring-white/10 sm:p-9">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-600/45 blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-brand-500/15 blur-3xl"
                />
                <div className="relative">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-brand-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                    El resultado
                  </span>
                  <h3 className="text-balance mt-5 text-2xl font-extrabold leading-tight">
                    Tu empresa, con orden y claridad
                  </h3>
                  <p className="mt-5 text-[0.95rem] leading-relaxed text-white/70">
                    Nuestro objetivo es que sientas que tenés un área de
                    Recursos Humanos propio, sin necesidad de sumarlo a tu
                    estructura.
                  </p>
                  <p className="mt-4 text-[0.95rem] leading-relaxed text-white/70">
                    Trabajamos junto a cada empresa con soluciones prácticas y
                    adaptadas a su realidad: administración de personal,
                    selección, control horario, gestión de ausencias, procesos,
                    indicadores y acompañamiento a líderes.
                  </p>
                  <p className="mt-4 text-[0.95rem] leading-relaxed text-white/70">
                    Para que tu equipo funcione mejor y vos cuentes con
                    información confiable para tomar decisiones.
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
