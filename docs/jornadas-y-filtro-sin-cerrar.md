# Jornadas: agrupado, estado y el filtro "sin cerrar"

Documento técnico. Explica el modelo de jornadas, por qué el estado se
calcula y no se guarda, y qué casos borde quedan abiertos.

---

## 1. El modelo, tal como está

**No hay tabla `jornadas`.** Hay una tabla `fichajes` con marcas
sueltas:

| columna         | qué es                                   |
| --------------- | ---------------------------------------- |
| `empleado_id`   | de quién es la marca                     |
| `tipo`          | `ingreso` \| `egreso`                    |
| `ts`            | cuándo, en `timestamptz` (UTC)           |
| `fuera_de_zona` | si el GPS cayó fuera de la zona asignada |

Una jornada es el **agrupado** de esas marcas. No existe como fila en
ningún lado.

También importa que hoy hay **un solo camino de escritura**
(`ficharAhora`): la app no edita ni borra fichajes. Eso va a cambiar —
el cliente ya pidió un botón "Editar" en el historial — y esa
expectativa pesa en la decisión que sigue.

---

## 2. Por qué el estado se calcula y no se guarda

El pedido original era agregar una columna `cerrada` y mantenerla
sincronizada al registrar la salida. No se hizo, por tres razones:

**El grano no da.** `cerrada` es una propiedad de la jornada, y la
jornada no es una fila. Ponerla en `fichajes` significa repetir el mismo
booleano en cada marca del día y mantener un invariante entre ellas: si
una queda desincronizada, la jornada tiene dos verdades.

**Materializar una tabla cuesta más de lo que rinde.** Una tabla
`jornadas` con `cerrada` guardado hay que mantenerla en el alta, en la
edición, en el borrado, en la carga masiva y en cualquier corrección
hecha por SQL (este repo tiene archivos `diagnostico_*.sql`, así que eso
pasa). Más el backfill del histórico. Todo eso a cambio de evitar un
`GROUP BY` sobre un rango indexado, que en el peor caso realista son
unos miles de filas.

**Calculado no se puede desincronizar.** Es la propiedad que más vale
acá: el estado siempre refleja las marcas, sin ninguna disciplina que
mantener.

### Cuándo habría que revisar esta decisión

- Si `fichajes` llega a decenas de millones de filas y el agregado deja
  de entrar en el presupuesto de latencia → vista materializada con
  refresco incremental.
- Si la jornada pasa a ser una **entidad propia**: que se pueda aprobar,
  corregir a mano, o bloquear después de liquidar. Ahí el estado deja de
  ser derivado y pasa a ser un dato con historia propia, y entonces sí
  corresponde una tabla.

Mientras la jornada sea "lo que dicen las marcas", calcularla es lo
correcto.

---

## 3. Cómo se agrupa

Se agrupa por **sesión**, no por fecha de calendario.

> Una marca abre jornada nueva si es un `ingreso` y (es la primera de esa
> persona **o** pasaron 6 horas o más desde la marca anterior). Todo lo
> demás continúa la jornada abierta.

Las 6 horas (`corte_jornada()`) están elegidas entre dos cotas reales: el
corte más largo _dentro_ de una jornada es el almuerzo (una o dos horas),
y el descanso más corto _entre_ jornadas son las 12 que exige la LCT
(art. 197). Cualquier valor entre 3 y 11 da el mismo resultado en la
práctica.

La jornada se **fecha por su ingreso**: el turno que entra el lunes a las
22:00 y sale el martes a las 06:00 es la jornada del lunes.

### Qué resuelve el cambio

Antes se agrupaba por `(empleado, fecha del fichaje)`. El turno nocturno
quedaba partido en dos: el lunes con entrada y sin salida, el martes con
salida y sin entrada, **los dos con cero horas y los dos marcados "sin
cerrar"**. Para una empresa con turno noche, el módulo entero daba
números falsos.

| caso                          | antes                  | ahora                     |
| ----------------------------- | ---------------------- | ------------------------- |
| Turno nocturno 22:00 → 06:00  | 2 jornadas rotas, 0 hs | 1 jornada del lunes, 8 hs |
| Salida y vuelta del almuerzo  | 1 jornada (ya andaba)  | igual                     |
| Doble toque en la terminal    | 1 jornada (ya andaba)  | igual                     |
| Se olvidó de fichar la salida | 2 abiertas             | 1 abierta + 1 cerrada     |
| Egreso sin ingreso previo     | jornada sin entrada    | igual                     |

---

## 4. Los tres estados

| estado       | definición                                                       |
| ------------ | ---------------------------------------------------------------- |
| `cerrada`    | tiene entrada **y la última marca es un egreso**                 |
| `en_curso`   | tiene entrada, no cerró, y el ingreso fue hace menos de 16 horas |
| `incompleta` | ni cerrada ni en curso → **esto es lo que hay que corregir**     |

Dos detalles que no son obvios:

