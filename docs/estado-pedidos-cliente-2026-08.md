# ISEO RH — Estado de los puntos del 28/7

Resumen de en qué quedó cada cosa que nos pasaste, qué necesitamos de tu
lado y qué sigue.

---

## 1. Resuelto — sale en la próxima actualización

**Borrar un pedido de adelanto.** No existía la opción: sólo se podía
aprobar o rechazar, y el de prueba que cargaste en LAK quedaba ahí para
siempre. Ahora hay un botón para eliminarlo, con confirmación, disponible
para el administrador de RRHH.

Una aclaración de criterio: si el pedido existió de verdad y no
corresponde, conviene **rechazarlo**, porque deja el registro y el
colaborador recibe el aviso. Borrar es para lo que nunca debió existir:
una prueba, un monto mal tipeado.

**Fichaje manual.** Estaba fallando de raíz: la base no tenía habilitada
la opción "manual" como forma de fichaje, así que toda carga a mano
rebotaba. Corregido.

**Comunicaciones: el "no leído" que no se iba.** Tenías razón y el
problema era de concepto. El numerito del menú no contaba mensajes sin
leer, contaba conversaciones sin cerrar. Como cerrar es una decisión
aparte de leer, nunca bajaba.

Ahora funciona como un mail: cada persona tiene su propia marca de
lectura, la conversación deja de figurar como pendiente cuando la abrís,
y vuelve a marcarse sola si llega un mensaje nuevo. En el listado se ve
una etiqueta "Sin leer".

**Fines de semana y feriados.** Los sábados y domingos ya se detectaban
solos. Lo que faltaba eran los feriados: un 25 de mayo dentro de unas
vacaciones se contaba como día hábil.

Ahora en Configuración hay un calendario de feriados. Navegás por año,
cargás los nacionales con un botón y agregás los propios de la empresa
(día del gremio, aniversario, un puente que decidan tomarse).

Dos cosas a tener en cuenta:

- Los feriados **trasladables** (17 de agosto, 12 de octubre, 20 de
  noviembre) y los **puentes turísticos** no se cargan solos. Cambian de
  fecha todos los años por decreto, y preferimos dejarlos vacíos antes
  que poner una fecha equivocada que después descuente mal un día de
  vacaciones. Se cargan a mano una vez al año.
- Carnaval y Viernes Santo sí se calculan solos.

**Logo.** Actualizado en toda la plataforma y en la web.

---

## 2. Necesitamos que nos confirmes

### Horas extras trabajadas en feriado

Ya sabemos qué días son no laborables. Lo que falta es la regla para
liquidar: **¿cómo se paga lo trabajado en un feriado?**

- ¿Va con 100% de recargo?
- ¿Se paga doble?
- ¿Se compensa con un franco?
- ¿Cambia según el convenio de cada empresa?

Esto lo define el convenio colectivo y no lo queremos suponer. Con la
regla escrita lo dejamos andando.

### Vacaciones: el período que arranca en octubre

Mencionaste que los días se deben acreditar al período del año a partir
de octubre, y que las vacaciones legales se toman de octubre a abril.

Antes de tocarlo necesitamos que nos escribas la regla completa, con un
ejemplo concreto. Por ejemplo:

> Un colaborador que ingresó el 15/03/2025, ¿cuántos días le
> corresponden al 1/10/2026 y hasta cuándo los puede tomar?

Con eso lo implementamos sin margen de error.

### Fichaje facial

Hoy el reconocimiento corre dentro del navegador, sin costo de
servicio. Preguntaste si conviene contratar algo externo.

Te vamos a pasar una comparación con números: qué se puede mejorar de lo
actual, qué servicios pagos hay, cuánto salen por mes según la cantidad
de colaboradores, y qué implica cada camino en tiempo de puesta en
marcha. La decisión es tuya una vez que veas los costos.

---

## 3. Necesitamos que lo pruebes de nuevo

Estos dos siguen sin resolverse y necesitamos tu ayuda para
diagnosticarlos.

- **Carga masiva de recibos** — identifica bien a las personas pero
  después figura error.
- **Envío de documentación para firma** — da error al subir el archivo.

Sumamos algo para no depender de capturas de pantalla: **la plataforma
ahora guarda sola el detalle técnico de cada error**. Vos no tenés que
hacer nada especial ni abrir nada.

**Lo que necesitamos:** después de la próxima actualización, volvé a
intentar las dos cosas exactamente como las hacías, aunque vuelvan a
fallar. Con eso nos queda registrado el detalle y lo revisamos de este
lado.

Si podés, avisanos aproximadamente **el día y la hora** en que lo
probaste, así lo ubicamos rápido.

---

## 4. Resumen de lo que necesitamos de vos

| # | Qué | Para qué |
|---|---|---|
| 1 | La regla de pago de horas trabajadas en feriado | Cerrar el cálculo de horas extras |
| 2 | La regla de vacaciones octubre–abril, con un ejemplo | Implementarla sin suposiciones |
| 3 | Reintentar carga masiva de recibos y envío de documentación | Capturar el error real |
| 4 | Los feriados trasladables y puentes de este año | Completar el calendario |

Sobre el fichaje facial no necesitamos nada todavía: primero te pasamos
la comparación de costos.
