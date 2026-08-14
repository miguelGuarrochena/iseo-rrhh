# FREEZE — Guía operativa para las pruebas reales

**Estado: congelado.** No se tocan más la arquitectura ni el modelo hasta
tener los resultados de campo.

Continúa `docs/rediseno-facial-2026-08-14.md` (arquitectura) y
`docs/validacion-facial-2026-08-15.md` (validación). Este documento es el
**manual de lo que hay que hacer ahora**, no un informe técnico.

---

## A. ESTADO DEL CÓDIGO

### A.1 Qué cambió en esta última pasada

Muy poco, y a propósito: la investigación de las fotos concluyó que **no había
nada que borrar**, así que no hubo limpieza que implementar.

| Archivo | Cambio | Por qué |
|---|---|---|
| `src/tests/minimizacionBiometrica.test.ts` | **Nuevo**, 13 tests | Fija que el pipeline no materialice ni persista ninguna imagen. Es una invariante fácil de romper sin querer y muy difícil de notar |
| `src/tests/enroladoFacial.test.ts` | +3 tests | Que el pendiente de re-enrolar sea **visible** para RRHH, no sólo correcto en el código |
| `supabase/limpieza_biometrica_v1.sql` | **Nuevo**, no es migración | Inspección (parte A, sólo lee) + borrado (parte B, comentada) |
| `src/types/rrhh.ts` | `fotoUrl` fuera de `OpcionesFichaje` | Ver B.4 |
| `src/lib/services/supabase/real.ts`, `rrhh.demo.ts` | `ficharAhora` deja de escribir `foto_url` | Ver B.4 |
| `supabase/migrations/…000078_fichaje_sin_fotografia.sql` | **Nueva, aditiva** | Trigger que fuerza `foto_url` a null. No borra la columna ni ningún dato |
| `supabase/tests/fichaje_sin_fotografia.test.sql` | **Nuevo**, 5 bloques | Que el corte valga por todos los caminos, no sólo por la app |

**Ningún cambio de arquitectura, de modelo ni de umbrales.** El único cambio de
esquema es el trigger aditivo de B.4, que no borra nada y se revierte con un
`drop trigger`.

### A.2 Verificación

```
npx tsc --noEmit   → limpio
npx next lint      → sin warnings ni errores
npm run build      → compila
npx jest --ci      → 49 suites / 622 tests PASS
tests SQL          → 19 de 22 OK
```

Los 3 SQL que fallan son **previos y ajenos** al módulo facial, ya verificado
quitando la restricción nueva y volviendo a correrlos:

| Test | Error | Módulo |
|---|---|---|
| `prod_baseline_verify` | `permission denied … documento_firma_destinatarios` | Firma de documentos |
| `rls_firma_recibos` | `permission denied for table ausencias` | Ausencias |
| `rls_cupos_licencia` | `duplicate key … empresas_pkey` | Estado residual en la base local |

---

## B. DATOS BIOMÉTRICOS

### B.1 Qué se encontró — no hay fotos de enrolamiento

**El pipeline facial nunca guardó una foto. No hay nada que borrar.**

Rastreé todos los caminos por los que una imagen podría persistirse:

| Dónde busqué | Resultado |
|---|---|
| Tablas con columna de imagen | 3, ninguna del enrolamiento (abajo) |
| Buckets de Storage | `documentos`, `fotos`, `logos`, `recibos-pdf` |
| Quién sube a Storage | Sólo `subirFotoEmpleado`, llamada desde crear/actualizar empleado |
| El módulo facial (`lib/facial`, `components/app/facial`) | **Cero** llamadas a `toDataURL`, `toBlob`, `upload`, `storage.from`, `IndexedDB` o `createObjectURL` |
| Qué escribe `enrolarRostro` | `descriptor_facial`, `descriptor_version`, `consentimiento_biometrico`. Nada más |

Las tres columnas de imagen que sí existen, y qué son:

