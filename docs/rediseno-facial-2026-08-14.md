# Rediseño del módulo de reconocimiento facial — 2026-08-14

**Alcance:** FASE 1 (auditoría), FASE 2 (investigación), FASE 3 (decisión).
**Base:** rama `main`, working tree limpio, commit `2117834`.
**Complementa** `docs/auditoria-fichaje-2026-08-14.md` (auditoría de seguridad del fichaje).
Este documento se ocupa de **visión por computadora y rendimiento**, no de autorización.

---

## FASE 1 — AUDITORÍA DEL PIPELINE ACTUAL

Las 26 preguntas del pedido, contestadas con lo que dice el código y los
binarios, no con impresiones.

### 1–3. Librería, modelos y tamaños

| Qué | Valor medido | Dónde se comprobó |
|---|---|---|
| Librería | `@vladmandic/face-api` **1.7.15** (MIT), fork mantenido de face-api.js | `package.json`, `node_modules/@vladmandic/face-api/package.json` |
| TF.js embebido | **4.22.0** (core, converter, backend-cpu, backend-webgl, backend-wasm) | `dist/tfjs.version.js` |
| JS del runtime | `face-api.esm.js` = **1 333 462 B** (1,27 MB), de los cuales `tfjs.esm.js` = **1 254 071 B** | `ls -la dist/` |
| Detector | `tiny_face_detector_model.bin` = **193 321 B** (19 tensores) | `public/models/`, manifest |
| Landmarks | `face_landmark_68_model.bin` = **356 840 B** (49 tensores) | idem |
| Embedding | `face_recognition_model.bin` = **6 444 032 B** (117 tensores) | idem |
| **Total pesos** | **6 994 193 B ≈ 6,67 MB** | |

Los tres modelos se copian de `node_modules` a `public/models` en
`postinstall`/`build` (`scripts/copiar-modelos-faciales.mjs`) y se sirven
con `Cache-Control: immutable` (`next.config.js`). Eso está bien resuelto
y se conserva.

### 4. Qué hace exactamente cada modelo

- **TinyFaceDetector** — detector tipo Tiny-YOLOv2 con anchors; entrada
  cuadrada configurable (128…608), salida cajas + score. Pesos de
  *yeephycho*, entrenados sobre **WIDER FACE**.
- **faceLandmark68Net** — regresor de 68 puntos 2-D (contorno de mandíbula,
  cejas, ojos, nariz, boca). Pesos de *yinguobing*.
- **faceRecognitionNet** — **ResNet-34 de dlib**
  (`dlib_face_recognition_resnet_model_v1`), entrada **150×150**, salida
  **128 floats**. Normalización verificada en el bundle:
  `sub([122.782, 117.001, 104.298]).div(255)` — es decir, resta de media
  BGR/RGB de dlib y escala. 99,38 % en LFW.

### 5–6. Backend de ejecución

**Medición sobre el bundle** (`node -e` buscando las llamadas a
`registerBackend`):

```
Om ARG: "cpu"
Om ARG: "webgl"
Om ARG: "wasm"
```

- El bundle registra **cpu, webgl y wasm**. **No registra webgpu.**
- El código **nunca llama a `setBackend`**. TF.js elige por prioridad:
  `webgl` (prio 2) → `cpu` (prio 1). El backend `wasm` está registrado con
  prioridad menor y, además, **no puede inicializarse**: sus binarios
  (`tfjs-backend-wasm-simd.wasm`, etc.) **no están en el paquete**
  (`find node_modules/@vladmandic/face-api -name '*.wasm'` → vacío) y el
  loader los buscaría en un CDN, que la CSP `connect-src 'self'` bloquea.

> **Hallazgo R-01.** La cadena real hoy es **WebGL → CPU**. No hay
> fallback intermedio. Un Samsung con WebGL degradado o con el contexto
> perdido cae directo a JavaScript puro, que para esta ResNet significa
> segundos por inferencia. `backendFacial()` existe y lee `tf.getBackend()`,
> pero **ningún componente lo muestra ni lo registra**: hoy es imposible
> saber en qué backend corrió una tablet.

### 7–10. Cuánto trabajo se hace por cuadro

`CapturaFacial.tsx` (líneas 46-48, 155-195):

```
MS_LIVENESS = 4000     // ventana
MS_ENTRE_CUADROS = 180 // pausa entre cuadros  → objetivo ≈ 5,5 fps
```

Por cuadro de liveness se llama `detectarOjos()`, que corre
`detectAllFaces(...).withFaceLandmarks()` — detector + landmarks, **sin**
descriptor. Esto ya está corregido respecto de la auditoría anterior
(F-05): el ResNet **ya no** corre en cada cuadro. Bien.

Lo que **sigue mal**:

> **Hallazgo R-02 — escalera de pasadas.** `PASADAS = [{320,0.5},
> {512,0.3},{608,0.2}]`. Cuando no hay cara, se corren **las tres**. El
> costo del detector escala con el área: 320² = 102 k px, 512² = 262 k px,
> 608² = 370 k px. Un cuadro fallido cuesta **7,2× más** que uno resuelto
> en la primera pasada. Y el caso "no hay cara" es exactamente el caso
> frecuente (persona acercándose, poca luz, encuadre). El presupuesto de
> 180 ms se revienta justo cuando más importa.

> **Hallazgo R-03 — el reloj no es el que se cree.** El bucle hace
> `await detectarOjos(...)` y **después** `setTimeout(180)`. El período
> real es `t_inferencia + 180 ms`, no 180 ms. Con 250 ms de inferencia el
> período es 430 ms → **9 cuadros en 4 s**, no 22. Con la escalera de R-02
> en el peor caso, 3-5 cuadros → por debajo de `CUADROS_MINIMOS = 6` →
> "No llegamos a verte bien". El mensaje culpa a la persona de un
> problema de presupuesto de cómputo.

> **Hallazgo R-04 — inferencia desperdiciada.** El flujo es *apretar
> botón → 4 s de liveness → una detección más con descriptor*. La
> detección final (`detectarRostro`) **repite** detector + landmarks que
> ya se habían corrido 20 veces, y encima sobre un cuadro **arbitrario**:
> el que hubiera cuando terminó el liveness. No se elige el mejor cuadro,
> ni siquiera uno con la cara centrada. El sistema tira ~20 detecciones
> buenas y ficha con la número 21.

