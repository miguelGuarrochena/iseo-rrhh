'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconArrowLeft,
  IconBell,
  IconCalendarEvent,
  IconChartBar,
  IconCheck,
  IconClockCheck,
  IconDotsVertical,
  IconFileCertificate,
  IconFileCheck,
  IconFileText,
  IconHome,
  IconId,
  IconMail,
  IconMessages,
  IconPhone,
  IconPlaneDeparture,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';

export type ClavePanel =
  | 'legajo'
  | 'asistencia'
  | 'ausencias'
  | 'comunicaciones'
  | 'documentacion'
  | 'reportes';

/** Mismas secciones que el menú real de la app (`navItems`). */
const nav: {
  icono: React.ElementType;
  etiqueta: string;
  clave?: ClavePanel;
}[] = [
  { icono: IconHome, etiqueta: 'Inicio' },
  { icono: IconUsers, etiqueta: 'Colaboradores', clave: 'legajo' },
  { icono: IconPlaneDeparture, etiqueta: 'Ausencias', clave: 'ausencias' },
  { icono: IconClockCheck, etiqueta: 'Fichaje', clave: 'asistencia' },
  { icono: IconFileCertificate, etiqueta: 'Recibos' },
  { icono: IconCalendarEvent, etiqueta: 'Agenda' },
  {
    icono: IconMessages,
    etiqueta: 'Comunicaciones',
    clave: 'comunicaciones',
  },
  { icono: IconFileCheck, etiqueta: 'A firmar', clave: 'documentacion' },
  { icono: IconChartBar, etiqueta: 'Reportes', clave: 'reportes' },
  { icono: IconSettings, etiqueta: 'Configuración' },
];

const Tarjeta: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <span
    className={`block rounded-md border border-line bg-white p-2 ${className}`}
  >
    {children}
  </span>
);

const Pastilla: React.FC<{ texto: string; tono: string }> = ({
  texto,
  tono,
}) => (
  <span
    className={`rounded-full px-1.5 py-[0.05rem] text-[0.36rem] font-bold ${tono}`}
  >
    {texto}
  </span>
);

const FilaDato: React.FC<{
  icono: React.ElementType;
  texto: string;
}> = ({ icono: Icono, texto }) => (
  <span className="flex items-center gap-1 text-[0.42rem] text-ink-soft">
    <Icono size={7} stroke={2} />
    {texto}
  </span>
);

/* ------------------------------- Paneles -------------------------------- */