| Columna | Qué es | ¿Se toca? |
|---|---|---|
| `empleados.foto_url` | **Avatar del legajo.** Lo sube RRHH a mano desde la ficha ("Subir foto"), va al bucket `fotos`, se ve en el listado de colaboradores y en la ficha | ❌ **No.** Es una función de negocio, no biometría del pipeline |
| `usuarios.avatar_url` | Foto de la cuenta de la app | ❌ No |
| `fichajes.foto_url` | Columna del esquema original (julio 2026). **Ningún código la escribe ni la lee.** El RPC `fichar_con_rostro` no la inserta | ❌ No (ver B.4) |

Lo único que el enrolamiento genera y guarda son **128 números**, de los que no
se puede reconstruir la cara.

> Nota histórica: el pipeline V1 **sí** generaba un JPEG del rostro en cada
> captura (`canvas.toDataURL`) que ninguno de sus dos consumidores usaba — se
> materializaba una imagen biométrica para tirarla enseguida. Eso se eliminó
> antes del rediseño (hallazgo F-14 de la auditoría de fichaje). El test nuevo
> existe para que no vuelva.

### B.2 Qué se eliminó

**Nada.** No había fotos de enrolamiento que eliminar.

Lo que sí queda **preparado** para eliminar, cuando corresponda, son las
**plantillas V1** — que no son fotos, son los 128 números del pipeline viejo:

- Guion de inspección: `supabase/limpieza_biometrica_v1.sql`, parte A.
- Borrado: parte B, **comentada**, hay que descomentarla a mano.
- La función `retirar_plantillas_faciales(1, 2)` exige rol de gestor, se niega
  a borrar la versión con la que se está fichando y devuelve cuántas borró.

### B.3 ⚠ Sobre producción

**El `.env` apunta a un Supabase remoto** (`osvbemnclntsufssdsbe.supabase.co`) y
**no hay service role key** en el entorno. No ejecuté nada contra producción, ni
siquiera de lectura.

Los números de abajo son de la **base local**:

| Dato | Local |
|---|---|
| Empleados con plantilla facial | 2 (ambas V1) |
| Empleados con avatar (`foto_url`) | 0 |
| Fichajes | 5 · con foto: **0** |
| Objetos en todos los buckets | **0** |
| Hashes antirreplay | 5 |

**Para saber qué hay en producción, corré la parte A del guion:**

```bash
npx supabase db execute --file supabase/limpieza_biometrica_v1.sql --linked
```

O pegá las consultas en el SQL Editor de Supabase Studio. Sólo leen.

### B.4 `fichajes.foto_url` — auditado y cerrado

Auditoría completa del campo, hecha aparte del freeze del pipeline.

**Qué se revisó, y qué se encontró en cada camino:**

| Camino | Resultado |
|---|---|
| `OpcionesFichaje.fotoUrl` (tipo) | Existía. **Ningún caller lo usaba** |
| `ficharAhora` (real y demo) | Insertaba `foto_url` si le pasaban una. Nadie le pasaba |
| Callers de `ficharAhora` | Sólo dos: `FichajeManualModal` (manda método, tipo, timestamp, quién) y `ficharConRostro` del demo (método, geo, tipo, confianza). **Ninguno pasa foto** |
| API routes (`src/app/api/*`) | 8 rutas, **ninguna** toca fichajes |
| `fichar_con_rostro` (RPC) | No inserta `foto_url` |
| Componentes de fichaje | Ninguno lee ni escribe `fichaje.fotoUrl` |
| Storage | El módulo facial **no escribe en ningún bucket** |
| RLS | Policy de INSERT que deja al empleado insertar su propia marca. Su `with check` **no dice nada de `foto_url`** |
| Triggers previos | Los tres `before insert` no la tocan. `imponer_actor_fichaje` limpia confianza y geocerca, pero tiene dos salidas tempranas por las que ni la mira |

**El hallazgo que cambió la decisión:** cortar la aplicación no alcanzaba.

Con la policy de INSERT abierta y ningún trigger limpiando el campo, un cliente
modificado —o un `curl` con un token válido— podía escribir ahí una `data:` URL
con una cara adentro. La promesa de "no guardamos fotos" era una **convención,
no un control**.

> Nota sobre la base local: ahí `authenticated` no tiene ni `SELECT` ni
> `INSERT` sobre `fichajes`, así que el ataque da `sin privilegio`. Pero esos
> grants **no** están en ninguna migración y la app no funcionaría con ellos
> así, de modo que en producción tienen que ser distintos. No se puede
> verificar el estado real de producción desde acá. Por eso el control se puso
> en la base y no se confió en el grant.

