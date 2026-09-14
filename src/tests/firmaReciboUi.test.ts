import {
  AVISO_FIRMA_SIN_SELLO,
  claseVerificacion,
  ETIQUETA_FIRMA_PENDIENTE,
  etiquetaFirmaConfirmada,
  puedeFirmarTrasVer,
  vistosTrasAbrir,
} from '@/lib/firmaReciboUi';

describe('firma de recibo: copy y reglas de UI', () => {
  it('no afirma que el PDF lleve un sello visual', () => {
    expect(AVISO_FIRMA_SIN_SELLO.toLowerCase()).toContain('constancia digital');
    expect(AVISO_FIRMA_SIN_SELLO.toLowerCase()).toContain(
      'no incluye un sello'
    );
    expect(AVISO_FIRMA_SIN_SELLO.toLowerCase()).not.toContain('firma digital');
  });

  it('el badge de firmado habla de constancia, no de sello', () => {
    expect(etiquetaFirmaConfirmada('14/09/2026')).toBe(
      'Constancia digital · 14/09/2026'
    );
    expect(etiquetaFirmaConfirmada()).toBe('Constancia digital');
    expect(ETIQUETA_FIRMA_PENDIENTE).toBe('Pendiente de firma');
  });

  it('no se puede firmar sin haber visto el recibo', () => {
    expect(puedeFirmarTrasVer(false)).toBe(false);
    expect(puedeFirmarTrasVer(true)).toBe(true);
  });

  it('apertura exitosa deja el recibo visto y habilita firmar', () => {
    const vistos = vistosTrasAbrir({}, 'r1', true);
    expect(vistos).toEqual({ r1: true });
    expect(puedeFirmarTrasVer(Boolean(vistos.r1))).toBe(true);
  });

  it('si no se pudo abrir, no marca visto y Firmar sigue bloqueado', () => {
    const vistos = vistosTrasAbrir({}, 'r1', false);
    expect(vistos).toEqual({});
    expect(puedeFirmarTrasVer(Boolean(vistos.r1))).toBe(false);
  });

  it('un error de Storage deja el recibo como estaba', () => {
    const prev = { r0: true };
    expect(vistosTrasAbrir(prev, 'r1', false)).toBe(prev);
    expect(prev).toEqual({ r0: true });
  });

  it('un hash que no coincide se marca como alerta', () => {
    expect(claseVerificacion('no_coincide')).toBe('alerta');
    expect(claseVerificacion('coincide')).toBe('ok');
    expect(claseVerificacion('sin_constancia')).toBe('neutro');
    expect(claseVerificacion('no_verificable')).toBe('neutro');
  });
});
