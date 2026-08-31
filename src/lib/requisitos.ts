/**
 * Qué le falta a un colaborador o a una empresa para que lo que la app
 * promete funcione de verdad.
 *
 * Esto no son errores. `errores.ts` responde "la acción falló y por qué".
 * Acá la acción sale bien —el recibo se guarda, el documento se manda—
 * pero no tiene el efecto que quien la hizo esperaba, porque falta un
 * dato en otro lado. Ese hueco era invisible: RRHH subía cuarenta
 * recibos, veía "cargados y visibles para el equipo" y se enteraba tres
 * semanas después de que quince personas no tenían usuario.
 *
 * La regla de si bloquea o sólo avisa está explicada en `Severidad`.
 */
import {
  Empleado,
  Empresa,
  ModalidadContratacion,
  ModoFichaje,
} from '@/types/rrhh';
import { necesitaReenrolar, tieneRostroEnrolado } from '@/lib/facial/enrolado';

/**
 * Bloquear le cuesta caro a quien está trabajando, así que se reserva
 * para cuando seguir hace daño que después no se puede deshacer: filtrar
 * el dato de una persona a otra, o dejar un registro legal mal armado.
 *
 * Todo lo demás avisa y deja seguir. Si el trabajo se conserva y el
 * hueco se puede tapar mañana, frenar una carga de cuarenta recibos
 * porque tres personas no tienen usuario le hace perder la tarde a RRHH
 * sin salvar nada.
 *
 * Lo que no existe es "pasar en silencio": si algo falta, se dice.
 */
export type Severidad = 'bloquea' | 'avisa';

export interface Falta {
  /** Identificador estable, para agrupar y para los tests. */
  clave: string;
  severidad: Severidad;
  /** Qué falta, en dos o tres palabras. Sirve de chip. */
  titulo: string;
  /**
   * Qué consecuencia tiene. Se escribe en términos de lo que la persona
   * no va a poder hacer, no del campo vacío: "no ve sus recibos" dice
   * más que "el campo email está vacío".
   */
  detalle: string;
  /** La acción concreta que lo resuelve. */
  comoSeArregla: string;
  /** A dónde ir a resolverlo. */
  ruta?: string;
}

/** Qué se está por hacer. Una falta importa según para qué. */
export type Ambito =
  | 'cuenta'
  | 'recibos'
  | 'firma'
  | 'comunicaciones'
  | 'fichaje'
  | 'pagos'
  | 'contrato'
  | 'organigrama';

interface Regla {
  clave: string;
  ambitos: Ambito[];
  severidad: Severidad;
  titulo: string;
  detalle: string;
  comoSeArregla: string;
  ruta: (e: Empleado) => string;
  /** true = falta. */
  falta: (e: Empleado, ctx: ContextoEmpleado) => boolean;
  /**
   * La falta sólo existe si la persona registra asistencia: lo que
   * señala es que no va a poder fichar. A quien está marcado
   * `sinFichaje` no le falta nada de eso.
   *
   * No lo lleva `facial_sin_consentimiento`, y es a propósito: esa no
   * habla de fichar sino de un dato biométrico YA guardado. Si el
   * rostro está en la base sin consentimiento registrado, el problema
   * con la Ley 25.326 es el mismo fiche o no fiche.
   */
  soloSiRegistraAsistencia?: boolean;
}

/**
 * Lo que la ficha del empleado no sabe de sí misma. Se pasa aparte para
 * que las reglas sigan siendo funciones puras y testeables sin base.
 */
export interface ContextoEmpleado {
  /**
   * Si tiene usuario para entrar a la app. `undefined` = todavía no se
   * consultó, y entonces la regla no dispara: una advertencia inventada
   * es peor que ninguna.
   */
  tieneCuenta?: boolean;
  /**
   * Si tiene al menos una remuneración cargada. Misma regla que arriba:
   * `undefined` significa que no se sabe, no que no tenga.
   */
  tieneSueldo?: boolean;
}

const vacio = (v: string | undefined | null): boolean =>
  !v || v.trim().length === 0;

