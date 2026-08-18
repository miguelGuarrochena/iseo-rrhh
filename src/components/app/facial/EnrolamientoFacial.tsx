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
      <div className="flex h-full flex-col">
        <h2 className="text-base font-bold text-ink">Reconocimiento facial</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Para fichar en la terminal de planta. No se guarda ninguna foto: se
          toma un código del rostro.
        </p>

        {!enrolado ? (
          <div className="mt-4 flex flex-1 flex-col rounded-2xl bg-paper px-4 py-4">
            <p className="text-sm font-semibold text-ink">
              Todavía no tiene el rostro registrado
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {nombre} no puede fichar con la cara hasta que lo registres. Hace
              falta que esté presente, de frente y con buena luz.
            </p>
            <Boton
              variante="primario"
              className="mt-auto self-start"
              onClick={abrir}
              disabled={guardando}
            >
              <IconFaceId size={18} stroke={1.9} />
              Registrar rostro
            </Boton>
          </div>
        ) : hayQueReenrolar ? (
          <div className="mt-4 flex flex-1 flex-col rounded-2xl bg-amber-50 px-4 py-4">
            <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-900">
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
              Hay que volver a tomarle el rostro
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">
              Está registrado con una versión anterior. Hasta que no lo
              actualices, la terminal no lo va a reconocer.
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Boton variante="primario" onClick={abrir} disabled={guardando}>
                <IconFaceId size={18} stroke={1.9} />
                Volver a tomar
              </Boton>
              <Boton
                variante="secundario"
                onClick={() => void quitar()}
                disabled={guardando}
              >
                <IconTrash size={16} />
                Quitar
              </Boton>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-1 flex-col rounded-2xl bg-emerald-50 px-4 py-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
              <IconCircleCheck size={16} />
              Rostro registrado
              {empleado.consentimientoBiometrico?.fecha
                ? ` · ${empleado.consentimientoBiometrico.fecha}`
                : ''}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-800/80">
              Ya puede fichar con la cara. Si cambia el aspecto (barba, lentes)
              o deja de reconocerlo, volvé a registrarlo.
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Boton variante="secundario" onClick={abrir} disabled={guardando}>
                Volver a registrar
              </Boton>
              <Boton
                variante="secundario"
                onClick={() => void quitar()}
                disabled={guardando}
              >
                <IconTrash size={16} />
                Quitar
              </Boton>
            </div>
          </div>
        )}
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
            {nombre} tiene que mirar al óvalo de frente, con buena luz y sin
            lentes de sol. No hace falta apretar ningún botón: la cámara toma
            varias tomas sola. No se guarda ninguna imagen, sólo un código del
            que no se puede reconstruir la cara.
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
              mensajeProcesando="Registrando el rostro…"
              ayuda="Poné la cara en el óvalo. Los puntos verdes marcan cada toma."
              pausaAlCompletar={1200}
              exigencia="ninguna"
              muestras={MUESTRAS_ENROLADO}
              intento={intento}
            />
          ) : (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900">
              Marcá el consentimiento para habilitar la cámara.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
};
