/**
 * Qué cuida este archivo: que la puerta de calidad rechace por el motivo
 * **correcto** y que las métricas de imagen midan lo que dicen medir.
 *
 * El motivo importa tanto como el rechazo. Es lo único que la persona
 * frente a la cámara ve: si el sistema dice "falta luz" a alguien que
 * está a dos metros, lo manda a pelearse con la lámpara equivocada
 * mientras la fila espera. El sistema anterior sólo sabía decir "no
 * detectamos ninguna cara".
 */

import {
  estadisticasDeImagen,
  evaluarCalidad,
  evaluarGeometria,
  MENSAJE_MOTIVO,
  PUNTAJE_ACEPTABLE,
  UMBRALES,
  type EntradaCalidad,
} from '@/lib/facial/calidad';
import type { Pose, Referencias } from '@/lib/facial/geometria';

const ANCHO = 1280;
const ALTO = 720;

/** Referencias de una cara centrada, a una distancia cómoda. */
const referencias = (
  sobreescribir: Partial<Referencias> = {}
): Referencias => ({
  ojoDerecho: { x: 560, y: 330 },
  ojoIzquierdo: { x: 720, y: 330 },
  boca: { x: 640, y: 450 },
  nariz: { x: 640, y: 390 },
  costadoDerecho: { x: 505, y: 380 },
  costadoIzquierdo: { x: 775, y: 380 },
  frente: { x: 640, y: 245 },
  menton: { x: 640, y: 520 },
  // 160 px sobre un cuadro de 1280 → 0,125: una cara bien encuadrada a
  // la distancia normal de un kiosco.
  interocular: 160,
  ...sobreescribir,
});

const pose = (sobreescribir: Partial<Pose> = {}): Pose => ({
  rollGrados: 0,
  yaw: 0,
  pitch: 0,
  ...sobreescribir,
});

const entrada = (s: Partial<EntradaCalidad> = {}): EntradaCalidad => ({
  referencias: referencias(),
  pose: pose(),
  estadisticas: { luma: 130, contraste: 45, nitidez: 0.05 },
  anchoCuadro: ANCHO,
  altoCuadro: ALTO,
  parpadeoDerecho: 0.05,
  parpadeoIzquierdo: 0.05,
  centroAnterior: null,
  ...s,
});

describe('estadisticasDeImagen', () => {
  /** RGBA gris uniforme del valor pedido. */
  const uniforme = (valor: number, lado = 32) => {
    const d = new Uint8ClampedArray(lado * lado * 4);
    for (let i = 0; i < lado * lado; i++) {
      d[i * 4] = valor;
      d[i * 4 + 1] = valor;
      d[i * 4 + 2] = valor;
      d[i * 4 + 3] = 255;
    }
    return { d, lado };
  };

  /** Tablero de ajedrez de 1 px: el patrón más nítido posible. */
  const ajedrez = (lado = 32) => {
    const d = new Uint8ClampedArray(lado * lado * 4);
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const v = (x + y) % 2 === 0 ? 40 : 210;
        const i = (y * lado + x) * 4;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    return { d, lado };
  };

  it('mide la luma media', () => {
    const { d, lado } = uniforme(90);
    expect(estadisticasDeImagen(d, lado, lado).luma).toBeCloseTo(90, 0);
  });

  it('da contraste cero en una imagen plana', () => {
    const { d, lado } = uniforme(128);
    expect(estadisticasDeImagen(d, lado, lado).contraste).toBeCloseTo(0, 5);
  });

  it('no divide por cero en una imagen de un solo tono', () => {
    // Es el caso de la cámara tapada. Sin la protección, la nitidez daba
    // NaN y el veredicto se volvía impredecible.
    const { d, lado } = uniforme(128);
    expect(Number.isFinite(estadisticasDeImagen(d, lado, lado).nitidez)).toBe(
      true
    );
  });

  it('da más nitidez a un patrón de bordes que a un degradado suave', () => {
    const { d: nitido, lado } = ajedrez();
    const suave = new Uint8ClampedArray(lado * lado * 4);
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const v = 40 + ((210 - 40) * x) / lado;
        const i = (y * lado + x) * 4;
        suave[i] = v;
        suave[i + 1] = v;
        suave[i + 2] = v;
        suave[i + 3] = 255;
      }
    }
    expect(estadisticasDeImagen(nitido, lado, lado).nitidez).toBeGreaterThan(
      estadisticasDeImagen(suave, lado, lado).nitidez
    );
  });

  it('la nitidez casi no cambia al bajar la iluminación', () => {
    // Es la razón de dividir la varianza del laplaciano por la de la
    // luma. Sin normalizar, una cara nítida con poca luz daba el mismo
    // número que una borrosa bien iluminada, y el sistema rechazaba
    // "por borrosa" a alguien parado en una zona oscura.
    const lado = 32;
    const claro = new Uint8ClampedArray(lado * lado * 4);
    const oscuro = new Uint8ClampedArray(lado * lado * 4);
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const base = (x + y) % 2 === 0 ? 40 : 210;
        const i = (y * lado + x) * 4;
        claro[i] = claro[i + 1] = claro[i + 2] = base;
        oscuro[i] = oscuro[i + 1] = oscuro[i + 2] = base * 0.3;
        claro[i + 3] = oscuro[i + 3] = 255;
      }
    }
    const a = estadisticasDeImagen(claro, lado, lado).nitidez;
    const b = estadisticasDeImagen(oscuro, lado, lado).nitidez;
    expect(Math.abs(a - b) / a).toBeLessThan(0.1);
  });

  it('devuelve ceros si el buffer no alcanza', () => {
    expect(estadisticasDeImagen(new Uint8ClampedArray(4), 32, 32)).toEqual({
      luma: 0,
      contraste: 0,
      nitidez: 0,
    });
  });
});

