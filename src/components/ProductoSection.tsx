'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  IconArrowRight,
  IconChartBar,
  IconCheck,
  IconChartPie,
  IconClock,
  IconClockCheck,
  IconCloud,
  IconFileText,
  IconId,
  IconPlaneDeparture,
  IconShieldCheck,
  IconSpeakerphone,
  IconUser,
} from '@tabler/icons-react';
import { plataformaLanzada } from '@/lib/lanzamiento';
import { PanelPlataforma, type ClavePanel } from './mockups/PanelPlataforma';

interface Solapa {
  clave: ClavePanel;
  icono: React.ElementType;
  etiqueta: string;
  titulo: string;
  detalle: string;
  puntos: string[];
}

const solapas: Solapa[] = [
  {
    clave: 'legajo',
    icono: IconId,
    etiqueta: 'Legajo Digital',
    titulo: 'Legajo Digital',
    detalle:
      'Centralizá toda la información de tus colaboradores en un legajo digital seguro, completo y siempre actualizado.',
    puntos: [
      'Datos personales y de contacto',
      'Documentos y archivos',
      'Historial laboral y contratos',
      'Evaluaciones y capacitaciones',
      'Información siempre disponible',
    ],
  },
  {
    clave: 'asistencia',
    icono: IconClock,
    etiqueta: 'Control de Asistencia',
    titulo: 'Control de Asistencia',
    detalle:
      'Registrá ingresos y egresos sin planillas y mirá en tiempo real cómo viene el día de tu equipo.',
    puntos: [
      'Fichaje desde el celular o la terminal',
      'Horas trabajadas y extras calculadas',
      'Llegadas tarde y ausencias detectadas',
      'Correcciones manuales con registro',
      'Exportación de novedades',
    ],
  },
  {
    clave: 'ausencias',
    icono: IconPlaneDeparture,
    etiqueta: 'Ausencias y Vacaciones',
    titulo: 'Ausencias y Vacaciones',
    detalle:
      'El colaborador pide desde su teléfono y el responsable aprueba con un click, sin cadenas de mails.',
    puntos: [
      'Solicitudes y aprobaciones online',
      'Días por ley calculados solos',
      'Certificados médicos adjuntos',
      'Calendario del equipo',
      'Saldos de vacaciones al día',
    ],
  },
  {
    clave: 'comunicaciones',
    icono: IconSpeakerphone,
    etiqueta: 'Comunicaciones',
    titulo: 'Comunicaciones',
    detalle:
      'Comunicá novedades a toda la empresa o a un sector puntual, y sabé quién las leyó.',
    puntos: [
      'Comunicados por empresa o sector',
      'Confirmación de lectura',
      'Notificaciones en el celular',
      'Adjuntos y enlaces',
      'Historial de todo lo enviado',
    ],
  },
  {
    clave: 'documentacion',
    icono: IconFileText,
    etiqueta: 'Documentación',
    titulo: 'Documentación',
    detalle:
      'Enviá, firmá y guardá la documentación laboral sin imprimir un solo papel.',
    puntos: [
      'Envío de documentos para firma',
      'Firma digital del colaborador',
      'Recibos de sueldo publicados',
      'Constancia con fecha y hora',
      'Archivo ordenado por persona',
    ],
  },
  {
    clave: 'reportes',
    icono: IconChartBar,
    etiqueta: 'Reportes',
    titulo: 'Reportes',
    detalle:
      'Los números de tu equipo, listos para tomar decisiones y para pasarle al contador.',
    puntos: [
      'Ausentismo y puntualidad',
      'Dotación y rotación',
      'Horas extras por sector',
      'Vencimientos y alertas',
      'Exportación a Excel',
    ],
  },
];

const cierres = [
  {
    icono: IconCloud,
    titulo: 'Accedé desde cualquier lugar',
    detalle: 'Toda la información disponible cuando la necesitás.',
  },
  {
    icono: IconShieldCheck,
    titulo: 'Información segura',
    detalle: 'Protegemos los datos de tu empresa y de tu equipo.',
  },
  {
    icono: IconClockCheck,
    titulo: 'Ahorrá tiempo',
    detalle: 'Automatizá tareas y eliminá procesos manuales.',
  },
  {
    icono: IconChartPie,
    titulo: 'Decisiones con datos',
    detalle: 'Reportes e indicadores para gestionar mejor tu negocio.',
  },
];

const irAContacto = () =>
  document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });

