# Auditoría técnica pre-producción — agosto 2026

Revisión completa de arquitectura, lógica de negocio, base de datos,
seguridad, performance y escalabilidad antes de poner la app en producción
con clientes reales.

**Alcance:** 224 archivos TypeScript (~44.500 líneas), 47 migraciones SQL,
7 rutas de API, 24 pantallas. No se hicieron cambios de código.

---

> **Estado al 2026-08-07 (tarde):** los **6 bloqueantes están resueltos**.
> Suite en verde: 32 suites, 317 tests (eran 270 en 31 suites, con 12
> rojos). Typecheck, lint y build limpios; CI montado.
>
> **Migraciones 48 y 49: probadas contra Postgres real (2026-08-07).**
> Se levantó el stack local (`supabase start`), se aplicaron **las 49
> migraciones desde cero** (`supabase db reset`) y se ejercitó cada rama
> de las funciones nuevas. Al hacerlo aparecieron **cuatro errores** que
> la revisión a ojo no había encontrado; están corregidos y reverificados.
> Detalle en C1.
>
> **Lo que sigue sin verificarse**, porque no se puede desde acá:
>
> - El **liveness con una cámara real** (la lógica pura tiene 14 tests,
>   pero nadie parpadeó frente a una webcam).
> - Las pantallas renderizadas de verdad: baja de colaborador (C4) y el
>   modal de remuneración (C5).
> - Las consultas de C5 (`getTurnosEntre` y sus tres consumidores) contra
>   datos reales.
>
> Plan de prueba en "Cómo verificar lo que falta".

## Veredicto

**Funciona, con reservas serias.** *(Veredicto original de la auditoría;
ver el estado de arriba para lo ya corregido.)*

La app compila, arranca, y el 96 % de los tests pasan. La calidad del
código es alta para un proyecto de este tamaño: cero `console.log`, 12
`any` en 44 mil líneas, dos TODO, typecheck y lint limpios, y una
disciplina de documentación (`docs/errores.md`, comentarios que citan
artículos de la LCT) que está muy por encima del promedio.

Lo que impide firmar la salida a producción no es la calidad del código
sino **cinco problemas concretos**: dos de dinero (se liquida mal), dos
de cumplimiento legal y de integridad del control horario, y uno de
proceso (no hay red que impida que los otros cuatro se repitan).

Ninguno es un rediseño. Los cinco son acotados y arreglables.

---

## Qué se ejecutó

| Verificación | Comando | Resultado |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | ✅ Limpio, cero errores |
| Lint | `npm run lint` | ✅ 0 warnings, 0 errores |
| Tests unitarios | `npm run test:ci` | ❌ **4 suites / 12 tests fallando** (270 pasan de 282) |
| Build producción | `npm run build` | ✅ Compila, 39 rutas generadas |
| Arranque | `npm run dev` | ✅ Ready en 1,5 s; `/` y `/login` devuelven 200 |
| Headers seguridad | `curl -I` en runtime | ✅ CSP, HSTS, X-Frame-Options, Permissions-Policy aplicados |
| Vulnerabilidades | `npm audit --omit=dev` | ❌ 6 vulnerabilidades (4 high, 2 moderate) |
| E2E | `npm run test:e2e` | ⏭️ No ejecutado (requiere instancia Supabase con datos) |

**Sobre los 12 tests que fallan:** son los 4 suites de la landing pública
(`HeroSection`, `Header`, `FeaturesSection`, `ContactSection`). La causa
es única y mecánica: los tests mockean `framer-motion` exponiendo sólo
`motion.div`, pero los componentes hoy usan `motion.h1`, `motion.p`,
`motion.span` y `AnimatePresence`. Al no estar en el mock, esos elementos
llegan como `undefined` y React tira *"Element type is invalid"*.

**Ninguna lógica de negocio está rota**: las 27 suites de dominio
(remuneraciones, liquidación final, fichadas, turnos, vacaciones,
convenios, kiosco, organigrama, validaciones) pasan enteras.

---

## 1. Problemas críticos

### C1 — El fichaje facial y la geocerca los decide el cliente

**Gravedad: crítica · Prioridad: 1 · ✅ RESUELTO (nivel 1) (2026-08-07)**