### 11–12. Main thread y workers

- **Todo corre en el main thread.** No hay Worker, ni `OffscreenCanvas`,
  ni `requestVideoFrameCallback`. El bucle es `while (Date.now() < hasta)`
  con `await`.
- TF.js WebGL sube/baja texturas de forma síncrona respecto del hilo de
  JS; `.data()` del descriptor es `await` pero el trabajo previo bloquea.
  Con backend `cpu` el main thread se congela durante toda la inferencia:
  la UI no repinta, el `aria-live` no se anuncia, el botón no responde.

> **Hallazgo R-05.** Se necesita Worker **para el embedding** (es la única
> operación cara y no necesita el `<video>`). La detección conviene que
> siga en el hilo que tiene el elemento de video, pero movida a
> `requestVideoFrameCallback`.

### 13–14. Resolución de video vs. resolución al modelo

```ts
getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
```

- `width/height` **sin `ideal`/`exact`** son *ideales* por defecto: el
  navegador puede entregar cualquier cosa. En Android suele dar 640×480,
  pero también 1280×720 si el driver lo prefiere.
- **No se lee nunca la resolución real** (`track.getSettings()`), ni se
  fija `frameRate`, ni se pide `resizeMode`.
- Al modelo se le pasa **el `<video>` entero**. face-api hace
  `toNetInput` → letterbox al `inputSize` cuadrado. Con 640×480 (4:3) a
  320×320 hay **distorsión de aspecto o padding**, según el camino.
- Una cara a 1,5 m en un cuadro de 640×480 ocupa ~90 px de alto; tras el
  reescalado a 320 quedan ~45 px. Es el límite del detector.

> **Hallazgo R-06.** No se declara ni se verifica la resolución de
> captura, y el modelo recibe el cuadro completo en vez de una ROI. Con
> una cámara frontal gran angular de tablet (lo habitual en Samsung), la
> cara ocupa una fracción chica del cuadro y se pierde resolución útil
> justo donde hace falta.

### 15–18. Crop, resize, alineamiento y normalización

Éste es el hallazgo central de la auditoría.

En el bundle:

```js
align(t, n = {}) {
  let { useDlibAlignment: a, minBoxPadding: r } =
      { useDlibAlignment: !1, minBoxPadding: .2, ...n };
  return a ? this.alignDlib() : this.alignMinBbox(r);
}
alignMinBbox(t) { let n = boundingBox(this.positions); return n.pad(n.width*t, n.height*t); }
```

`withFaceDescriptors()` usa `alignedRect`, que sale de `landmarks.align()`
**con las opciones por defecto** → `useDlibAlignment: false` →
`alignMinBbox(0.2)`.

> **Hallazgo R-07 — NO HAY ALINEAMIENTO.**
> Lo único que se hace es: caja contenedora de los 68 puntos, agrandada
> un 20 %, recortada, y estirada a 150×150.
>
> - **No hay rotación.** Si la persona inclina la cabeza 15°, el modelo
>   recibe una cara inclinada 15°.
> - **No hay normalización de escala canónica.** El tamaño del recorte
>   depende de la caja de landmarks, que cambia con el gesto (boca
>   abierta agranda la caja) y con el yaw.
> - **No hay traslación canónica.** Los ojos no caen siempre en el mismo
>   lugar del chip de 150×150.
>
> La ResNet de dlib fue entrenada con `get_face_chip`, que **sí** aplica
> una transformación de similitud (rotación + escala + traslación) a un
> chip canónico. Alimentarla con recortes sin alinear es usar el modelo
> fuera de su distribución de entrenamiento. **Esto degrada la separación
> genuino/impostor de forma sistemática, y explica por qué "el mismo
> empleado a veces sí y a veces no".** Ningún ajuste de umbral arregla
> esto: mueve el punto de operación, no separa mejor las distribuciones.
>
> Dato colateral: face-api **tiene** `alignDlib()` implementado
> (constantes extraídas del bundle: `relScale = 0.45`, `relX = 0.5`,
> `relY = 0.43`; puntos de referencia = centroides de ojo izq., ojo der. y
> boca) pero **tampoco rota** — sólo centra y escala una caja alineada a
> los ejes. Ni siquiera activándolo se obtiene el chip que el modelo
> espera.

Normalización de píxeles: correcta y verificada
(`sub([122.782,117.001,104.298]).div(255)` sobre un tensor 150×150). No se
toca.

### 19–21. Embeddings, similitud y umbrales

- **Embedding:** 128 floats, `Float32Array` → `Array.from` → `number[]` →
  `jsonb` en Postgres. **No está L2-normalizado** (el modelo de dlib
  produce vectores de norma ≈1 por construcción, pero no exactamente).
- **Similitud:** distancia **euclidiana**, calculada **en SQL**
  (`distancia_descriptores(a jsonb, b jsonb)`), no en el cliente.
- **Umbrales:** `0.6` para 1:1, `0.5` para 1:N, margen `0.05` entre el
  primero y el segundo candidato en 1:N. Están **duplicados**: en
  `src/lib/facial/reconocimiento.ts` y, otra vez, hardcodeados dentro de
  `fichar_con_rostro`. El de SQL es el que decide.

> **Hallazgo R-08 — el umbral es el default de face-api, no una
> calibración.** 0,6 es el número que face-api pone en su README. No hay
> ni una medición de FAR/FRR sobre esta población, este hardware y esta
> iluminación. Con R-07 encima (sin alineamiento), la distribución de
> distancias es **más ancha** que la que justificó ese 0,6 → el umbral
> está mal ubicado por partida doble.

> **Hallazgo R-09 — `mejorCoincidencia` tiene un bug y es código muerto.**
> `reconocimiento.ts:314-342`: cuando aparece un candidato mejor, la
> "segunda mejor" se pisa con la distancia del mejor **anterior**, aunque
> ya se hubiera visto una intermedia menor. El margen queda mal calculado.
> No afecta producción (el match vive en SQL) pero está testeado como si
> fuera correcto.