export const ProductoSection: React.FC = () => {
  const [activa, setActiva] = useState<ClavePanel>('legajo');
  const solapa = solapas.find((s) => s.clave === activa) ?? solapas[0];
  const Icono = solapa.icono;

  return (
    <section id="producto" className="bg-paper px-2 py-2 sm:px-3">
      <div className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-white via-brand-50/40 to-white px-5 py-14 sm:px-10 sm:py-20">
          {/* Encabezado */}
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-[0.72rem] font-bold uppercase tracking-widest text-brand-600">
                <IconUser size={14} stroke={2} />
                La plataforma
              </span>
              {!plataformaLanzada && (
                <span className="rounded-full border border-peach/60 bg-peach/15 px-3 py-1 text-xs font-bold text-navy">
                  Próximamente
                </span>
              )}
            </span>
            <h2 className="text-balance mt-6 text-[2rem] font-extrabold leading-[1.12] tracking-tight text-navy sm:text-[2.7rem]">
              Conocé todo lo que podés hacer con{' '}
              <span className="text-brand-600">ISEO RH</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-ink-soft">
              Desde el ingreso de un colaborador hasta sus vacaciones, toda la
              gestión de tu equipo en un solo lugar.
            </p>
          </div>

          {/* Solapas + contenido */}
          <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            <div className="grid lg:grid-cols-[15.5rem_1fr]">
              {/* Rail de solapas */}
              <div
                role="tablist"
                aria-label="Módulos de la plataforma"
                className="flex gap-1 overflow-x-auto border-b border-line p-3 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r"
              >
                {solapas.map(({ clave, icono: IconoSolapa, etiqueta }) => {
                  const activo = clave === activa;
                  return (
                    <button
                      key={clave}
                      role="tab"
                      aria-selected={activo}
                      onClick={() => setActiva(clave)}
                      className={`relative flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg border-0 px-3.5 py-3 text-left text-[0.85rem] font-semibold transition-colors lg:w-full lg:text-[0.9rem] ${
                        activo
                          ? 'bg-brand-50 text-brand-600'
                          : 'bg-transparent text-ink-soft hover:bg-paper hover:text-navy'
                      }`}
                    >
                      {activo && (
                        <motion.span
                          layoutId="solapa-activa"
                          aria-hidden
                          className="absolute left-0 top-1.5 bottom-1.5 hidden w-[3px] rounded-full bg-brand-600 lg:block"
                          transition={{
                            type: 'spring',
                            stiffness: 420,
                            damping: 34,
                          }}
                        />
                      )}
                      <IconoSolapa
                        size={18}
                        stroke={1.9}
                        className="shrink-0"
                      />
                      <span className="whitespace-nowrap lg:whitespace-normal">
                        {etiqueta}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Detalle + pantalla */}
              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-center lg:gap-10">
                <motion.div
                  key={solapa.clave}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icono size={22} stroke={1.8} />
                  </span>
                  <h3 className="mt-4 text-xl font-extrabold text-navy sm:text-2xl">
                    {solapa.titulo}
                  </h3>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
                    {solapa.detalle}
                  </p>
                  <ul className="mt-5 flex list-none flex-col gap-2.5 p-0">
                    {solapa.puntos.map((punto) => (
                      <li
                        key={punto}
                        className="flex items-center gap-2.5 text-[0.9rem] text-navy"
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                          <IconCheck size={10} stroke={3.2} />
                        </span>
                        {punto}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={irAContacto}
                    className="group mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 bg-white px-5 py-3 text-[0.9rem] font-bold text-brand-600 transition-colors hover:bg-brand-600 hover:text-white"
                  >
                    Solicitar una demo
                    <IconArrowRight
                      size={16}
                      stroke={2.4}
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </button>
                </motion.div>

                <div aria-hidden className="aspect-[4/3] w-full">
                  <PanelPlataforma clave={activa} />
                </div>
              </div>
            </div>
          </div>

          {/* Cierres */}
          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {cierres.map(({ icono: IconoCierre, titulo, detalle }) => (
              <div key={titulo} className="flex gap-3 bg-white px-5 py-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <IconoCierre size={19} stroke={1.8} />
                </span>
                <span>
                  <span className="block text-[0.9rem] font-bold text-navy">
                    {titulo}
                  </span>
                  <span className="mt-1 block text-[0.85rem] leading-snug text-ink-soft">
                    {detalle}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