const PanelLegajo = () => (
  <>
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-[0.5rem] font-bold text-navy">
        <IconArrowLeft size={9} stroke={2.2} />
        Legajo de empleado
      </span>
      <span className="flex items-center gap-1.5 text-ink-soft">
        <IconBell size={8} stroke={2} />
        <span className="h-3 w-3 rounded-full bg-gradient-to-br from-peach to-brand-400" />
        <IconDotsVertical size={8} stroke={2} />
      </span>
    </div>

    <div className="mt-1.5 flex items-center gap-2 border-b border-line pb-1">
      {[
        'Resumen',
        'Información',
        'Documentos',
        'Historial',
        'Evaluaciones',
      ].map((t, i) => (
        <span
          key={t}
          className={`pb-1 text-[0.42rem] font-semibold ${
            i === 0
              ? 'border-b-[1.5px] border-brand-600 text-brand-600'
              : 'text-ink-soft'
          }`}
        >
          {t}
        </span>
      ))}
    </div>

    <div className="mt-2 grid grid-cols-[1.25fr_1fr] gap-1.5">
      <Tarjeta>
        <span className="flex items-center gap-1.5">
          <span className="h-6 w-6 rounded-full bg-gradient-to-br from-peach to-brand-400" />
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              <span className="text-[0.5rem] font-bold text-navy">
                María López
              </span>
              <Pastilla texto="Activo" tono="bg-emerald-100 text-emerald-700" />
            </span>
            <span className="block text-[0.4rem] text-ink-soft">
              Gerente de Recursos Humanos
            </span>
          </span>
        </span>
        <span className="mt-1.5 flex flex-col gap-0.5">
          <FilaDato icono={IconMail} texto="maria.lopez@empresa.com" />
          <FilaDato icono={IconPhone} texto="+54 11 1234 5678" />
          <FilaDato icono={IconId} texto="Legajo: 0123 · Ingreso: 14/02/2022" />
        </span>
      </Tarjeta>

      <Tarjeta>
        <span className="block text-[0.44rem] font-bold text-navy">
          Información rápida
        </span>
        <span className="mt-1 flex flex-col gap-0.5">
          {[
            ['Departamento', 'Recursos Humanos'],
            ['Ubicación', 'Buenos Aires'],
            ['Supervisor', 'Juan Pérez'],
          ].map(([k, v]) => (
            <span key={k} className="flex justify-between gap-1">
              <span className="text-[0.4rem] text-ink-soft">{k}</span>
              <span className="text-[0.4rem] font-semibold text-navy">{v}</span>
            </span>
          ))}
        </span>
      </Tarjeta>
    </div>

    <Tarjeta className="mt-1.5">
      <span className="flex items-center justify-between">
        <span className="text-[0.44rem] font-bold text-navy">Documentos</span>
        <span className="text-[0.4rem] font-semibold text-brand-600">
          Ver todos
        </span>
      </span>
      <span className="mt-1 grid grid-cols-4 gap-1">
        {[
          ['Contrato laboral', 'PDF · 12/02/2022', 'text-red-500'],
          ['DNI', 'JPG · 12/02/2022', 'text-brand-500'],
          ['Formulario AFIP', 'XLS · 12/02/2022', 'text-emerald-500'],
          ['Recibo de sueldo', 'PDF · 05/2024', 'text-red-500'],
        ].map(([titulo, meta, color]) => (
          <span
            key={titulo}
            className="rounded border border-line px-1 py-1 text-center"
          >
            <IconFileText size={9} stroke={2} className={`mx-auto ${color}`} />
            <span className="mt-0.5 block truncate text-[0.36rem] font-semibold text-navy">
              {titulo}
            </span>
            <span className="block truncate text-[0.32rem] text-ink-soft">
              {meta}
            </span>
          </span>
        ))}
      </span>
    </Tarjeta>
  </>
);

const PanelAsistencia = () => (
  <>
    <span className="text-[0.5rem] font-bold text-navy">
      Control de asistencia
    </span>
    <span className="mt-1.5 grid grid-cols-3 gap-1.5">
      {[
        ['Presentes hoy', '11/12', 'text-emerald-600'],
        ['Llegadas tarde', '1', 'text-orange-500'],
        ['Horas extras', '6,5', 'text-brand-600'],
      ].map(([k, v, color]) => (
        <Tarjeta key={k}>
          <span className="block text-[0.4rem] text-ink-soft">{k}</span>
          <span
            className={`mt-0.5 block text-[0.8rem] font-extrabold leading-none ${color}`}
          >
            {v}
          </span>
        </Tarjeta>
      ))}
    </span>
    <Tarjeta className="mt-1.5">
      <span className="grid grid-cols-4 border-b border-line pb-1 text-[0.38rem] font-bold uppercase tracking-wide text-ink-soft">
        <span>Colaborador</span>
        <span>Ingreso</span>
        <span>Egreso</span>
        <span>Estado</span>
      </span>
      {[
        ['Martín Gómez', '08:02', '17:05', 'En horario', 'emerald'],
        ['Ana Torres', '09:14', '18:10', 'Tarde', 'orange'],
        ['Pedro Ruiz', '07:58', '18:32', 'Horas extras', 'brand'],
        ['Lucía Fernández', '08:00', '—', 'Trabajando', 'brand'],
      ].map(([nombre, ing, egr, estado, tono]) => (
        <span
          key={nombre as string}
          className="grid grid-cols-4 items-center border-b border-line/70 py-[0.22rem] text-[0.4rem] text-ink-soft last:border-0"
        >
          <span className="truncate font-semibold text-navy">{nombre}</span>
          <span className="tabular-nums">{ing}</span>
          <span className="tabular-nums">{egr}</span>
          <span>
            <Pastilla
              texto={estado as string}
              tono={
                tono === 'emerald'
                  ? 'bg-emerald-100 text-emerald-700'
                  : tono === 'orange'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-brand-100 text-brand-700'
              }
            />
          </span>
        </span>
      ))}
    </Tarjeta>
  </>
);