> **Hallazgo R-10 — el costo del 1:N está en el peor lugar.**
> `distancia_descriptores` hace `jsonb_array_elements_text` **dos veces
> por empleado** y castea 256 textos a `double precision` en cada
> comparación. Para 200 empleados son **51 200 parseos de JSON por
> fichada**, y se hace **dos veces** (el mejor, y después otra vez para el
> segundo candidato). Es O(N) con una constante altísima, dentro de la
> transacción del fichaje.

### 22. Enrolamiento

`EnrolamientoFacial.tsx` + `CapturaFacial.tsx`:

- **Un** cuadro, **un** descriptor, sin `exigirLiveness`.
- Sin score mínimo: si la cara se detectó recién en la pasada 3
  (`scoreThreshold: 0.2`), se acepta igual.
- Sin control de nitidez, brillo, pose, oclusión ni tamaño.
- Sin comparación contra el enrolado anterior al re-enrolar.
- Sin verificación de que el descriptor nuevo no colisione con otro
  empleado ya enrolado.

> **Hallazgo R-11.** La referencia contra la que se compara todo el año se
> toma con la luz de la oficina de RRHH, la cámara de la notebook de RRHH,
> un cuadro cualquiera, y sin ninguna validación. Es el punto de mayor
> apalancamiento de todo el sistema y hoy no tiene ni un control.

### 23. Liveness

`lib/facial/liveness.ts`: EAR (eye aspect ratio) sobre los 6 puntos por
ojo de face-api; se exige el ciclo **abierto → cerrado → abierto** con
histéresis 0,27 / 0,21 y ≥ 6 cuadros.

El código es correcto y está bien testeado. El problema es **qué afirma**:

> **Hallazgo R-12.** Esto detecta un parpadeo, no una persona. Nivel de
> protección real:
>
> | Ataque | ¿Lo corta? |
> |---|---|
> | Foto impresa | Sí |
> | Foto en la pantalla de otro teléfono | Sí |
> | **Vídeo del compañero en otro teléfono** | **No** |
> | **Vídeo en bucle / replay** | **No** |
> | Máscara / deepfake | No |
>
> Un vídeo de 5 segundos de un compañero, grabado con el mismo teléfono,
> pasa el chequeo. En un control horario, el ataque realista **es
> exactamente ése** (el compañero que ficha por el que llegó tarde), y es
> el único que el liveness actual no cubre. Llamar "liveness" a esto es
> generoso.

### 24–25. Problemas del enrolamiento y del reconocimiento — resumen

**Enrolamiento:** R-11 (muestra única sin control de calidad) + R-07 (la
referencia se calcula sin alinear, así que arrastra el ruido de pose de
ese cuadro para siempre).

**Reconocimiento:** R-07 (sin alineamiento) → R-08 (umbral no calibrado
sobre una distribución ancha) → R-02/R-03/R-04 (presupuesto de cómputo
mal gastado, cuadro final arbitrario) → R-01 (sin fallback de backend ni
telemetría para saber cuál de todos está pasando).

### 26. Qué puede venir específicamente de las Samsung

No hay ningún modelo de tablet documentado en el repo
(`grep -rniE "samsung|galaxy tab|SM-[TXP]"` → sólo comentarios genéricos).
Eso **también es un hallazgo**: se estuvo diagnosticando a ciegas.

Riesgos reales, específicos de ese hardware, que hay que **medir**:

| # | Riesgo | Por qué en Samsung |
|---|---|---|
| S-1 | GPU Mali (Exynos) con WebGL2 lento en `texSubImage2D` | Las Galaxy Tab A/A8/A9 usan Mali-G52/G57. La subida de texturas por cuadro es el cuello real, no el cómputo |
| S-2 | Pérdida de contexto WebGL bajo presión de memoria | Chrome mata el contexto y TF.js cae a `cpu` **sin avisar**. Hoy nada lo detecta |
| S-3 | Cámara frontal 2-5 MP gran angular con autoexposición lenta | Contraluz de ventana → cara subexpuesta; el detector no engancha |
| S-4 | `getUserMedia` entrega 640×480 pero el ISP hace *upscale* de un sensor binned | Nitidez real muy por debajo de la nominal |
| S-5 | Throttling térmico tras 20-30 min de kiosco | El rendimiento cae 30-50 % y no vuelve |
| S-6 | Samsung Internet ≠ Chrome | WebGL2 y `requestVideoFrameCallback` con soporte distinto |
| S-7 | RAM 3-4 GB con Chrome descartando la pestaña en background | Reload → cold start de 7 MB de modelos |

---

## FASE 2 — INVESTIGACIÓN

### 2.1 Runtimes

| Runtime | Tamaño runtime | Backends reales en Android/Chrome | Madurez | Veredicto |
|---|---|---|---|---|
| **TensorFlow.js 4.22** | 1,25 MB JS | WebGL2 (maduro), WASM+SIMD (maduro, binarios aparte), WebGPU (paquete aparte, inmaduro en Mali) | Muy alta | **Se conserva, sólo para el embedding** |
| **ONNX Runtime Web 1.27** | ~10-20 MB wasm según build | WASM/SIMD/threads maduro; WebGPU (JSEP) bueno en desktop, **desparejo en Mali/Adreno**; WebNN experimental | Alta | **Descartado**: nos obligaría a convertir el modelo de dlib a ONNX (no hay export oficial) y sumaría un tercer runtime |
| **MediaPipe Tasks Vision 1.0.1** | `vision_wasm_internal.wasm` = **11 756 954 B** (11,2 MB; ≈3,5 MB con brotli) | Delegado GPU sobre WebGL2 + CPU/XNNPACK. Es el mismo runtime que usa Android nativo | Muy alta, mantenido por Google | **Elegido para percepción** |

Nota sobre WebGPU: está disponible en Chrome Android desde la 121 y sólo
en Android 12+ con GPU Qualcomm/ARM. Para convnets chicas como éstas la
ganancia sobre WebGL2 es marginal, y el backend WebGPU de TF.js todavía
tiene huecos de operadores en Mali. **No se fuerza; se mide y se registra.**

