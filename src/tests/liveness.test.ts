/**
 * Qué cuida este archivo: que la prueba de vida exija el **gesto
 * completo** y no un cuadro suelto, y que el desafío de pose no se pueda
 * cumplir por accidente.
 *
 * La versión anterior de este módulo declaraba "vivo" con un parpadeo.
 * Eso corta la foto impresa y la foto en pantalla, pero **no un vídeo**,
 * que en un control horario es el ataque realista: el compañero graba
 * cinco segundos de quien llegó tarde y ficha por él. El desafío de pose
 * existe para eso, y sólo sirve si el lado es impredecible y hay que
 * responder en una ventana corta.
 */

import {
  camaraTrabada,
  cumpleDesafio,
  CUADROS_MINIMOS,
  CUADROS_PARA_TRABADA,
  evaluarLiveness,
  hayParpadeo,
  OJO_ABIERTO,
  OJO_CERRADO,
  sortearLado,
  YAW_DESAFIO,
  YAW_FRONTAL,
} from '@/lib/facial/liveness';

const abierto = OJO_ABIERTO - 0.05;
const cerrado = OJO_CERRADO + 0.05;
/** En la banda muerta entre los dos umbrales: no es ni una cosa ni la otra. */
const entremedio = (OJO_ABIERTO + OJO_CERRADO) / 2;

describe('hayParpadeo', () => {
  it('reconoce el ciclo completo abierto → cerrado → abierto', () => {
    expect(hayParpadeo([abierto, abierto, cerrado, abierto])).toBe(true);
  });

  it('no acepta ojos siempre abiertos (una foto de frente)', () => {
    expect(hayParpadeo([abierto, abierto, abierto, abierto])).toBe(false);
  });

  it('no acepta ojos siempre cerrados (una foto con los ojos cerrados)', () => {
    // Si sólo se mirara "hubo un cuadro con los ojos cerrados", alcanzaba
    // con presentar esa foto.
    expect(hayParpadeo([cerrado, cerrado, cerrado])).toBe(false);
  });

  it('no cierra el ciclo si no vuelve a abrir', () => {
    expect(hayParpadeo([abierto, cerrado, cerrado])).toBe(false);
  });

  it('no cuenta como parpadeo un valor que oscila en la banda muerta', () => {
    // Es lo que produce el ruido de la cámara sobre una imagen fija. Sin
    // la histéresis, ese ruido se leería como una ráfaga de parpadeos.
    expect(
      hayParpadeo([abierto, entremedio, abierto, entremedio, abierto])
    ).toBe(false);
  });
});

describe('cumpleDesafio', () => {
  const frente = 0;
  const giroIzq = YAW_DESAFIO + 0.05;
  const giroDer = -(YAW_DESAFIO + 0.05);

  it('acepta frente → giro al lado pedido → frente', () => {
    expect(cumpleDesafio('izquierda', [frente, giroIzq, frente])).toBe(true);
    expect(cumpleDesafio('derecha', [frente, giroDer, frente])).toBe(true);
  });

  it('rechaza el giro al lado contrario', () => {
    // Es la mitad del valor del desafío: si aceptara cualquier giro, un
    // vídeo con un solo lado grabado alcanzaría.
    expect(cumpleDesafio('izquierda', [frente, giroDer, frente])).toBe(false);
  });

  it('rechaza quedarse quieto de frente', () => {
    expect(cumpleDesafio('izquierda', [frente, frente, frente])).toBe(false);
  });

  it('rechaza girar y no volver al frente', () => {
    expect(cumpleDesafio('izquierda', [frente, giroIzq, giroIzq])).toBe(false);
  });

  it('rechaza empezar ya girado (una foto de perfil)', () => {
    expect(cumpleDesafio('izquierda', [giroIzq, giroIzq, giroIzq])).toBe(false);
  });

  it('no acepta un giro que no llega al mínimo pedido', () => {
    const tibio = (YAW_DESAFIO + YAW_FRONTAL) / 2;
    expect(cumpleDesafio('izquierda', [frente, tibio, frente])).toBe(false);
  });
});

