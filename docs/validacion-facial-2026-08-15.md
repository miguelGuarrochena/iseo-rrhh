# Validación para producción del módulo facial — 2026-08-15

**Continúa** `docs/rediseno-facial-2026-08-14.md`, que cerró la arquitectura.
Acá se cierra la **validación**: compatibilidad de dispositivos, calibración,
re-enrolamiento y pruebas de falso positivo.

La arquitectura no se tocó: MediaPipe FaceLandmarker para percepción, dlib
ResNet-34 para identidad, alineamiento canónico, Worker, 3-5 inferencias por
fichada, WASM local. No se evaluó ningún modelo alternativo.

---

## 1. CAMBIOS REALIZADOS

### 1.1 Diagnóstico de dispositivo (`lib/facial/diagnostico.ts`)

La sonda ahora informa todo lo que hace falta para homologar una tablet nueva:

| Dato | Cómo se obtiene |
|---|---|
| Fabricante | Prefijo del modelo (`SM-`, `TB-`…) o user agent |
| Modelo | `userAgentData.getHighEntropyValues(['model'])`, con respaldo en el UA |
| Versión de Android | `platformVersion`, con respaldo en el UA |
| Navegador y versión | Detección propia, **en orden**: Samsung Internet y Edge se prueban antes que Chrome porque los dos incluyen `Chrome/` en su UA |
| WebView embebido | Marca `; wv)` del UA |
| Arquitectura de CPU | `architecture`+`bitness`; en Android se deduce `arm64` / `arm-32` del UA |
| Memoria | `deviceMemory` (GB) y `performance.memory` (heap JS) |
| WebGL | Versión efectiva **y cadena del driver** (`WEBGL_debug_renderer_info`) — es lo único que distingue un Mali-G52 de un Adreno |
| WebGPU | Se pide el adaptador de verdad, no se mira si existe `navigator.gpu` |
| WASM / SIMD | Validación de un módulo v128 mínimo |
| `requestVideoFrameCallback`, `OffscreenCanvas`, `Worker`, `getUserMedia` | Presencia real |

### 1.2 Latencias por etapa y estabilidad (`lib/facial/motor.ts`)

Nuevo en el diagnóstico que emite el motor:

- `msPercepcion` — MediaPipe.
- `msAlineamiento` — recorte canónico + estadísticas de imagen.
- `msDescriptor` — dlib (ya estaba, vía el ejecutor).
- **`msReconocimiento`** — del primer cuadro del intento a la plantilla
  entregada. Es lo que siente la persona, y ninguna latencia por etapa lo
  reemplaza: incluye los cuadros descartados mientras se acomoda y la espera
  del desafío de pose.
- **`fpsCamara`** — medido en el callback de vídeo, **antes** del throttling,
  y separado del FPS del bucle. Sin separarlos, una cámara que entrega 7
  cuadros por segundo se confunde con un procesamiento lento y se termina
  optimizando lo que no era.
- **`incidencias[]`** — delegado caído a CPU, Worker que no arrancó, backend
  degradado, falta de rVFC. Antes esto quedaba enterrado en el estado de cada
  módulo y no lo veía nadie al homologar.
- **`estabilidad`** — compara la mediana de percepción de los primeros 30 s
  contra la de los últimos 30 s, más heap JS inicial vs. actual y cuadros
  perdidos. Es lo que detecta el throttling térmico, que aparece a los veinte
  o treinta minutos y no se va.

### 1.3 Homologación en tres niveles

`clasificarDispositivo()` devuelve `incompatible` / `funcional` / `rendimiento`.
**Nunca devuelve `homologado`**, y hay un test que lo fija: homologar exige la
calibración con personas reales y una jornada de kiosco, y ningún script puede
certificar ninguna de las dos. Si la función pudiera devolver ese nivel, alguien
lo tomaría como suficiente.

Los topes (`TOPES`) **no son requisitos de hardware**: son los tiempos que el
pipeline necesita para que una fila avance. Qué dispositivos los cumplen es
justamente lo que hay que medir. Por eso en el código no hay ninguna afirmación
del tipo "Android 10 y 4 GB".

### 1.4 Calibración (`lib/facial/banco.ts`)

- `umbralConservador()` — el umbral se pone **por debajo de la impostora más
  cercana observada**, con margen de 0,05. No en el EER: el EER supone que un
  falso positivo y un falso negativo cuestan lo mismo, y en este producto no.
