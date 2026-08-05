# Respuestas a la devolución del 02/08

Documento para mandarle al cliente. Cubre las dos preguntas que dejó
abiertas (horas extras en feriado y regla de vacaciones) y resume qué se
corrigió y qué quedó pendiente.

---

## 1. Horas extras y feriados

### Cómo queda

El sistema calcula las horas trabajadas a partir del fichaje y sugiere
el valor de las extras al cargar la remuneración. **La sugerencia usa el
50%**, que es el recargo de los días hábiles.

Los recargos que la ley marca son:

| Cuándo                       | Recargo | Base legal                |
| ---------------------------- | ------- | ------------------------- |
| Día hábil, pasada la jornada | 50%     | LCT art. 201              |
| Sábado después de las 13     | 100%    | LCT art. 201              |
| Domingo                      | 100%    | LCT art. 201              |
| Feriado nacional             | 100%    | Ley 27.399 + LCT art. 166 |

Los topes: **3 horas por día, 30 por mes y 200 por año** (Decreto
484/2000).

### Qué hace la app hoy

- Cuenta las horas trabajadas fuera de la jornada configurada.
- En Remuneraciones muestra el total del mes y sugiere el importe al 50%,
  con un botón para sumarlo al bruto.
- Ahora los feriados cargados se ven en el calendario, y el resumen de
  fichadas marca **cuántos feriados trabajó cada persona** en el período.

### Qué queda a criterio de quien liquida

La app **no separa sola** las extras al 100% de las del 50%. Es a
propósito: el corte del sábado a las 13, los francos compensatorios y los
adicionales del convenio cambian la base de cálculo, y automatizarlo mal
es peor que no automatizarlo. El aviso en pantalla lo dice explícito
("revisalo con tu contador antes de liquidar").

**Si querés que lo separe automáticamente**, se puede hacer en una
segunda etapa: ya están los tres datos que hacen falta (fichaje, feriados
cargados y día de la semana). Lo que hay que definir con vos es qué hace
la empresa con el feriado trabajado: ¿se paga al 100%, se compensa con
franco, o las dos según el caso? Eso no lo puede decidir el sistema.

### Sobre los topes

Hoy no se bloquea a nadie por pasarse de 3 horas en un día. Si querés,
se puede agregar un aviso —no un bloqueo— cuando alguien supera el tope
diario, mensual o anual. Es una pantalla más, no un cambio de fondo.

---

## 2. Vacaciones: la regla completa con el ejemplo

### La regla

**Días que corresponden (LCT art. 150)**, computados al 31/12 del año:

| Antigüedad al 31/12 | Días corridos            |
| ------------------- | ------------------------ |
| Menos de 6 meses    | 1 día cada 20 trabajados |
| 6 meses a 5 años    | 14                       |
| 5 a 10 años         | 21                       |
| 10 a 20 años        | 28                       |
| Más de 20 años      | 35                       |

**Cuándo se toman (LCT art. 154):** entre el **1 de octubre y el 30 de
abril** del año siguiente. Es la ventana en la que la empresa puede
otorgarlas.

### El ejemplo que pediste

> Alguien que entró el 15/03/2025, ¿cuántos días tiene al 1/10/2026?

Hay que mirar **dos períodos distintos**, y ahí está la parte que se
presta a confusión:

**Período 2025** (antigüedad al 31/12/2025: 9 meses y medio)

Con menos de 6 meses correspondería 1 día cada 20 trabajados, pero al
31/12/2025 ya tiene más de 6 meses, así que le corresponden los **14
días** de la primera categoría. Esos días se toman entre el 1/10/2025 y
el 30/4/2026.

**Período 2026** (antigüedad al 31/12/2026: 1 año y 9 meses)

Le corresponden **14 días**, que puede tomar entre el 1/10/2026 y el
30/4/2027.

### Sobre el "1 día cada 20 trabajados"

En tu mensaje calculaste 10 días con esa regla. Vale la pena aclararlo,
porque es el punto que más se malinterpreta.

El **art. 153** dice que se otorga 1 día cada 20 de trabajo efectivo
**sólo cuando el trabajador no llegó a la mitad de los días hábiles del
año** (art. 151). No es la regla general: es la excepción para quien
entró tarde en el año.

Alguien que entró el **15/03/2025** trabajó de marzo a diciembre: superó
ampliamente la mitad de los días hábiles de 2025. Entonces le
corresponden los **14 días** de la tabla, no el prorrateo.

