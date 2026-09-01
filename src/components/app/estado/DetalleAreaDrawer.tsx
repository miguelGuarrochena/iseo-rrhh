'use client';

import { Drawer } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { BloqueFaltas, BloqueFaltasDeVarios } from '@/components/app/Faltas';
import { tono } from '@/components/app/estado/tono';
import { AreaEstado } from '@/lib/estadoRrhh';

/**
 * El detalle de un área, en un panel al costado.
 *
 * Antes el detalle se abría debajo de todo el grid: con tres columnas,
 * apretar "Ver detalle" en la primera tarjeta desplegaba contenido a
 * dos filas de distancia, fuera de la pantalla, y parecía que el botón
 * no había hecho nada. Un panel aparece siempre en el mismo lugar, no
 * corre nada de sitio y tiene su propio scroll, que es lo que hace
 * falta cuando el área tiene dieciséis personas con pendientes.
 *
 * El encabezado repite el punto de color de la tarjeta y el panel es
 * angosto a propósito: tiene que leerse como el detalle de la tarjeta
 * que quedó marcada atrás, no como otra pantalla. A 640px la mayoría de
 * las áreas dejaban media pantalla vacía y una sola columna de texto
 * estirada; a 480 el contenido llena el ancho y se sigue viendo el
 * grid de atrás, que es la referencia de dónde estás parado.
 */
export const DetalleAreaDrawer = ({
  area,
  onCerrar,
}: {
  area: AreaEstado | null;
  onCerrar: () => void;
}) => {
  const anchaPantalla = useMediaQuery('(min-width: 640px)', true);
  const c = area ? tono(area) : null;

  return (
    <Drawer
      opened={area !== null}
      onClose={onCerrar}
      position={anchaPantalla ? 'right' : 'bottom'}
      size={anchaPantalla ? 480 : '88%'}
      // 24px: el mismo aire que el `sm:p-6` de los paneles de la app.
      // El token `lg` de Mantine son 20 y el siguiente salta a 32.
      padding={anchaPantalla ? 24 : 'md'}
      overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
      title={
        area &&
        c && (
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.punto}`}
            />
            <span className="min-w-0 break-words">{area.etiqueta}</span>
          </span>
        )
      }
      styles={{
        title: { fontWeight: 800, fontSize: '1.0625rem' },
        content: anchaPantalla
          ? undefined
          : { borderRadius: '24px 24px 0 0', height: 'auto' },
      }}
    >
      {area && c && (
        <div className="flex flex-col gap-5 pb-[env(safe-area-inset-bottom)]">
          {/* Qué es el área y cómo viene. Van en renglones separados
              porque el porcentaje pegado al final de la descripción
              quedaba como una coletilla en negrita partida al medio, y
              en la tarjeta es el número más grande de todos. */}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm leading-relaxed text-ink-soft">
              {area.descripcion}
            </p>
            {area.cumplimientoPct !== undefined && (
              <p className={`text-sm font-semibold ${c.texto}`}>
                El {area.cumplimientoPct}% de los legajos de esta área está al
                día
              </p>
            )}
          </div>

          {area.faltasEmpresa.length > 0 && (
            <BloqueFaltas
              faltas={area.faltasEmpresa}
              titulo="Lo que falta configurar"
            />
          )}
          {area.items.length > 0 && (
            <BloqueFaltasDeVarios
              items={area.items}
              titulo={`${area.conPendientes} ${
                area.conPendientes === 1 ? 'persona' : 'personas'
              } con pendientes`}
            />
          )}
        </div>
      )}
    </Drawer>
  );
};
