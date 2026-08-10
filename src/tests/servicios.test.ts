import {
  darDeBajaEmpleado,
  enrolarRostro,
  getAusenciasPendientes,
  getDescriptoresFaciales,
  getEmpleados,
  getSaldoVacaciones,
  getEstadoDeCuentas,
  invitarUsuario,
  loginConEmail,
  quitarAcceso,
  vincularUsuarioAEmpleado,
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

  // Dos cuentas sobre el mismo legajo se ven el recibo de sueldo entre
  // sí: las políticas resuelven "lo mío" por el vínculo, no por el email.
  it('no vincula un legajo que ya tiene otra cuenta', async () => {
    await expect(
      vincularUsuarioAEmpleado('usr-empleado', 'ple-1')
    ).rejects.toThrow(/ya está vinculado/i);
  });

  it('desvincular libera el legajo y permite volver a vincularlo', async () => {
    expect(
      (await vincularUsuarioAEmpleado('usr-empleado', null))?.empleadoId
    ).toBeNull();
    expect(
      (await vincularUsuarioAEmpleado('usr-empleado', 'ple-3'))?.empleadoId
    ).toBe('ple-3');
  });

  // Desde `usuarios` las dos se ven igual, y son cosas distintas: a una
  // hay que reenviarle la invitación y a la otra no.
  it('distingue la cuenta recién invitada de la que ya se usa', async () => {
    await invitarUsuario({
      email: 'nuevo@bombasdelsur.com',
      nombreCompleto: 'Nuevo Ingreso',
      rol: 'empleado',
    });
    const cuentas = await getEstadoDeCuentas();
    expect(
      cuentas.find((c) => c.email === 'nuevo@bombasdelsur.com')?.estado
    ).toBe('pendiente');
    expect(
      cuentas.find((c) => c.email === 'rrhh@bombasdelsur.com')?.estado
    ).toBe('activa');
  });

  it('quitar el acceso saca la cuenta y libera el email', async () => {
    await quitarAcceso('nuevo@bombasdelsur.com');
    const cuentas = await getEstadoDeCuentas();
    expect(cuentas.some((c) => c.email === 'nuevo@bombasdelsur.com')).toBe(
      false
    );
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
    await enrolarRostro('ple-3', [0.1, 0.2, 0.3], {
      aceptado: true,
      texto: 'Autoriza el uso de su rostro para registrar asistencia.',
    });

    const empleados = await getEmpleados();
    const empleado = empleados.find((e) => e.id === 'ple-3');
    const descriptores = await getDescriptoresFaciales();

    expect(empleado).toBeTruthy();
    expect(empleado).not.toHaveProperty('descriptorFacial');
    expect(descriptores.some((d) => d.empleadoId === 'ple-3')).toBe(true);
  });
  it('no enrola un rostro sin consentimiento del titular', async () => {
    await expect(
      enrolarRostro('ple-2', [0.4, 0.5, 0.6], {
        aceptado: false,
        texto: 'Sin autorización.',
      })
    ).rejects.toThrow(/consentimiento/i);
  });

  it('guarda la constancia de qué se aceptó, no sólo un booleano', async () => {
    const texto = 'Autoriza el uso de su rostro para registrar asistencia.';
    const actualizado = await enrolarRostro('ple-3', [0.1, 0.2, 0.3], {
      aceptado: true,
      texto,
    });
    expect(actualizado?.consentimientoBiometrico?.aceptado).toBe(true);
    expect(actualizado?.consentimientoBiometrico?.texto).toBe(texto);
    expect(actualizado?.consentimientoBiometrico?.fecha).toBeTruthy();
  });

  /**
   * La finalidad por la que se recolectó el rostro termina con la baja,
   * así que el dato tiene que irse con ella (Ley 25.326). Antes quedaba
   * guardado para siempre salvo que alguien apretara "borrar rostro".
   */
  it('la baja del colaborador borra su biometría', async () => {
    await enrolarRostro('ple-4', [0.7, 0.8, 0.9], {
      aceptado: true,
      texto: 'Autoriza el uso de su rostro.',
    });
    const dado = await darDeBajaEmpleado('ple-4', 'Renuncia', '2026-08-07');

    expect(dado?.activo).toBe(false);
    expect(dado?.descriptorFacial).toBeUndefined();
    expect(dado?.consentimientoBiometrico).toBeUndefined();

    const descriptores = await getDescriptoresFaciales();
    expect(descriptores.some((d) => d.empleadoId === 'ple-4')).toBe(false);
  });
});