El prorrateo aplicaría, por ejemplo, a alguien que entró en **octubre de
2025**: al 31/12 trabajó unos 60 días hábiles, así que le corresponderían
3 días para el período 2025.

> **Nota técnica para nosotros:** el sistema aproxima esa condición con
> "menos de 6 meses de antigüedad al 31/12" en vez de contar días
> hábiles efectivos. Para los casos normales da el mismo resultado. Si
> alguna vez importa el borde exacto (alguien que entró justo a mitad de
> año y tuvo licencias largas), avisame y lo ajustamos.

### Los días que quedaron sin usar

Esto es lo que pediste y **ya está hecho**: en la ficha del colaborador
hay un ítem **"Vacaciones pendientes de años anteriores"** donde se
cargan a mano los días que no se tomó, y se suman al saldo del período
que arranca.

Ejemplo: si en 2025 le quedaron 7 días, se cargan ahí y el saldo de 2026
pasa a ser 14 + 7 = 21 días. La ficha lo muestra desglosado ("de 14 + 7
acumulados") para que el número se entienda.

**Se carga a mano y no se calcula solo**, a propósito. La LCT (art. 164)
permite acumular como máximo **un tercio del período inmediatamente
anterior** y el resto caduca. Decidir automáticamente qué días
sobreviven sería tomar por la empresa una decisión que no le corresponde
al sistema, y que además cada empresa arregla distinto con su gente.

---

## 3. Errores corregidos

| Qué reportaste                                             | Qué pasaba                                                                                                                                                                            | Estado                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Los feriados se cargan pero no figuran en el calendario    | El calendario nunca leía la tabla de feriados: sólo mostraba eventos y vencimientos                                                                                                   | **Corregido.** Los feriados aparecen pintados en el calendario y listados, con leyenda                          |
| "null value in column grupo_familiar" al guardar el legajo | Al editar cualquier dato, se mandaba `null` en el grupo familiar y Postgres rechazaba **todo** el guardado. Por eso "algo cargo y me lo toma": sólo funcionaba si el campo tenía algo | **Corregido**, y también en los otros 13 campos que tenían el mismo problema latente                            |
| No se puede registrar el rostro                            | Los modelos de reconocimiento se bajaban de un CDN externo que la política de seguridad de la app bloqueaba. Nunca era la conexión                                                    | **Corregido.** Los modelos ahora los sirve la propia app: anda sin internet y arranca más rápido en la tablet   |
| Los listados desplegables no se ven bien, se cortan        | Tenían alto fijo (unas 6 opciones) y dentro de los modales quedaban recortados por el contenedor                                                                                      | **Corregido.** Ahora usan todo el alto disponible, se abren para arriba si no hay lugar abajo, y no se recortan |

Además, el mensaje de error del fichaje facial decía "revisá tu conexión"
cuando el problema no tenía nada que ver con la conexión. Eso mandaba a
buscar el problema al lugar equivocado; ahora dice qué pasó de verdad.

---

## 4. Funcionalidad nueva

### Historial de fichadas con filtros

En **Fichaje**, debajo del panel del día, está el historial:

- Rango de fechas (por defecto, los últimos 7 días).
- Filtro por colaborador (nombre, apellido, legajo o DNI), por sector, y
  "sólo jornadas sin cerrar".
- Dos vistas: **Movimientos** (cada entrada y salida) y **Resumen** (una
  fila por persona).

### Excel del resumen

El botón **Excel** baja la planilla con el mismo formato que la que ya
usás: una fila por persona y, por cada día, ausencia / entrada / salida /
total de horas / si contó como día trabajado, más los totales de
feriados, horas y días a la derecha. Trae la hoja "Filtros aplicados" con
el período y los filtros usados.

> El botón **"Novedades de la semana"** sigue estando: es otra cosa
> (llegadas tarde y minutos). Los dos sirven para cosas distintas.

### Régimen laboral: las dos formas

Al dar de alta una empresa ahora se elige el **régimen**:

**A — Relación de dependencia** (lo de siempre)

Aportes de ley, recibos de sueldo, documentos para firmar, cada
colaborador con su usuario.

**B — Simplificado** (monotributo / pago directo)

- **Sin descuentos de ley**: el neto que muestra es la plata que se paga.
  Antes mostraba "neto $830.000" sobre un sueldo de $1.000.000 que se
  pagaba entero, así que la pantalla no servía.
- **Monotributo a cargo de la empresa**: en la ficha del colaborador se
  carga la cuota y se marca si la paga la empresa. Es tu ejemplo: sueldo
  $100 + monotributo $23 = $123 de costo del mes.
- **Colaboradores sin cuenta**: hay una opción en la ficha para marcar
  que esa persona no va a tener usuario. Ficha en la tablet, RRHH le
  carga ausencias y remuneración, y deja de aparecer en los avisos de
  "sin cuenta". Es lo que necesita Joaco.

Todo lo demás —fichaje, ausencias, feriados, reportes, métricas— funciona
igual en los dos regímenes.

El régimen se puede cambiar después desde la ficha de la empresa. Lo que
**no** hace es recalcular hacia atrás: los períodos ya liquidados quedan
con el neto con el que se guardaron. La pantalla lo avisa.

---

## 5. Pendiente

- **Logos de las empresas** (Mae Tuanis, Atrackon, Glaciarum,
  Bellolandia): esperando que los pasen.
- **Volver a probar la carga masiva de recibos y el envío para firma**:
  necesitás más mails de prueba.
- **Separar automáticamente las extras al 100%**: requiere definir qué
  hace la empresa con el feriado trabajado (ver punto 1).
- **Avisos por tope de horas extras** (3/día, 30/mes, 200/año): a
  definir si lo querés.

---

## 6. Rendimiento con más clientes (interno)

Esta sección no va para el cliente. Se arreglaron tres cosas que
funcionan bien con 10 empleados y se rompen con 300.

### El tope silencioso de 1000 filas

PostgREST corta cualquier `select` sin paginar en 1000 filas **y no
devuelve error**. Una empresa de 50 personas genera ~3000 fichajes por
mes, así que el resumen y el Excel salían incompletos sin que nada
fallara — el peor tipo de bug, porque el número está mal y parece bien.

Se agregó `traerTodo()` (`src/lib/services/supabase/paginado.ts`), que
pagina hasta agotar, y se aplicó a las tablas que crecen sin techo:
fichajes, ausencias, empleados, remuneraciones, recibos, notificaciones
y movimientos financieros.

Dos detalles que importan:

- Todas las consultas paginadas ordenan con un desempate (`ts` + `id`).
  Sin orden total, dos filas con la misma clave se pueden repetir o
  saltear entre páginas.
- Hay un tope duro de 50.000 filas que corta con un error explícito. Un
  rango de diez años no debe comerse la memoria del navegador en
  silencio.

### La agregación estaba en el navegador

El historial y el resumen de control se bajaban **todas** las marcas del
período para agruparlas en el cliente. Ahora las agrupa Postgres
(`jornadas_de_empresa`), que devuelve una fila por empleado y día. Un
mes de 300 personas pasó de ~18.000 filas a ~6.000, y la vista de
Movimientos pagina contra el servidor en vez de traer el período entero
para mostrar 15 filas.

De paso se eliminó una duplicación: había dos implementaciones del mismo
agrupado (una en `fichadas.ts` y otra en `real.ts`) que redondeaban
distinto.

### N+1

`getEmpresa()` se llamaba en casi todas las pantallas y dentro de
`cargarRemuneracion`, así que una carga masiva de 100 sueldos disparaba
100 consultas idénticas. Se cachea 30 segundos, con invalidación
explícita en cada escritura sobre `empresas` y con el id de la empresa
en la clave (el superadmin salta entre clientes sin recargar).

### Un bug de redondeo que apareció en el camino

El total de horas sumaba las horas **ya redondeadas** de cada día. Una
jornada de 8h58 se mostraba como 9,0 y, sobre veinte días, el total se
iba casi media hora para arriba. En la planilla con la que se paga eso
se nota. Ahora se suman los minutos exactos y se redondea una sola vez;
el Excel además muestra 8:58 en vez de 9:00.

---

## 7. Antes de probar

Hay tres migraciones nuevas de base de datos que hay que correr:

```
supabase/migrations/20260805000044_regimen_laboral_empresa.sql
supabase/migrations/20260805000045_vacaciones_pendientes.sql
supabase/migrations/20260805000046_jornadas_en_sql.sql
```

Sin eso, el régimen laboral y las vacaciones pendientes no van a andar.

Además, los modelos de reconocimiento facial ahora los sirve la propia
app desde `public/models`. Se copian solos en `npm install` y en el
build (igual que el worker de pdf.js), así que **hay que correr
`npm install` antes de levantar el proyecto**.
