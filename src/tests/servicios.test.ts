import {
  enrolarRostro,
  getAusenciasPendientes,
  getDescriptoresFaciales,
  getEmpleados,
  getSaldoVacaciones,
  loginConEmail,
} from '@/lib/services/rrhh';

describe('servicios (mocks)', () => {
  it('loginConEmail encuentra usuarios demo sin distinguir mayúsculas', async () => {
    const usuario = await loginConEmail('RRHH@bombasdelsur.com');
    expect(usuario?.rol).toBe('admin_rrhh');
  });

  it('loginConEmail devuelve null si el email no existe', async () => {
    expect(await loginConEmail('nadie@nada.com')).toBeNull();
  });

  it('getAusenciasPendientes solo devuelve pendientes', async () => {
    const pendientes = await getAusenciasPendientes();
    expect(pendientes.length).toBeGreaterThan(0);
    expect(pendientes.every((a) => a.estado === 'pendiente')).toBe(true);
  });

  it('getSaldoVacaciones descuenta usadas y pendientes', async () => {
    // ple-3: ingreso 2021 → +5 años → 21 días; 5 aprobados + 5 pendientes en 2026
    const saldo = await getSaldoVacaciones('ple-3', 2026);
    expect(saldo).not.toBeNull();
    expect(saldo?.diasCorresponden).toBe(21);
    expect(saldo?.diasUtilizados).toBe(5);
    expect(saldo?.diasPendientesAprobacion).toBe(5);
    expect(saldo?.diasDisponibles).toBe(11);
  });

  it('los listados de empleados no exponen biometría facial', async () => {
    await enrolarRostro('ple-3', [0.1, 0.2, 0.3]);

    const empleados = await getEmpleados();
    const empleado = empleados.find((e) => e.id === 'ple-3');
    const descriptores = await getDescriptoresFaciales();

    expect(empleado).toBeTruthy();
    expect(empleado).not.toHaveProperty('descriptorFacial');
    expect(descriptores.some((d) => d.empleadoId === 'ple-3')).toBe(true);
  });
});
