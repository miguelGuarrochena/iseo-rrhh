import {
  actualizarAbonoEmpresa,
  crearMovimiento,
  eliminarMovimiento,
  getResumenFinanzas,
} from '@/lib/services/rrhh';

const periodo = new Date().toISOString().slice(0, 7);

describe('resumen de finanzas (demo)', () => {
  it('calcula ingresos, gastos, neto y MRR del período', async () => {
    const r = await getResumenFinanzas(periodo);
    expect(r.ingresosDelMes).toBe(125000); // 85.000 + 40.000
    expect(r.gastosDelMes).toBe(40000); // 18.000 + 22.000
    expect(r.neto).toBe(85000);
    expect(r.mrr).toBe(145000); // abonos de empresas activas
  });

  it('marca al día / pendiente según lo cobrado vs el abono', async () => {
    const r = await getResumenFinanzas(periodo);
    const bombas = r.facturacion.find((f) => f.empresaId === 'emp-1');
    const negro = r.facturacion.find((f) => f.empresaId === 'emp-2');
    expect(bombas?.alDia).toBe(true); // cobró 85.000 de 85.000
    expect(negro?.alDia).toBe(false); // cobró 40.000 de 60.000
    expect(r.empresasAlDia).toBe(1);
    expect(r.empresasVencidas).toBe(1);
  });

  it('registrar un cobro deja a la empresa al día', async () => {
    await crearMovimiento({
      tipo: 'ingreso',
      concepto: 'Saldo abono — El Negro Holandés',
      empresaId: 'emp-2',
      monto: 20000,
      fecha: `${periodo}-10`,
    });
    const r = await getResumenFinanzas(periodo);
    expect(r.facturacion.find((f) => f.empresaId === 'emp-2')?.alDia).toBe(
      true
    );
    expect(r.empresasVencidas).toBe(0);
  });

  it('un gasto nuevo baja el neto y se puede eliminar', async () => {
    const antes = (await getResumenFinanzas(periodo)).gastosDelMes;
    const mov = await crearMovimiento({
      tipo: 'gasto',
      concepto: 'Publicidad',
      monto: 5000,
      fecha: `${periodo}-12`,
    });
    expect((await getResumenFinanzas(periodo)).gastosDelMes).toBe(antes + 5000);
    await eliminarMovimiento(mov.id);
    expect((await getResumenFinanzas(periodo)).gastosDelMes).toBe(antes);
  });

  it('cambiar el abono actualiza el MRR', async () => {
    await actualizarAbonoEmpresa('emp-1', 100000);
    const r = await getResumenFinanzas(periodo);
    expect(
      r.facturacion.find((f) => f.empresaId === 'emp-1')?.abonoMensual
    ).toBe(100000);
    expect(r.mrr).toBe(160000); // 100.000 + 60.000
  });
});