- `cotaSuperiorFar()` — regla de tres. Con `n` pares impostores y cero fallos,
  lo máximo que se puede afirmar es FAR < `3/n`. **No** que sea cero.
- `personasNecesarias()` — cuántas personas hacen falta para poder *demostrar*
  un FAR dado.
- El protocolo de la página pasó a las cinco condiciones pedidas y ahora
  **muestra qué falta**: por persona y en total.

### 1.5 Versionado de plantillas

- **Migración `20260815000077_version_de_plantilla_facial.sql`** (justificada
  en §5).
- `VERSION_PLANTILLA = 2` en `lib/facial/plantilla.ts`, fuente única del lado
  del cliente, con la regla escrita de cuándo hay que subirla.
- `plantillaVigente()` y `necesitaReenrolar()` en `lib/facial/enrolado.ts`:
  "estar enrolado" y "poder fichar" dejaron de ser la misma pregunta.
- La ficha del empleado muestra **tres** estados, no dos, y el listado de
  requisitos gana `facial_plantilla_vieja` con severidad **bloquea** — porque
  esa persona no puede fichar, no es una mejora pendiente.

### 1.6 Archivos

| Archivo | Cambio |
|---|---|
| `lib/facial/diagnostico.ts` | Sonda ampliada + clasificación de homologación |
| `lib/facial/motor.ts` | Latencias por etapa, FPS de cámara, incidencias, estabilidad |
| `lib/facial/banco.ts` | Umbral conservador, cota de FAR, personas necesarias |
| `lib/facial/plantilla.ts` | `VERSION_PLANTILLA` |
| `lib/facial/enrolado.ts` | `plantillaVigente`, `necesitaReenrolar` |
| `lib/requisitos.ts` | Requisito `facial_plantilla_vieja` |
| `app/app/diagnostico-facial/page.tsx` | Paneles de homologación, estabilidad, incidencias, cobertura del protocolo y umbral recomendado |
| `components/app/facial/EnrolamientoFacial.tsx` | Tercer estado "hay que volver a tomar" |
| `services/supabase/real.ts`, `mapeos.ts`, `types/rrhh.ts` | Versión al enrolar y al fichar |
| `supabase/migrations/…000077…` | Columna, filtro de versión, retiro de plantillas |
| `supabase/tests/version_plantilla_facial.test.sql` | Nuevo |
| 6 fixtures SQL existentes | `descriptor_version` (lo exige el nuevo CHECK) |

---

## 2. TESTS EJECUTADOS

### 2.1 JavaScript / TypeScript

```
npx tsc --noEmit     → limpio
npx next lint        → sin warnings ni errores
npx jest --ci        → 48 suites / 606 tests PASS
npm run build        → compila
```

De 526 a **606 tests**. Los 80 nuevos:

| Suite | Tests | Qué fija |
|---|---|---|
| `diagnosticoFacial.test.ts` | 24 | Samsung Internet ≠ Chrome; WebView detectado; `clasificarDispositivo` nunca otorga `homologado`; sin medir no asciende |
| `falsoPositivoFacial.test.ts` | 34 | La batería completa de §6 |
| `bancoFacial.test.ts` | +15 | Umbral conservador, regla de tres, solape de distribuciones |
| `enroladoFacial.test.ts` | +7 | Vigencia de plantilla y re-enrolamiento |

### 2.2 SQL (contra Supabase local, migración aplicada)

| Test | Resultado |
|---|---|
| `version_plantilla_facial` (nuevo) | ✅ 7 bloques |
| `terminal_vinculada` (F-01) | ✅ |
| `rpc` | ✅ |
| `metodo_y_anulacion` (F-07, F-12) | ✅ |
| `rls_migration66_68` (F-02) | ✅ |
| `redteam_probe`, `redteam_fresh_probe`, `redteam_systematic_probe` | ✅ |
| `independent_final_probe` | ✅ |
| `rls_migration60` … `rls_migration70`, `rls_ausencias_*`, `rls_estados_solicitud` | ✅ |

**Tres fallan, y son previas y ajenas al módulo facial.** Lo verifiqué quitando
mi restricción CHECK y volviendo a correrlas: fallan igual.

| Test | Error | Módulo |
|---|---|---|
| `prod_baseline_verify` | `permission denied for table documento_firma_destinatarios` | Firma de documentos |
| `rls_firma_recibos` | `permission denied for table ausencias` | Ausencias |
| `rls_cupos_licencia` | `duplicate key … empresas_pkey` | Estado residual en la base local |

No las toqué: están fuera del alcance de esta fase.

---

