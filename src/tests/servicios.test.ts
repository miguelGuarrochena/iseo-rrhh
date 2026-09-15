import {
  aprobarExtrasDeJornada,
  completarAlta,
  crearEmpleado,
  darDeBajaEmpleado,
  enrolarRostro,
  getAusenciasPendientes,
  getDescriptoresFaciales,
  getEmpleados,
  getEmpleadosTodos,
  getSaldoVacaciones,
  getEstadoDeCuentas,
  getTurnosDeEmpleado,
  invitarUsuario,
  loginConEmail,
  quitarAcceso,
  reactivarEmpleado,
  vincularUsuarioAEmpleado,
} from '@/lib/services/rrhh';
import { useAuthStore } from '@/lib/auth/store';
import { usuariosMock } from '@/lib/mocks/usuarios';

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

  // Es la cuenta que existe en Auth pero no tiene perfil: entra y la app no
  // sabe quién es. Completar el alta la arregla sin mandar otro mail, que
  // es lo que hace falta cuando la persona ya puso su contraseña.
  it('completar el alta convierte una cuenta a medias en una cuenta activa', async () => {
    const antes = await getEstadoDeCuentas();
    const aMedias = antes.find((c) => c.estado === 'sin_perfil');
    expect(aMedias).toBeDefined();

    await completarAlta(aMedias!.email);

    const despues = await getEstadoDeCuentas();
    expect(despues.find((c) => c.email === aMedias!.email)?.estado).toBe(
      'activa'
    );
    expect(despues.some((c) => c.estado === 'sin_perfil')).toBe(false);
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

  /**
   * Antes, aprobar las extras de un día sin turno creaba el turno con el
   * horario general de la empresa. Tenía sentido mientras ese día se
   * medía contra ese mismo horario: el turno no movía ningún número.
   *
   * Desde que un día sin turno no se mide (ver `controlarJornada`),
   * crearlo sería inventar las extras que después se pagan, con un
   * horario que puede no ser el de esa persona — el falso positivo de
   * gastronomía, convertido en plata. Ahora se pide el turno primero.
   */
  it('aprobar extras de un día sin turno falla y dice qué hacer', async () => {
    const fecha = '2026-07-15';
    const antes = await getTurnosDeEmpleado('ple-3');
    expect(antes.some((t) => t.fecha === fecha)).toBe(false);

    await expect(aprobarExtrasDeJornada('ple-3', fecha, true)).rejects.toThrow(
      /no tiene turno asignado/i
    );
  });

  it('y no deja un turno inventado atrás', async () => {
    const fecha = '2026-07-16';
    await expect(
      aprobarExtrasDeJornada('ple-3', fecha, true)
    ).rejects.toThrow();
    const turnos = await getTurnosDeEmpleado('ple-3');
    expect(turnos.some((t) => t.fecha === fecha)).toBe(false);
  });

  it('desaprobar un día con turno lo desmarca sin borrarlo', async () => {
    const [turnoExistente] = await getTurnosDeEmpleado('ple-3');
    await aprobarExtrasDeJornada('ple-3', turnoExistente.fecha, true);
    const quitado = await aprobarExtrasDeJornada(
      'ple-3',
      turnoExistente.fecha,
      false
    );

    expect(quitado.extrasAprobadas).toBe(false);
    const turnos = await getTurnosDeEmpleado('ple-3');
    expect(turnos.filter((t) => t.fecha === turnoExistente.fecha)).toHaveLength(
      1
    );
  });

  it('sobre un día que ya tiene turno respeta el horario planificado', async () => {
    const [turnoExistente] = await getTurnosDeEmpleado('ple-3');
    const marcado = await aprobarExtrasDeJornada(
      'ple-3',
      turnoExistente.fecha,
      true
    );

    expect(marcado.id).toBe(turnoExistente.id);
    expect(marcado.horaEntrada).toBe(turnoExistente.horaEntrada);
    expect(marcado.horaSalida).toBe(turnoExistente.horaSalida);
    expect(marcado.extrasAprobadas).toBe(true);
  });
});

const altaDePrueba = (dni: string) =>
  crearEmpleado({
    nombre: 'Dueño',
    apellido: 'Poster',
    dni,
    puesto: 'Socio',
    sector: 'Dirección',
    fechaIngreso: '2024-01-15',
    modalidadContratacion: 'indeterminado',
  });