### 2.2 Detección y landmarks

| Opción | Licencia código | Licencia pesos | Tamaño | Observación |
|---|---|---|---|---|
| TinyFaceDetector (actual) | MIT | pesos de yeephycho, entrenados sobre **WIDER FACE = CC BY-NC-ND 2.0** | 193 KB | ⚠ **Riesgo comercial**. Ver §2.5 |
| faceLandmark68Net (actual) | MIT | pesos de yinguobing, datasets públicos mezclados, **procedencia no declarada** | 357 KB | ⚠ Procedencia no auditable |
| **MediaPipe BlazeFace + FaceMesh** | Apache 2.0 | **Apache 2.0 declarado en el model card** de Google; datos de entrenamiento propios de Google | `face_landmarker.task` = **3 758 596 B** (3,58 MB), incluye detector + malla de 478 puntos + 52 blendshapes + matriz de transformación 4×4 | ✅ Licencia limpia, latencia BlazeFace 2,94 ms CPU / 7,41 ms GPU en Pixel 6 |
| YuNet (OpenCV Zoo) | Apache 2.0 | Apache 2.0, pero entrenado sobre WIDER FACE | 232 KB | Buen detector, misma duda de dataset, y sólo 5 puntos |

### 2.3 Embedding (reconocimiento)

**El criterio decisivo acá es la licencia, no la precisión**, porque casi
todos los modelos modernos de face recognition están entrenados sobre
datasets *research-only*.

| Modelo | Licencia código | Licencia pesos | Dim | LFW | ¿Comercial? |
|---|---|---|---|---|---|
| **dlib ResNet-34** (`dlib_face_recognition_resnet_model_v1`, el actual) | Boost | **Dominio público** — Davis King: *"anyone can do whatever they want with these model files as I've released them into the public domain"* | 128 | 99,38 % | ✅ **Sí, sin condiciones** |
| InsightFace ArcFace / `buffalo_l` / `antelopev2` | MIT | **Non-commercial research only**; licencia comercial aparte vía `recognition-oss-pack@insightface.ai` | 512 | 99,8 % | ❌ **No** |
| AdaFace | MIT | Pesos entrenados sobre MS1MV2 / WebFace4M → **research only** | 512 | 99,8 % | ❌ No |
| FaceNet (davidsandberg) | MIT | VGGFace2 / CASIA-WebFace → research only | 512 | 99,6 % | ❌ No |
| **SFace** (OpenCV Zoo, MobileFaceNet + SFace loss) | Apache 2.0 | **Apache 2.0 declarado por OpenCV**; entrenado sobre CASIA-WebFace | 128 | ~99,6 % | 🟡 Sí por licencia declarada, con duda sobre el dataset. **Sólo ONNX** |
| EdgeFace (Idiap) | — | Licencia en el portfolio *tecnológico* de Idiap → **licenciamiento comercial** | 512 | 99,73 % | ❌ No |

> **Conclusión de licencias:** el modelo que ya está en producción es
> **uno de los dos únicos candidatos sin ninguna restricción comercial**,
> y el único de los dos que ya está integrado, ya está en la base y no
> requiere un tercer runtime. Cambiarlo por ArcFace/AdaFace sería
> cambiar un problema técnico por un problema legal.

### 2.4 Anti-spoofing

| Opción | Licencia | Tamaño | Corta vídeo/pantalla |
|---|---|---|---|
| EAR / parpadeo (actual) | propio | 0 | ❌ |
| **Challenge-response de pose** (girar la cabeza al lado que se pide al azar) | propio | 0 | 🟡 Sube mucho el costo del ataque: hay que tener vídeo del compañero girando a los dos lados y elegirlo en < 1 s |
| **MiniFASNet V2** (Silent-Face-Anti-Spoofing, minivision-ai) | **Apache 2.0** | ~600 KB - 1,9 MB, entrada 80×80 | ✅ Textura/moiré. Sólo hay pesos PyTorch/ONNX → tercer runtime o conversión |
| FaceTec / iProov / AWS Rekognition Face Liveness | comercial | — | ✅ Certificado iBeta L1/L2 |

### 2.5 Nota honesta sobre licencias de datasets

Hay dos capas y conviene no mezclarlas:

1. **La licencia que el autor otorga sobre los pesos.** Es la que gobierna
   nuestra redistribución. TinyFaceDetector viene bajo MIT de face-api.js.
2. **La licencia del dataset con que se entrenó.** WIDER FACE es
   CC BY-NC-ND 2.0: *"released for academic research only… agree not to
   reproduce, duplicate, copy, sell, trade, resell or exploit for any
   commercial purposes"*.

Si la restricción del dataset "se propaga" a los pesos es una cuestión
legalmente **no resuelta** y varía por jurisdicción. La postura defendible
para un producto comercial es preferir, cuando existe alternativa
equivalente, modelos donde **el titular de los datos de entrenamiento es
también quien otorga la licencia de los pesos**. Ése es exactamente el
caso de MediaPipe (Google entrenó con datos propios y publica bajo
Apache 2.0) y del modelo de dlib (Davis King armó el dataset y lo liberó
al dominio público).

**Por eso el rediseño saca los dos modelos de procedencia dudosa
(TinyFaceDetector, faceLandmark68Net) y se queda con el único que no la
tiene (dlib).** No es un efecto colateral: es una de las razones de la
decisión.

---

## FASE 3 — DECISIÓN ARQUITECTÓNICA

### 3.1 La decisión

> **Arquitectura híbrida de dos capas: percepción en MediaPipe, identidad
> en TF.js. Una sola pasada de percepción por cuadro; el embedding sólo
> sobre cuadros elegidos.**