> **Arreglado.** La migración
> `20260807000049_fichaje_facial_validado_en_servidor.sql` agrega el RPC
> `fichar_con_rostro`: el cliente manda **sólo el descriptor y las
> coordenadas crudas**, y el servidor hace el match contra los rostros
> enrolados, calcula la geocerca con Haversine, decide ingreso/egreso e
> inserta la fichada él mismo. `confianza` y `fuera_de_zona` dejan de ser
> algo que el cliente pueda afirmar.
>
> Para que no se pueda esquivar el RPC, un trigger
> (`exigir_fichaje_facial_validado`) rechaza cualquier `insert` en
> `fichajes` con método facial que no venga de él. El RPC es
> `security definer`, así que además **los descriptores de la empresa ya no
> se bajan a la tablet** — eso resuelve también I12.
>
> En el cliente, `FichajeFacialModal` perdió el matching, el cálculo de
> geocerca y los props `descriptorEmpleado` y `geocerca`: ya no existen
> de este lado. Los errores ahora pasan por `interpretarError`, así que
> "no te reconocí" se distingue de "se cayó la conexión".
>
> **Liveness:** nuevo `src/lib/facial/liveness.ts` con detección de
> parpadeo por relación de aspecto del ojo (EAR). Se exige al fichar
> —no al enrolar, donde hay alguien de RRHH presente— y corta el caso de
> la foto impresa o la pantalla de otro celular. 14 tests, incluidos los
> casos "foto con ojos abiertos" y "foto con ojos cerrados".
>
> **Verificación contra Postgres real (2026-08-07).** Las 49 migraciones
> aplican limpio desde cero. Probar de verdad encontró **cuatro errores
> que leer el código no había encontrado** — vale registrarlos porque tres
> de los cuatro habrían llegado a producción:
>
> | # | Qué estaba mal | Consecuencia si llegaba a producción |
> |---|---|---|
> | 1 | El trigger guardaba `metodo like 'facial%'`, pero el fichaje facial **desde el celular** usa método `celular`/`remoto` | El agujero seguía abierto por esa ruta: `confianza: 1` por insert directo. **Era el bug más grave** |
> | 2 | `returns fichajes` en vez de `returns setof fichajes` | PostgREST devolvía un objeto donde `.single()` espera un arreglo: **el fichaje facial no habría funcionado nunca** |
> | 3 | `v_tipo` y `v_ultimo` declarados `text`, pero las columnas son enums (`tipo_fichaje`, `metodo_fichaje`) | El `insert` fallaba siempre: *"column tipo is of type tipo_fichaje but expression is of type text"* |
> | 4 | `if v_mejor is null` en vez de `if not found` | Funcionaba de casualidad; frágil |
>
> Corregidos y reverificados. Qué se ejercitó, todo pasando:
>
> - **Matemática:** `distancia_descriptores` (√50 = 7,0711) y
>   `distancia_metros` (1° de latitud = 111.195 m).
> - **Consentimiento (mig. 48):** rechaza sin consentimiento, con
>   `aceptado:false` y sin fecha; acepta completo; deja editar otros
>   campos de una ficha ya enrolada; deja borrar siempre (ARCO).
> - **Guardia de fichajes (mig. 49):** rechaza el insert directo con
>   `confianza` y con `fuera_de_zona`; deja pasar el fichaje manual.
> - **RPC:** ingreso/egreso alternando, confianza calculada por el
>   servidor (0,965 = 1 − 0,0173/0,5, correcto), geocerca dentro y fuera,
>   rostro desconocido rechazado, descriptor vacío rechazado, modo 1:1,
>   margen entre dos rostros parecidos (se niega a elegir) y exclusión de
>   empleados inactivos.
> - **Contrato REST:** `POST /rest/v1/rpc/fichar_con_rostro` con un JWT
>   real devuelve arreglo por defecto y objeto con el `Accept` que usa
>   `.single()`.
>
> **Salvedades que quedan:**
>
> 1. Esto es el **nivel 1** que acordamos: el descriptor lo sigue
>    calculando el navegador, así que un cliente modificado podría enviar
>    uno inventado. Cortar eso requiere mandar la imagen y calcular el
>    embedding en el servidor, con el costo que se discutió.
> 2. El **liveness no se probó con una cámara real** — sólo su lógica
>    pura (14 tests).
> 3. `getDescriptoresFaciales()` ya no la usa ninguna pantalla, pero sigue
>    expuesta en el facade y en la base. Conviene quitarla en una limpieza
>    aparte; hoy sólo la tocan los tests.

**Qué pasa.** Todo el pipeline de reconocimiento facial corre en el
navegador (`src/lib/facial/reconocimiento.ts`). El servidor nunca
recalcula nada: `ficharAhora` (`src/lib/services/supabase/real.ts:1649`)
inserta `confianza`, `metodo`, `geo` y `fueraDeZona` **tal como los manda
el cliente**. El cálculo de si está dentro de la geocerca se hace en
`src/lib/facial/ubicacion.ts` y viaja al servidor como un booleano ya
resuelto.

**Por qué ocurre.** El módulo se diseñó como UX de kiosco (matching 1:N en
la tablet, sin latencia de red) y nunca se agregó la contraparte de
validación server-side.

**Impacto.** El registro horario no es confiable como prueba. Concretamente:

- Cualquier sesión con rol `supervisor` o `admin_rrhh` puede fichar por
  cualquier empleado con un `fetch` a la API de Supabase pasando
  `confianza: 1` — la política `fichajes_fichar`
  (`20260727000024_fix_permisos_superadmin.sql:35`) lo permite porque
  necesita habilitar la tablet de planta.
- `navigator.geolocation` se falsea desde las DevTools de Chrome o con
  cualquier app de GPS spoofing. Un empleado puede marcar "dentro de
  zona" desde su casa.
- No hay ninguna detección de vida (*liveness*): una foto impresa o la
  pantalla de otro celular pasan la verificación. El *buddy punching* —el
  fraude exacto que el reconocimiento facial debería evitar— sigue siendo
  trivial.

Si un empleado impugna un descuento por llegadas tarde, o si hay una
inspección laboral, el registro no se sostiene: cualquiera puede
demostrar que el dato lo escribió el cliente.

**Cómo se soluciona.** Mover la decisión al servidor: una función RPC
(`security definer`) que reciba el descriptor y las coordenadas crudas,
haga el matching contra `empleados.descriptor_facial` y calcule
`fueraDeZona` contra la geocerca guardada, y devuelva el fichaje ya
insertado. `confianza` y `fueraDeZona` dejan de ser campos escribibles
por el cliente. Como paso mínimo intermedio, un `liveness` básico
(parpadeo o giro solicitado) antes de aceptar el descriptor.

---

### C2 — El consentimiento biométrico es un checkbox sin efecto

**Gravedad: crítica (legal) · Prioridad: 1 · ✅ RESUELTO (2026-08-07)**

> **Arreglado.** El consentimiento dejó de ser estado de React:
> `enrolarRostro(id, descriptor, consentimiento)` lo recibe como
> parámetro y falla si no viene aceptado. Se guarda la **constancia
> completa** —qué texto se aceptó, cuándo y qué usuario lo registró— en
> vez de sólo `{ aceptado: true }`, porque ante un reclamo hay que poder
> mostrar qué se informó.
>
> Lo que hace que esto no sea otra vez cosmético: la regla vive en la
> base. La migración
> `20260807000048_consentimiento_biometrico_real.sql` agrega el trigger
> `exigir_consentimiento_biometrico`, que rechaza cualquier escritura de
> `descriptor_facial` sin consentimiento aceptado y fechado — desde la
> app, desde el REST o desde un script. Sólo se controla cuando el
> descriptor **cambia**, para no bloquear la edición de fichas viejas.
>
> **Pendiente de decisión tuya:** las filas ya enroladas tienen el
> consentimiento autogenerado por el código viejo. La migración no las
> toca. El SQL para invalidarlas y forzar el re-enrolamiento con
> consentimiento real está comentado al final del archivo — se distingue
> por `otorgadoPor`, que sólo escribe el código nuevo.