const PanelAusencias = () => (
  <>
    <span className="text-[0.5rem] font-bold text-navy">
      Ausencias y vacaciones
    </span>
    <span className="mt-1.5 grid grid-cols-[1.15fr_1fr] gap-1.5">
      <Tarjeta>
        <span className="block text-[0.44rem] font-bold text-navy">
          Solicitudes pendientes
        </span>
        {[
          ['María López', 'Vacaciones · 17/06 - 21/06'],
          ['Juan Pérez', 'Día personal · 18/06'],
          ['Pedro Ruiz', 'Licencia médica · 19/06'],
        ].map(([nombre, detalle]) => (
          <span
            key={nombre}
            className="mt-1 flex items-center justify-between gap-1 rounded border border-line px-1.5 py-1"
          >
            <span className="min-w-0">
              <span className="block truncate text-[0.42rem] font-semibold text-navy">
                {nombre}
              </span>
              <span className="block truncate text-[0.36rem] text-ink-soft">
                {detalle}
              </span>
            </span>
            <span className="flex shrink-0 gap-0.5">
              <span className="flex h-3 w-3 items-center justify-center rounded bg-emerald-100 text-emerald-700">
                <IconCheck size={6} stroke={3} />
              </span>
              <span className="flex h-3 w-3 items-center justify-center rounded bg-paper text-ink-soft">
                ✕
              </span>
            </span>
          </span>
        ))}
      </Tarjeta>
      <Tarjeta>
        <span className="block text-[0.44rem] font-bold text-navy">
          Saldo de vacaciones
        </span>
        {[
          ['María López', 14, 21],
          ['Juan Pérez', 7, 14],
          ['Ana Torres', 18, 21],
        ].map(([nombre, usados, total]) => (
          <span key={nombre as string} className="mt-1 block">
            <span className="flex justify-between text-[0.38rem] text-ink-soft">
              <span className="font-semibold text-navy">{nombre}</span>
              <span className="tabular-nums">
                {usados}/{total} días
              </span>
            </span>
            <span className="mt-0.5 block h-[0.2rem] w-full rounded-full bg-line">
              <motion.span
                initial={{ width: 0 }}
                whileInView={{
                  width: `${(Number(usados) / Number(total)) * 100}%`,
                }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="block h-full rounded-full bg-brand-500"
              />
            </span>
          </span>
        ))}
      </Tarjeta>
    </span>
    <Tarjeta className="mt-1.5">
      <span className="block text-[0.44rem] font-bold text-navy">
        Calendario del equipo · Junio
      </span>
      <span className="mt-1 grid grid-cols-[repeat(15,1fr)] gap-[0.1rem]">
        {Array.from({ length: 45 }).map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-[1px] ${
              [8, 9, 10, 23, 24, 38].includes(i)
                ? 'bg-brand-400'
                : [16, 31].includes(i)
                  ? 'bg-orange-300'
                  : 'bg-paper'
            }`}
          />
        ))}
      </span>
    </Tarjeta>
  </>
);

const PanelComunicaciones = () => (
  <>
    <span className="text-[0.5rem] font-bold text-navy">Comunicaciones</span>
    <Tarjeta className="mt-1.5">
      {[
        ['Cierre por feriado puente', 'Toda la empresa', '12/12', true],
        ['Nueva política de home office', 'Administración', '11/12', true],
        ['Capacitación de seguridad', 'Producción', '09/12', false],
        ['Entrega de uniformes', 'Logística', '05/12', false],
      ].map(([titulo, sector, fecha, sinLeer]) => (
        <span
          key={titulo as string}
          className="flex items-center gap-1.5 border-b border-line/70 py-1 last:border-0"
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              sinLeer ? 'bg-brand-500' : 'bg-line'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[0.44rem] ${
                sinLeer ? 'font-bold text-navy' : 'font-medium text-ink-soft'
              }`}
            >
              {titulo}
            </span>
            <span className="block text-[0.36rem] text-ink-soft">{sector}</span>
          </span>
          <Pastilla
            texto={sinLeer ? 'Sin leer' : 'Leído'}
            tono={
              sinLeer
                ? 'bg-brand-100 text-brand-700'
                : 'bg-emerald-100 text-emerald-700'
            }
          />
          <span className="w-6 shrink-0 text-right text-[0.36rem] tabular-nums text-ink-soft">
            {fecha}
          </span>
        </span>
      ))}
    </Tarjeta>
    <span className="mt-1.5 grid grid-cols-3 gap-1.5">
      {[
        ['Enviados', '18'],
        ['Confirmaron lectura', '86%'],
        ['Pendientes', '4'],
      ].map(([k, v]) => (
        <Tarjeta key={k}>
          <span className="block text-[0.38rem] text-ink-soft">{k}</span>
          <span className="mt-0.5 block text-[0.72rem] font-extrabold leading-none text-navy">
            {v}
          </span>
        </Tarjeta>
      ))}
    </span>
  </>
);