**Qué se hizo:**

1. **Se cortó el camino en la aplicación.** `fotoUrl` fuera de
   `OpcionesFichaje`; `ficharAhora` ya no escribe `foto_url` ni en el backend
   real ni en el demo. `tsc` limpio confirma que nada dependía de eso.
2. **Se cerró el camino del servidor** — migración
   `20260815000078_fichaje_sin_fotografia.sql`, **aditiva**: un trigger
   `before insert or update` fuerza `foto_url` a null, sin condiciones ni
   excepciones. No hay ningún caso legítimo que quiera escribir una foto; si
   apareciera, el cambio tiene que ser explícito.
3. **Se dejó la columna.** Quitarla es irreversible, obliga a reescribir la
   vista y los triggers de auditoría que la nombran, y no aporta ninguna
   garantía que el trigger no dé ya. Revertir todo esto es
   `drop trigger trg_fichaje_sin_fotografia on fichajes;`.

**Hallazgo colateral, mejor de lo esperado:** `proteger_update_fichaje` ya
rechaza **cualquier** UPDATE sobre `fichajes` ("Los fichajes no se editan").
El camino de UPDATE estaba cerrado desde antes, por una capa anterior y más
fuerte (F-12).

**Tests:** `supabase/tests/fichaje_sin_fotografia.test.sql` (5 bloques: INSERT
directo, UPDATE rechazado, camino del RPC, existencia del trigger, y que no se
haya roto lo que sí debe guardarse) + 3 tests JS en
`minimizacionBiometrica.test.ts`.

**Queda vivo `Fichaje.fotoUrl` en el modelo de lectura** (el tipo y `aFichaje`).
No almacena nada —la columna ahora es siempre null— y nadie lo lee. Sacarlo es
cosmético y toca el modelo de lectura, así que se dejó para después del freeze.

### B.5 Cómo funciona V2

```
Empleado → Enrolamiento → cámara en vivo
                            ↓
                MediaPipe FaceLandmarker  (478 landmarks + blendshapes)
                            ↓
                puerta de calidad  (tamaño, pose, luz, nitidez, movimiento)
                            ↓
                alineamiento canónico  (similitud → chip 150×150)
                            ↓
                dlib ResNet-34 en Web Worker
                            ↓
                5 muestras → control de dispersión → promedio
                            ↓
                guardar: 128 números + descriptor_version = 2
                            ↓
                los píxeles mueren con el cuadro
```

**En ningún punto se crea un archivo de imagen.** El recorte de 150×150 vive en
un `ImageData` que se reusa cuadro a cuadro y nunca sale de la pestaña.

---

## C. RE-ENROLAMIENTO

### C.1 Quién es quién

| Estado | Qué ve RRHH | ¿Puede fichar con la cara? |
|---|---|---|
| Sin plantilla | "Sin rostro registrado" · requisito `facial_sin_rostro` | No |
| **Plantilla V1** | ⚠ "Registrado con una versión anterior" · requisito `facial_plantilla_vieja` (**bloquea**) | **No** |
| Plantilla V2 | ✓ "Rostro registrado" | Sí |

El pendiente aparece solo en el listado de requisitos de `/app/fichaje`,
`/app/colaboradores` y el tablero. Nadie tiene que llevar la cuenta a mano.

### C.2 Los pasos

**1 · Avisar antes de desplegar.**

> Desde el momento del despliegue, **quien tenga plantilla V1 no puede fichar
> con la cara** hasta que se le vuelva a tomar. No es un efecto colateral: es
> la alternativa correcta a compararlo contra una plantilla incompatible.
> Tené el fichaje manual a mano esos días.

**2 · Desplegar** (código + migración 77). Nadie pierde datos: las plantillas
existentes quedan marcadas como V1.

**3 · Re-enrolar.** Ficha del empleado → *Reconocimiento facial* → botón
**"Volver a tomar"** (aparece destacado). La persona mira la cámara unos
segundos; el sistema toma 5 muestras separadas y valida que coincidan entre sí.
Si no coinciden, rechaza y pide de nuevo.