## 3. DIAGNÓSTICO DE COMPATIBILIDAD ANDROID

### 3.1 Los tres niveles, que no son lo mismo

| Nivel | Qué significa | Quién lo otorga |
|---|---|---|
| **Compatible funcional** | El pipeline arranca y produce descriptores | El diagnóstico, solo |
| **Rendimiento aceptable** | Además cumple los tiempos para que una fila avance | El diagnóstico, solo |
| **Homologado** | Además se calibró con personas y aguantó una jornada | **Una persona**, tras las pruebas |

### 3.2 Qué bloquea (incompatible)

Sin contexto seguro (https), sin `getUserMedia`, sin WebAssembly, o **sin
WebGL**. Sin WebGL el descriptor caería a CPU pura, del orden de segundos por
inferencia: técnicamente anda, operativamente no sirve.

### 3.3 Qué degrada pero no impide

Sólo WebGL 1 · sin WASM SIMD · sin `OffscreenCanvas`/`Worker` (el descriptor
pasa al hilo principal y la pantalla se congela durante la inferencia) · sin
`requestVideoFrameCallback` (más batería y temperatura) · WebView embebido ·
motor de 32 bits · menos de 3 GB de RAM.

### 3.4 Topes de rendimiento y de dónde salen

| Métrica | Tope | Razón |
|---|---|---|
| Percepción | ≤ 25 ms | A 15 fps el presupuesto por cuadro es 66 ms; 25 deja margen para la puerta y el repintado |
| Descriptor | ≤ 120 ms | Con 3 muestras separadas 220 ms, mantiene el reconocimiento por debajo del segundo |
| FPS del bucle | ≥ 8 | Por debajo, la confirmación de 3 cuadros tarda más de lo que la gente tolera |
| Ancho de cámara | ≥ 640 px | Con menos, una cara a un metro no llega al mínimo de distancia interocular |

### 3.5 Cómo homologar una tablet nueva

1. Abrir `/app/diagnostico-facial` **en la tablet** (superadmin, ruta no
   enlazada).
2. Leer el panel **Homologación**. Si dice *No compatible*, terminó: los
   bloqueos están listados.
3. Verificar que **Pipeline** diga `GPU` y `webgl`, y que **Incidencias** esté
   vacío. Si el delegado es CPU o el Worker no arrancó, ése es el problema de
   esa tablet y ya está identificado por nombre.
4. Dejar la pantalla abierta **≥ 10 minutos** con alguien delante cada tanto y
   mirar **Estabilidad**: degradación por encima del 30 % es throttling
   térmico, y esa tablet no aguanta un turno.
5. Copiar el informe y pegarlo en la tabla de homologación.

### 3.6 Tabla de homologación

**Vacía a propósito.** Se llena con mediciones, no con suposiciones.

| Fabricante | Modelo | Android | Navegador | GPU | Percepción | Descriptor | FPS | Degradación | Nivel |
|---|---|---|---|---|---|---|---|---|---|
| _(pendiente)_ | | | | | | | | | |

**Las dos Samsung siguen sin medirse.** El instrumento está listo y probado;
las tablets no pasaron por él.

---

## 4. METODOLOGÍA DE CALIBRACIÓN

### 4.1 Protocolo

**≥ 10 personas × 5 condiciones obligatorias**: frontal, giro izquierda, giro
derecha, variación vertical, otra distancia. La página marca qué falta por
persona y no da la calibración por válida hasta completarlo.

Las cinco cubren lo que un empleado real produce sin proponérselo. Si sólo se
midiera de frente y con buena luz, la distribución genuina saldría
artificialmente compacta, el umbral quedaría más exigente que lo que la
realidad tolera, y el sistema rebotaría gente legítima todo el día.

### 4.2 Cómo se elige el umbral

Se calculan todas las distancias par a par: mismo sujeto → **genuinas**;
sujetos distintos → **impostoras**. Y entonces:

```
umbral = min(distancias impostoras) − 0,05
```

**No el EER.** El EER es el punto donde falso positivo y falso negativo se
igualan, que es lo correcto cuando cuestan lo mismo. Acá no:

> Un falso rechazo cuesta que el empleado vuelva a mirar la cámara: cinco
> segundos, y se nota. Un falso positivo mete la marca de otra persona en un
> registro horario que puede terminar en una inspección, y **no se entera
> nadie** — no hay síntoma, no hay error, no falla nada.