describe('evaluarGeometria', () => {
  it('acepta una cara centrada, de frente y con los ojos abiertos', () => {
    expect(evaluarGeometria(entrada())).toEqual({ ok: true, motivo: null });
  });

  it.each([
    ['lejos', { referencias: referencias({ interocular: 50 }) }],
    ['cerca', { referencias: referencias({ interocular: 500 }) }],
    ['inclinado', { pose: pose({ rollGrados: 30 }) }],
    ['de_perfil', { pose: pose({ yaw: 0.5 }) }],
    ['cabeza_baja', { pose: pose({ pitch: -0.5 }) }],
    ['ojos_cerrados', { parpadeoDerecho: 0.9, parpadeoIzquierdo: 0.9 }],
  ])('rechaza con motivo "%s"', (motivo, cambio) => {
    expect(
      evaluarGeometria(entrada(cambio as Partial<EntradaCalidad>))
    ).toEqual({
      ok: false,
      motivo,
    });
  });

  it('rechaza una cara pegada al borde del cuadro', () => {
    const r = referencias({
      ojoDerecho: { x: 40, y: 330 },
      ojoIzquierdo: { x: 160, y: 330 },
      boca: { x: 100, y: 430 },
    });
    expect(evaluarGeometria(entrada({ referencias: r }))).toEqual({
      ok: false,
      motivo: 'descentrado',
    });
  });

  it('rechaza el cuadro movido comparando contra el anterior', () => {
    expect(
      evaluarGeometria(entrada({ centroAnterior: { x: 200, y: 200 } }))
    ).toEqual({ ok: false, motivo: 'movido' });
  });

  it('no marca movimiento en el primer cuadro, cuando no hay con qué comparar', () => {
    expect(evaluarGeometria(entrada({ centroAnterior: null })).ok).toBe(true);
  });
});