| Componente | Elección | Licencia | Tamaño | Frecuencia |
|---|---|---|---|---|
| Detección + landmarks + blendshapes + pose 3-D | **MediaPipe `FaceLandmarker`** (`face_landmarker.task`, VIDEO mode, delegado GPU) | Apache 2.0 | 3,58 MB modelo + 11,2 MB wasm | **Cada cuadro de vídeo** (rVFC, tope 15 fps) |
| Puerta de calidad | Código propio sobre los landmarks | — | 0 | Cada cuadro (JS puro, < 1 ms) |
| Alineamiento | Transformación de similitud propia → chip 150×150 | — | 0 | Sólo en cuadros que pasan la puerta |
| Embedding | **`faceRecognitionNet` de face-api** (ResNet-34 de dlib) sobre **TF.js**, en **Web Worker** | Dominio público | 6,44 MB | **3-5 veces por fichada**, nunca por cuadro |
| Liveness | Blendshapes (`eyeBlinkLeft/Right`) + challenge-response de pose 3-D | — | 0 | Sobre el flujo que ya existe |
| Backend TF.js | **WebGL → WASM+SIMD (binarios locales) → CPU**, con telemetría | Apache 2.0 | +2,5 MB de `.wasm` locales | — |

**Se elimina:** `tiny_face_detector_model` (193 KB) y
`face_landmark_68_model` (357 KB), con su exposición de licencia.

### 3.2 Qué se descartó y por qué

| Descartado | Motivo |
|---|---|
| ONNX Runtime Web como runtime principal | El único modelo de embedding con licencia limpia (dlib) no tiene export ONNX oficial. Traerlo obligaría a convertir a mano un modelo que hoy funciona, y a mantener un tercer runtime |
| ArcFace / AdaFace / InsightFace | **Non-commercial research only.** Bloqueante duro para un producto que se vende |
| EdgeFace | Licenciamiento comercial vía Idiap |
| SFace (ONNX) | Licencia OK, pero exigiría ONNX Runtime Web sólo para él, y obliga a re-enrolar a todos para ganar poco frente a dlib **bien alineado** |
| Sustituir TF.js por MediaPipe entero | MediaPipe no tiene tarea de face *recognition*. Hace falta el embedding igual |
| WebGPU por defecto | Cobertura real en Chrome Android ≥ 121 **y** Android 12+ **y** GPU Qualcomm/ARM. El backend WebGPU de TF.js tiene huecos de operadores en Mali. Se detecta, se mide y se registra; no se activa a ciegas |
| Mandar la imagen al servidor y calcular el embedding ahí | Multiplica la biometría que viaja, rompe el funcionamiento offline y necesita un runtime de ML en el borde de Supabase. Contradice el requisito de inferencia local |
| Cambiar la dimensión del descriptor (128 → 512) | Obliga a migrar `empleados.descriptor_facial`, reescribir `distancia_descriptores` y **re-enrolar a toda la plantilla**, a cambio de una ganancia que el alineamiento correcto da gratis |

### 3.3 Por qué se conserva el modelo de embedding

No es conservadurismo. Es que el modelo **no es el problema medido**:

- El problema es que se lo alimenta **sin alinear** (R-07), con una
  **referencia de enrolamiento de un cuadro sin control** (R-11), y se
  decide con **un cuadro arbitrario** (R-04) contra un **umbral de README**
  (R-08).
- Corregir esas cuatro cosas no cuesta ni una licencia ni un megabyte.
- Y si después de corregirlas la medición dice que el techo del modelo
  molesta, el reemplazo comercialmente seguro está identificado (SFace,
  Apache 2.0, también 128-D) y el cambio queda acotado a un módulo.

### 3.4 Pipeline objetivo

```
getUserMedia (1280×720 ideal, frameRate 30, facingMode user)
  │  ← se lee y se registra la resolución REAL de track.getSettings()
  ▼
requestVideoFrameCallback ──────────────────────────────┐
  ▼                                                     │
FaceLandmarker.detectForVideo()   [GPU, 5-15 ms]        │
  │  478 landmarks + 52 blendshapes + matriz 4×4        │
  ▼                                                     │
¿cuántas caras?                                         │
  0 → "Buscando rostro"        ──────────────────────►  │
  2+ → "Que quede una sola persona" ─────────────────►  │
  1 ▼                                                   │
PUERTA DE CALIDAD  (JS puro, < 1 ms)                    │
  ├ tamaño        distancia interocular / ancho         │
  ├ encuadre      centro dentro del óvalo               │
  ├ pose          |yaw|<20° |pitch|<20° |roll|<15°      │
  ├ ojos          eyeBlink < 0,5 en ambos               │
  ├ brillo        luma media del recorte ∈ [55,205]     │
  ├ contraste     desvío estándar de luma > 25          │
  ├ nitidez       varianza del laplaciano sobre 96×96   │
  └ estabilidad   desplazamiento entre cuadros < 2 %    │
  ▼  score 0..1  + motivo del rechazo → mensaje de UX ──┘
CONFIRMACIÓN TEMPORAL: 3 cuadros consecutivos con score ≥ 0,55
  ▼
ALINEAMIENTO  (canvas 2D setTransform, similitud) → chip 150×150
  ▼
EMBEDDING  (Worker, TF.js) [20-60 ms WebGL]  ← máx. 5 por fichada
  ▼
BÚFER DE PLANTILLAS: se guardan los K=3 mejores por score
  ▼
LIVENESS
  ├ pasivo: parpadeo real vía blendshapes (ciclo completo)
  └ activo: si el riesgo lo pide, giro de cabeza al lado sorteado
  ▼
RPC fichar_con_rostro(descriptor)   ← sin cambios de contrato
  ▼
FICHAJE
```

### 3.5 Presupuesto de cómputo (objetivo)

| Etapa | Frecuencia | Costo esperado tablet | Costo/segundo |
|---|---|---|---|
| `detectForVideo` | 15 fps | 8-20 ms | 120-300 ms/s |
| Puerta de calidad | 15 fps | < 1 ms | < 15 ms/s |
| Alineamiento | ~3 fps | ~1 ms | ~3 ms/s |
| Embedding (Worker) | ≤ 5 por fichada | 20-60 ms | fuera del main thread |
| **Main thread** | | | **< 35 % de ocupación** |

Contra el estado actual, donde un cuadro de liveness fallido cuesta hasta
**3 inferencias completas del detector** en el main thread.

### 3.6 Cómo se calibra el umbral (no se elige)