const fichaDe = (e: Empleado) => `/colaboradores/${e.id}/editar`;

/**
 * El catálogo. Agregar una falta nueva es agregar una fila acá y aparece
 * sola en la ficha, en la lista y en la pantalla del ámbito que toque.
 */
const REGLAS: Regla[] = [
  {
    clave: 'sin_cuenta',
    ambitos: ['cuenta', 'recibos', 'firma', 'comunicaciones'],
    severidad: 'avisa',
    titulo: 'Sin cuenta',
    detalle:
      'No puede entrar a la app: no ve sus recibos ni los documentos que le mandás a firmar, no puede escribirte y no le llega ningún aviso por mail.',
    comoSeArregla:
      'Invitala desde Permisos: el mail le da acceso y el vínculo con esta ficha es lo que la deja ver lo suyo.',
    // Con el id, Permisos abre la invitación ya cargada con sus datos y
    // vinculada a esta ficha: es el paso que se saltaba al invitar a mano.
    ruta: (e) => `/permisos?empleado=${e.id}`,
    falta: (_e, ctx) => ctx.tieneCuenta === false,
  },
  {
    clave: 'sin_email',
    ambitos: ['cuenta', 'recibos', 'firma', 'comunicaciones'],
    severidad: 'avisa',
    titulo: 'Sin email',
    detalle:
      'Sin email no se la puede invitar a la app ni mandarle avisos. Es lo primero que hace falta para todo lo demás.',
    comoSeArregla: 'Cargá su email en la ficha.',
    ruta: fichaDe,
    falta: (e) => vacio(e.email),
  },
  {
    clave: 'sin_cuil',
    ambitos: ['recibos'],
    severidad: 'avisa',
    titulo: 'Sin CUIL',
    detalle:
      'La carga masiva de recibos reconoce a cada persona por el CUIL impreso en el PDF. Sin ese dato en la ficha, sus recibos quedan sin asignar y hay que elegirlos a mano uno por uno.',
    comoSeArregla: 'Cargá el CUIL en la ficha.',
    ruta: fichaDe,
    falta: (e) => vacio(e.cuil),
  },
  {
    clave: 'sin_cbu',
    ambitos: ['pagos'],
    severidad: 'avisa',
    titulo: 'Sin CBU',
    detalle:
      'No figura dónde depositarle el sueldo. No frena nada dentro de la app, pero el día de pago falta el dato.',
    comoSeArregla: 'Cargá el CBU en la ficha.',
    ruta: fichaDe,
    falta: (e) => vacio(e.cbu),
  },
  {
    clave: 'sin_sueldo',
    ambitos: ['pagos'],
    severidad: 'avisa',
    titulo: 'Sin sueldo cargado',
    detalle:
      'No tiene ninguna remuneración registrada, así que no entra en la masa salarial, no se le calcula el aguinaldo ni el valor de la hora extra, y si se va no hay con qué armar la liquidación final.',
    comoSeArregla: 'Cargale la remuneración desde Remuneraciones.',
    ruta: () => '/remuneraciones',
    falta: (_e, ctx) => ctx.tieneSueldo === false,
  },
  {
    clave: 'plazo_fijo_sin_fin',
    ambitos: ['contrato'],
    severidad: 'avisa',
    titulo: 'Contrato sin fecha de fin',
    detalle:
      'Está como contrato a plazo fijo pero no dice hasta cuándo, así que no hay aviso de vencimiento. Un plazo fijo que vence sin preaviso se convierte en indeterminado.',
    comoSeArregla: 'Cargá la fecha de fin de contrato en la ficha.',
    ruta: fichaDe,
    falta: (e) =>
      e.modalidadContratacion === ('plazo_fijo' as ModalidadContratacion) &&
      vacio(e.fechaFinContrato),
  },
  {
    clave: 'facial_sin_rostro',
    soloSiRegistraAsistencia: true,
    ambitos: ['fichaje'],
    severidad: 'avisa',
    titulo: 'Rostro sin enrolar',
    detalle:
      'Ficha en planta por reconocimiento facial, pero todavía no se le enroló el rostro: la terminal no la va a reconocer.',
    comoSeArregla: 'Enrolá su rostro desde la ficha, con su consentimiento.',
    ruta: (e) => `/colaboradores/${e.id}`,
    falta: (e) =>
      e.modoFichaje === ('planta' as ModoFichaje) && !tieneRostroEnrolado(e),
  },
  {
    /*
     * El tablero del re-enrolamiento.
     *
     * Es `bloquea` y no `avisa` porque no es una mejora pendiente: esta
     * persona **no puede fichar**. El servidor sólo compara contra
     * plantillas de la versión vigente, así que para el RPC su rostro no
     * existe, y el síntoma que ve es "No reconocimos el rostro" — un
     * mensaje que la manda a pararse mejor frente a una cámara que nunca
     * la va a reconocer.
     *
     * Sale solo de la lista a medida que RRHH re-enrola, sin que nadie
     * tenga que llevar la cuenta a mano.
     */
    clave: 'facial_plantilla_vieja',
    soloSiRegistraAsistencia: true,
    ambitos: ['fichaje'],
    severidad: 'bloquea',
    titulo: 'Rostro registrado con una versión anterior',
    detalle:
      'Su rostro se registró con la versión anterior del reconocimiento facial. Las plantillas de las dos versiones no son comparables, así que la terminal no la va a reconocer hasta que se le vuelva a tomar el rostro.',
    comoSeArregla:
      'Entrá a su ficha y tocá "Volver a tomar" en Reconocimiento facial.',
    ruta: (e) => `/colaboradores/${e.id}`,
    falta: (e) => necesitaReenrolar(e),
  },
  {
    clave: 'facial_sin_consentimiento',
    ambitos: ['fichaje'],
    severidad: 'bloquea',
    titulo: 'Sin consentimiento biométrico',
    detalle:
      'Tiene el rostro enrolado pero no está registrado su consentimiento. La Ley 25.326 pide consentimiento expreso para tratar datos biométricos, y sin eso el dato no se puede usar.',
    comoSeArregla:
      'Registrá el consentimiento desde la ficha, o borrá el rostro enrolado.',
    ruta: (e) => `/colaboradores/${e.id}`,
    falta: (e) =>
      tieneRostroEnrolado(e) && !e.consentimientoBiometrico?.aceptado,
  },
  {
    clave: 'celular_sin_geocerca',
    soloSiRegistraAsistencia: true,
    ambitos: ['fichaje'],
    severidad: 'avisa',
    titulo: 'Sin zona de fichaje',
    detalle:
      'Ficha por celular sin zona definida, así que puede marcar entrada desde cualquier lado. Si eso es a propósito (trabajo remoto), conviene ponerle modo remoto.',
    comoSeArregla: 'Definí la geocerca en la ficha, o cambiala a remoto.',
    ruta: fichaDe,
    falta: (e) => e.modoFichaje === ('celular' as ModoFichaje) && !e.geocerca,
  },
  {
    clave: 'sin_supervisor',
    ambitos: ['organigrama'],
    severidad: 'avisa',
    titulo: 'Sin supervisor',
    detalle:
      'No cuelga de nadie en el organigrama y sus pedidos de ausencia no le llegan a ningún supervisor: los tiene que resolver RRHH.',
    comoSeArregla: 'Asignale un supervisor en la ficha.',
    ruta: fichaDe,
    falta: (e) => !e.supervisorId,
  },
];