El margen de 0,05 existe porque la impostora mínima **observada** es una
muestra, no el mínimo verdadero: la próxima persona que se enrole puede
parecerse más a alguien que cualquiera de las medidas. Pegar el umbral a ese
valor sería calibrar contra el ruido del conjunto de prueba.

El FRR resultante es una **consecuencia**, no un objetivo, y se informa para
que sea una decisión consciente. Si sale alto, el arreglo es mejorar el
enrolamiento, no aflojar el umbral.

### 4.3 Cuánto se puede afirmar — y esto limita el objetivo pedido

Con cero falsas aceptaciones observadas, la regla de tres da la cota al 95 %:

| Personas × 5 cond. | Muestras | Pares impostores | Cota superior del FAR |
|---|---|---|---|
| 10 | 50 | 1 125 | **0,267 %** |
| 16 | 80 | 2 960 | 0,101 % |
| 20 | 100 | 4 750 | 0,063 % |
| 30 | 150 | 10 875 | 0,028 % |
| **50** | 250 | 30 625 | **0,0098 %** |

> **El objetivo de FAR ≤ 0,01 % que fijó el informe anterior NO se puede
> demostrar con 10 personas.** Aunque ningún impostor entre, la muestra no
> alcanza para verlo: lo honesto sería decir *"FAR por debajo de 0,27 %"*.
> Para demostrar 0,01 % hacen falta **50 personas**; para 0,1 %, **16**.

Esto no es un defecto del pipeline: es cuánta evidencia da una muestra de ese
tamaño. Hay tres salidas y son decisión de negocio:

1. Calibrar con 10 personas y **declarar FAR < 0,27 %** para 1:N.
2. Ampliar a ~16 personas y declarar FAR < 0,1 %.
3. Ampliar a ~50 personas y recién ahí declarar FAR < 0,01 %.

La página calcula y muestra la cota sola, con la cantidad de pares que haya.

### 4.4 Dónde vive el umbral

Los umbrales de producción están en `fichar_con_rostro` (SQL) — un umbral que
viva en el cliente es un umbral que el cliente puede cambiar. `plantilla.ts` los
espeja **documentados** para que la herramienta muestre el punto de operación
vigente al lado de lo medido, con el procedimiento de calibración escrito al
lado. Al actualizarlos hay que cambiar los dos, con la fecha y el N de la
medición que los justificó.

**Todavía no se movieron**: siguen en 0,6 (1:1) y 0,5 (1:N), que son los de
face-api y corresponden a la distribución del pipeline **viejo**.

---

## 5. ESTRATEGIA DE RE-ENROLAMIENTO

### 5.1 Por qué hizo falta tocar SQL

El pedido decía no migrar sin necesidad. La hay, y es esta: **el match ocurre
dentro de `fichar_con_rostro`**, que es `SECURITY DEFINER` justamente para que
los descriptores no salgan de la base. Un marcador de versión que viva sólo en
el cliente no puede impedir que el servidor compare dos plantillas
incompatibles. La única forma de que sea *imposible* es que el filtro esté en la
consulta que elige contra quién comparar.

La migración es mínima: una columna, un CHECK, una columna más en la vista de
lectura, el filtro en el RPC y una función de retiro. **No toca F-01, terminal
vinculada, RLS, actor, auditoría ni F-02**, y los tests SQL de todas ellas
siguen pasando.

### 5.2 Cómo funciona

- `empleados.descriptor_version` — 1 = pipeline viejo, 2 = actual. Las filas
  existentes con rostro quedaron en 1 con un `UPDATE` explícito, no en NULL: un
  NULL no distingue "viene del pipeline viejo" de "nadie la llenó todavía".
- CHECK: descriptor y versión van juntos o no van. Un descriptor sin versión es
  un descriptor que después nadie sabe con qué comparar.
- El RPC filtra `coalesce(descriptor_version, 1) = p_version` **en el WHERE**,
  no en un chequeo posterior: si comparara primero, la plantilla incompatible ya
  podría haber ganado el `order by dist`.
- `p_version` **por defecto 1**, no 2. Es deliberado: durante el despliegue
  puede quedar una pestaña con el JavaScript viejo en cache; con el default en 1
  esa pestaña conserva su comportamiento de siempre en vez de caer sobre las
  plantillas nuevas.

### 5.3 Los cuatro pasos

**1 · Desplegar.** Nadie pierde nada: los enrolados quedan en versión 1 y las
terminales actualizadas mandan versión 2, así que no encuentran match. En
`/app/fichaje` cada persona sin re-enrolar aparece en el listado de requisitos
como **bloqueante**, con el texto y el enlace a su ficha.

