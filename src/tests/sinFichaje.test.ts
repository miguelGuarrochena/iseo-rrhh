import { aEmpleado } from '@/lib/services/supabase/mapeos';
import { faltasDeEmpleado } from '@/lib/requisitos';
import type { Empleado } from '@/types/rrhh';

/**
 * La marca "no registra asistencia" (migración 110).
 *
 * Existe para el caso mixto —ficha la planta, la administración no— y
 * sólo apaga lo que se MUESTRA. Lo que se prueba acá es que el dato
 * viaje: si el mapeo se olvida de la columna, el tablero vuelve a
 * afirmarle "0 hs trabajadas" a quien no ficha, y nadie se entera.
 */

const fila = (extra: Record<string, unknown> = {}) => ({
  id: 'e1',
  empresa_id: 'emp1',
  nombre: 'Kevin',
  apellido: 'Joseph',
  dni: '30111222',
  estado_civil: 'soltero',
  nivel_estudios: 'secundario',
  fecha_ingreso: '2024-03-01',
  puesto: 'Administración',
  sector: 'Administración',
  supervisor_id: null,
  modalidad_contratacion: 'indeterminado',
  modalidad_pago: 'mensual',
  activo: true,
  ...extra,
});

describe('empleado que no registra asistencia', () => {
  it('llega desde la base como `sinFichaje`', () => {
    expect(aEmpleado(fila({ sin_fichaje: true })).sinFichaje).toBe(true);
  });

  it('quien sí ficha queda en false', () => {
    expect(aEmpleado(fila({ sin_fichaje: false })).sinFichaje).toBe(false);
  });

  it('sin la columna se asume que ficha, como venía siendo', () => {
    // Los legajos que ya existían no tienen la marca puesta: el default
    // no puede cambiarle el tablero a nadie.
    expect(aEmpleado(fila()).sinFichaje).toBe(false);
  });

  it('es independiente de cómo ficha y de si tiene cuenta', () => {
    const e = aEmpleado(
      fila({ sin_fichaje: true, modo_fichaje: 'celular', sin_usuario: false })
    );
    // La marca no pisa `modoFichaje`: si mañana la persona empieza a
    // fichar, el modo que tenía sigue estando.
    expect(e.modoFichaje).toBe('celular');
    expect(e.sinUsuario).toBe(false);
    expect(e.sinFichaje).toBe(true);
  });
});

/**
 * Los faltantes de Estado de RRHH.
 *
 * A quien no registra asistencia no le falta enrolar el rostro ni
 * definir una zona de fichaje: nunca va a fichar. Lo que sí sigue
 * faltándole es todo lo demás —email, CUIL, CBU, supervisor—, que no
 * tiene nada que ver con el control horario.
 */
describe('faltantes de un empleado que no registra asistencia', () => {
  /** Alguien a quien le falta TODO lo de fichaje y varias cosas más. */
  const base = {
    id: 'e1',
    empresaId: 'emp1',
    nombre: 'Kevin',
    apellido: 'Joseph',
    dni: '30111222',
    cuil: '',
    email: '',
    cbu: '',
    fechaIngreso: '2024-03-01',
    puesto: 'Administración',
    sector: 'Administración',
    supervisorId: null,
    modalidadContratacion: 'plazo_fijo',
    activo: true,
    // Ficha en planta y no tiene rostro enrolado.
    modoFichaje: 'planta',
  } as unknown as Empleado;

  const claves = (
    e: Empleado,
    ambito?: Parameters<typeof faltasDeEmpleado>[2]
  ) =>
    faltasDeEmpleado(e, { tieneCuenta: false, tieneSueldo: false }, ambito).map(
      (f) => f.clave
    );

  /** En el orden del catálogo, que es el que devuelve la función. */
  const NO_FICHAJE = [
    'sin_cuenta',
    'sin_email',
    'sin_cuil',
    'sin_cbu',
    'sin_sueldo',
    'plazo_fijo_sin_fin',
    'sin_supervisor',
  ];
  const CON_ROSTRO_PENDIENTE = [
    'sin_cuenta',
    'sin_email',
    'sin_cuil',
    'sin_cbu',
    'sin_sueldo',
    'plazo_fijo_sin_fin',
    'facial_sin_rostro',
    'sin_supervisor',
  ];

  it('quien ficha sigue viendo exactamente los mismos faltantes que antes', () => {
    expect(claves(base, 'fichaje')).toEqual(['facial_sin_rostro']);
    expect(claves({ ...base, modoFichaje: 'celular' }, 'fichaje')).toEqual([
      'celular_sin_geocerca',
    ]);
    expect(
      claves(
        { ...base, tieneRostro: true, descriptorVersion: 1 } as Empleado,
        'fichaje'
      )
    ).toEqual(
      // v1 no sirve para fichar y además nadie registró el consentimiento.
      ['facial_plantilla_vieja', 'facial_sin_consentimiento']
    );
    expect(claves(base)).toEqual(CON_ROSTRO_PENDIENTE);
  });

  it('marcado como sinFichaje no le queda ningún faltante de fichaje', () => {
    const sinFichaje = { ...base, sinFichaje: true };
    expect(claves(sinFichaje, 'fichaje')).toEqual([]);
    expect(
      claves({ ...sinFichaje, modoFichaje: 'celular' }, 'fichaje')
    ).toEqual([]);
    expect(
      claves(
        { ...sinFichaje, tieneRostro: true, descriptorVersion: 1 } as Empleado,
        'fichaje'
      )
      // Queda sólo la del consentimiento: el rostro está guardado igual,
      // y la Ley 25.326 no depende de si la persona ficha.
    ).toEqual(['facial_sin_consentimiento']);
  });

  it('los demás faltantes de RRHH siguen apareciendo igual', () => {
    expect(claves({ ...base, sinFichaje: true })).toEqual(NO_FICHAJE);
  });

  it('cambiar la marca no toca ningún otro dato del legajo ni sus faltantes', () => {
    const antes = JSON.stringify(base);
    const marcado: Empleado = { ...base, sinFichaje: true };

    // El original no se modificó y lo único distinto es la marca.
    expect(JSON.stringify(base)).toBe(antes);
    expect({ ...marcado, sinFichaje: undefined }).toEqual({
      ...base,
      sinFichaje: undefined,
    });

    // Y los faltantes que no son de fichaje son exactamente los mismos.
    const sinLosDeFichaje = (e: Empleado) =>
      claves(e).filter((c) => NO_FICHAJE.includes(c));
    expect(sinLosDeFichaje(marcado)).toEqual(sinLosDeFichaje(base));
  });
});