1. **Instrumento:** RPC `medir_distancia_facial(p_descriptor)`, sólo para
   `admin_rrhh`, que devuelve la distancia al enrolado **sin fichar**, y
   una herramienta de banco que la llama en lote.
2. **Protocolo:** ≥ 10 personas × ≥ 5 condiciones (frontal buena luz,
   contraluz, poca luz, con anteojos, ángulo ±20°) **en la tablet de
   producción**, más las distancias cruzadas contra los demás enrolados.
3. **Salidas:** distribución de distancias *genuinas* (misma persona) y
   *impostoras* (personas distintas). De ahí salen la curva DET, el EER, y
   el umbral que cumple el objetivo operativo.
4. **Objetivo operativo del producto** (no de laboratorio):
   - 1:1 (celular): **FRR ≤ 3 % con FAR ≤ 0,1 %**
   - 1:N (tablet): **FRR ≤ 5 % con FAR ≤ 0,01 %** y margen al segundo
     candidato ≥ 3 desvíos de la distribución genuina.
5. El umbral queda **en una sola fuente** (SQL), versionado, con la fecha
   y el N de la calibración que lo justificó.

### 3.7 Nivel de liveness propuesto (y lo que no es)

Para un control horario de empresa el modelo de amenaza es **el compañero
que ficha por otro**, no un atacante financiado.

- **Nivel 1 (siempre):** parpadeo verificado con blendshapes + coherencia
  temporal + rechazo de cuadros congelados (si N cuadros son idénticos,
  es un vídeo pausado o una foto).
- **Nivel 2 (kiosco):** challenge-response de pose — se sortea "mirá a la
  izquierda" o "mirá a la derecha" y se verifica con la matriz de
  transformación 3-D, con ventana de tiempo. Un vídeo pregrabado no
  responde a un pedido sorteado en el momento.
- **Nivel 3 (no se implementa ahora, se documenta):** anti-spoofing por
  textura (MiniFASNet, Apache 2.0) o SDK certificado iBeta. Se deja
  identificado con su costo.

**Lo que NO se va a afirmar:** que el sistema resiste un deepfake en vivo
o una máscara. No lo resiste, y el producto no debe decir que sí.

### 3.8 Lo que no se toca (seguridad ya cerrada)

El rediseño es **estrictamente del lado del cliente y del pipeline de
visión**. El contrato con el servidor no cambia:

- `fichar_con_rostro(p_descriptor, p_empleado_id, p_lat, p_lng, p_tipo,
  p_terminal_id, p_terminal_secreto)` — **misma firma**.
- F-01 (gestor + terminal vinculada en 1:N), secreto de terminal, RLS,
  `SECURITY DEFINER`, actor del fichaje, auditoría, separación 1:1 / 1:N,
  `empleados_lectura` sin `descriptor_facial` (F-02): **intactos**.
- El descriptor sigue siendo lo único biométrico que viaja. **No se
  guardan fotografías** en ningún momento del rediseño, ni en
  enrolamiento ni en fichaje.
- El enrolamiento multi-muestra **promedia en el cliente** y manda **un
  solo descriptor** — no se agranda la superficie de datos biométricos en
  la base.

---

---

## FASE 4 — IMPLEMENTACIÓN

### 4.1 Mapa de archivos

| Archivo | Qué hace | Estado |
|---|---|---|
| `lib/facial/geometria.ts` | Puntos de referencia, pose y **transformación de similitud** | nuevo |
| `lib/facial/alineamiento.ts` | Recorte canónico 150×150 con canvas, lienzo reutilizado | nuevo |
| `lib/facial/calidad.ts` | Puerta de calidad en dos etapas + métricas de imagen | nuevo |
| `lib/facial/percepcion.ts` | MediaPipe FaceLandmarker: carga, delegado GPU→CPU, `detectForVideo` | nuevo |
| `lib/facial/embedding.nucleo.ts` | dlib sobre TF.js: cadena de backends, carga, inferencia | nuevo |
| `lib/facial/embedding.worker.ts` | Worker que corre el núcleo | nuevo |
| `lib/facial/embedding.ts` | Cliente worker-primero con red de contención; ejecutor compartido | nuevo |
| `lib/facial/motor.ts` | Bucle por cuadro, máquina de estados, búfer de plantillas | nuevo |
| `lib/facial/plantilla.ts` | Promediado, dispersión, selección de mejores, umbrales | nuevo |
| `lib/facial/camara.ts` | Apertura de cámara y lectura de la configuración **real** | nuevo |
| `lib/facial/diagnostico.ts` | Sonda de dispositivo y activación del modo diagnóstico | nuevo |
| `lib/facial/banco.ts` | FRR/FAR, curva, EER, separación d′ | nuevo |
| `lib/facial/liveness.ts` | Parpadeo por blendshapes, desafío de pose, cámara trabada | reescrito |
| `lib/facial/reconocimiento.ts` | — | **eliminado** |
| `components/app/facial/CapturaFacial.tsx` | Cámara + UI en vivo, sin botón de captura | reescrito |
| `components/app/facial/PanelDiagnostico.tsx` | Panel de métricas (`?diag=1`) | nuevo |
| `components/app/facial/EnrolamientoFacial.tsx` | Enrolamiento de 5 muestras + control de dispersión | modificado |
| `components/app/facial/FichajeFacialModal.tsx` | Exigencia por modo, reintento sin recargar, hora del servidor | modificado |
| `app/app/diagnostico-facial/page.tsx` | Banco de pruebas (superadmin, ruta no enlazada) | nuevo |
| `scripts/copiar-modelos-faciales.mjs` | Prepara `public/facial` | reescrito |

### 4.2 Lo que se eliminó

- `tiny_face_detector_model` (193 KB) y `face_landmark_68_model` (357 KB) — y con
  ellos la exposición a la licencia **CC BY-NC-ND** de WIDER FACE.
- La escalera de pasadas 320/512/608 (R-02).
- El bucle `while` con `setTimeout` (R-03).
- `mejorCoincidencia`, con su bug del segundo candidato (R-09) — era código
  muerto: el match vive en SQL.
- El botón "Capturar" y el flujo de cuadro único arbitrario (R-04).

### 4.3 Dos defectos encontrados durante la implementación