describe('sortearLado', () => {
  it('devuelve los dos lados a lo largo de muchas tiradas', () => {
    // No se testea la calidad del generador —eso lo garantiza
    // `crypto.getRandomValues`— sino que no haya quedado un lado fijo,
    // que dejaría el desafío sin ningún valor.
    const vistos = new Set(Array.from({ length: 200 }, () => sortearLado()));
    expect(vistos.size).toBe(2);
  });
});

describe('camaraTrabada', () => {
  it('detecta el vídeo congelado', () => {
    expect(camaraTrabada(Array(CUADROS_PARA_TRABADA).fill(0))).toBe(true);
  });

  it('no confunde a una persona quieta con un cuadro repetido', () => {
    // Alguien quieto igual mueve el centroide décimas de píxel. Cero
    // movimiento exacto es un cuadro repetido, no una persona.
    expect(camaraTrabada(Array(CUADROS_PARA_TRABADA).fill(0.002))).toBe(false);
  });

  it('no dictamina con pocos cuadros', () => {
    expect(camaraTrabada(Array(CUADROS_PARA_TRABADA - 1).fill(0))).toBe(false);
  });
});

describe('evaluarLiveness', () => {
  const movimientoNormal = Array(20).fill(0.004);
  const cierresConParpadeo = [
    ...Array(CUADROS_MINIMOS).fill(abierto),
    cerrado,
    abierto,
  ];

  it('con exigencia "ninguna" no pide nada (enrolamiento supervisado)', () => {
    expect(
      evaluarLiveness({
        exigencia: 'ninguna',
        cierres: [],
        yaws: [],
        movimientos: movimientoNormal,
      })
    ).toEqual({ vivo: true });
  });

  it('la cámara trabada gana sobre cualquier otra cosa', () => {
    // Si el vídeo no se actualiza, lo que se está evaluando no es una
    // persona: no tiene sentido opinar sobre su parpadeo.
    expect(
      evaluarLiveness({
        exigencia: 'ninguna',
        cierres: cierresConParpadeo,
        yaws: [],
        movimientos: Array(CUADROS_PARA_TRABADA).fill(0),
      })
    ).toEqual({ vivo: false, motivo: 'camara_trabada' });
  });

  it('no da por viva una secuencia demasiado corta', () => {
    // Ante la duda no se afirma: que la persona repita el gesto cuesta
    // segundos; registrar una fichada que no hizo cuesta un problema con
    // el registro horario.
    expect(
      evaluarLiveness({
        exigencia: 'parpadeo',
        cierres: [abierto, cerrado],
        yaws: [],
        movimientos: movimientoNormal,
      })
    ).toEqual({ vivo: false, motivo: 'pocos_cuadros' });
  });

  it('acepta el parpadeo cuando alcanza con eso', () => {
    expect(
      evaluarLiveness({
        exigencia: 'parpadeo',
        cierres: cierresConParpadeo,
        yaws: [],
        movimientos: movimientoNormal,
      })
    ).toEqual({ vivo: true });
  });

  it('con desafío exigido, el parpadeo solo no alcanza', () => {
    expect(
      evaluarLiveness({
        exigencia: 'parpadeo_y_desafio',
        cierres: cierresConParpadeo,
        yaws: [0, 0, 0],
        movimientos: movimientoNormal,
        lado: 'izquierda',
      })
    ).toEqual({ vivo: false, motivo: 'desafio_no_cumplido' });
  });

  it('acepta parpadeo + desafío cumplido', () => {
    expect(
      evaluarLiveness({
        exigencia: 'parpadeo_y_desafio',
        cierres: cierresConParpadeo,
        yaws: [0, YAW_DESAFIO + 0.1, 0],
        movimientos: movimientoNormal,
        lado: 'izquierda',
      })
    ).toEqual({ vivo: true });
  });

  it('sin lado sorteado, el desafío no se puede dar por cumplido', () => {
    expect(
      evaluarLiveness({
        exigencia: 'parpadeo_y_desafio',
        cierres: cierresConParpadeo,
        yaws: [0, YAW_DESAFIO + 0.1, 0],
        movimientos: movimientoNormal,
        lado: null,
      })
    ).toEqual({ vivo: false, motivo: 'desafio_no_cumplido' });
  });
});