**4 · Verificar.** El requisito desaparece de la lista solo. Cuando la lista
esté vacía, terminó.

**5 · Retirar las V1** (opcional, cuando (4) esté completo):

```bash
npx supabase db execute --file supabase/limpieza_biometrica_v1.sql --linked
```

Primero corre sólo la inspección. Para borrar, descomentá la parte B del
archivo, poné el UUID de un admin_rrhh real, y volvé a correrlo.

**Nada se borra automáticamente en ningún momento.**

---

## D. PRUEBA DE TABLETS — qué hacer en cada Samsung

Repetir **igual** en las dos, y anotar cuál es cuál.

### D.1 Preparación

1. Entrá a la app **por https**, no por la IP de la red. Sin contexto seguro el
   navegador no habilita la cámara.
2. Iniciá sesión con la cuenta **superadmin**.
3. Andá a `/app/diagnostico-facial` (no está en ningún menú: hay que escribir
   la ruta).
4. Aceptá el permiso de cámara.

### D.2 Medición base (2 minutos)

Esperá a que el panel deje de decir "Preparando el sistema…" y anotá:

- **Panel Dispositivo** — fabricante, modelo, Android, navegador (y si dice
  *WebView*), arquitectura, GPU, WebGL, WASM SIMD, memoria.
- **Panel Homologación** — el veredicto y, si los hay, los bloqueos.
- **Panel Pipeline** — percepción, alineamiento, embedding, reconocimiento
  total, FPS bucle/cámara, cámara real.
- **Panel Incidencias** — si aparece algo, **eso es el problema de esa tablet**
  y ya está identificado por nombre.

🚩 **Señales de alarma que hay que anotar sí o sí:**

| Si ves… | Significa |
|---|---|
| Percepción: `CPU` | El delegado GPU no arrancó. Va a ir varias veces más lento |
| Embedding: `principal` | El Worker no arrancó: la pantalla se congela en cada inferencia |
| Backend: `wasm` o `cpu` | WebGL no está disponible |
| Navegador: *WebView* | La versión del motor la fija otra app, no el usuario |
| FPS de cámara mucho menor que el del bucle | El problema es el sensor, no el procesamiento |

### D.3 Prueba de estabilidad (10 minutos)

Dejá la pantalla abierta 10 minutos, con alguien parándose delante cada uno o
dos minutos. Después mirá el **panel Estabilidad**:

- **Degradación > 30 %** → la tablet está haciendo throttling térmico y **no
  aguanta un turno**. Anotalo, es un motivo de no homologación.
- **Heap JS que sube y no baja** → posible fuga de memoria.
- **Cuadros perdidos creciendo** → contexto WebGL inestable.

### D.4 Cerrar

Tocá **Copiar informe** y pegalo en un archivo por tablet. Ese texto tiene todo
lo anterior en formato plano.

### D.5 Homologar una tablet nueva más adelante

El mismo procedimiento, sin cambios. `clasificarDispositivo()` **nunca** declara
por su cuenta que un dispositivo está homologado —hay un test que lo fija—:
como mucho dice *"rendimiento aceptable"*. Homologar es una decisión de una
persona, después de D.3 y de la calibración.

---

## E. CALIBRACIÓN — qué personas y qué datos

### E.1 Cuánta gente hace falta (decisión previa)

Esto hay que decidirlo **antes** de convocar a nadie, porque cambia a cuántos
llamás. Con cero falsos positivos observados, la regla de tres dice lo máximo
que se puede afirmar:

| Personas × 5 condiciones | Pares impostores | Se puede afirmar |
|---|---|---|
| 10 | 1 125 | FAR < **0,27 %** |
| 16 | 2 960 | FAR < **0,1 %** |
| 30 | 10 875 | FAR < 0,028 % |
| **50** | 30 625 | FAR < **0,0098 %** |

> **Con 10 personas no se puede demostrar un FAR de 0,01 %**, aunque no entre
> ningún impostor. La muestra no alcanza para verlo. No es un defecto del
> sistema: es cuánta evidencia da una muestra de ese tamaño.

**Elegí una:** 10 personas (declarás 0,27 %) · 16 (declarás 0,1 %) · 50
(declarás 0,01 %).

### E.2 Las 5 condiciones, por persona