Ninguno de los dos habría aparecido sin ejecutar el código:

**El Worker nunca arrancaba.** La detección del entorno de face-api preguntaba
por `typeof window === 'undefined'`. En el bundle que webpack arma para el
Worker **`window` está definido igual**, así que el chequeo daba falso, no se
armaba el entorno, `loadFromUri` moría con *"getEnv - environment is not
defined"* y el ejecutor caía siempre al hilo principal — es decir, la
protección contra el congelamiento de la pantalla no existía, y nada lo decía.
Se cambió por la condición real: intentar `getEnv()` y armar el entorno si
lanza. **Medido antes y después: 1000 ms → 33 ms por descriptor.**

**El desafío de pose no se podía completar.** `atenderDesafio` preguntaba por
la prueba de vida entera, y `evaluarLiveness` chequea el parpadeo **antes** que
el giro: mientras la persona no hubiera parpadeado, el desafío nunca se daba
por cumplido y cada cuatro segundos se sorteaba otro lado. Ahora pregunta sólo
por el giro; el parpadeo se verifica al cerrar, que es donde corresponde.

### 4.4 Ciclo de vida (corrección de kiosco)

Los modelos son **singletons de la pestaña**, no de la pantalla. Cerrar el
modal detiene el bucle pero **no** destruye nada; se sueltan al desmontar la
app (cerrar sesión). Motivos:

- Levantar todo cuesta ~1 s entre pesos y compilación de shaders, y en el
  kiosco la pantalla se abre y se cierra decenas de veces por turno.
- Cada apertura creaba un contexto WebGL más. Chrome tiene un tope por
  pestaña; al cruzarlo mata los más viejos y el fichaje "deja de andar".
- Había una carrera: una pantalla cerrándose se llevaba puesto el modelo que
  otra acababa de pedir, dejando un `FaceLandmarker` cerrado que devolvía
  `null` para siempre.

---

## FASE 5 — BENCHMARK

### 5.1 Medición en escritorio (Chromium 148, Apple M1, ANGLE Metal)

Ejecutada contra el pipeline real, con dos instancias concurrentes (React
StrictMode) — es decir, **peor caso** respecto de una sola sesión.

| Métrica | Medido |
|---|---|
| Carga de MediaPipe + inicialización | **109-149 ms**, delegado **GPU** |
| Carga de dlib + selección de backend | **169-301 ms**, backend **webgl** |
| Calentamiento (incluye compilar shaders) | **305-884 ms** |
| Descriptor, 12 inferencias seguidas | **min 23 · p50 33 · max 44 ms** |
| Descriptor en hilo principal (antes del arreglo del Worker) | **~1000 ms** |
| Inicialización del backend WASM desde `/facial/tfjs-wasm` | **49 ms**, `getBackend() === 'wasm'` |
| Determinismo (mismo recorte → mismo descriptor) | ✅ |
| Todos los assets desde el mismo origen | ✅ 200 OK, sin CDN |

El calentamiento explica por sí solo el viejo síntoma de "la primera vez nunca
anda": sin él, la primera persona del día pagaba ~600 ms de compilación de
shaders dentro de su fichada.

### 5.2 Qué falta medir, y es lo importante

**Todo lo anterior es escritorio y no decide nada.** Lo que decide es la
tablet. El instrumento está hecho: `/app/diagnostico-facial`, sólo superadmin,
ruta no enlazada.

Protocolo en cada Samsung:

1. Abrir `/app/diagnostico-facial` **en la tablet**.
2. Anotar el bloque "Dispositivo" — es la primera vez que va a haber un modelo
   concreto y una cadena de GPU en lugar de "una Samsung".
3. Verificar que el bloque "Pipeline" diga `GPU` y `webgl`. Si dice `CPU` o
   `wasm`, ése es el problema de esa tablet y ya está identificado.
4. Tomar ≥ 5 muestras por persona cambiando la condición, con ≥ 10 personas.
5. Copiar el informe y pegarlo en este documento.

### 5.3 Criterios de éxito (medibles)

| Métrica | Objetivo | Cómo se mide |
|---|---|---|
| Delegado de percepción | GPU en ambas tablets | panel de diagnóstico |
| Latencia de percepción | ≤ 25 ms p50 | panel |
| Latencia de descriptor | ≤ 120 ms p50 | panel |
| FPS del bucle | ≥ 12 | panel |
| Cold start (cache fría) | ≤ 8 s | panel, `msCarga` |
| Warm start (cache tibia) | ≤ 1,5 s | panel |
| Tiempo hasta el fichaje, persona cooperativa | ≤ 3 s | cronómetro |
| Separación d′ | **≥ 3,0** | banco |
| FRR 1:1 con FAR ≤ 0,1 % | ≤ 3 % | banco |
| FRR 1:N con FAR ≤ 0,01 % | ≤ 5 % | banco |
| Estabilidad 8 h | sin caída de FPS > 30 % ni recarga de pestaña | panel al final del turno |

**d′ es la métrica de comparación entre implementaciones**, porque no depende
del umbral. Si al comparar dos pipelines d′ no sube, no hubo mejora: hubo un
cambio de punto de operación.

---

## FASE 6 — HARDENING, RIESGOS Y VEREDICTO

### 6.1 Tests agregados

`npx jest --ci` → **46 suites / 526 tests PASS** (antes: 45 / 442).

| Suite | Cubre |
|---|---|
| `geometriaFacial.test.ts` (13) | Que el alineamiento sea **de verdad** una similitud: misma cara rotada, escalada y corrida ⇒ **el mismo recorte**; ojos nivelados; escala invariante a la distancia; signo del yaw |
| `calidadFacial.test.ts` (26) | Motivo correcto por cada rechazo; prioridad geometría > fotometría; nitidez invariante a la iluminación; puntaje = mínimo, no promedio |
| `liveness.test.ts` (24) | Ciclo completo de parpadeo; foto con ojos cerrados; desafío al lado contrario; empezar ya girado; cámara trabada |
| `plantillaFacial.test.ts` (13) | El promedio se acerca al valor real más que la muestra típica; dispersión = máximo entre pares |
| `bancoFacial.test.ts` (14) | FRR/FAR en la dirección correcta; monotonía; `umbralParaFar` devuelve el más alto |