> ⚠ Entre el despliegue y el final del re-enrolamiento, **quien no se haya
> re-enrolado no puede fichar con la cara**. No es un efecto colateral: es la
> alternativa correcta a compararlo contra una plantilla incompatible. Hay que
> avisarlo antes y tener el fichaje manual a mano.

**2 · Re-enrolar.** Desde la ficha, botón "Volver a tomar" (aparece destacado
cuando corresponde). Son 5 muestras con control de dispersión: si las tomas no
coinciden entre sí, se rechaza y se pide de nuevo.

**3 · Verificar.** El listado de requisitos se vacía solo. El panel de
Calibración de `/app/diagnostico-facial` permite confirmar que las distancias
genuinas con las plantillas nuevas están donde se espera.

**4 · Retirar.** Recién cuando no quede nadie en versión 1:

```sql
select retirar_plantillas_faciales(1::smallint, 2::smallint);
```

Sólo RRHH de la empresa, nunca borra la versión vigente, y devuelve cuántas
borró. **No se ejecuta automáticamente**: una plantilla borrada sólo se
recupera volviendo a enrolar a la persona.

**Nada se borra solo en ningún momento.**

---

## 6. PRUEBAS DE FALSO POSITIVO

`src/tests/falsoPositivoFacial.test.ts`, 34 casos.

| Escenario | Comportamiento fijado |
|---|---|
| A ficha como A | Acepta: distancia muy por debajo del umbral |
| **B ficha como A** | **Rechaza**: distancia muy por encima |
| Dos candidatos parecidos | **Rechaza** si el segundo está a menos de 0,05 |
| Varias personas frente a cámara | **No elige ninguna**. `numFaces: 2` existe para poder *ver* que hay una segunda; con `numFaces: 1` el modelo devolvería la más prominente y no habría forma de saberlo |
| Ausencia de rostro | No avanza, nunca produce descriptor |
| Cara parcialmente fuera del frame | Rechaza (`entraEnCuadro`) |
| Mala iluminación / contraluz / imagen plana / desenfoque | Rechaza, con el motivo correcto cada una |
| Demasiado lejos / demasiado cerca | Rechaza |
| Cara girada / inclinada / mirando abajo | Rechaza |
| Movimiento | Rechaza |
| Ojos cerrados | Rechaza |
| Cuadro apenas aceptable | Pasa la puerta pero **no entra a la plantilla**: falta puntaje |
| Plantilla de otra versión | No se compara |

### 6.1 Anti-spoofing: lo que hay y lo que NO

> **No hay anti-spoofing por textura. No se afirma que lo haya.**

| Ataque | Qué lo corta | ¿Corta? |
|---|---|---|
| Foto impresa | Parpadeo | ✅ |
| Foto en pantalla de otro teléfono | Parpadeo | ✅ |
| Foto con ojos cerrados | Ciclo abierto→cerrado→abierto | ✅ |
| Foto de perfil | El desafío exige empezar de frente | ✅ |
| **Vídeo pregrabado de frente** | Parpadeo — **el vídeo parpadea** | ❌ |
| Vídeo con un solo giro grabado | Desafío de lado sorteado | ✅ |
| **Vídeo con los dos giros grabados** | Nada | ❌ |
| **Máscara, deepfake en vivo** | Nada | ❌ |

Hay un test que afirma explícitamente la limitación: *"un vídeo de frente que
parpadea SÍ pasa el nivel de parpadeo"*. Está para que nadie lea la suite y
concluya que el sistema resiste un vídeo. Por eso el kiosco —donde vive ese
ataque— usa `parpadeo_y_desafio` y no sólo parpadeo.

Cerrar las filas en rojo requiere MiniFASNet (Apache 2.0, ~600 KB) o un SDK
certificado iBeta. Identificado, no implementado.

La detección de cámara trabada **no es anti-spoofing**: es salud de hardware.
Un track congelado entrega siempre el mismo cuadro y la puerta de calidad lo
aprueba con puntaje alto, porque efectivamente está quieto.

---

## 7. RIESGOS RESTANTES

