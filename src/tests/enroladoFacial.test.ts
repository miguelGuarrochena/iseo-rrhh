import {
  necesitaReenrolar,
  plantillaVigente,
  tieneRostroEnrolado,
} from '@/lib/facial/enrolado';
import { VERSION_PLANTILLA } from '@/lib/facial/plantilla';
import { faltasDeEmpleado } from '@/lib/requisitos';
import type { Empleado } from '@/types/rrhh';

/**
 * La pregunta "¿está enrolada?" se contesta distinto según el backend, y
 * ninguna pantalla debería tener que saberlo.
 *
 * El backend real dejó de devolver `descriptorFacial` (FIC-011): es el
 * secreto con el que se autentica el fichaje facial, y con esos 128
 * números se ficha por REST sin cámara ni prueba de vida. Ahora manda
 * `tieneRostro`. El modo demo compara en memoria y sigue teniendo el
 * descriptor.
 *
 * El riesgo que cubren estos casos es silencioso: si una pantalla vuelve
 * a mirar `descriptorFacial?.length`, contra el backend real da siempre
 * falso y el botón "Fichar" desaparece para gente que sí está enrolada,
 * sin ningún error a la vista.
 */
describe('tieneRostroEnrolado', () => {
  it('backend real: se guía por tieneRostro', () => {
    expect(tieneRostroEnrolado({ tieneRostro: true })).toBe(true);
    expect(tieneRostroEnrolado({ tieneRostro: false })).toBe(false);
  });

  it('modo demo: se guía por el descriptor que tiene en memoria', () => {
    expect(tieneRostroEnrolado({ descriptorFacial: [0.1, 0.2] })).toBe(true);
    expect(tieneRostroEnrolado({ descriptorFacial: [] })).toBe(false);
  });

  it('tieneRostro manda sobre el descriptor cuando vienen los dos', () => {
    // El servidor es la autoridad: si dice que no hay rostro, no lo hay,
    // aunque haya quedado un descriptor viejo en memoria.
    expect(
      tieneRostroEnrolado({ tieneRostro: false, descriptorFacial: [0.1] })
    ).toBe(false);
  });

  it('sin ninguno de los dos campos, no está enrolada', () => {
    expect(tieneRostroEnrolado({})).toBe(false);
  });

  it('no rompe con la ficha todavía sin cargar', () => {
    expect(tieneRostroEnrolado(null)).toBe(false);
    expect(tieneRostroEnrolado(undefined)).toBe(false);
  });
});

/**
 * "Estar enrolado" y "poder fichar" dejaron de ser lo mismo.
 *
 * El servidor compara sólo contra plantillas de la misma versión, así que
 * alguien enrolado con el pipeline anterior está enrolado y aun así
 * rebota: para el RPC su plantilla no existe. Si la pantalla mostrara
 * "Rostro registrado ✓" a esa persona, el problema aparecería recién en
 * la terminal, con la fila formada atrás.
 */
describe('plantillaVigente', () => {
  it('la plantilla de la versión actual sirve', () => {
    expect(
      plantillaVigente({
        tieneRostro: true,
        descriptorVersion: VERSION_PLANTILLA,
      })
    ).toBe(true);
  });

  it('una plantilla de versión anterior NO sirve', () => {
    expect(
      plantillaVigente({
        tieneRostro: true,
        descriptorVersion: VERSION_PLANTILLA - 1,
      })
    ).toBe(false);
  });

  it('sin versión se comporta exactamente igual que con versión 1', () => {
    // Es el estado de las filas anteriores a la migración. El RPC hace
    // `coalesce(descriptor_version, 1)`, y acá tiene que coincidir o la
    // pantalla diría una cosa y el servidor haría otra. Se comparan los
    // dos casos entre sí en vez de contra un valor fijo: así el test
    // sigue diciendo la verdad cuando la versión suba a 3.
    expect(plantillaVigente({ tieneRostro: true })).toBe(
      plantillaVigente({ tieneRostro: true, descriptorVersion: 1 })
    );
  });

  it('sin rostro no hay plantilla vigente', () => {
    expect(
      plantillaVigente({
        tieneRostro: false,
        descriptorVersion: VERSION_PLANTILLA,
      })
    ).toBe(false);
    expect(plantillaVigente(null)).toBe(false);
  });
});

/**
 * El re-enrolamiento tiene que ser **visible**, no sólo correcto.
 *
 * Durante el despliegue, quien tenga plantilla v1 no puede fichar con la
 * cara. Si eso no apareciera en la lista de pendientes de RRHH, el
 * síntoma llegaría por el lado equivocado: la persona parada frente a la
 * terminal escuchando "No reconocimos el rostro", intentando de nuevo
 * contra una cámara que nunca la va a reconocer.
 */
describe('visibilidad del re-enrolamiento para RRHH', () => {
  const base = {
    id: 'ple-1',
    nombre: 'Ana',
    apellido: 'Pérez',
    modoFichaje: 'planta',
    consentimientoBiometrico: { aceptado: true, fecha: '2026-01-01' },
  } as unknown as Empleado;

  const clavesFichaje = (e: Empleado) =>
    faltasDeEmpleado(e, {}, 'fichaje').map((f) => f.clave);

  it('quien tiene plantilla v1 aparece como pendiente y BLOQUEA', () => {
    const faltas = faltasDeEmpleado(
      { ...base, tieneRostro: true, descriptorVersion: 1 },
      {},
      'fichaje'
    );
    const falta = faltas.find((f) => f.clave === 'facial_plantilla_vieja');
    expect(falta).toBeDefined();
    // `bloquea` y no `avisa`: no es una mejora pendiente, es que esa
    // persona hoy no puede fichar.
    expect(falta!.severidad).toBe('bloquea');
  });

  it('quien ya está en v2 no aparece', () => {
    expect(
      clavesFichaje({
        ...base,
        tieneRostro: true,
        descriptorVersion: VERSION_PLANTILLA,
      })
    ).not.toContain('facial_plantilla_vieja');
  });

  it('quien nunca se enroló aparece como "sin rostro", no como "plantilla vieja"', () => {
    // Son dos listas distintas y dos acciones distintas. Mezclarlas haría
    // que RRHH no supiera si tiene que enrolar por primera vez o volver a
    // tomar, y son conversaciones distintas con la persona.
    const claves = clavesFichaje({ ...base, tieneRostro: false });
    expect(claves).toContain('facial_sin_rostro');
    expect(claves).not.toContain('facial_plantilla_vieja');
  });
});

describe('necesitaReenrolar', () => {
  it('marca a quien tiene plantilla vieja', () => {
    expect(necesitaReenrolar({ tieneRostro: true, descriptorVersion: 1 })).toBe(
      true
    );
  });

  it('NO marca a quien nunca se enroló', () => {
    // Son dos listas distintas y dos acciones distintas: a quien nunca se
    // enroló hay que enrolarlo; a quien tiene plantilla vieja hay que
    // volver a tomarle el rostro y avisarle por qué dejó de andar.
    expect(necesitaReenrolar({ tieneRostro: false })).toBe(false);
  });

  it('NO marca a quien ya está en la versión actual', () => {
    expect(
      necesitaReenrolar({
        tieneRostro: true,
        descriptorVersion: VERSION_PLANTILLA,
      })
    ).toBe(false);
  });
});