/**
 * En qué ámbitos pega una falta. Lo necesita el Estado de RRHH para
 * agrupar los pendientes por área sin volver a escribir el catálogo:
 * las reglas siguen viviendo sólo acá.
 */
export const ambitosDeFalta = (clave: string): Ambito[] =>
  REGLAS.find((r) => r.clave === clave)?.ambitos ?? [];

const aFalta = (r: Regla, e: Empleado): Falta => ({
  clave: r.clave,
  severidad: r.severidad,
  titulo: r.titulo,
  detalle: r.detalle,
  comoSeArregla: r.comoSeArregla,
  ruta: r.ruta(e),
});

/**
 * Todo lo que le falta a una persona. Sin `ambito` devuelve el panorama
 * completo (la ficha); con `ambito` sólo lo que importa para eso que se
 * está por hacer, porque avisarle a alguien que sube recibos que a esa
 * persona le falta la geocerca es ruido.
 */
/**
 * Faltas que dejan de serlo cuando el colaborador está marcado para no
 * tener cuenta: no le falta el usuario, es que se decidió que no va a
 * tener. Avisarlo igual convierte la lista en ruido y esconde las
 * faltas reales.
 */
const AMBITOS_DE_CUENTA: Ambito[] = [
  'cuenta',
  'recibos',
  'firma',
  'comunicaciones',
];