**Qué pasa.** `EnrolamientoFacial.tsx:127` exige tildar un checkbox de
consentimiento antes de habilitar la captura, pero **ese estado nunca sale
de React**. `enrolarRostro` (`real.ts:1689`) no recibe ningún parámetro de
consentimiento y **siempre** escribe:

```ts
consentimiento_biometrico: { aceptado: true, fecha: hoyISO() }
```

Verificado en el código. Cualquier llamada a esa función marca el
consentimiento como otorgado, haya ocurrido o no.

La regla `facial_sin_consentimiento` (`src/lib/requisitos.ts:186`) tiene
severidad `'bloquea'`, pero `bloquea()` sólo se usa para **pintar un chip
de rojo** en `Faltas.tsx`. No hay ningún `if (bloquea(...)) return` antes
de enrolar o fichar. Y como `enrolarRostro` siempre escribe
`aceptado: true`, la falta prácticamente nunca puede dispararse.

**Por qué ocurre.** El consentimiento se modeló como requisito de UI en
vez de como precondición de datos. La documentación
(`docs/errores.md:224`) lo describe como "la única falta que bloquea",
pero el bloqueo nunca se implementó en el backend.

**Impacto.** La Ley 25.326 exige consentimiento previo, informado y
expreso para tratar datos biométricos. Hoy el sistema **registra que ese
consentimiento existe sin que haya ocurrido**, y quien tilda el checkbox
suele ser RRHH operando la ficha, no el propio empleado. En una
inspección o un reclamo, el registro de consentimiento es un dato que la
app se autogeneró.

**Cómo se soluciona.** Que `enrolarRostro` reciba el consentimiento como
parámetro explícito y lo persista con evidencia (fecha, quién lo otorgó,
idealmente confirmado por el propio empleado desde su cuenta). Un
`CHECK`/trigger en Postgres que rechace escribir `descriptor_facial` si
`consentimiento_biometrico` no viene en el mismo statement.

---

### C3 — La biometría no se borra cuando el empleado se va

**Gravedad: crítica (legal) · Prioridad: 2 · ✅ RESUELTO (2026-08-07)**

> **Arreglado.** `darDeBajaEmpleado` ahora borra `descriptor_facial` y
> `consentimiento_biometrico` en el mismo `update` que marca la baja, y lo
> deja asentado en auditoría. Ya no depende de que alguien se acuerde de
> apretar "borrar rostro".
>
> **La foto de perfil no se toca**, a propósito: es parte del legajo que
> hay obligación de conservar y que la propia pantalla de baja promete
> conservar. El dato biométrico es el descriptor, no la foto.
>
> 3 tests nuevos en `servicios.test.ts` (rechazo sin consentimiento,
> constancia guardada, biometría borrada en la baja).

**Qué pasa.** `darDeBajaEmpleado` (`real.ts:768`) hace exactamente esto:

```ts
.update({ activo: false, motivo_baja: motivo, fecha_baja: fecha })
```

No toca `descriptor_facial` ni `consentimiento_biometrico`. La función
`borrarRostro` existe (`real.ts:1712`) pero es un botón manual separado
que nadie está obligado a apretar.

**Por qué ocurre.** El flujo de baja se pensó como baja lógica del legajo;
el borrado de biometría se implementó por separado para el caso "me quiero
desenrolar" y los dos nunca se conectaron.

**Impacto.** El vector biométrico de cada ex-empleado queda almacenado
indefinidamente, junto con su foto en el bucket `fotos`. La Ley 25.326
exige eliminar los datos cuando dejan de cumplir la finalidad para la que
se recolectaron. Un ex-empleado que ejerce su derecho ARCO no tiene
forma de que el dato realmente se vaya, y la empresa acumula pasivo legal
por cada baja.

**Cómo se soluciona.** Que `darDeBajaEmpleado` invoque `borrarRostro` y
`borrarDeStorage` de la foto en la misma operación (idealmente vía RPC
transaccional). Si se quiere conservar la trazabilidad de que hubo
enrolamiento, dejar el registro de auditoría pero no el vector.

---

### C4 — La liquidación final descuenta vacaciones del año equivocado

**Gravedad: crítica (dinero) · Prioridad: 1 · ✅ RESUELTO (2026-08-07)**

> **Arreglado.** Los días gozados ahora se derivan del año de `fechaBaja`,
> no del año del sistema. Se extrajo `diasVacacionesGozadosEn()` a
> `src/lib/vacaciones.ts` (función pura, testeable sin React) y se
> reemplazó la derivación que estaba dentro del `useMemo` de la página.
> Sale de `ausencias`, que la ficha ya tenía en memoria: no agrega ninguna
> consulta. Además, si las ausencias no se pudieron leer el borrador ya no
> se arma —antes suponía cero días gozados y pagaba de más— y se muestra
> un mensaje que dice por qué. 7 tests nuevos en `vacaciones.test.ts`,
> incluido el caso de baja retroactiva a caballo de año.

**Qué pasa.** En `src/app/app/colaboradores/[id]/page.tsx`:

```ts
const ANIO_ACTUAL = new Date().getFullYear();          // línea 83
const cSaldo = useCarga(() => getSaldoVacaciones(id, ANIO_ACTUAL), [id]);  // 109
// ...
armarLiquidacionFinal({ fechaBaja, diasVacacionesGozados: saldo?.diasUtilizados ?? 0 })  // 211-214
```