describe('reactivar un colaborador dado de baja', () => {
  afterEach(() => {
    useAuthStore.setState({ usuario: null });
  });

  it('un admin puede reactivar el mismo legajo, sin duplicar DNI ni biometría', async () => {
    const creado = await altaDePrueba('99887701');
    const descriptor = [0.11, 0.22, 0.33];
    await enrolarRostro(creado.id, descriptor, {
      aceptado: true,
      texto: 'Autoriza el uso de su rostro.',
    });

    const usuario = {
      id: `usr-${creado.id}`,
      email: 'dueno.poster@test.com',
      rol: 'admin_rrhh' as const,
      empresaId: 'emp-1',
      empleadoId: creado.id,
      nombreCompleto: 'Dueño Poster',
    };
    usuariosMock.push(usuario);
    try {
      await darDeBajaEmpleado(creado.id, 'Alta de prueba', '2026-09-01');
      const reactivado = await reactivarEmpleado(creado.id);

      expect(reactivado?.id).toBe(creado.id);
      expect(reactivado?.dni).toBe(creado.dni);
      expect(reactivado?.activo).toBe(true);
      expect(reactivado?.fechaBaja).toBeUndefined();
      expect(reactivado?.motivoBaja).toBeUndefined();
      expect(reactivado?.descriptorFacial).toBeUndefined();
      expect(reactivado?.descriptorVersion).toBeUndefined();
      expect(reactivado?.consentimientoBiometrico).toBeUndefined();

      const activos = await getEmpleados();
      const todos = await getEmpleadosTodos();
      expect(activos.filter((e) => e.id === creado.id)).toHaveLength(1);
      expect(todos.filter((e) => e.id === creado.id)).toHaveLength(1);
      expect(todos.filter((e) => e.dni === creado.dni)).toHaveLength(1);
      expect(todos.find((e) => e.id === creado.id)?.activo).toBe(true);
      expect(
        todos.find((e) => e.id === creado.id && !e.activo)
      ).toBeUndefined();

      const descriptores = await getDescriptoresFaciales();
      expect(descriptores.some((d) => d.empleadoId === creado.id)).toBe(false);

      const vinculado = usuariosMock.find((u) => u.id === usuario.id);
      expect(vinculado?.empleadoId).toBe(creado.id);
      expect(vinculado?.rol).toBe('admin_rrhh');
    } finally {
      const i = usuariosMock.findIndex((u) => u.id === usuario.id);
      if (i >= 0) usuariosMock.splice(i, 1);
    }
  });

  it('no reactiva a quien ya está activo', async () => {
    const creado = await altaDePrueba('99887702');
    await expect(reactivarEmpleado(creado.id)).rejects.toThrow(
      /ya está activo/i
    );
    expect(creado.activo).toBe(true);
  });

  it('un supervisor no puede reactivar', async () => {
    const creado = await altaDePrueba('99887703');
    await darDeBajaEmpleado(creado.id, 'Prueba', '2026-09-01');
    useAuthStore.setState({
      usuario: usuariosMock.find((u) => u.rol === 'supervisor') ?? null,
    });
    await expect(reactivarEmpleado(creado.id)).rejects.toThrow(/permiso/i);
    const todos = await getEmpleadosTodos();
    const sigue = todos.find((e) => e.id === creado.id);
    expect(sigue?.activo).toBe(false);
    expect(sigue?.fechaBaja).toBe('2026-09-01');
    expect(sigue?.motivoBaja).toBe('Prueba');
  });

  it('un empleado no puede reactivar', async () => {
    const creado = await altaDePrueba('99887704');
    await darDeBajaEmpleado(creado.id, 'Prueba', '2026-09-02');
    useAuthStore.setState({
      usuario: usuariosMock.find((u) => u.rol === 'empleado') ?? null,
    });
    await expect(reactivarEmpleado(creado.id)).rejects.toThrow(/permiso/i);
    const todos = await getEmpleadosTodos();
    const sigue = todos.find((e) => e.id === creado.id);
    expect(sigue?.activo).toBe(false);
    expect(sigue?.dni).toBe(creado.dni);
    expect(sigue?.fechaBaja).toBe('2026-09-02');
  });
});