export const faltasDeEmpleado = (
  empleado: Empleado,
  contexto: ContextoEmpleado = {},
  ambito?: Ambito
): Falta[] =>
  REGLAS.filter((r) => !ambito || r.ambitos.includes(ambito))
    .filter(
      (r) =>
        !empleado.sinUsuario ||
        !r.ambitos.every((a) => AMBITOS_DE_CUENTA.includes(a))
    )
    // Mismo criterio que arriba, con la otra decisión del legajo: a
    // quien no registra asistencia no le falta enrolar el rostro ni
    // definir una zona de fichaje. Reclamárselo es ruido que tapa las
    // faltas de verdad.
    .filter((r) => !empleado.sinFichaje || !r.soloSiRegistraAsistencia)
    .filter((r) => r.falta(empleado, contexto))
    .map((r) => aFalta(r, empleado));

/** Si alguna falta frena la acción. */
export const bloquea = (faltas: Falta[]): boolean =>
  faltas.some((f) => f.severidad === 'bloquea');

/**
 * Faltas de la empresa. Son pocas pero pegan en todos lados, porque no
 * dependen de una persona sino de la configuración.
 */
export const faltasDeEmpresa = (empresa: Empresa): Falta[] => {
  const faltas: Falta[] = [];
  if (vacio(empresa.cuit)) {
    faltas.push({
      clave: 'empresa_sin_cuit',
      severidad: 'avisa',
      titulo: 'Empresa sin CUIT',
      detalle:
        'Al leer los recibos en PDF, el CUIT de la empresa aparece en el encabezado de cada hoja. Sin conocerlo, se puede confundir con el de una persona y asignar mal el recibo.',
      comoSeArregla: 'Cargá el CUIT en Configuración.',
      ruta: '/configuracion',
    });
  }
  if (vacio(empresa.contactoEmail)) {
    faltas.push({
      clave: 'empresa_sin_contacto',
      severidad: 'avisa',
      titulo: 'Sin email de contacto',
      detalle:
        'No hay a dónde escribirle a la empresa por temas administrativos ni de facturación.',
      comoSeArregla: 'Cargá el email de contacto en Configuración.',
      ruta: '/configuracion',
    });
  }
  return faltas;
};

/**
 * Resumen para una lista: cuánta gente tiene algo pendiente y cuál es la
 * falta más repetida. Sirve para el encabezado de Colaboradores, donde
 * enumerar cada caso sería una pared de texto.
 */
export interface ResumenFaltas {
  personas: number;
  total: number;
  masComun?: { titulo: string; cuantos: number };
}

export const resumirFaltas = (
  porEmpleado: { empleado: Empleado; faltas: Falta[] }[]
): ResumenFaltas => {
  const conAlgo = porEmpleado.filter((p) => p.faltas.length > 0);
  const cuenta = new Map<string, { titulo: string; cuantos: number }>();
  for (const p of conAlgo) {
    for (const f of p.faltas) {
      const previo = cuenta.get(f.clave);
      cuenta.set(f.clave, {
        titulo: f.titulo,
        cuantos: (previo?.cuantos ?? 0) + 1,
      });
    }
  }
  const masComun = [...cuenta.values()].sort(
    (a, b) => b.cuantos - a.cuantos
  )[0];
  return {
    personas: conAlgo.length,
    total: conAlgo.reduce((n, p) => n + p.faltas.length, 0),
    masComun,
  };
};