const PanelDocumentacion = () => (
  <>
    <span className="text-[0.5rem] font-bold text-navy">
      Documentos para firma
    </span>
    <Tarjeta className="mt-1.5">
      <span className="grid grid-cols-[1.5fr_1fr_0.9fr] border-b border-line pb-1 text-[0.38rem] font-bold uppercase tracking-wide text-ink-soft">
        <span>Documento</span>
        <span>Destinatario</span>
        <span>Estado</span>
      </span>
      {[
        ['Notificación de vacaciones', 'María López', 'Firmado', 'emerald'],
        ['Recibo de sueldo · 05/2026', 'Juan Pérez', 'Firmado', 'emerald'],
        ['Política de uso de datos', 'Ana Torres', 'Pendiente', 'orange'],
        ['Adenda de contrato', 'Pedro Ruiz', 'Enviado', 'brand'],
      ].map(([doc, dest, estado, tono]) => (
        <span
          key={doc as string}
          className="grid grid-cols-[1.5fr_1fr_0.9fr] items-center border-b border-line/70 py-[0.22rem] text-[0.4rem] last:border-0"
        >
          <span className="flex items-center gap-1 truncate font-semibold text-navy">
            <IconFileText size={7} stroke={2} className="text-red-500" />
            {doc}
          </span>
          <span className="truncate text-ink-soft">{dest}</span>
          <span>
            <Pastilla
              texto={estado as string}
              tono={
                tono === 'emerald'
                  ? 'bg-emerald-100 text-emerald-700'
                  : tono === 'orange'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-brand-100 text-brand-700'
              }
            />
          </span>
        </span>
      ))}
    </Tarjeta>
    <span className="mt-1.5 grid grid-cols-3 gap-1.5">
      {[
        ['Firmados', '42'],
        ['Pendientes', '6'],
        ['Vencen esta semana', '2'],
      ].map(([k, v]) => (
        <Tarjeta key={k}>
          <span className="block text-[0.38rem] text-ink-soft">{k}</span>
          <span className="mt-0.5 block text-[0.72rem] font-extrabold leading-none text-navy">
            {v}
          </span>
        </Tarjeta>
      ))}
    </span>
  </>
);

