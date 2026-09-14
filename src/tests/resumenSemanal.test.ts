import {
  armarEmailResumen,
  cronAutorizado,
  decidirTrasEnvio,
  hayPendientesResumen,
  moduloEncendido,
  resumenEmpresaActivo,
  resumenPlataformaActivo,
  type PendientesResumenSemanal,
} from '@/lib/resumenSemanal';

const vacios: PendientesResumenSemanal = {
  ausencias: 0,
  recibosSinFirmar: 0,
  comunicacionesAbiertas: 0,
  jornadasSinCerrar: 0,
  vencimientos: [],
};

describe('cron del resumen semanal', () => {
  it('rechaza un secret inválido o ausente', () => {
    expect(cronAutorizado(undefined, 'Bearer x')).toBe(false);
    expect(cronAutorizado('abc', 'Bearer otro')).toBe(false);
    expect(cronAutorizado('abc', null)).toBe(false);
    expect(cronAutorizado('abc', 'Bearer abc')).toBe(true);
  });

  it('la plataforma apagada no manda nada', () => {
    expect(resumenPlataformaActivo({ resumenSemanalEmail: false })).toBe(false);
    expect(resumenPlataformaActivo({})).toBe(true);
    expect(resumenPlataformaActivo(undefined)).toBe(true);
  });

  it('una empresa puede apagar el resumen', () => {
    expect(resumenEmpresaActivo({ resumenSemanal: false })).toBe(false);
    expect(resumenEmpresaActivo({})).toBe(true);
  });

  it('sin pendientes no hay mail (es el comportamiento esperado)', () => {
    expect(hayPendientesResumen(vacios)).toBe(false);
    expect(hayPendientesResumen({ ...vacios, ausencias: 2 })).toBe(true);
  });

  it('un módulo apagado no cuenta pendientes de esa sección', () => {
    expect(moduloEncendido({ ausencias: false }, 'ausencias')).toBe(false);
    expect(moduloEncendido({}, 'ausencias')).toBe(true);
  });

  it('si el envío falla hay que reintentar, no marcar como enviado', () => {
    expect(decidirTrasEnvio(true)).toBe('enviado');
    expect(decidirTrasEnvio(false)).toBe('fallo_envio');
  });

  it('el HTML nombra la empresa y escapa el título de un vencimiento', () => {
    const html = armarEmailResumen('Acme <SA>', {
      ...vacios,
      ausencias: 1,
      vencimientos: [{ titulo: '<script>x</script>', fecha: '20/09/2026' }],
    });
    expect(html).toContain('Tu semana en Acme &lt;SA&gt;');
    expect(html).toContain('1');
    expect(html).toContain('ausencia sin resolver');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});