Pero dentro de `diasVacacionesProporcionales`
(`src/lib/liquidacionFinal.ts:31`), el año que se usa para calcular
cuánto le corresponde es `baja.getFullYear()` — **el año de la fecha de
baja, no el del sistema**.

Además, el `useCarga` tiene `[id]` como dependencia: cambiar la fecha de
baja en el date-picker no vuelve a pedir el saldo.

**Por qué ocurre.** Dos partes del cálculo tomaron el año de fuentes
distintas: la UI lo tomó del reloj, la función de dominio de la fecha del
hecho.

**Impacto — dinero real, silencioso.** Si hoy es enero de 2027 y se carga
una baja con fecha 2026-12-15:

- "Cuánto le correspondía" se calcula bien para 2026.
- "Cuántos días ya se tomó" viene del saldo de **2027** — recién empezado,
  casi seguro 0.
- La liquidación **no descuenta las vacaciones que sí gozó durante 2026** y
  la empresa las paga de nuevo.

Se dispara con cualquier baja retroactiva o procesada después del cambio
de año, que en la práctica es habitual. No hay ningún aviso en pantalla:
el número simplemente sale mal.

**Cómo se soluciona.** Pedir el saldo del año de la baja, no del año del
sistema: `getSaldoVacaciones(id, Number(fechaBaja.slice(0, 4)))`, con
`fechaBaja` en las dependencias del `useCarga`. Vale además un test de
regresión en `liquidacionFinal.test.ts` con baja a caballo de año.

---

### C5 — Las horas extra ignoran el turno asignado al empleado

**Gravedad: crítica (dinero) · Prioridad: 2 · ✅ RESUELTO (2026-08-07)**

> **Arreglado.** `controlDeJornadas` ahora usa el **turno asignado** a esa
> persona ese día y sólo cae al horario general si no tiene turno, así que
> las empresas que no usan turnos no cambian. La comparación se extrajo a
> `controlarJornada()` en `src/lib/turnos.ts` —función pura— y se conectó
> en los tres consumidores (Reportes, Mi Mes, liquidación).
>
> Se resolvió además el **turno noche**: un horario cuya salida es menor
> que la entrada (22:00–06:00) se reconoce como que cruza medianoche. Antes
> daba 840 minutos de llegada tarde por día.
>
> Al revisarlo apareció un segundo problema: la tabla `turnos` tiene
> `extras_aprobadas` y la pantalla de Turnos deja aprobarlas, pero **nada
> en el camino de liquidación lo leía**. Por decisión del cliente, al bruto
> ahora sólo se ofrecen las **aprobadas**. `getHorasExtrasDelPeriodo`
> devuelve `{ detectadas, aprobadas }` y el modal muestra las dos: si hay
> extras sin aprobar lo dice y explica dónde aprobarlas, en vez de mostrar
> un cero que se lee como "no hizo extras".
>
> También se agregó `getTurnosEntre()`, acotada por rango: `getTurnos()`
> traía todos los turnos históricos de la empresa sin filtrar por fecha.
>
> 10 tests nuevos en `turnos.test.ts`, incluidos los tres del turno noche.
>
> **Decisión registrada:** entrar antes de hora **no** cuenta como extra
> (sólo la salida tardía). `controlarTurno`, que se usa en la grilla de
> Turnos, sí las cuenta — queda como diferencia conocida entre "lo que
> muestra la grilla" y "lo que se paga".

**Qué pasa.** Hay **dos definiciones distintas de "horario esperado"**:

- `src/lib/turnos.ts` (`controlarTurno`) compara contra el `Turno`
  asignado a ese empleado ese día — horario individual.
- `controlDeJornadas` (`real.ts:1981`) compara contra
  `empresa.config.horaEntrada` / `horaSalida` — **un horario único y
  global para toda la empresa**. Nunca llama a `getTurnos`.

La segunda es la que alimenta `getResumenControl` (dashboard de Reportes)
y `getHorasExtrasDelPeriodo` (`real.ts:2136`), que es lo que
`RemuneracionModal.tsx:399` ofrece con el botón **"Sumar al bruto"**.

El comentario de `getHorasExtrasDelPeriodo` afirma que usa "la misma
función que usa el control de Turnos". Es engañoso: usa la misma función
que Reportes, que es justamente la que **no** mira los turnos.

**Por qué ocurre.** El horario global existía primero; la asignación de
turnos por empleado se agregó después y sólo se conectó al módulo de
control de Turnos, no a Reportes ni a Remuneraciones.

**Impacto.** En cualquier empresa con turnos que no coincidan con el
horario general —rotativos, nocturno, medio turno— las horas extra
sugeridas al liquidar son incorrectas, y se cargan al sueldo bruto con un
clic. Un empleado de turno noche (22:00–06:00) además aparece con
cientos de minutos de llegada tarde por día en Reportes.

**Cómo se soluciona.** Que `controlDeJornadas` reciba los turnos del
período y use, por cada jornada, el turno del empleado ese día, con el
horario global como fallback cuando no hay turno asignado. Es un cambio
acotado a una función, pero toca dos consumidores (Reportes y
Remuneraciones), así que conviene hacerlo con tests primero.

Nota relacionada: `valorHorasExtras` (`remuneraciones.ts:101`) aplica
siempre recargo 50 %, nunca el 100 % de sábado después de las 13,
domingo y feriado (art. 201 LCT). Está advertido en la UI, pero el botón
"Sumar al bruto" saltea la advertencia.

---

### C6 — No hay CI, y hay tests rotos en `main`

**Gravedad: crítica (proceso) · Prioridad: 1 · ✅ RESUELTO (2026-08-07)**