En la tablet, en `/app/diagnostico-facial`, poné un identificador por persona
(`sujeto-1`, `sujeto-2`, …) y tomá una muestra por cada condición:

1. **Frontal** — de frente, a la distancia normal de la terminal.
2. **Giro izquierda** — cabeza girada a su izquierda, dentro de lo cómodo.
3. **Giro derecha** — ídem al otro lado.
4. **Variación vertical** — un poco más arriba o más abajo (persona más alta o
   más baja que la media).
5. **Otra distancia** — un paso más cerca o más lejos.

Si el lugar las tiene, sumá *contraluz*, *poca luz* y *con anteojos*: no son
obligatorias pero hacen la medición más realista.

**El panel te dice qué falta**, por persona y en total. No lo da por válido
hasta completar las cinco de cada una.

### E.3 Qué recoger

Tocá **Copiar informe** al final. Trae, ya calculado:

- distribución de distancias **genuinas** (misma persona) e **impostoras**
  (personas distintas);
- **separación d′** — la métrica que no depende del umbral;
- **umbral recomendado** y el FRR que implica;
- **cota superior del FAR** con la cantidad de pares que juntaste.

### E.4 Cómo se elige el umbral

**No en el EER.** El EER es el punto donde falso positivo y falso negativo se
igualan, que es lo correcto cuando cuestan lo mismo. Acá no:

> Un falso rechazo cuesta que el empleado vuelva a mirar la cámara: cinco
> segundos, y se nota. Un falso positivo mete la marca de otra persona en un
> registro horario que puede terminar en una inspección, y **no se entera
> nadie**.

La regla es:

```
umbral = (distancia impostora más chica observada) − 0,05
```

El margen existe porque esa mínima es una muestra, no el mínimo verdadero: la
próxima persona que se enrole puede parecerse más a alguien que cualquiera de
las medidas. El FRR que salga es una consecuencia, y se informa para que sea una
decisión consciente. **Si sale alto, se arregla el enrolamiento, no se afloja el
umbral.**

### E.5 Dónde se cambia (después de tener los datos)

**No lo toqué**: siguen en 0,6 (1:1) y 0,5 (1:N), que son los de face-api y
corresponden a la distribución del pipeline **viejo**.

Hay que cambiarlo en **dos lugares**, con la fecha y el N de la medición:

1. `fichar_con_rostro` (SQL) — es donde manda. Una migración nueva.
2. `src/lib/facial/plantilla.ts` — el espejo documental que muestra el panel.

---

## F. CRITERIOS DE GO

Pasamos a producción cuando **todo** esto se cumpla:

### F.1 Tablets

- [ ] Las dos Samsung dan **"Rendimiento aceptable"** en el panel.
- [ ] Percepción `GPU` y embedding en `worker` con backend `webgl`.
- [ ] Panel de Incidencias **vacío** en las dos.
- [ ] Degradación **< 30 %** tras 10 minutos.
- [ ] Informe de cada tablet pegado en la tabla de homologación.

### F.2 Calibración

- [ ] Protocolo completo: las 5 condiciones × la cantidad de personas de E.1.
- [ ] **Ningún impostor** por debajo del umbral recomendado.
- [ ] **d′ ≥ 3,0** — si no llega, el problema es el enrolamiento o el
      encuadre, no el umbral.
- [ ] FRR con el umbral recomendado **≤ 10 %**, o decisión explícita de
      aceptar uno mayor.
- [ ] Umbrales actualizados en SQL **y** en `plantilla.ts`, con fecha y N.

### F.3 Re-enrolamiento

- [ ] Aviso dado a la plantilla.
- [ ] **Cero** personas con requisito "Rostro registrado con una versión
      anterior".
- [ ] Prueba de fichaje real con al menos 5 personas ya en V2.

### F.4 Estabilidad

- [ ] **Una jornada de 8 h** de kiosco continuo, verificando al final que la
      degradación y el heap sigan sanos.

### F.5 Freno

Si **cualquiera** de F.1–F.4 falla, no se pasa a producción. Y en particular:

> Si la calibración muestra que las distribuciones genuina e impostora **se
> solapan**, ningún umbral separa limpio. Ahí no se elige un umbral de
> compromiso: se investiga el enrolamiento antes de seguir.

