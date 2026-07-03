import { diasEntre } from '@/lib/fechas';
import {
  crearAusencia,
  crearEmpresa,
  cambiarEstadoEmpresa,
  ficharAhora,
  firmarRecibo,
  getAusenciasDeEmpleado,
  getFichajesDeEmpleadoHoy,
  resolverAusencia,
} from '@/lib/services/rrhh';

describe('diasEntre', () => {
  it('cuenta ambos extremos', () => {
    expect(diasEntre('2026-07-20', '2026-07-24')).toBe(5);
  });
  it('un solo día', () => {
    expect(diasEntre('2026-07-20', '2026-07-20')).toBe(1);
  });
  it('devuelve 0 si el rango está invertido', () => {
    expect(diasEntre('2026-07-24', '2026-07-20')).toBe(0);
  });
});

describe('flujo de ausencias', () => {
  it('crea una solicitud pendiente y la aprueba', async () => {
    const creada = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'especial',
      fechaDesde: '2026-08-10',
      fechaHasta: '2026-08-11',
      comentario: 'Trámite',
    });
    expect(creada.estado).toBe('pendiente');
    expect(creada.dias).toBe(2);

    const aprobada = await resolverAusencia(creada.id, 'aprobada', 'ple-1');
    expect(aprobada?.estado).toBe('aprobada');
    expect(aprobada?.resueltaPor).toBe('ple-1');

    const deEmpleado = await getAusenciasDeEmpleado('ple-4');
    expect(deEmpleado.some((a) => a.id === creada.id)).toBe(true);
  });

  it('no permite re-resolver una ausencia ya resuelta', async () => {
    const creada = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'estudio',
      fechaDesde: '2026-09-01',
      fechaHasta: '2026-09-01',
    });
    await resolverAusencia(creada.id, 'rechazada', 'ple-1');
    const reintento = await resolverAusencia(creada.id, 'aprobada', 'ple-1');
    expect(reintento?.estado).toBe('rechazada');
  });
});

describe('fichaje', () => {
  it('alterna ingreso y egreso en el día', async () => {
    const primero = await ficharAhora('ple-6');
    expect(primero.tipo).toBe('ingreso');
    const segundo = await ficharAhora('ple-6');
    expect(segundo.tipo).toBe('egreso');
    const deHoy = await getFichajesDeEmpleadoHoy('ple-6');
    expect(deHoy.length).toBe(2);
  });
});

describe('recibos', () => {
  it('firma un recibo pendiente y no lo vuelve a firmar', async () => {
    const firmado = await firmarRecibo('rec-2');
    expect(firmado?.estadoFirma).toBe('firmado');
    expect(firmado?.firmadoEn).toBeTruthy();
    const fechaOriginal = firmado?.firmadoEn;
    const reintento = await firmarRecibo('rec-2');
    expect(reintento?.firmadoEn).toBe(fechaOriginal);
  });
});

describe('empresas (superadmin)', () => {
  it('crea una empresa activa y la suspende', async () => {
    const nueva = await crearEmpresa({
      nombre: 'Test SRL',
      cuit: '30-11111111-1',
      contactoNombre: 'Test',
      contactoEmail: 'test@test.com',
    });
    expect(nueva.estado).toBe('activa');

    const suspendida = await cambiarEstadoEmpresa(nueva.id, 'suspendida');
    expect(suspendida?.estado).toBe('suspendida');
  });
});