> **Arreglado.** Los 12 tests están en verde: **31 suites, 290 tests**.
> Aparecieron tres causas distintas, no una:
>
> 1. El mock de `framer-motion` enumeraba `motion.div` a mano. Ahora hay
>    un stub único (`src/tests/mocks/framerMotion.tsx`) con un Proxy, así
>    que `motion.loQueSea` funciona y no hay lista que mantener. Se
>    enchufa por `moduleNameMapper`, igual que el stub de `iceberg-js`, y
>    se borraron los tres `jest.mock` locales.
> 2. `jest.setup.js` estaba vacío y le faltaban polyfills que jsdom no
>    trae y esta app sí usa: `matchMedia` (Mantine y `useContador`),
>    `IntersectionObserver` y `requestAnimationFrame`.
> 3. Header y FeaturesSection tenían aserciones contra copy que ya no
>    existe. Se actualizaron al texto real.
>
> El CI vive en `.github/workflows/ci.yml`: typecheck, lint, tests y
> build en cada push y PR, más un job informativo de `npm audit`. Se
> verificó que el build **no necesita credenciales reales** (los clientes
> de Supabase son lazy), así que CI corre con placeholders y no toca la
> base.

**Qué pasa.** No existe `.github/workflows` ni ninguna otra configuración
de integración continua. Los 12 tests rotos están commiteados en `main` y
nada los señala. `npm test` es `jest --watch`, que en un pipeline se
colgaría; el script correcto (`test:ci`) no lo invoca nadie
automáticamente.

**Por qué ocurre.** El proyecto creció rápido y la verificación siempre se
corrió a mano.

**Impacto.** Es el problema que sostiene a los otros cinco. Los bugs C4 y
C5 son exactamente el tipo de cosa que un test de regresión atrapa, y
hoy nada garantiza que se corran. Con la app en producción liquidando
sueldos, "me acordé de correr los tests" no es una estrategia.

Además, `scripts/comparar-jornadas-sql-ts.mjs` existe precisamente porque
hay **dos implementaciones de la misma regla de jornadas** (TypeScript en
`fichadas.ts` y SQL en `20260805000047_jornadas_por_sesion.sql`). Hoy
coinciden, pero la única garantía de que sigan coincidiendo es que alguien
corra ese script a mano.

**Cómo se soluciona.** Un workflow de GitHub Actions que corra `tsc
--noEmit`, `next lint`, `test:ci` y `build` en cada push y PR. Arreglar el
mock de `framer-motion` para poner los 12 tests en verde antes de
activarlo (si no, nace rojo y se ignora). Como segundo paso, meter la
comparación SQL↔TS de jornadas en el pipeline contra una base efímera.

---

## 2. Problemas importantes

### I1 — `/api/avisos` no valida el rol de quien dispara el aviso

`src/app/api/avisos/route.ts:62-69` valida sesión y que el registro
pertenezca a la misma empresa, pero **nunca chequea `perfil.rol`**. Usa
`supabaseAdmin()` (service role, saltea RLS) para leer `comunicaciones`,
`recibos` y `ausencias` de toda la empresa.

Un usuario con rol `empleado` puede entonces disparar emails a sus
compañeros sobre recibos o ausencias ajenas, y usar la diferencia de
respuesta (`{ok:false}` vs envío) como oráculo para enumerar qué IDs
existen en su empresa.

**Arreglo:** exigir `admin_rrhh`/`supervisor` según el evento.
**Prioridad: 3.**

### I2 — `adelantos_select` expone montos a supervisores

`20260710000021:61-66` usa `es_gestor()`, que incluye `supervisor`. Es
**exactamente el mismo patrón** que ya se corrigió para recibos en
`20260728000032_recibos_solo_rrhh.sql` tras la decisión del cliente de
que el detalle salarial es sólo de RRHH — pero no se aplicó a adelantos,
que son igualmente información salarial. `vacaciones_pendientes_select`
(`20260805000045:47`) tiene el mismo alcance amplio.

**Arreglo:** `auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado()`.
**Prioridad: 3.**

### I3 — Faltan índices por `empresa_id` en las tablas que más van a crecer

Verificado: los únicos índices sobre `recibos` son por `empleado_id` y el
único parcial de vigencia; sobre `remuneraciones`, sólo el único de
`(empleado_id, periodo, tipo)`. **Ninguna tiene índice por `empresa_id`**,
que es el filtro obligatorio de toda query (RLS lo aplica siempre).

`getRecibosTodos()` y `getRemuneracionesTodas()` filtran por `empresa_id`:
con miles de empleados × 12 períodos × varios tipos, eso es un scan
filtrado en cada carga de grilla. Mismo problema en `comunicaciones`,
`comunicacion_mensajes` (agravado porque tiene Realtime),
`documentos_firma` y `documento_firma_destinatarios`.

**Arreglo:** índices compuestos `(empresa_id, periodo)` y
`(empresa_id, empleado_id)` según el patrón de acceso de cada una. Es
barato y no rompe nada. **Prioridad: 4.**

### I4 — No hay observabilidad del lado del servidor

No hay Sentry ni logging estructurado en ninguna ruta de API. Los únicos
logs son `console.error` en `resend.ts`, que en Vercel van a logs
efímeros sin alertas. `registrarErrorApp` sólo corre en el cliente y se
traga sus propios fallos.

Consecuencia directa: **si un cron de facturación falla en producción,
nadie se entera.** Y `cron/facturacion/route.ts:111` incrementa
`notificados += 1` sin verificar el `error` del insert — el contador puede
reportar éxito sobre algo que no se guardó.

**Arreglo:** Sentry (o equivalente) en las rutas de API, y chequear el
error de ese insert. **Prioridad: 3.**

### I5 — `ON DELETE CASCADE` desde `empresas` sin ninguna protección

Todo cuelga de `empresas` con `cascade`: empleados, fichajes, recibos
firmados, remuneraciones, documentos. La app no expone borrado de
empresas (usa baja lógica), pero la cascada está viva a nivel de base: un
`DELETE` desde el SQL Editor de Supabase borra irrecuperablemente el
historial salarial y los recibos firmados de un cliente entero — que son
justamente la prueba legal que la migración 26 se esforzó en preservar.