---

## G. RIESGOS RESTANTES

### G.1 Spoofing — lo que NO está cubierto

> **No hay anti-spoofing por textura. El producto no debe afirmar que lo hay.**

| Ataque | ¿Se corta? | Con qué |
|---|---|---|
| Foto impresa | ✅ | Parpadeo |
| Foto en pantalla de otro teléfono | ✅ | Parpadeo |
| Foto con ojos cerrados | ✅ | Ciclo abierto→cerrado→abierto |
| Foto de perfil | ✅ | El desafío exige empezar de frente |
| **Vídeo pregrabado de frente** | ❌ | *el vídeo parpadea* |
| Vídeo con un solo giro grabado | ✅ | El lado se sortea en el momento |
| **Vídeo con los dos giros grabados** | ❌ | Nada |
| **Máscara, deepfake en vivo** | ❌ | Nada |

El kiosco usa parpadeo **más** desafío de pose justamente porque el ataque
realista —el compañero que ficha por el que llegó tarde— vive ahí. Cerrar las
filas en rojo requiere MiniFASNet (Apache 2.0, ~600 KB) o un SDK certificado
iBeta. Identificado, no implementado, y **fuera del freeze**.

Mitigación operativa mientras tanto: el kiosco supervisado. Una terminal a la
vista de un encargado sube mucho el costo de sostener un teléfono frente a la
cámara.

### G.2 Compatibilidad Android

| Riesgo | Estado |
|---|---|
| **Las dos Samsung siguen sin medirse.** Todo lo conocido es de un M1 | Abierto — es el bloqueante principal |
| Una tablet con WebView embebido puede no traer WebGL2 ni rVFC | Detectado por el diagnóstico, no probado en campo |
| Motor de 32 bits: techo de memoria bajo para 10 MB de modelos | Advertencia en el diagnóstico |
| Mali con WebGL degradado → delegado CPU | Detectado y reportado como incidencia |
| Throttling térmico tras 20-30 min | Medido por el panel de Estabilidad |

**No asumas que otra tablet Android va a rendir como las Samsung.** Cada modelo
nuevo pasa por D.1–D.4 antes de homologarse.

### G.3 Los demás

| # | Riesgo | Estado |
|---|---|---|
| R-1 | Umbrales sin calibrar (son del pipeline viejo) | **Bloquea producción** |
| R-2 | El objetivo FAR ≤ 0,01 % exige 50 personas (E.1) | Decisión pendiente |
| R-3 | Ventana de re-enrolamiento: quien no se re-enroló no ficha | Mitigado con aviso + fichaje manual |
| R-4 | El descriptor lo calcula el cliente; uno modificado podría inventarlo | Irreducible; se compensa con terminal vinculada |
| R-5 | ~~`fichajes.foto_url` con cableado vivo~~ | **Cerrado** (B.4): app cortada + trigger en la base |
| R-6 | Umbrales de `yaw`/`pitch`/`nitidez` sin calibrar en tablet | Ajustable con el panel |
| R-7 | 3 tests SQL previos fallando, ajenos al módulo | Otro alcance |
| R-8 | `distancia_descriptores` parsea JSON por empleado | No urgente |

---

## FREEZE

A partir de acá **no hay más cambios** de arquitectura, modelo, umbrales ni
esquema hasta tener los resultados de D y E.

Lo único que puede reabrir el código antes de eso es **un problema real
encontrado en las pruebas**. Si aparece, se arregla ese problema y se agrega el
test que impida que vuelva — nada más.

**Lo que sigue no es desarrollo, es trabajo de campo:**

| Orden | Acción | Quién |
|---|---|---|
| 1 | Correr la parte A del guion de limpieza contra producción y ver qué hay | Vos |
| 2 | Decidir el objetivo de FAR (E.1) | Negocio |
| 3 | Diagnóstico en las dos Samsung (D) | Con las tablets |
| 4 | Calibración (E) | Con personas |
| 5 | Actualizar umbrales con los datos | Después de (4) |
| 6 | Avisar y re-enrolar (C) | RRHH |
| 7 | Jornada de 8 h | Con las tablets |
| 8 | Retirar las plantillas V1 | Después de (6) |