const PanelReportes = () => (
  <>
    <span className="text-[0.5rem] font-bold text-navy">
      Reportes del equipo
    </span>
    <span className="mt-1.5 grid grid-cols-[1.4fr_1fr] gap-1.5">
      <Tarjeta>
        <span className="block text-[0.44rem] font-bold text-navy">
          Ausentismo por mes
        </span>
        <span className="mt-1.5 flex h-14 items-end gap-1">
          {[38, 55, 30, 62, 45, 72, 50, 66].map((alto, i) => (
            <motion.span
              key={i}
              initial={{ height: 0 }}
              whileInView={{ height: `${alto}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.05, ease: 'easeOut' }}
              className={`flex-1 rounded-t-[2px] ${
                i === 5 ? 'bg-brand-600' : 'bg-brand-200'
              }`}
            />
          ))}
        </span>
        <span className="mt-1 flex justify-between text-[0.32rem] text-ink-soft">
          {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'].map((m) => (
            <span key={m}>{m}</span>
          ))}
        </span>
      </Tarjeta>
      <Tarjeta>
        <span className="block text-[0.44rem] font-bold text-navy">
          Indicadores
        </span>
        {[
          ['Puntualidad', '94%'],
          ['Rotación', '3,2%'],
          ['Horas extras', '128 h'],
          ['Dotación', '86'],
        ].map(([k, v]) => (
          <span
            key={k}
            className="mt-1 flex items-center justify-between border-b border-line/70 pb-1 text-[0.4rem] last:border-0"
          >
            <span className="text-ink-soft">{k}</span>
            <span className="font-bold tabular-nums text-navy">{v}</span>
          </span>
        ))}
      </Tarjeta>
    </span>
    <Tarjeta className="mt-1.5">
      <span className="flex items-center justify-between">
        <span className="text-[0.44rem] font-bold text-navy">
          Vencimientos próximos
        </span>
        <span className="text-[0.38rem] font-semibold text-brand-600">
          Exportar a Excel
        </span>
      </span>
      <span className="mt-1 grid grid-cols-3 gap-1">
        {[
          ['Libreta sanitaria', '3 personas'],
          ['Carnet de conducir', '1 persona'],
          ['Exámenes periódicos', '5 personas'],
        ].map(([k, v]) => (
          <span key={k} className="rounded border border-line px-1.5 py-1">
            <span className="block truncate text-[0.38rem] font-semibold text-navy">
              {k}
            </span>
            <span className="block text-[0.34rem] text-ink-soft">{v}</span>
          </span>
        ))}
      </span>
    </Tarjeta>
  </>
);

const paneles: Record<ClavePanel, React.FC> = {
  legajo: PanelLegajo,
  asistencia: PanelAsistencia,
  ausencias: PanelAusencias,
  comunicaciones: PanelComunicaciones,
  documentacion: PanelDocumentacion,
  reportes: PanelReportes,
};

/**
 * Pantalla de la app según la solapa elegida. Todo dibujado en HTML:
 * no son capturas, así que se ve nítido en cualquier resolución.
 */
export const PanelPlataforma: React.FC<{ clave: ClavePanel }> = ({ clave }) => {
  const Panel = paneles[clave];
  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-line bg-white shadow-lift">
      {/* Menú lateral */}
      <div className="hidden w-[24%] shrink-0 flex-col gap-px border-r border-line bg-paper/50 px-1.5 py-2 sm:flex">
        <p className="px-1.5 pb-2 text-[0.5rem] font-extrabold tracking-tight text-navy">
          ISEO <span className="text-brand-600">RH</span>
        </p>
        {nav.map(({ icono: Icono, etiqueta, clave: c }) => (
          <span
            key={etiqueta}
            className={`flex items-center gap-1 rounded px-1.5 py-[0.2rem] text-[0.42rem] font-medium transition-colors ${
              c === clave ? 'bg-brand-50 text-brand-700' : 'text-ink-soft'
            }`}
          >
            <Icono size={8} stroke={2} className="shrink-0" />
            {etiqueta}
          </span>
        ))}
      </div>

      {/* Contenido */}
      <motion.div
        key={clave}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="min-w-0 flex-1 bg-paper/40 p-2"
      >
        <Panel />
      </motion.div>
    </div>
  );
};