**Arreglo:** pasar a `RESTRICT` en las tablas con valor legal, o un
trigger `BEFORE DELETE` que exija una marca explícita de purga.
**Prioridad: 4.**

### I6 — Sin rate limit en envío de emails ni invitaciones

`limiteDeUso.ts` es un `Map` en memoria por proceso —el propio comentario
lo admite— y sólo cubre los dos endpoints de Gemini. `/api/avisos`
(Resend) y `/api/invitaciones` no tienen ninguno. Combinado con I1, un
empleado puede generar volumen de envíos con costo económico y riesgo de
que el dominio caiga en listas de spam.

**Arreglo:** rate limit con estado compartido (Upstash Redis) en los
endpoints con costo. **Prioridad: 4.**

### I7 — La sesión y la empresa activa no se sincronizan entre pestañas

No hay listener de `storage` ni `BroadcastChannel` en toda la app. Dos
consecuencias:

- `logout()` en una pestaña deja a las demás operando con la sesión en
  memoria.
- Para un superadmin que "visita" empresas (`entrarAEmpresa`), dos
  pestañas pueden estar sobre empresas distintas sin avisar. Como
  `empresaOperativaId()` se resuelve fuera de React, **una acción puede
  escribir sobre la empresa equivocada**.

**Arreglo:** listener de `storage` en `AuthProvider` que propague logout y
cambio de empresa. **Prioridad: 4.**

### I8 — `vacacionesDiasHabiles` mezcla unidades

Si la empresa activa esa opción, los días **consumidos** se cuentan en
hábiles (`fechas.ts:46`) pero los que **corresponden**
(`vacaciones.ts:6`) y el **valor del día** (`liquidacionFinal.ts:53`,
bruto ÷ 25) siguen en corridos. Se restan magnitudes distintas: al
empleado le queda más saldo del que realmente tiene, y en la liquidación
final se le pagan de más días no gozados.

Por defecto la opción está en `false` (corridos, que es lo correcto por
LCT), así que sólo afecta a quien la haya activado.

**Arreglo:** decidir una única unidad y convertir en los bordes.
**Prioridad: 4.**

### I9 — Operaciones de varios pasos sin atomicidad

`crearDocumentoFirma` (`real.ts:3449`) inserta el documento y luego los
destinatarios en una llamada aparte, sin rollback: si la segunda falla
queda un documento sin destinatarios. La carga masiva de recibos y
`asignarTurnos` insertan fila por fila desde el cliente; un fallo a mitad
deja el conjunto parcialmente aplicado sin forma de saber qué entró.

El caso de rectificación de recibos ya tiene compensación manual, pero es
una saga frágil.

**Arreglo:** funciones `plpgsql` (RPC) que envuelvan cada operación
compuesta en una transacción real. **Prioridad: 5.**

### I10 — Faltan constraints de integridad en montos y enums

- `remuneraciones.monto_bruto`, `monto_neto`, `aportes` y
  `otros_descuentos` **no tienen `CHECK (>= 0)`** — a diferencia de
  `adelantos.monto` y `descuentos_recurrentes.monto`, que sí lo tienen. Un
  bug de UI o una carga masiva mal parseada graba un sueldo negativo.
- `periodo` es `text` libre en seis tablas sin `CHECK` de formato
  `YYYY-MM`; `modo_fichaje` documenta sus valores válidos en un comentario
  pero no los fuerza.
- `notas_internas.autor_id` y `ausencias.resuelta_por` no declaran
  `ON DELETE`, lo que puede **bloquear el borrado de un usuario del staff**
  (inconsistente con `documentos_firma.creado_por`, que sí usa `SET NULL`).

**Prioridad: 5.**

### I11 — Vulnerabilidades en dependencias

`npm audit --omit=dev`: 6 vulnerabilidades (4 high, 2 moderate).

- **`next` 14.2.35** — una docena de advisories, varios de DoS y cache
  poisoning. Buena parte aplica sobre todo a self-hosted; en Vercel el
  riesgo baja pero no desaparece.
- **`postcss`** (transitiva vía Next) — XSS y lectura arbitraria de
  archivos vía `sourceMappingURL`.
- **`pdfjs-dist`** y **`uuid`** (vía `exceljs`) — el fix de `uuid` implica
  bajar `exceljs` a 3.4, que es breaking.
- **`brace-expansion`** — DoS, con fix no-breaking disponible.

**Arreglo:** `npm audit fix` para lo no-breaking; planificar el salto de
Next aparte, con su propio ciclo de prueba. **Prioridad: 4.**

### I12 — Los descriptores biométricos de toda la empresa viajan a la tablet

`getDescriptoresFaciales` (`real.ts:1728`) trae **todos** los vectores
faciales de la empresa al navegador de la tablet de planta para el
matching 1:N. Son datos biométricos de todo el personal cargados en un
dispositivo físico compartido, en `jsonb` plano.

**Arreglo:** mover el matching 1:N al servidor (se resuelve junto con C1).
**Prioridad: 3** — sale casi gratis si se hace C1.

---

## 3. Problemas menores

