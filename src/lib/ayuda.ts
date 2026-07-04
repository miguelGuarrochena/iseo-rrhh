/**
 * Base de conocimiento de ayuda de ISEO RH. Alimenta tanto el listado de
 * preguntas frecuentes como el asistente de ayuda con IA (RAG liviano).
 */
import { Rol } from '@/types/rrhh';

export interface FaqItem {
  pregunta: string;
  respuesta: string;
  /** Si se define, solo esos roles ven la entrada. */
  roles?: Rol[];
}

export interface FaqCategoria {
  titulo: string;
  items: FaqItem[];
}

const GESTION: Rol[] = ['admin_rrhh', 'supervisor', 'superadmin'];
const ADMIN: Rol[] = ['admin_rrhh', 'superadmin'];

export const FAQ: FaqCategoria[] = [
  {
    titulo: 'Primeros pasos',
    items: [
      {
        pregunta: '¿Cómo instalo la app en el celular?',
        respuesta:
          'Entrá al menú de tu usuario (arriba a la derecha) y tocá "Instalar app". Vas a ver los pasos para tu teléfono. Queda como un ícono más, se abre a pantalla completa y se actualiza sola.',
      },
      {
        pregunta: '¿Dónde veo mis notificaciones?',
        respuesta:
          'En la campana de la barra superior. Ahí aparecen avisos como la aprobación o rechazo de una ausencia, o un recibo nuevo para firmar.',
      },
    ],
  },
  {
    titulo: 'Fichaje',
    items: [
      {
        pregunta: '¿Cómo registro mi ingreso o egreso?',
        respuesta:
          'Entrá a Fichaje y tocá el botón "Fichar ingreso" (o "Fichar egreso"). Si tu empresa usa reconocimiento facial y ya registraste tu rostro, se abre la cámara para confirmar tu identidad. Se guarda la hora y tu ubicación.',
      },
      {
        pregunta: '¿Qué es el "Modo planta"?',
        respuesta:
          'Es para fichar desde una tablet compartida en el lugar de trabajo: cada persona se pone frente a la cámara y el sistema la reconoce y registra su ingreso/egreso.',
        roles: GESTION,
      },
      {
        pregunta: 'No me reconoce la cara al fichar, ¿qué hago?',
        respuesta:
          'Acercate, mirá de frente y buscá buena luz. Si sigue sin reconocerte, pedile a RRHH que vuelva a registrar tu rostro desde tu ficha.',
      },
    ],
  },
  {
    titulo: 'Ausencias y vacaciones',
    items: [
      {
        pregunta: '¿Cómo pido vacaciones o una licencia?',
        respuesta:
          'Entrá a Ausencias y tocá "Nueva solicitud". Elegí el tipo (vacaciones, enfermedad, estudio, etc.), las fechas y enviá. Tu supervisor la aprueba o rechaza, y te llega una notificación con el resultado.',
      },
      {
        pregunta: '¿Cuántos días de vacaciones tengo?',
        respuesta:
          'En Ausencias ves tu saldo de días disponibles según tu antigüedad. Los días por ley se calculan automáticamente.',
      },
      {
        pregunta: '¿Cómo apruebo o rechazo una ausencia del equipo?',
        respuesta:
          'En Ausencias, en "Pendientes de aprobación", aprobás o rechazás con un click. Si rechazás, podés dejar el motivo, que le llega al colaborador.',
        roles: GESTION,
      },
    ],
  },
  {
    titulo: 'Recibos de sueldo',
    items: [
      {
        pregunta: '¿Cómo firmo mi recibo?',
        respuesta:
          'Entrá a Recibos, abrí el recibo pendiente y tocá "Firmar". Queda con constancia de recepción, con fecha y hora.',
      },
      {
        pregunta: '¿Cómo cargo un recibo para el equipo?',
        respuesta:
          'En Recibos, tocá "Cargar recibo", elegí el colaborador y el período, y adjuntá el PDF. El colaborador lo ve al instante en su sección Recibos.',
        roles: ADMIN,
      },
    ],
  },
  {
    titulo: 'Mi legajo',
    items: [
      {
        pregunta: '¿Dónde veo mis datos personales?',
        respuesta:
          'En "Mi legajo" ves tus datos, contacto, grupo familiar, contacto de emergencia y tu documentación. Si algo no está bien, avisale a RRHH para que lo corrija.',
      },
    ],
  },
  {
    titulo: 'Turnos',
    items: [
      {
        pregunta: '¿Cómo asigno turnos y controlo la asistencia?',
        respuesta:
          'En Turnos elegís al colaborador y la semana, y cargás el horario de entrada y salida de cada día. El sistema lo compara con la fichada real y te marca llegadas tarde, salidas antes, horas extras y ausencias.',
        roles: GESTION,
      },
    ],
  },
  {
    titulo: 'Colaboradores',
    items: [
      {
        pregunta: '¿Cómo doy de alta un colaborador?',
        respuesta:
          'En Colaboradores tocá "Nuevo" y completá los datos. Después podés cargar su documentación, registrar su rostro para el fichaje facial y asignarle un supervisor.',
        roles: ADMIN,
      },
      {
        pregunta: '¿Qué son las notas internas?',
        respuesta:
          'Son una bitácora privada del colaborador (fecha, autor, motivo y observación) que solo ven los administradores. Sirve para dejar registro de aumentos, situaciones o desempeño.',
        roles: ADMIN,
      },
    ],
  },
  {
    titulo: 'Remuneraciones',
    items: [
      {
        pregunta: '¿Qué veo en Remuneraciones?',
        respuesta:
          'Si sos colaborador, ves tu evolución salarial, la variación, tu mejor sueldo del semestre y el aguinaldo estimado. Si sos administrador, ves la masa salarial, los costos y las cargas estimadas del equipo.',
      },
    ],
  },
  {
    titulo: 'Organigrama',
    items: [
      {
        pregunta: '¿Cómo se arma el organigrama?',
        respuesta:
          'Se arma solo con el campo "Reporta a" de cada colaborador. Para cambiarlo, tocá a una persona en el organigrama y elegí su nuevo supervisor, o editá el campo "Supervisor" en su ficha.',
        roles: GESTION,
      },
    ],
  },
  {
    titulo: 'Convenio',
    items: [
      {
        pregunta: '¿Cómo consulto el convenio?',
        respuesta:
          'En Convenio podés buscar por palabra o preguntarle al asistente (ej. "¿cuántos días por fallecimiento?"). El administrador es quien carga el texto del convenio de la empresa.',
      },
    ],
  },
];

/** Texto de la FAQ visible para un rol, en formato "Pregunta / Respuesta". */
export const faqTextoParaRol = (rol: Rol): string =>
  FAQ.flatMap((cat) =>
    cat.items
      .filter((it) => !it.roles || it.roles.includes(rol))
      .map((it) => `Pregunta: ${it.pregunta}\nRespuesta: ${it.respuesta}`)
  ).join('\n\n');

/** Categorías con los items visibles para un rol (sin categorías vacías). */
export const faqParaRol = (rol: Rol): FaqCategoria[] =>
  FAQ.map((cat) => ({
    ...cat,
    items: cat.items.filter((it) => !it.roles || it.roles.includes(rol)),
  })).filter((cat) => cat.items.length > 0);