**`cerrada` mira la última marca, no "si hay algún egreso".** El caso
que lo obliga: entró 07:00, salió a almorzar 12:00, volvió 12:30 y no
fichó la salida. Tiene un ingreso y un egreso, pero la persona volvió y
nunca se fue: la jornada está abierta. Con la definición ingenua ("hay
entrada y hay salida") figuraba como cerrada y el error se perdía. Esto
lo encontró un test, no una revisión.

**`en_curso` se separa de `incompleta` a propósito.** El rango por
defecto del historial son los últimos 7 días e incluye hoy. Sin esta
distinción, a las 10 de la mañana el filtro "sin cerrar" devolvía a toda
la planta: gente que entró y todavía no salió. Cierto, pero inservible.
Quien está trabajando ahora no es un error que corregir.

En pantalla, "en curso" aparece con etiqueta propia en el resumen y
**no** entra en el filtro.

---

## 5. El filtro, ahora en SQL

El bug original: el filtro se aplicaba en el navegador sobre la página ya
traída. Si una jornada abierta caía en la página 4, no aparecía nunca — y
el contador del paginador contaba filas que después se descartaban.

Ahora hay dos funciones en la base:

**`jornadas_de_empresa(empresa, desde, hasta, empleado_ids)`**
Una fila por jornada, con `cerrada` y `en_curso` como columnas
calculadas. PostgREST permite filtrar sobre el resultado de una función,
así que el cliente pide `cerrada=false&en_curso=false` y Postgres aplica
el `WHERE` **antes** del `LIMIT/OFFSET`.

**`fichajes_del_periodo(empresa, desde, hasta, empleado_ids, solo_abiertas)`**
Las marcas sueltas de la vista Movimientos. `returns setof fichajes`, así
que devuelve la misma forma que un select sobre la tabla y agregar una
columna a `fichajes` no obliga a tocarla.

Las dos se apoyan en **`marcas_numeradas`**, que es la única
implementación de la regla de agrupado. Antes había dos copias que
redondeaban distinto.

Se leen 24 horas de más a cada lado del rango para no cortar por la mitad
las jornadas que cruzan el borde, y después se descartan las que arrancan
fuera: **una jornada pertenece al período en el que empezó**.

### Índices

```sql
create index fichajes_empresa_ts_jornada_idx
  on fichajes (empresa_id, ts) include (empleado_id, tipo, fuera_de_zona);
```

El barrido queda index-only. **No se indexa la fecha local**: la
expresión `(ts at time zone …)::date` es `STABLE` y no `IMMUTABLE` (las
reglas de husos horarios cambian), así que Postgres rechaza el índice.
Por eso todo filtra por `ts` y la conversión a fecha local se hace una
sola vez sobre los límites del rango.

---

## 6. Casos borde

### Resueltos y con test

- Turno nocturno cruzando medianoche.
- Corte de almuerzo (y varios cortes en el mismo día).
- Doble toque en la terminal.
- Salida sin fichar → la jornada anterior queda abierta.
- **Vuelta del almuerzo sin fichar la salida** → abierta.
- Egreso huérfano, sin ingreso.
- Jornada que arranca antes del rango → no cuenta en ese período.
- Jornada que termina después del rango → se ve completa igual.
- Dos jornadas el mismo día separadas por 7 horas.

### Conocidos, sin resolver

**Jornada de más de 16 horas.** Deja de contar como "en curso" y pasa a
"incompleta" aunque la persona siga adentro. Es deliberado: por encima de
ese límite, lo más probable es que sea un fichaje que quedó mal. Si algún
cliente tiene guardias de 24 horas, hay que subir `max_jornada()`.

**Doble jornada con menos de 6 horas de descanso.** Se agrupan como una
sola. Es ilegal (LCT art. 197 exige 12 horas), así que en la práctica no
debería pasar; si pasa, el número va a estar mal y conviene que se note.

**Cambio de huso horario.** `zona_empresa()` está fija en
`America/Argentina/Buenos_Aires`. Toda la app es argentina (LCT, CUIL,
AFIP). Si aparece un cliente en otro huso, pasa a ser una columna de
`empresas` y un parámetro más.

**Fichajes cargados con fecha futura.** No se validan. Una carga manual
con la fecha mal tipeada genera una jornada en el futuro que va a
aparecer en los rangos que la incluyan.

**Edición y borrado de fichajes.** Todavía no existen en la app. Cuando
se agreguen, el estado de la jornada se recalcula solo — que es
exactamente la ventaja de no haberlo guardado.

---

## 7. Cómo verificar los cambios

Hay dos scripts que necesitan un Postgres a mano (no corren en CI):

```bash
# Suite funcional: agrupado, estados, filtro, paginación y bordes.
PG_URL=postgres://… node scripts/probar-jornadas.mjs

# Que la implementación SQL y la de TypeScript den lo mismo.
PG_URL=postgres://… TS_FICHADAS=/ruta/a/fichadas.js \
  node scripts/comparar-jornadas-sql-ts.mjs
```

El segundo existe porque hay **dos implementaciones de la misma regla**:
`jornadas_de_empresa` en SQL (la que corre en producción) y
`armarJornadas` en `src/lib/fichadas.ts` (la de la demo y los tests). Que
coincidan no lo garantiza nada más que ejecutarlas sobre los mismos casos
y comparar. Si se toca el agrupado, hay que correr los dos.

Los tests de Jest (`src/tests/fichadas.test.ts`) cubren la versión
TypeScript y no necesitan base.
