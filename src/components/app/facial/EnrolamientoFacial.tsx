'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconFaceId,
  IconCircleCheck,
  IconTrash,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CapturaFacial } from './CapturaFacial';
import { avisoError, avisoExito } from '@/lib/avisos';
import { borrarRostro, enrolarRostro } from '@/lib/services/rrhh';
import { necesitaReenrolar, tieneRostroEnrolado } from '@/lib/facial/enrolado';
import { DISPERSION_MAXIMA_ENROLADO } from '@/lib/facial/plantilla';
import type { DetallePlantilla } from '@/lib/facial/motor';
import { Empleado } from '@/types/rrhh';

/**
 * Cuántas muestras componen la plantilla de referencia.
 *
 * Más que en el fichaje (3), y por una razón asimétrica: el enrolamiento
 * se hace **una vez** y define la referencia de todo el año, mientras que
 * un fichaje que sale mal se repite en cinco segundos. Vale la pena
 * gastar un par de segundos más acá.
 *
 * El motor junta hasta 12 candidatos y se queda con los 5 de mejor
 * puntaje, separados por al menos 220 ms entre sí: no son cinco cuadros
 * consecutivos casi idénticos, sino cinco momentos distintos, con
 * variaciones naturales de pose y expresión. Eso es lo que hace que
 * promediarlos cancele ruido en vez de repetirlo.
 */
const MUESTRAS_ENROLADO = 5;

interface EnrolamientoFacialProps {
  empleado: Empleado;
  onActualizado: (empleado: Empleado) => void;
}

/**
 * Registro del rostro del colaborador para el fichaje facial.
 * Requiere consentimiento explícito (dato biométrico, Ley 25.326).
 */
export const EnrolamientoFacial = ({
  empleado,
  onActualizado,
}: EnrolamientoFacialProps) => {
  const [abierto, { open, close }] = useDisclosure(false);
  const [consiente, setConsiente] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(0);

  const enrolado = tieneRostroEnrolado(empleado);
  const hayQueReenrolar = necesitaReenrolar(empleado);
  const nombre = empleado.nombre;

  /**
   * El texto exacto que se acepta. Se guarda junto al consentimiento: si
   * mañana hay un reclamo, hay que poder mostrar qué se informó, no sólo
   * que alguien tildó una casilla.
   */
  const textoConsentimiento =
    `${empleado.nombre} ${empleado.apellido} autoriza el uso de sus datos ` +
    `biométricos (rostro) para registrar su asistencia, conforme a la Ley ` +
    `25.326 de Protección de Datos Personales.`;

  const abrir = () => {
    setConsiente(false);
    open();
  };

  const capturar = async (plantilla: number[], detalle: DetallePlantilla) => {
    // La pantalla no habilita la cámara sin el tilde, pero el chequeo va
    // igual acá: el consentimiento es la condición para guardar el dato,
    // no para mostrar un botón.
    if (!consiente) {
      avisoError(
        'Falta el consentimiento',
        'Sin la autorización del titular no podemos registrar el rostro.'
      );
      return;
    }

    // Control de coherencia del enrolamiento.
    //
    // Es la referencia contra la que esta persona se va a comparar todos
    // los días del año: si las muestras que la componen no se parecen
    // entre sí, la plantilla no describe a nadie y el resultado son
    // falsos rechazos permanentes que después nadie sabe explicar. Pasa
    // cuando alguien se cruza frente a la cámara durante la captura, o
    // cuando media cara queda tapada en algunas tomas.
    //
    // Antes no había ningún control: se guardaba un descriptor de un
    // cuadro cualquiera, sin score mínimo, sin nitidez, sin pose.
    if (detalle.dispersion > DISPERSION_MAXIMA_ENROLADO) {
      setIntento((n) => n + 1);
      avisoError(
        'Las tomas no coinciden entre sí',
        'Que quede una sola persona frente a la cámara, con buena luz y sin taparse la cara. Volvé a intentarlo.'
      );
      return;
    }

    setGuardando(true);
    try {
      const actualizado = await enrolarRostro(empleado.id, plantilla, {
        aceptado: true,
        texto: textoConsentimiento,
      });
      if (actualizado) {
        onActualizado(actualizado);
        avisoExito(
          'Rostro registrado',
          `${nombre} ya puede fichar con la cara.`
        );
        close();
      }
    } catch {
      avisoError('No pudimos registrar el rostro', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    setGuardando(true);
    try {
      const actualizado = await borrarRostro(empleado.id);
      if (actualizado) {
        onActualizado(actualizado);
        avisoExito('Rostro eliminado', 'Se borró el dato biométrico.');
      }
    } catch {
      avisoError('No pudimos eliminar el rostro', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <IconFaceId size={20} stroke={1.9} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Reconocimiento facial</p>
            {/*
              Tres estados, no dos. "Registrado" y "puede fichar" dejaron
              de ser lo mismo: el servidor sólo compara contra plantillas
              de la versión vigente, así que alguien registrado con el
              pipeline anterior rebota en la terminal. Mostrarle el tilde
              verde sería mandarlo a descubrirlo con la fila atrás.
            */}
            {!enrolado ? (
              <p className="mt-0.5 text-sm text-ink-soft">
                Sin rostro registrado. No puede fichar con la cara todavía.
              </p>
            ) : hayQueReenrolar ? (
              <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-amber-700">
                <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Registrado con una versión anterior del sistema. Hay que
                  volver a tomarle el rostro para que pueda fichar.
                </span>
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-emerald-700">
                <IconCircleCheck size={15} />
                Rostro registrado
                {empleado.consentimientoBiometrico?.fecha
                  ? ` · ${empleado.consentimientoBiometrico.fecha}`
                  : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {enrolado && (
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => void quitar()}
              disabled={guardando}
            >
              <IconTrash size={15} />
            </Boton>
          )}
          <Boton
            variante={hayQueReenrolar ? 'primario' : 'secundario'}
            tamano="sm"
            onClick={abrir}
          >
            {hayQueReenrolar
              ? 'Volver a tomar'
              : enrolado
                ? 'Volver a registrar'
                : 'Registrar rostro'}
          </Boton>
        </div>
      </div>

      <Modal
        opened={abierto}
        onClose={close}
        title={`Registrar rostro de ${nombre}`}
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            {nombre} tiene que mirar a la cámara unos segundos, con buena luz y
            sin lentes de sol. No se guarda ninguna imagen: se toman varias
            medidas del rostro y se guarda un promedio, un código del que no se
            puede reconstruir la cara.
          </p>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-paper/60 p-3">
            <input
              type="checkbox"
              checked={consiente}
              onChange={(e) => setConsiente(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            />
            <span className="text-sm text-ink">{textoConsentimiento}</span>
          </label>

          {/*
            `exigencia="ninguna"`: el enrolamiento lo hace alguien de RRHH
            con la persona presente, así que la garantía de que hay
            alguien vivo del otro lado es humana, no algorítmica. Pedir un
            parpadeo o un giro acá sería fricción sin riesgo que la
            justifique — y en la tablet de planta, que es donde el riesgo
            sí existe, la exigencia está puesta al máximo.
          */}
          {consiente ? (
            <CapturaFacial
              onPlantilla={(plantilla, detalle) =>
                void capturar(plantilla, detalle)
              }
              procesando={guardando}
              exigencia="ninguna"
              muestras={MUESTRAS_ENROLADO}
              intento={intento}
            />
          ) : (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
              Marcá el consentimiento para habilitar la cámara.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
};
