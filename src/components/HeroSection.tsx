'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconFolders,
  IconMessageDots,
  IconPlayerPlay,
  IconPlaneDeparture,
  IconShieldLock,
  IconUsersGroup,
} from '@tabler/icons-react';
import { MockupHero } from './mockups/MockupHero';

const beneficios = [
  {
    icono: IconUsersGroup,
    titulo: 'Centralizá la información',
    detalle: 'de tus empleados',
  },
  {
    icono: IconPlaneDeparture,
    titulo: 'Gestioná ausencias',
    detalle: 'y vacaciones',
  },
  {
    icono: IconFolders,
    titulo: 'Mantené legajos',
    detalle: 'siempre actualizados',
  },
  {
    icono: IconMessageDots,
    titulo: 'Comunicá y notificá',
    detalle: 'de forma simple',
  },
  {
    icono: IconShieldLock,
    titulo: 'Información segura',
    detalle: 'siempre disponible',
  },
];

const clientes = [
  { nombre: 'LAK', rubro: 'Estudio' },
  { nombre: 'Rospide', rubro: 'Escribanía' },
  { nombre: 'Negro Holandés', rubro: 'Panadería' },
  { nombre: 'TGF', rubro: 'Bombas' },
  { nombre: 'Mae Tuanis', rubro: 'Indumentaria' },
  { nombre: 'Glaciarum', rubro: 'Museo de Hielo' },
  { nombre: 'Madre Teresa', rubro: 'Colegio' },
];

const irA = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

/**
 * El bloque de texto entra en cascada en vez de todo junto: el ojo
 * sigue el orden en que conviene leerlo (etiqueta → titular → promesa →
 * botones). 70ms entre elementos es lo suficiente para que se note el
 * orden sin que el último llegue tarde.
 */
const contenedor = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const item = {
  oculto: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const },
  },
};

export const HeroSection: React.FC = () => (
  <section className="bg-paper px-2 pb-2 pt-24 sm:px-3 sm:pt-28">
    <div className="mx-auto max-w-7xl">
      <div className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-brand-50/80 via-white to-white px-6 py-12 sm:px-10 sm:py-16 lg:px-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          {/* Texto */}
          <motion.div
            variants={contenedor}
            initial="oculto"
            animate="visible"
            className="relative"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-[100px]"
            />
            <div className="relative">
              <motion.span
                variants={item}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-[0.72rem] font-bold uppercase tracking-widest text-brand-600"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                Recursos Humanos para PyMEs
              </motion.span>

              <motion.h1
                variants={item}
                className="text-balance mt-6 text-[2.4rem] font-extrabold leading-[1.05] tracking-tight text-navy sm:text-[3.4rem]"
              >
                Somos tu área de{' '}
                <span className="text-brand-600">Recursos Humanos</span>
              </motion.h1>

              {/*
                La línea se dibuja de izquierda a derecha justo después
                del titular: subraya el remate en vez de aparecer ya
                puesta. Anima el ancho, que no es lo más barato, pero son
                64px una sola vez al cargar.
              */}
              <motion.span
                aria-hidden
                initial={{ width: 0 }}
                animate={{ width: '4rem' }}
                transition={{
                  duration: 0.5,
                  delay: 0.45,
                  ease: [0.23, 1, 0.32, 1],
                }}
                className="mt-6 block h-1 rounded-full bg-peach"
              />

              <motion.p
                variants={item}
                className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-navy/80"
              >
                Aliado en la gestión y organización del personal, creando
                herramientas y procesos a medida.
              </motion.p>

              <motion.p
                variants={item}
                className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft"
              >
                Plataforma pensada para pequeñas y medianas empresas, que
                permite centralizar la información de los empleados y gestionar
                procesos como legajos, ausencias, vacaciones, comunicaciones y
                documentación.
              </motion.p>

              <motion.div
                variants={item}
                className="mt-9 flex flex-col gap-3 sm:flex-row"
              >
                <button
                  onClick={() => irA('contact')}
                  className="presionable inline-flex cursor-pointer items-center justify-center rounded-xl border-0 bg-navy px-7 py-3.5 text-base font-semibold text-white hover:bg-brand-600"
                >
                  Solicitar una demo
                </button>
                <button
                  onClick={() => irA('producto')}
                  className="presionable inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-7 py-3.5 text-base font-semibold text-navy hover:border-brand-200 hover:text-brand-600"
                >
                  <IconPlayerPlay size={18} stroke={2} />
                  Conocé la plataforma
                </button>
              </motion.div>
            </div>
          </motion.div>

          {/* Mockup */}
          <div className="pb-8 lg:pb-4">
            <MockupHero />
          </div>
        </div>

        {/* Franja de beneficios */}
        {/*
          Las cinco celdas entran una atrás de otra en vez de todas
          juntas: son cinco promesas distintas y el escalonado las hace
          leer como una lista, no como un bloque. 50ms es el mínimo que
          se percibe como secuencia.
        */}
        <motion.div
          variants={{
            oculto: {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
          initial="oculto"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5"
        >
          {beneficios.map(({ icono: Icono, titulo, detalle }) => (
            <motion.div
              key={titulo}
              variants={item}
              className="flex items-center gap-3 bg-white px-5 py-5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icono size={19} stroke={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9rem] font-bold leading-snug text-navy">
                  {titulo}
                </span>
                <span className="block text-[0.85rem] leading-snug text-ink-soft">
                  {detalle}
                </span>
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Clientes */}
        <div className="mt-12 text-center">
          <p className="text-sm font-bold text-navy">
            Empresas que confían en nosotros
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-12 gap-y-7">
            {clientes.map(({ nombre, rubro }) => (
              <span
                key={nombre}
                className="text-center text-ink-soft/70 transition-colors hover:text-navy"
              >
                <span className="block text-xl font-extrabold uppercase leading-none tracking-tight">
                  {nombre}
                </span>
                <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.22em]">
                  {rubro}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);