| # | Riesgo | Estado |
|---|---|---|
| R-1 | **Las dos Samsung siguen sin medirse.** Todo el rendimiento conocido es de un M1 | Abierto — el instrumento está listo |
| R-2 | **Los umbrales siguen sin calibrar**: 0,6 / 0,5 corresponden al pipeline viejo | Abierto — bloquea producción |
| R-3 | El objetivo FAR ≤ 0,01 % **no es demostrable** con 10 personas (§4.3) | Decisión de negocio pendiente |
| R-4 | Sin anti-spoofing por textura: vídeo con los dos giros, máscara, deepfake | Aceptado y documentado |
| R-5 | Ventana de re-enrolamiento: quien no se re-enroló no ficha con la cara | Mitigado (listado bloqueante + fichaje manual) |
| R-6 | El descriptor lo calcula el cliente: un cliente modificado puede inventarlo | Irreducible; se compensa con terminal vinculada |
| R-7 | Umbrales de `yaw`/`pitch`/`nitidez`: índices sin unidad, sin calibrar en tablet | Abierto, ajustable con el panel |
| R-8 | 3 tests SQL previos fallando (firma de documentos, ausencias, estado residual) | Ajeno a esta fase |
| R-9 | `distancia_descriptores` parsea JSON por empleado; con miles hará falta `pgvector` | No urgente |

---

## 8. VEREDICTO

### 🟢 GO — listo y verificado

- Diagnóstico de dispositivo completo, con los tres niveles de homologación y
  un procedimiento reproducible para tablets nuevas.
- Aislamiento de versiones de plantilla, **probado contra la base real**: una
  plantilla v2 no alcanza a alguien en v1 ni al revés, el default es 1, el
  CHECK se cumple, F-02 sigue intacto y el retiro nunca borra la versión
  vigente.
- Estrategia de re-enrolamiento en cuatro pasos, sin borrado automático, con
  seguimiento visible en el listado de requisitos.
- Metodología de calibración reproducible, con el criterio asimétrico
  explícito y la cota estadística calculada.
- 606 tests JS + 22 suites SQL. Typecheck, lint y build limpios.
- F-01, terminal vinculada, RLS, actor, auditoría y F-02 verificados por sus
  propios tests SQL después del cambio.

### 🟡 GO CONDICIONADO — depende de pruebas reales

- **Homologación de las dos Samsung.** Sin eso no hay ni un dato de rendimiento
  del hardware objetivo.
- **Calibración del umbral.** Los vigentes son de otra distribución.
- **Re-enrolamiento de la plantilla**, con el aviso previo a la gente.
- **Jornada de kiosco** de 8 h verificando estabilidad.

### 🔴 NO-GO — hoy no se puede poner en producción

Un solo bloqueante, y es el mismo de los dos puntos anteriores combinados:

> **Se desplegaría un sistema cuyo umbral corresponde al pipeline anterior,
> sobre hardware del que no hay una sola medición.**

No es un defecto del código: es trabajo de campo que no se hizo. Mientras siga
así, el módulo no puede sostener un registro horario.

---

## 9. ACCIONES PENDIENTES, POR PRIORIDAD

| # | Acción | Bloquea producción | Quién |
|---|---|---|---|
| 1 | Correr `/app/diagnostico-facial` en las **dos Samsung** y pegar el resultado en §3.6 | **Sí** | Con las tablets |
| 2 | Decidir el objetivo de FAR según §4.3 (10 → 0,27 % · 16 → 0,1 % · 50 → 0,01 %) | **Sí** | Negocio |
| 3 | Calibrar con el protocolo de 5 condiciones y la cantidad de personas que salga de (2) | **Sí** | Con personas |
| 4 | Actualizar los umbrales en la migración SQL **y** en `plantilla.ts`, con fecha y N | **Sí** | Tras (3) |
| 5 | Avisar a la plantilla y **re-enrolar a todos** | **Sí** | RRHH |
| 6 | Jornada de 8 h de kiosco mirando degradación y heap | **Sí** | Con las tablets |
| 7 | Retirar las plantillas v1 con `retirar_plantillas_faciales(1, 2)` | No | Tras (5) |
| 8 | Ajustar umbrales de `yaw`/`pitch`/`nitidez` con lo medido | No | Tras (1) |
| 9 | Evaluar MiniFASNet si el modelo de amenaza lo pide | No | — |
| 10 | Arreglar los 3 tests SQL previos ajenos al módulo | No | Otro alcance |

---

## Estado

- Diagnóstico Android: **cerrado** (instrumento listo, mediciones pendientes).
- Calibración: **metodología cerrada**, ejecución pendiente.
- Re-enrolamiento: **implementado y probado**, ejecución pendiente.
- Falsos positivos: **cerrado**, con las limitaciones declaradas.
- Producción: 🔴 **NO-GO** hasta completar las acciones 1 a 6.