describe('evaluarCalidad', () => {
  it('acepta un cuadro bueno y le da un puntaje alto', () => {
    const v = evaluarCalidad(entrada());
    expect(v.ok).toBe(true);
    expect(v.puntaje).toBeGreaterThan(0.8);
  });

  it('una cara bien encuadrada no pierde puntaje por no estar pegada a la cámara', () => {
    // El tamaño tiene una meseta, no un óptimo puntual: entre 0,11 y
    // 0,25 el modelo anda igual. Usar el medio del rango tolerado como
    // ideal castigaba una cara perfectamente encuadrada, y ese puntaje
    // bajo se propagaba a la selección de los mejores cuadros.
    const comodo = evaluarCalidad(
      entrada({ referencias: referencias({ interocular: 160 }) })
    );
    const cerca = evaluarCalidad(
      entrada({ referencias: referencias({ interocular: 280 }) })
    );
    expect(comodo.puntaje).toBeCloseTo(cerca.puntaje, 5);
  });

  it('castiga a la cara que está en el límite de lo aceptable por lejana', () => {
    const v = evaluarCalidad(
      entrada({ referencias: referencias({ interocular: 100 }) })
    );
    expect(v.ok).toBe(true);
    expect(v.puntaje).toBeLessThan(0.4);
  });

  it('rechaza por falta de luz', () => {
    const v = evaluarCalidad(
      entrada({ estadisticas: { luma: 20, contraste: 45, nitidez: 0.05 } })
    );
    expect(v.motivo).toBe('oscuro');
  });

  it('rechaza el contraluz que quema la imagen', () => {
    const v = evaluarCalidad(
      entrada({ estadisticas: { luma: 240, contraste: 45, nitidez: 0.05 } })
    );
    expect(v.motivo).toBe('quemado');
  });

  it('rechaza por falta de foco', () => {
    const v = evaluarCalidad(
      entrada({ estadisticas: { luma: 130, contraste: 45, nitidez: 0.001 } })
    );
    expect(v.motivo).toBe('borroso');
  });

  it('prioriza el problema geométrico sobre el fotométrico', () => {
    // Alguien lejos y con poca luz tiene que escuchar "acercate"
    // primero: es lo que puede resolver solo y de una. Cambiar de lugar
    // la lámpara viene después.
    const v = evaluarCalidad(
      entrada({
        referencias: referencias({ interocular: 50 }),
        estadisticas: { luma: 20, contraste: 5, nitidez: 0.001 },
      })
    );
    expect(v.motivo).toBe('lejos');
  });

  it('el puntaje es el mínimo de los parciales, no el promedio', () => {
    // Un cuadro perfecto salvo que está casi de perfil no es un buen
    // cuadro. El promedio lo disimularía y ese cuadro entraría a la
    // plantilla arrastrándola hacia el ruido.
    const casiPerfil = evaluarCalidad(
      entrada({ pose: pose({ yaw: UMBRALES.yawMaximo * 0.95 }) })
    );
    expect(casiPerfil.ok).toBe(true);
    expect(casiPerfil.puntaje).toBeLessThan(0.1);
  });

  it('un cuadro flojo dice cuál métrica lo hundió, no "borroso" por defecto', () => {
    // El motor rechaza también por puntaje bajo, y ahí el veredicto es
    // `ok: true` con `motivo: null`. Antes rellenaba ese hueco con
    // 'borroso' fijo: alguien casi de perfil leía "la imagen sale
    // borrosa: limpiá la cámara" y se ponía a limpiar el vidrio.
    const casiPerfil = evaluarCalidad(
      entrada({ pose: pose({ yaw: UMBRALES.yawMaximo * 0.95 }) })
    );
    expect(casiPerfil.motivo).toBeNull();
    expect(casiPerfil.debil).toBe('de_perfil');

    const casiOscuro = evaluarCalidad(
      entrada({ estadisticas: { luma: 62, contraste: 45, nitidez: 0.05 } })
    );
    expect(casiOscuro.debil).toBe('oscuro');

    const casiQuemado = evaluarCalidad(
      entrada({ estadisticas: { luma: 198, contraste: 45, nitidez: 0.05 } })
    );
    expect(casiQuemado.debil).toBe('quemado');
  });

  it('acepta una cara apenas blanda, como la que da cualquier webcam', () => {
    // Reproducción del rechazo de enrolamiento: con el divisor viejo
    // (`nitidez / (nitidezMinima * 3)` y min = 0,012) este cuadro daba
    // puntaje 0,333. El motor exige PUNTAJE_ACEPTABLE = 0,35, así que
    // pasaba la puerta de foco y igual no entraba a la plantilla. Como
    // el motivo iba vacío, la pantalla decía "borrosa" en todos los
    // intentos y nadie se podía enrolar.
    const blanda = evaluarCalidad(
      entrada({ estadisticas: { luma: 130, contraste: 45, nitidez: 0.012 } })
    );
    expect(blanda.ok).toBe(true);
    expect(blanda.motivo).toBeNull();
    expect(blanda.puntaje).toBeGreaterThan(PUNTAJE_ACEPTABLE);
    expect(0.012 / UMBRALES.nitidezComoda).toBeGreaterThan(PUNTAJE_ACEPTABLE);
  });

  it('un cuadro que apenas pasa la puerta de foco no entra a la plantilla', () => {
    // Lo otro que hay que sostener: aflojar el piso no puede convertir
    // un cuadro dudoso en referencia. La puerta lo deja pasar, el
    // puntaje lo deja afuera del promedio.
    const alLimite = evaluarCalidad(
      entrada({
        estadisticas: {
          luma: 130,
          contraste: 45,
          nitidez: UMBRALES.nitidezMinima * 1.01,
        },
      })
    );
    expect(alLimite.ok).toBe(true);
    expect(alLimite.puntaje).toBeLessThan(PUNTAJE_ACEPTABLE);
    expect(alLimite.debil).toBe('borroso');
  });

  it('expone las métricas crudas para el modo diagnóstico', () => {
    const v = evaluarCalidad(entrada());
    expect(v.metricas.tamano).toBeCloseTo(160 / ANCHO, 5);
    expect(v.metricas.luma).toBe(130);
  });

  it('tiene un mensaje para cada motivo de rechazo', () => {
    // Sin esto, agregar un motivo nuevo dejaría a la persona con un
    // `undefined` en la pantalla.
    expect(
      Object.values(MENSAJE_MOTIVO).every((texto) => texto.length > 0)
    ).toBe(true);
  });
});