| # | Qué pasa | Dónde |
|---|---|---|
| M1 | `useCarga` con `activo: false` no invalida el fetch en vuelo: la rama temprana no incrementa `generacion.current`, así que una respuesta vieja puede escribir sobre el estado pausado | `src/lib/useCarga.ts:111-115` |
| M2 | `Sidebar` y `BottomNav` duplican la carga de pendientes y están desincronizados: BottomNav hace polling cada 60 s, Sidebar pide una sola vez al montar | `Sidebar.tsx:46`, `BottomNav.tsx:34` |
| M3 | `req.json()` sin `try/catch` en tres endpoints: un body inválido da 500 en vez de 400 | `invitaciones:80`, `avisos:71`, `equipo-iseo:42` |
| M4 | Antigüedad de vacaciones usa `<` estricto; en el límite exacto (5/10/20 años) da la categoría superior. Beneficia al empleado y casi nunca se dispara por los bisiestos | `vacaciones.ts:22` |
| M5 | Redondeos encadenados en la liquidación final (se redondea sobre valores ya redondeados). Diferencia máxima de $1, pero es criterio distinto al de `fichadas.ts` | `liquidacionFinal.ts:133` |
| M6 | Una jornada sin cerrar cuenta como `diaTrabajado: 0` en la planilla que va al contador — un olvido de fichar la salida se lee como "no trabajó" | `fichadas.ts:386` |
| M7 | `modalidadPago` (jornal/semanal/quincenal) se carga y se guarda pero ninguna fórmula lo consulta: todos se liquidan como mensualizados | `types/rrhh.ts:218` |
| M8 | Fechas inválidas en la liquidación devuelven 0 en silencio: se ve "total $0" en vez de un error | `liquidacionFinal.ts:29,66` |
| M9 | El buscador global no tiene `aria-label`, sólo `placeholder` (no cuenta como nombre accesible) | `BuscadorGlobal.tsx:144` |
| M10 | `.env.example` no documenta `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `DIA_VENCIMIENTO_FACTURACION` ni `DIAS_AVISO_PREVIO` — un deploy nuevo arranca incompleto | `.env.example` |
| M11 | `ARCHITECTURE.md` y `STATUS.md` describen una landing page de 7 componentes con `src/pages/`. La app real tiene 224 archivos, App Router y 47 migraciones. Cualquiera que entre por ahí se desorienta | raíz del repo |
| M12 | Lógica de autenticación reimplementada a mano en 4 rutas en vez de usar `usuarioDesdeToken`, que ya existe y usan otras dos | `src/lib/api/autenticar.ts` |

---

## 4. Mejoras recomendadas

- **Validación con Zod en las rutas de API.** Hoy es manual y artesanal
  (type-guards, regex). Funciona, pero cada campo nuevo depende de que
  alguien se acuerde. Ningún endpoint valida que los UUID sean UUID: un
  valor mal formado llega a Postgres y vuelve como error crudo 22P02.
- **`maxDuration` en los crons.** No está declarado en ninguna ruta, así
  que corren con el default de Vercel. Los dos crons recorren empresas en
  loop secuencial: con suficientes clientes, timeout.
- **Retención de datos.** `auditoria_acciones` y `errores_app` crecen sin
  límite y sin política de purga.
- **Idempotencia en invitaciones.** No hay clave de idempotencia; el doble
  submit depende del `disabled` de la UI.
- **Índice GIN** en `ausencias.adjuntos` si el operador `?` de la policy de
  storage empieza a pesar.

---

## 5. Refactorizaciones sugeridas

**No hacer ninguna antes de los críticos.** Van en orden de retorno:

1. **Partir `recibos/page.tsx` (905 líneas).** Es el god component más
   claro: 4 fetches, reglas de negocio y el JSX de tres vistas en un solo
   archivo. Extraer las derivaciones de listas
   (`borradores`/`publicados`/`pendientes`/`faltantes`/`historial`) a
   funciones puras en `src/lib/` las vuelve testeables sin React — y son
   justamente el tipo de lógica donde aparecieron C4 y C5.
2. **Memoizar esas derivaciones.** Hoy se recalculan en cada render.
   `versionesPrevias(r)` filtra todo el array de archivados **por cada
   fila**: O(N·M) sin memo. Con volúmenes de pyme no se nota, pero crece
   en silencio.
3. **`colaboradores/[id]/page.tsx` (852 líneas)** orquesta 8 `useCarga`.
   Está mejor descompuesto, pero es mucho para revisar de una sentada.
4. **Un `ModalIseo` compartido.** 22 componentes importan `Modal` de
   Mantine repitiendo las mismas props de estilo a mano. Los inputs sí
   tienen su capa (`Campo`, `Selector`, `Boton`); los modales no.
5. **`useModulos` hacia Zustand.** Hoy es un pub-sub casero con `Map` a
   nivel de módulo, en paralelo al store que ya existe. Dos mecanismos de
   estado global para aprender en vez de uno.
6. **El triple mantenimiento de la capa de servicios.** `real.ts` (134
   exports, 3.722 líneas), `rrhh.demo.ts` (136 exports) y el facade
   `rrhh.ts` (137). Cada función nueva se escribe tres veces. El facade en
   sí está bien diseñado y el genérico `elegir` fuerza compatibilidad de
   tipos — el costo es de volumen, no de diseño. Vale evaluar si el modo
   demo necesita cubrir las 136 operaciones o alcanza con las de las
   pantallas que se muestran.

---

## 6. Riesgos futuros de escalabilidad

| Riesgo | Cuándo aparece | Qué hacer |
|---|---|---|
| Scans por falta de índice `empresa_id` en `recibos`/`remuneraciones`/`comunicaciones` | Ya, con cientos de empleados por empresa | I3 — barato, hacerlo pronto |
| `fichajes` sin particionar | ~2-4 M filas/año con miles de empleados. Los índices de la migración 47 aguantan bastante | Particionado por rango de fecha cuando se acerque a decenas de millones |
| Crons con loop secuencial y sin paginación | Cientos de empresas activas | `Promise.allSettled` con concurrencia acotada + `maxDuration` |
| Rate limit en memoria | Ya no funciona en serverless multi-instancia | Upstash Redis |
| Matching 1:N en el cliente | Miles de empleados por terminal: la tablet descarga y compara todos los vectores en cada fichaje | Se resuelve con C1 |
| Bundles pesados | `/app/fichaje` 514 kB, `/app/ausencias` 506 kB, `/app/colaboradores` 498 kB de First Load JS | `dynamic()` para face-api, pdf.js y d3-org-chart |
| Sin retención en auditoría y errores | Crecimiento lineal sin techo | Política de purga |

---

## 7. Riesgos de mantenimiento

- **La documentación de la raíz miente** (M11). `ARCHITECTURE.md` y
  `STATUS.md` describen un producto que ya no existe. En cambio,
  `docs/errores.md`, `docs/GUIA-OPERATIVA.md` y las revisiones anteriores
  son excelentes y están al día. Conviene borrar o reescribir las dos
  primeras: documentación desactualizada es peor que ninguna.
- **Dos implementaciones de la regla de jornadas** (TS y SQL) cuya paridad
  depende de correr un script a mano.
- **Dos definiciones de "horario esperado"** — es C5, y es la prueba de
  que este patrón ya causó un bug real.
- **Sin `schema.sql` consolidado**: el estado de la base es la suma de 47
  migraciones. Para entender una tabla hay que leerlas todas en orden.
- **God components** de 700–900 líneas donde conviven fetching, negocio y
  presentación.

---

## 8. Riesgos de seguridad

**Lo que está bien** (vale decirlo, porque es mucho): CSP, HSTS,
`X-Frame-Options`, `Permissions-Policy` verificados en runtime; ningún
secreto con prefijo `NEXT_PUBLIC_`; `SUPABASE_SECRET_KEY` protegida con
`server-only`; los crons fallan cerrado si falta `CRON_SECRET`; RLS
habilitada en todas las tablas de negocio; el trigger
`prevenir_escalada_rol_usuario` bloquea la autoasignación de `superadmin`;
el único `dangerouslySetInnerHTML` es JSON-LD estático; `.env` no está
trackeado. El incidente histórico de escalación de privilegios en
`/api/invitaciones` está bien resuelto y no encontré ningún caso nuevo del
mismo patrón.

**Lo que queda:**

| Riesgo | Ref |
|---|---|
| Fichaje y geocerca confiables-por-el-cliente | C1 |
| Sin liveness: spoofing con foto impresa | C1 |
| Consentimiento biométrico ficticio (Ley 25.326) | C2 |
| Biometría que sobrevive a la baja (derecho ARCO) | C3 |
| `/api/avisos` sin chequeo de rol | I1 |
| Adelantos visibles para supervisores | I2 |
| Sin rate limit en emails e invitaciones | I6 |
| Sesión no invalidada entre pestañas | I7 |
| 6 vulnerabilidades en dependencias | I11 |
| Biometría de toda la empresa en la tablet | I12 |
| Sin observabilidad: un ataque no se detecta | I4 |

Para un pase más profundo del lado seguridad, vale correr
`/security-review` aparte.

---

## 9. Riesgos de performance

Ninguno bloquea la salida a producción; todos crecen con el volumen.

1. **Queries sin índice** (I3) — el de mayor impacto real y el más barato
   de arreglar.
2. **Derivaciones sin memoizar** en `recibos/page.tsx`, con el O(N·M) de
   `versionesPrevias` por fila.
3. **Bundles de 500 kB** en las tres pantallas más usadas, por face-api,
   pdf.js y d3-org-chart cargados de entrada.
4. **Polling de 60 s** en `BottomNav` para el badge de pendientes, cuando
   el proyecto ya usa Supabase Realtime en Comunicaciones.
5. **Crons secuenciales** sin `maxDuration`.
6. **Matching facial 1:N en el cliente** descargando todos los vectores.

---

## Cómo verificar lo que falta

Lo de abajo **no está probado**. En orden de riesgo.

### 1. Las migraciones — ✅ hecho

Aplicadas y ejercitadas contra el Postgres local el 2026-08-07 (ver C1).
Para repetirlo:

```bash
supabase start && supabase db reset
```

### 2. El fichaje facial de punta a punta

Con la app corriendo y una cámara:

1. Enrolar un rostro desde la ficha → tiene que **fallar** si no se tilda
   el consentimiento.
2. Fichar desde el celular (modo verificar) → pedir parpadeo → registrar.
3. Fichar desde la tablet (modo identificar, 1:N).
4. Poner una **foto en la pantalla del celular** frente a la cámara → el
   liveness la tiene que rechazar.
5. Mirar en la red que ya **no** se descarguen los descriptores de la
   empresa al abrir el kiosco.
6. Dar de baja a alguien enrolado → verificar en la base que
   `descriptor_facial` quedó en `null`.

### 3. Horas extra y turnos (C5)

1. Asignar un turno noche (22:00–06:00), fichar dentro de él y confirmar
   que en Reportes **no** aparece llegada tarde.
2. Aprobar las extras de un día en Turnos → abrir el modal de
   remuneración → tiene que ofrecer sumarlas.
3. Sin aprobar ninguna → el modal muestra las detectadas y dice que no
   hay aprobadas, sin botón.

### 4. Liquidación final (C4)

Dar de baja con una **fecha del año pasado** a alguien que se tomó
vacaciones ese año, y confirmar que el borrador las descuenta.

---

## Plan de ataque sugerido

No arreglar nada hasta acordar el orden. Mi recomendación:

**Antes de producción (bloqueantes)**

1. **C4** — vacaciones del año de la baja. Es una línea y es dinero.
2. **C6** — arreglar el mock de `framer-motion`, poner los tests en verde
   y montar CI. Habilita verificar todo lo demás.
3. **C5** — horas extra por turno, con tests de regresión primero.
4. **C2 + C3** — consentimiento biométrico real y borrado en la baja.
   Van juntos, es el mismo módulo y el mismo riesgo legal.
5. **C1** — validación server-side del fichaje. El más grande de los
   cinco; si no llega para el corte, la alternativa es **desactivar el
   fichaje facial** hasta tenerlo y dejar sólo el manual.

**Primera semana después**

I1, I2, I4, I12 (seguridad y privacidad, todos acotados).

**Primer mes**

I3, I5, I6, I7, I11 (índices, cascadas, rate limit, pestañas,
dependencias).

**Cuando haya aire**

Los menores, las refactorizaciones y el resto.

---

*Auditoría realizada el 2026-08-07 sobre `main` en el commit `91ac6c1`.*