Suites eliminadas: `reconocimientoFacial.test.ts` y `deteccionFacial.test.ts`
—probaban módulos que ya no existen.

### 6.2 Verificación de integración ejecutada

Con una ruta temporal contra el pipeline real, ya borrada:

- ✅ MediaPipe carga desde `/facial/mediapipe` y elige delegado GPU.
- ✅ dlib carga desde `/facial/dlib`, backend `webgl`.
- ✅ El Worker arranca y devuelve 128 números.
- ✅ El escalón WASM del fallback inicializa desde `/facial/tfjs-wasm`.
- ✅ Todos los assets, 200 desde el mismo origen. Ningún CDN.
- ✅ `npm run build` compila; `next lint` limpio; `tsc --noEmit` limpio.

### 6.3 Hallazgo de privacidad

**MediaPipe intenta enviar telemetría a `https://odml.pa.googleapis.com/v1/log`.**
La CSP la bloquea (`connect-src 'self' …`) y **el pipeline sigue funcionando**;
queda un error en la consola. Son métricas de uso del runtime, no imágenes ni
descriptores — pero conviene tenerlo escrito: un módulo biométrico que intenta
hablar con un tercero es exactamente el tipo de cosa que hay que declarar. La
CSP existente ya es el control correcto y no hay que aflojarla.

### 6.4 Lo que NO se tocó (seguridad ya cerrada)

Verificado por lectura: el rediseño es **estrictamente cliente + visión**.
`fichar_con_rostro` conserva su firma; F-01 (gestor + terminal vinculada en
1:N), secreto de terminal, RLS, `SECURITY DEFINER`, actor del fichaje,
auditoría, separación 1:1 / 1:N y `empleados_lectura` sin `descriptor_facial`
(F-02) siguen exactamente igual. **Cero migraciones de SQL en este trabajo.**

Minimización: no se materializa ninguna imagen en ningún punto; el enrolamiento
promedia en el cliente y manda **un** vector, no cinco; el panel de diagnóstico
no muestra descriptores ni imágenes.

### 6.5 Problemas conocidos

| # | Problema | Impacto |
|---|---|---|
| K-1 | **Los enrolados actuales quedan obsoletos.** Se calcularon sin alinear; los nuevos se calculan alineados. Son distribuciones distintas | **Hay que re-enrolar a toda la plantilla.** No es opcional |
| K-2 | Los umbrales de SQL (0,6 / 0,5) siguen siendo los viejos y ahora corresponden a otra distribución | Recalibrar con el banco **antes** de producción |
| K-3 | `+22 MB` de assets en el primer arranque (≈8 MB con brotli) | Cold start más largo la primera vez; después, cache inmutable |
| K-4 | Los umbrales de `yaw`/`pitch`/`nitidez` son índices sin unidad, con valores de partida no calibrados en tablet | Ajustar con el panel de diagnóstico |
| K-5 | El desafío de pose agrega ~2-4 s al fichaje de kiosco | Es el precio de cortar el ataque por vídeo. Configurable por modo |
| K-6 | `distancia_descriptores` sigue parseando JSON por empleado (R-10) | No se tocó: es servidor. Con miles de empleados hará falta `pgvector` |
| K-7 | Telemetría de MediaPipe bloqueada por CSP deja ruido en consola | Cosmético |

### 6.6 Riesgos residuales

1. **Vídeo con los dos giros grabados.** El desafío encarece mucho el ataque
   pero no lo hace imposible. Cerrarlo requiere anti-spoofing por textura
   (MiniFASNet, Apache 2.0) o un SDK certificado iBeta.
2. **Máscara o deepfake en vivo.** No se resiste, y el producto no debe decir
   que sí.
3. **El descriptor lo calcula el cliente.** Un cliente modificado puede enviar
   uno inventado. Irreducible sin mover el embedding al servidor. Se compensa
   con terminal vinculada + plantilla no exportable.
4. **GPS no es prueba de presencia.** Ya documentado en la auditoría de fichaje.
5. **Sin medición en hardware real todavía.** Es el riesgo más grande que
   queda abierto, y es el único que no puedo cerrar desde acá.

### 6.7 Veredicto

**¿Pondría esta arquitectura en producción para un sistema de fichaje
empresarial?**

**Sí, la arquitectura. Todavía no este despliegue.**

La arquitectura la defiendo técnicamente:

- El modelo de identidad es el único de calidad con licencia **sin ninguna
  restricción comercial**, y ahora se lo alimenta como fue entrenado —
  alineado — que era el defecto de fondo.
- La percepción es el runtime que Google usa en Android nativo, Apache 2.0,
  con datos de entrenamiento propios: se fue el único modelo del stack con
  licencia no comercial.
- El costo caro corre en un Worker, con una cadena de backends real y con
  telemetría que dice cuál está funcionando.
- Cada decisión que antes era implícita —qué cuadro, qué calidad, cuántas
  muestras, qué umbral— es hoy explícita, medida y testeada.
- Nada de esto tocó la seguridad ya cerrada.

Lo que falta para que el **despliegue** sea GO, y no es negociable:

1. Correr `/app/diagnostico-facial` en las dos Samsung y pegar los resultados
   acá.
2. Calibrar los umbrales con ≥ 10 personas × ≥ 5 condiciones, y actualizar la
   migración de SQL con la fecha y el N de esa medición.
3. **Re-enrolar a toda la plantilla** (K-1).
4. Ocho horas de kiosco continuas verificando que no se degrade.

Hasta que eso esté hecho el estado es 🟡 **GO CONDICIONADO**: el diseño está
cerrado y defendido, la medición en el hardware objetivo no.

---

## Estado

- FASE 1 — auditoría: **cerrada**.
- FASE 2 — investigación: **cerrada**.
- FASE 3 — decisión: **cerrada**.
- FASE 4 — implementación: **cerrada**.
- FASE 5 — benchmark: **escritorio cerrado; hardware real pendiente de las
  tablets** (el instrumento está listo).
- FASE 6 — hardening: **cerrada en lo que no depende del hardware**.
