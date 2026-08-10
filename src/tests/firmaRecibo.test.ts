import {
  COLUMNAS_RECIBO_INMUTABLES_EMPLEADO,
  firmaOneShotPermitida,
  pathReciboPerteneceAlTenant,
} from '@/lib/seguridad/firmaRecibo';
import { firmarRecibo } from '@/lib/services/rrhh';

describe('contrato firma recibo (BUG-005 / BUG-006)', () => {
  it('lista columnas que el empleado no puede mutar', () => {
    expect(COLUMNAS_RECIBO_INMUTABLES_EMPLEADO).toEqual(
      expect.arrayContaining([
        'archivo_url',
        'empresa_id',
        'empleado_id',
        'periodo',
        'tipo',
        'firmado_empleador_en',
      ])
    );
  });

  it('one-shot: pendiente→firmado con fecha', () => {
    expect(
      firmaOneShotPermitida({
        estadoAntes: 'pendiente',
        estadoDespues: 'firmado',
        firmadoEnAntes: null,
        firmadoEnDespues: '2026-08-10T12:00:00Z',
      })
    ).toBe(true);
  });

  it('one-shot: re-firmar denegado', () => {
    expect(
      firmaOneShotPermitida({
        estadoAntes: 'firmado',
        estadoDespues: 'firmado',
        firmadoEnAntes: '2026-08-10T12:00:00Z',
        firmadoEnDespues: '2026-08-11T12:00:00Z',
      })
    ).toBe(false);
  });

  it('path de otra empresa no pertenece al tenant', () => {
    expect(
      pathReciboPerteneceAlTenant(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/x.pdf',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
      )
    ).toBe(false);
    expect(
      pathReciboPerteneceAlTenant(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/x.pdf',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
      )
    ).toBe(true);
  });
});

describe('flujo demo legítimo de firma', () => {
  it('firma pendiente y no re-firma', async () => {
    const firmado = await firmarRecibo('rec-2');
    expect(firmado?.estadoFirma).toBe('firmado');
    expect(firmado?.firmadoEn).toBeTruthy();
    const fecha = firmado?.firmadoEn;
    const reintento = await firmarRecibo('rec-2');
    expect(reintento?.firmadoEn).toBe(fecha);
  });
});
