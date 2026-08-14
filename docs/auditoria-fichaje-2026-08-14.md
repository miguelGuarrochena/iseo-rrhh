# Auditoría profunda del módulo de Fichaje — 2026-08-14

**Alcance:** FASE A (auditoría sin modificar código) y FASE B (hallazgos priorizados).
**Estado del repo:** rama `main`, working tree limpio, último commit `f1f69ea`.
**Nada de este documento modifica código.** No hay commit ni push.

---

## 0. Qué se auditó

| Área | Archivos |
|---|---|
| UI fichaje | `src/app/app/fichaje/page.tsx`, `components/app/fichaje/{ModoKiosco,ActivarKioscoModal,HistorialFichadas,FiltrosFichadasModal,PinPad}.tsx` |
| UI facial | `components/app/facial/{CapturaFacial,FichajeFacialModal,FichajeManualModal,EnrolamientoFacial,AvisoBateria}.tsx` |
| Lógica facial | `lib/facial/{reconocimiento,liveness,ubicacion}.ts` |
| Kiosco / terminal | `lib/kiosco.ts`, `lib/terminal.ts` |
| Jornadas / turnos | `lib/fichadas.ts`, `lib/turnos.ts`, `lib/exportarFichadas.ts` |
| Servicios | `lib/services/supabase/real.ts` (bloque Fichajes / Jornadas), `lib/services/rrhh.ts` |
| SQL | migraciones 01, 08, 09, 10, 23, 24, 35, 46, 47, 48, 49, 51, 63, 66, 67, 69, **73** |
| Tests | `src/tests/{fichaje,fichadas,turnos,kiosco,liveness,reconocimientoFacial}.test.ts`, `supabase/tests/rpc.test.sql`, `supabase/tests/concurrencia_fichaje.sh`, `e2e/*.spec.ts` |

**Baseline ejecutado:** `npx jest --ci` → **40 suites / 442 tests PASS** (5,1 s).
**No ejecutado:** los tests SQL y el script de concurrencia — no hay contenedor `supabase_db` corriendo en esta máquina (`docker ps` vacío). Los hallazgos SQL son por lectura de código, no por ejecución.

---

## 1. Mapa de arquitectura real (flujo completo)

```
┌─ TABLET / CELULAR (navegador) ───────────────────────────────────────────┐
│                                                                          │
│  ModoKiosco.tsx            FichajePage (PanelFichajePropio)              │
│   └ localStorage:           └ getTerminalLocal() → localStorage          │
│     iseo_kiosco_activo         iseo_terminal_id                          │
│     iseo_kiosco_pin (sha256)                                             │
│     iseo_kiosco_empresa      ← toda la puerta del kiosco es CLIENTE      │
│                                                                          │
│              ▼ FichajeFacialModal (modo = identificar | verificar)       │
│                                                                          │
│  CapturaFacial.tsx                                                       │
│   ├ getUserMedia({facingMode:'user', 640x480})                           │
│   ├ liveness: bucle 4 s / 180 ms → detectarRostro() por cuadro           │
│   │   ⚠ cada cuadro corre detector + landmarks + **descriptor 6,4 MB**   │
│   ├ detectarRostro(): 3 pasadas 320/512/608, TinyFaceDetector            │
│   └ canvas.toDataURL('image/jpeg') ← se genera una FOTO y se descarta    │
│                                                                          │
│              ▼ descriptor: number[128] + {lat,lng} de navigator.geo      │
└──────────────────────────────────────────────────────────────────────────┘
                               │  supabase-js .rpc()
                               ▼
┌─ POSTGRES ───────────────────────────────────────────────────────────────┐
│ fichar_con_rostro(p_descriptor, p_metodo, p_empleado_id, p_lat,          │
│                   p_lng, p_tipo)   SECURITY DEFINER                      │
│  1. v_empresa := auth_empresa()          ← NULL para superadmin          │
│  2. si p_empleado_id ≠ null → exige = auth_empleado()  (FIC-002 ✓)       │
│     si p_empleado_id = null → **sin ninguna restricción de actor** ✗     │
│  3. match: distancia_descriptores() sobre empleados activos del tenant   │
│  4. umbral 0.5 (1:N) / 0.6 (1:1); margen 0.05 sólo en 1:N                │
│  5. antirreplay: md5(descriptor::text) en fichajes_descriptor_usado      │
│  6. geocerca: empresas.config->'geocerca'  ← **clave que nadie escribe** │
│  7. pg_advisory_xact_lock(hash(empleado))          (FIC-004 ✓)           │
│  8. tipo := alterna según última marca **del día calendario local**  ✗   │
│  9. set_config('app.fichaje_validado','si', local)                       │
│ 10. INSERT INTO fichajes (... clock_timestamp() ...)                     │
│                                                                          │
│ TRIGGERS BEFORE INSERT (orden alfabético):                               │
│  a) exigir_fichaje_facial_validado  → confianza/fuera_de_zona sólo RPC ✓ │
│  b) trg_imponer_actor_fichaje       → 3ros ⇒ metodo=manual + auditoría ✓ │
│  c) trg_lock_fichaje_ts_empleado    → empleado ⇒ ts=clock_timestamp() ✓  │
│                                                                          │
│ RLS fichajes: SELECT (propio | gestor del tenant | superadmin)           │
│               INSERT (propio | gestor del tenant | superadmin)           │
│               UPDATE / DELETE → **sin policy = imposible por PostgREST** │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─ LECTURA / LIQUIDACIÓN ──────────────────────────────────────────────────┐
│ marcas_numeradas() → jornadas_de_empresa() → getJornadas()               │
│   agrupa por SESIÓN (corte 6 h), fecha = día del ingreso, zona_empresa() │
│ fichajes_del_periodo() → getFichajesPagina() (paginado server-side)      │
│ armarResumen() [TS] → HistorialFichadas → descargarResumenFichadas .xlsx │
│ controlDeJornadas() [TS] → getResumenControl / getMiMes / horas extras   │
│                                                                          │
│ ⚠ Toda la capa TS calcula día y hora con **el huso del navegador**;      │
│   toda la capa SQL con **zona_empresa()**. Dos definiciones de "día".    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Puntos donde hoy se confía en el cliente

| # | Dato / regla | Quién lo afirma hoy | Debería |
|---|---|---|---|
| C1 | Que hay una persona viva frente a la cámara | Cliente (liveness JS) | Sin solución gratuita completa; hay mitigaciones |
| C2 | Que el descriptor salió de una cámara y no de un `fetch` | Cliente | Idem (ver §4) |
| C3 | `p_metodo` (`facial_tablet` / `celular` / `remoto` / `manual`) | Cliente | Derivarlo en servidor |
| C4 | Que el dispositivo es una terminal autorizada | `localStorage.iseo_terminal_id` | Vínculo servidor↔terminal |
| C5 | Que el modo planta está activo | `localStorage.iseo_kiosco_activo` | Idem |
| C6 | Que `empleados.modo_fichaje = 'planta'` se respeta | Sólo la UI lo oculta | Validar en RPC |
| C7 | Que el `ts` manual no es futuro / absurdo | Sólo `FichajeManualModal` | CHECK + validación en trigger |
| C8 | Coordenadas GPS | Cliente (irreducible) | Documentar limitación |
| C9 | Qué empresa está operando (superadmin) | `empresaOperativaId()` en el store | El RPC ya usa `auth_empresa()` — pero rompe (§F-06) |

---

## 2. FASE B — Hallazgos priorizados

### 🔴 P0 — Crítico

---

#### **F-01 · El path 1:N no exige NINGÚN actor: cualquier empleado autenticado puede fichar por cualquier otro**

**Dónde:** `20260813000073_fichaje_bloque1.sql:180-186`

```sql
if p_empleado_id is not null then
  if auth_empleado() is null or auth_empleado() is distinct from p_empleado_id then
    raise exception 'Solo podés fichar por vos.';
  end if;
end if;
-- ← si p_empleado_id ES null, no hay ninguna comprobación
```

FIC-002 cerró el 1:1 pero dejó abierto el 1:N. Cualquier usuario `authenticated` del tenant —incluido un empleado raso, desde su celular, sin cámara— puede:

```
POST /rest/v1/rpc/fichar_con_rostro
{ "p_descriptor": [...128 floats...], "p_empleado_id": null, "p_metodo": "facial_tablet" }
```

y el servidor fichará **a quien matchee ese descriptor**, con `metodo='facial_tablet'` y `confianza≈0.97`. El trigger `imponer_actor_fichaje` **no interviene** (el RPC setea `app.fichaje_validado='si'` y sale por el `return new` temprano), así que la marca no queda como `manual` ni genera auditoría: en la planilla que va a liquidación figura como un fichaje facial legítimo en la terminal.

**Impacto:** buddy punching indetectable + adulteración de la evidencia. Es el peor hallazgo del módulo para un sistema cuyos datos van a liquidación.

**Test que lo probaría:** falta. `rpc.test.sql:412-425` prueba el 1:N *con JWT de gestor* y lo da por bueno; nunca prueba 1:N con JWT de empleado.

---

#### **F-02 · Un empleado puede leer su propio `descriptor_facial` → fichar sin cámara, desde cualquier lugar, para siempre**

**Dónde:** `20260810000066_empleados_pii_redaction.sql:18-34` + vista `empleados_lectura`

```sql
puede_ver_datos_sensibles_empleado(p_empleado_id) :=
  es_superadmin() or auth_rol()='admin_rrhh'
  or (auth_empleado() = p_empleado_id)   -- ← el titular
```

El descriptor es el **secreto de autenticación** del fichaje facial. Entregárselo al titular equivale a darle su propia contraseña en texto plano: baja `descriptor_facial`, le suma `1e-9` a un float (esquiva el antirreplay de `md5`), y ficha desde su casa a las 8:00 con un `cron`. Sin cámara, sin liveness, sin presencia.

Peor: `admin_rrhh` puede exfiltrar **todos** los templates del tenant y, combinado con **F-01**, fabricar asistencia de cualquiera con apariencia de fichaje facial válido.

**Nota legal:** también es un problema de privacidad — un dato biométrico que sale del servidor y queda en el `localStorage`/red de un dispositivo personal.

**Contradice** el comentario de la migración 49: *"los rostros enrolados nunca cruzan la red"*. Hoy sí cruzan.

**Atenuante parcial:** `getDescriptoresFaciales()` (`real.ts:1990`) es código muerto — la app ya no lo usa. Pero la exposición REST sigue viva.

---

#### **F-03 · Turno nocturno: el egreso después de medianoche se registra como INGRESO**

**Dónde:** `20260813000073_fichaje_bloque1.sql:255-274`

```sql
v_inicio_dia := ((now() at time zone zona_empresa())::date)::timestamp
                at time zone zona_empresa();
select f.tipo into v_ultimo from fichajes f
 where f.empleado_id = v_mejor.id
   and f.ts >= v_inicio_dia          -- ← sólo el día calendario local
 order by f.ts desc, f.id desc limit 1;
v_tipo := case when v_ultimo = 'ingreso' then 'egreso' else 'ingreso' end;
```

Escenario real (turno 22:00–06:00, el que la migración 47 dice explícitamente que hay que soportar):

| Momento | `v_inicio_dia` | Última marca del día | `v_tipo` resultante | Correcto |
|---|---|---|---|---|
| Lun 22:00 | Lun 00:00 ART | ninguna | `ingreso` | ✓ |
| Mar 06:00 | **Mar 00:00 ART** | ninguna (la de 22:00 quedó fuera) | **`ingreso`** | ✗ debía ser `egreso` |

Consecuencia en cadena, porque `marcas_numeradas()` agrupa bien pero recibe datos mal tipados:

- La jornada del lunes queda `ingreso, ingreso` → `ultimo_tipo <> 'egreso'` → **`cerrada = false` para siempre**.
- `entrada` = 22:00, `salida` = NULL → **`horas = 0`**.
- En el Excel de liquidación: turno noche = 0 horas, todos los días.
- En `getResumenControl`: `jornadasIncompletas` crece sin razón.

**FIC-003 arregló el huso pero no el modelo.** El corte correcto no es el día calendario sino la **sesión** (`corte_jornada()` = 6 h), que es exactamente la regla que ya usa `marcas_numeradas()`. Hoy hay dos definiciones distintas de "jornada" en la misma base.

**Regla correcta y coherente con el resto:**
```
última marca (sin filtro de día)
  · es 'ingreso' y (now() - ts) <  corte_jornada()  →  egreso
  · es 'ingreso' y (now() - ts) >= corte_jornada()  →  ingreso (sesión nueva; la anterior queda abierta)
  · es 'egreso'  o no hay                            →  ingreso
```

---

#### **F-04 · La geocerca configurada no es la que se evalúa: el control de zona está muerto en producción**

**Dónde:** RPC lee `empresas.config->'geocerca'`; el producto escribe `empleados.geocerca`.

- `FormEmpleado.tsx:712-727` → guarda `{lat, lng, radioM}` en **`empleados.geocerca`** (migración 09).
- `fichar_con_rostro` (`:239-249`) → lee **`empresas.config->'geocerca'`**.
- `ConfigEmpresa` (`types/rrhh.ts:61-158`) **no tiene** campo `geocerca`; ninguna pantalla lo escribe.

Resultado: `v_geocerca` es siempre `NULL` → `v_fuera` queda `NULL` → **`fuera_de_zona` nunca se calcula**. La badge "Fuera de zona" de `page.tsx:446` nunca se enciende, `jornadas.fueraDeZona` siempre falso, y la geocerca que RRHH configura por persona no tiene ningún efecto.

**Por qué los tests no lo detectan:** los fixtures escriben la clave a mano —`rpc.test.sql:30` y `concurrencia_fichaje.sh:50` insertan `config.geocerca`— así que el test verifica una configuración que en producción no existe. Es un test que valida el fixture, no el producto.

**Decisión de negocio pendiente:** ¿la geocerca es por empresa (una planta) o por empleado (obras, sucursales)? El código tiene las dos y no usa ninguna. No la invento.

---

#### **F-05 · El liveness calcula el descriptor facial completo en cada cuadro → en tablets Samsung no llega a juntar cuadros y rebota gente legítima**

**Dónde:** `CapturaFacial.tsx:143-175` + `reconocimiento.ts:128-173`

```ts
while (Date.now() < hasta) {              // 4000 ms
  const cuadro = await detectarRostro(video);   // ← detector + landmarks + DESCRIPTOR
  ...
  await new Promise(r => setTimeout(r, 180));
}
```

`detectarRostro` corre `.withFaceLandmarks().withFaceDescriptors()`. El descriptor sale de `face_recognition_model` (**6,4 MB**, ResNet-34), que es ~85 % del costo de inferencia. **Para medir el EAR sólo hacen falta los landmarks** (356 KB).

Y encima, cuando no detecta cara, la escalera de pasadas corre las **tres** (320 → 512 → 608) — o sea hasta 3 inferencias completas por cuadro, justo en el caso frecuente (poca luz, persona lejos).

Aritmética del fallo, con `CUADROS_MINIMOS = 6`:

| Dispositivo | ms por `detectarRostro` (estimado) | Cuadros en 4 s | ¿Pasa liveness? |
|---|---|---|---|
| Notebook, WebGL | ~60–120 | 15–25 | ✓ |
| Tablet Samsung gama media, WebGL | ~350–700 | 5–9 | **borderline** |
| Tablet con WebGL degradado → backend CPU | ~1500–4000 | **1–2** | **✗ nunca** |

Cuando no junta 6 cuadros, `evaluarLiveness` devuelve `pocos_cuadros` y la pantalla dice *"No llegamos a verte bien"* — un mensaje que manda a la persona a pararse mejor cuando el problema es que el dispositivo no da abasto. **Esta es, con alta probabilidad, la causa principal del "no funciona en las tablets".** El diagnóstico es de categoría **J (implementación) + A/B (hardware/navegador)**, no F ni H.

**Agravante:** no hay ninguna selección explícita de backend de TF.js ni fallback a WASM. `@vladmandic/face-api` resuelve `webgl → cpu`; el backend `wasm` no está registrado, así que un dispositivo sin WebGL utilizable cae a **CPU pura**, que es el peor de los mundos. No hay telemetría que diga en qué backend corrió.

---

### 🟠 P1 — Alto

---

#### **F-06 · Un superadmin no puede operar el kiosco: `auth_empresa()` es NULL**

`auth_empresa()` devuelve `usuarios.empresa_id`, que para `superadmin` es NULL. El RPC corta en `:171` con *"Sin empresa activa"*. La UI, en cambio, cree que sí puede: `ModoKiosco` guarda la empresa en `localStorage` y llama a `entrarAEmpresa()`, que sólo cambia el store del cliente. `kiosco.ts:116` incluso habilita explícitamente al superadmin a administrar la tablet.

Efecto: si ISEO deja una tablet configurada con su propia cuenta, **el fichaje falla siempre** y el mensaje no explica por qué.

---

#### **F-07 · `p_metodo` lo elige el cliente: el registro miente sobre cómo se fichó**

`p_metodo::metodo_fichaje` entra sin validación. Un empleado puede fichar desde el celular declarando `facial_tablet`, o declarar `manual` (lo que además hace que la marca aparezca en la UI con el ícono de carga a mano, `page.tsx:432-437`). Para un dato que se usa como evidencia, el "cómo" tiene que derivarlo el servidor: 1:N ⇒ `facial_tablet`; 1:1 ⇒ según `modo_fichaje` del empleado; `manual` sólo por el camino de insert directo.

---

#### **F-08 · `modo_fichaje = 'planta'` no se aplica en el servidor**

`PanelFichajePropio` (`page.tsx:77-90`) sólo *muestra* "Fichás en la terminal". El RPC no consulta `empleados.modo_fichaje`. Un empleado de planta ficha 1:1 desde su casa sin ningún obstáculo. Lo mismo con `pedirUbicacion` (`page.tsx:354`): quien está en modo `celular` puede simplemente no mandar coordenadas y el RPC acepta `p_lat/p_lng = null` sin marcar nada.

---

#### **F-09 · Nada acota `fichajes.ts`: un gestor puede cargar marcas en el futuro o en 1990**

No hay CHECK sobre `ts` ni validación en `imponer_actor_fichaje`. La única barrera (`FichajeManualModal.tsx:86`) es el cliente. Por REST, un `admin_rrhh` puede insertar `ts = '2030-01-01'`, y eso entra en jornadas, resumen y Excel.

---

#### **F-10 · Dos definiciones de "día" y de "hora": TS usa el huso del navegador, SQL usa `zona_empresa()`**

| Función | Huso |
|---|---|
| `zona_empresa()`, `jornadas_de_empresa`, `fichajes_del_periodo`, `fichar_con_rostro` | `America/Argentina/Buenos_Aires` fijo |
| `fichadas.ts` → `diaLocal`, `horaLocal` | navegador |
| `turnos.ts` → `horaLocalDe`, `fechaLocalDe`, `minutosDelISO` | navegador |
| `fechas.ts` → `hoyISO`, `aISOLocal`, `formatearHora` | navegador |
| `real.ts` → `inicioDeHoy()`, `rangoISO()`, `ultimaSemana()`, `getMiMes`, `getHorasExtrasDelPeriodo` | navegador |

Mientras el dispositivo esté en ART coinciden. Dejan de coincidir con: una tablet mal configurada (frecuente en equipos de planta que se resetean), alguien viajando, o un supervisor mirando el reporte desde otro país. En ese caso el Excel y la pantalla dicen cosas distintas sobre el mismo día, y las horas extras se calculan contra el reloj equivocado.

`jest.config.js:4` fuerza `TZ=America/Argentina/Buenos_Aires`, así que **ningún test puede detectar esta clase de bug**. Es correcto para reproducir producción, pero hace falta al menos una suite que corra en otro huso.

---

#### **F-11 · El kiosco es enteramente client-side y deja viva una sesión de gestor en una tablet compartida**

- `iseo_kiosco_activo`, `iseo_kiosco_pin`, `iseo_terminal_id` viven en `localStorage`. Cualquiera con acceso a la tablet (o un empleado en su propio teléfono) los escribe: **convertir un dispositivo personal en "terminal" es un `localStorage.setItem`**.
- El PIN se hashea sin salt ni iteraciones (`kiosco.ts:32-48`), con fallback **djb2** en contextos sin WebCrypto. Un PIN de 4 dígitos con SHA-256 sin salt es un espacio de 10 000 preimágenes: se rompe al instante si se lee el `localStorage`.
- El contador de intentos (`iseo_kiosco_intentos`) también está en `localStorage`: `removeItem` y se reinicia. El límite de 5 intentos es decorativo.
- Mientras el kiosco está activo, la **sesión de Supabase del gestor sigue viva** en ese dispositivo. Quien extraiga el token del `localStorage` tiene una sesión de RRHH: sueldos, legajos, CBU.
- No hay timeout de sesión, ni pantalla completa, ni bloqueo de orientación, ni recuperación explícita tras suspensión (sólo el `track.ended` de `CapturaFacial.tsx:103`).

---

#### **F-12 · No existe anulación de fichajes: la única corrección posible es no corregir**

`fichajes` no tiene policy de UPDATE ni DELETE (bien: nadie borra evidencia por PostgREST), pero **tampoco hay `anulado_en` / `anulado_por` / `motivo`**. Un fichaje cargado por error —o el duplicado de "toqué, falló la red, volví a tocar"— queda para siempre y arrastra la jornada, el resumen y el Excel. Hoy la única salida es un `UPDATE` con `service_role` desde la consola de Supabase, sin auditoría. Es exactamente lo que la FASE 10 pide evitar.

---

#### **F-13 · Enrolamiento de una sola muestra, un solo cuadro, sin control de calidad**

`EnrolamientoFacial.tsx:48-78` guarda **un** descriptor de **un** cuadro. No hay:
- score mínimo de detección (se acepta lo que salga de la pasada que enganche, incluso `scoreThreshold: 0.2`),
- chequeo de frontalidad, nitidez o iluminación,
- múltiples muestras (frontal / giros / expresiones),
- verificación de que el descriptor nuevo se parece razonablemente al anterior al re-enrolar.

Con una única referencia tomada con la luz de la oficina de RRHH y un umbral 1:1 de 0.6, el rechazo falso en la planta (otra luz, otra cámara, otro ángulo) es el comportamiento esperado, no una anomalía. **Es la segunda causa probable del "no reconoce" en tablets**, después de F-05.

---

### 🟡 P2 — Medio

| # | Hallazgo |
|---|---|
| **F-14** | `CapturaFacial.tsx:201-206` genera un **JPEG del rostro** (`canvas.toDataURL`) en cada captura. Ninguno de los dos consumidores lo usa. Se materializa una imagen biométrica sin necesidad — contradice el principio de minimización de la FASE 3. |
| **F-15** | Antirreplay sólo por `md5` exacto (`:227-236`): se esquiva con cualquier perturbación de un float. No es un defecto de diseño (el comentario lo dice), pero sí es una defensa que no debería contarse como control real. Sumado a F-02, no aporta nada contra el atacante realista. |
| **F-16** | `fichajes_descriptor_usado` crece sin retención: una fila por fichaje, para siempre. Con 300 personas × 4 marcas/día son ~440 k filas/año que sólo sirven para comparar contra el pasado inmediato. |
| **F-17** | Sin límite de tasa en `fichar_con_rostro`. Un cliente puede llamarlo en bucle; cada llamada hace un scan con `jsonb_array_elements` sobre todos los enrolados del tenant (~128 parseos de JSON por empleado). Es un DoS barato y una vía de exploración de matching. |
| **F-18** | `getFichajesDeEmpleadoHoy` (`real.ts:1843`) no filtra por `empresa_id` (depende de RLS) y usa `inicioDeHoy()` del navegador. El "Próximo fichaje: Ingreso/Egreso" que ve el empleado puede no coincidir con lo que el servidor decidirá. |
| **F-19** | `mejorCoincidencia` (`reconocimiento.ts:225-253`) tiene un bug de segundo candidato: si el primer candidato del bucle ya es el mejor y ninguno posterior lo supera, `segunda` se actualiza bien; pero cuando aparece un nuevo mejor, la `segunda` anterior se **pisa** con la distancia del mejor viejo aunque hubiera una intermedia menor. Es código muerto hoy (el match vive en SQL), pero está testeado como si fuera correcto — `reconocimientoFacial.test.ts:57-72` no cubre ese orden. Conviene borrarlo o arreglarlo, no dejarlo. |
| **F-20** | `FichajeFacialModal.tsx:144` muestra `new Date()` del **cliente** como hora del fichaje, no `fichaje.timestamp` del servidor. La FASE 9 pide explícitamente mostrar la hora registrada por el servidor. |
| **F-21** | `ModoKiosco.tsx:76-86` refresca el reloj cada 10 s; la fecha (`:238`) se recalcula sólo en render. Una tablet que queda toda la noche puede mostrar el día anterior. |
| **F-22** | `getMiMes` / `getHorasExtrasDelPeriodo` (`real.ts:2400-2470`) traen fichajes con `.select('*')` sin paginar y sin `traerTodo`: se cortan silenciosamente en 1000 filas, que es el bug que la migración 46 dice haber arreglado en otras pantallas. |

### 🟢 P3 — Bajo

| # | Hallazgo |
|---|---|
| **F-23** | `PASADAS` fijo (320/512/608) sin adaptación al dispositivo; no hay forma de medir cuál pasada resolvió. |
| **F-24** | El óvalo guía (`CapturaFacial.tsx:251-254`) es decorativo: no se verifica que la cara caiga dentro ni que tenga tamaño mínimo. La persona no recibe feedback de "acercate / centrate" en vivo. |
| **F-25** | Sin `aria-live` en los mensajes de error de `CapturaFacial` (sí lo tiene el aviso de parpadeo). |
| **F-26** | `distancia_descriptores` no valida que los arrays tengan 128 elementos ni la misma longitud: un descriptor de 3 elementos "funciona" (es lo que hacen los propios fixtures de test). |
| **F-27** | Los mensajes técnicos de error del RPC llegan tal cual a la pantalla vía `interpretarError`; conviene revisar que ninguno filtre nombres de otros empleados. |

---

## 3. Lo que está bien y no hay que tocar

Vale decirlo explícitamente para no romperlo:

- **Migración 49**: mover el match y la geocerca al servidor, y no bajar los descriptores a la tablet, fue la decisión correcta. `exigir_fichaje_facial_validado` controla el **dato** (`confianza`/`fuera_de_zona`) y no el método — eso cierra el agujero que se abría con `metodo='celular'`.
- **FIC-001**: forzar `metodo='manual'` + `registrado_por_id` + auditoría en la misma transacción, en un trigger y no en el cliente. Bien resuelto.
- **FIC-004**: `pg_advisory_xact_lock(hashtextextended(empleado))` serializa por persona sin bloquear a los demás, y el script de concurrencia prueba las dos cosas.
- **Migración 47**: agrupar por sesión y no por día calendario, con `cerrada`/`en_curso` calculados en SQL para poder filtrar antes de paginar. Es el modelo correcto — el problema (F-03) es que el RPC no lo respeta.
- **Paginación server-side** de `getJornadas` / `getFichajesPagina`, con orden total `(ts, id)`.
- **`clock_timestamp()` en vez de `now()`**: sutil y correcto.
- **Consentimiento biométrico exigido por trigger** (migración 48), con la nota honesta sobre los datos preexistentes.
- **Sin policy de UPDATE/DELETE en `fichajes`**: la inmutabilidad por defecto es la postura correcta.
- El **Excel** replica el formato que el cliente ya usa y suma minutos exactos redondeando una sola vez al final.

---

## 4. FASE 2 — Diagnóstico del reconocimiento facial

### Qué se está usando

| Componente | Elección actual | Observación |
|---|---|---|
| Librería | `@vladmandic/face-api` 1.7.15 (fork mantenido de face-api.js) | Correcta; es la mejor opción gratuita en navegador |
| Detector | `TinyFaceDetector` (193 KB) | Rápido; ~5× menos preciso que SSD MobileNet en caras chicas/perfil |
| Landmarks | `faceLandmark68Net` (357 KB) | Completo, no el `_tiny` |
| Embedding | `faceRecognitionNet` (6,4 MB, ResNet-34, 128-D) | Es el modelo de dlib; SOTA de 2017 |
| Backend TF.js | **no se elige** → `webgl` o, si falla, `cpu` | ⚠ sin WASM registrado, sin telemetría |
| Origen de modelos | `/models` propio (no CDN) | Correcto — la CSP bloqueaba jsdelivr |
| Enrolamiento | 1 descriptor, 1 cuadro, sin control de calidad | ⚠ ver F-13 |
| Umbrales | 0.6 (1:1) / 0.5 (1:N), margen 0.05 | Son los valores por defecto de face-api; razonables |

### Veredicto sobre la causa del fallo en las tablets Samsung

**No es un problema de umbral, ni de modelo, ni justifica contratar un servicio externo.** El diagnóstico es **K = J + A/B + E**, en este orden de impacto:

1. **J — Implementación (F-05).** Correr el ResNet de 6,4 MB en cada cuadro del liveness es el cuello de botella. Es ~5–8× más cómputo del necesario, en el bucle más sensible al tiempo de todo el módulo.
2. **A/B — Hardware + navegador.** Sin selección explícita de backend, un dispositivo con WebGL degradado cae a CPU. Hoy no hay forma de saber si eso está pasando: no se registra el backend en ningún lado.
3. **E — Enrolamiento (F-13).** Una sola muestra contra una tablet con otra luz y otra cámara ⇒ falsos rechazos estructurales, aun con el resto perfecto.

**Lo que se puede resolver gratis:** los tres puntos de arriba. Estimación conservadora de mejora: 3–6× más cuadros por segundo en el liveness, y una reducción sustancial del rechazo falso con enrolamiento multi-muestra.

**Lo que NO se resuelve gratis, y hay que decirlo:**

- **Anti-spoofing real.** El EAR de `liveness.ts` corta la foto impresa. **No corta un video del compañero en otro celular**, que es un ataque trivial. El liveness pasivo serio (textura, reflejo, profundidad) requiere un modelo dedicado o un SDK pago (FaceTec, iProov, AWS Rekognition Face Liveness). Alternativa gratuita parcial: *challenge-response* aleatorio (girar la cabeza a un lado indicado al azar), que sube bastante el costo del ataque sin costo de licencia.
- **Que el descriptor provenga de la cámara y no de un `fetch`.** Irreducible mientras el embedding se calcule en el cliente. Las dos únicas salidas son (a) mandar la imagen al servidor y calcular ahí el embedding —más caro, más biometría viajando, y requiere una Edge Function con un runtime de ML—, o (b) aceptar el modelo de confianza actual y compensarlo con los controles de F-01/F-02/F-04 (terminal vinculada, template no exportable, geocerca real). **Recomiendo (b): es gratis y cierra el 90 % del riesgo práctico.**
- **1:N a escala.** Con miles de empleados el scan lineal con `jsonb_array_elements` se va a notar. La salida es `pgvector` — gratuita, pero es una extensión y una migración de datos. Todavía no hace falta.

### Estrategia de medición propuesta (sin exponer biometría de más)

Herramienta interna, sólo para `superadmin`, en una ruta no enlazada:

1. **Sonda de dispositivo** — registra por sesión: backend TF.js efectivo (`tf.getBackend()`), `navigator.userAgent`, resolución real del track, ms por pasada de detección, cuántos cuadros junta en la ventana de liveness, y cuál de las tres pasadas resolvió. **Sin ninguna imagen ni descriptor.** Esto contesta empíricamente si el problema es de cómputo, y en qué tablets.
2. **Banco de distancias** — RPC `medir_distancia_facial(p_descriptor)` que, para `admin_rrhh`, devuelve la distancia al enrolado propio **sin fichar**. Permite medir en la tablet real: mismo usuario/mismo dispositivo, mismo usuario/otro dispositivo, con y sin anteojos, distinta luz, distintos ángulos, y contra otros usuarios. Sale una matriz de distancias con la que se pueden calcular FRR/FAR reales, en vez de mover el umbral a ojo.
3. **Métricas objetivo** antes de tocar cualquier umbral: FRR < 5 % con FAR < 0,1 % en 1:1, medido sobre al menos 10 personas × 5 condiciones en la tablet de producción.

---

## 5. FASE 7 — Nota obligatoria sobre geolocalización

`navigator.geolocation` **no es prueba de presencia**. Se falsea desde las DevTools, desde una app de mock location en Android sin root, o con un perfil de emulador. La geocerca sirve para detectar el olvido honesto ("fiché desde casa sin querer"), **no para sostener un reclamo laboral**. Esto tiene que quedar escrito en el producto (tooltip en la configuración de zona) y en el documento que se le entrega al cliente, no sólo en un comentario del código.

---

## 6. Estado de la cobertura de tests

| Nivel | Hoy | Falta |
|---|---|---|
| Unit (Jest) | 442 tests PASS. Buena cobertura de `fichadas`, `turnos`, `liveness`, `kiosco`, Haversine | Cruce de medianoche en el **tipo** de marca; huso ≠ ART; `armarResumen` con anulaciones |
| SQL (`rpc.test.sql`) | Consentimiento, guardia de confianza/geocerca, FIC-001/002/003/009, margen 1:N | **1:N con JWT de empleado (F-01)**; lectura de `descriptor_facial` por el titular (F-02); `ts` futuro (F-09); `p_metodo` arbitrario (F-07); `modo_fichaje` (F-08); geocerca **sin** la clave en `config` (F-04) |
| Concurrencia | `concurrencia_fichaje.sh`: doble request mismo empleado + empleados distintos | Doble request con **el mismo descriptor**; N=10 simultáneas; idempotencia con clave de cliente |
| E2E | `happy-paths`, `capturas-responsive`, `barrido-desborde` | Flujo de fichaje completo, kiosco, recuperación de error, cámara no disponible |
| Adversarial | Existen `redteam_*.test.sql` pero **ninguno cubre fichaje** | Todo el bloque de la FASE 4 |

**Observación importante:** los fixtures SQL usan descriptores de **3 elementos** (`'[0,0,0]'`) y escriben `config.geocerca` a mano. Los tests pasan contra una realidad que no es la de producción. Eso es lo que dejó pasar F-04.

---

## 7. Veredicto de la auditoría (FASE A/B)

# 🔴 NO-GO

para usar los datos de fichaje como evidencia de asistencia en liquidación, reclamos o auditorías, **en el estado actual**.

Los tres bloqueantes:

- **F-01 + F-02**: cualquier empleado autenticado puede fabricar fichajes propios y ajenos con apariencia de fichaje facial válido, sin cámara y sin dejar rastro de carga manual. La marca no es evidencia de nada.
- **F-03**: los turnos nocturnos registran 0 horas. Si el cliente tiene turno noche, la liquidación sale mal hoy.
- **F-04**: el control de zona no existe en producción, pero la UI lo presenta como si existiera.

Nada de esto requiere plata ni cambiar la arquitectura. Con F-01, F-02, F-03, F-04 y F-05 corregidos, el módulo pasa a 🟡 **GO WITH RISKS** (riesgo residual: liveness débil frente a video, y GPS no criptográfico — ambos documentables y aceptables si el kiosco es supervisado).

---

## 8. Decisiones de negocio

### Tomadas

1. **Geocerca: por empleado (`empleados.geocerca`)** — confirmado 2026-08-14.
   Aplica **únicamente** al fichaje 1:1 desde el celular (`modo_fichaje = 'celular'`).
   El kiosco de planta deja de pedir GPS: su garantía de presencia es la terminal vinculada (F-01), no la coordenada.
   El modo `remoto` queda exento por definición.
   *Implementado en la migración 74 (FIC-012) + `ModoKiosco` con `pedirUbicacion={false}`.*

### Pendientes

2. **¿Qué pasa cuando alguien queda fuera de zona?** ¿Se rechaza el fichaje, se registra con marca (hoy), o se avisa a RRHH?
3. **Fichaje 1:N: forma exacta del vínculo con la terminal.** La dirección está confirmada (terminal vinculada en servidor); falta definir el mecanismo: un secreto por terminal generado al autorizarla en Configuración, guardado en el dispositivo y exigido por el RPC. Mientras tanto **F-01 sigue abierto**.
4. **Anulación de fichajes: ¿quién puede?** ¿`admin_rrhh` solo, o también supervisor? ¿Motivo obligatorio?
5. **¿Cuánto hacia atrás puede cargar un fichaje manual?** Propongo 90 días como cota dura.
6. **Retención de `fichajes_descriptor_usado`**: propongo 30 días.
7. **`modo_fichaje = 'planta'`: ¿se bloquea el fichaje desde el celular, o sólo se marca como anómalo?**
8. **Zona gris de `tipo_de_marca_siguiente`** (ver §9): alguien que entra 22:00, se olvida de fichar la salida y vuelve a las 08:00 cierra una jornada de 10 h en vez de abrir la del día. No hay información para distinguir los dos casos. Quedó del lado que coincide con `en_curso`. ¿Se acepta, o se prefiere avisar en pantalla cuando la sesión abierta lleva más de N horas?

---

## 9. Correcciones aplicadas (FASE D, primera tanda)

Sin commit ni push. Migración nueva: `20260814000074_fichaje_bloque2.sql`.

| Hallazgo | Qué se hizo | Dónde |
|---|---|---|
| **F-05** | El bucle de liveness usa `detectarOjos()`, que corre detector + landmarks y **no** el ResNet de 6,4 MB. Además reusa la pasada que resolvió el cuadro anterior en vez de reintentar siempre desde 320. Se agregó `backendFacial()` para poder registrar si TF.js quedó en `webgl` o en `cpu`. | `lib/facial/reconocimiento.ts`, `CapturaFacial.tsx` |
| **F-03** | La regla ingreso/egreso salió del RPC a `tipo_de_marca_siguiente(empleado, ahora)`: una sola definición, con `ahora` inyectable para poder testear. Ya no filtra por día calendario. | mig. 74 (FIC-010) |
| **F-02** | `empleados_lectura` deja de exponer `descriptor_facial` **a todos** (antes lo veía el titular y `admin_rrhh`) y expone `tiene_rostro`. En TS, `tieneRostroEnrolado()` unifica la pregunta entre backend real y demo. `real.getDescriptoresFaciales` ahora falla ruidosamente. | mig. 74 (FIC-011), `lib/facial/enrolado.ts` |
| **F-04** | El RPC lee `empleados.geocerca` (la que el producto configura) en vez de `empresas.config->'geocerca'` (clave inexistente), y sólo en 1:1 con `modo_fichaje = 'celular'`. Sin zona cargada devuelve `null`, no `false`. | mig. 74 (FIC-012) |
| **F-14** | `CapturaFacial` dejó de generar un JPEG del rostro que ningún consumidor usaba. | `CapturaFacial.tsx` |

### El error que encontró el test

La primera versión de FIC-010 usaba `corte_jornada()` (6 h) como umbral para decidir si la próxima marca es un egreso. **El test del turno noche lo rechazó**: entre el ingreso de las 22:00 y el egreso de las 06:00 hay ocho horas, o sea más que el corte, así que la salida volvía a registrarse como ingreso — el mismo bug con otro disfraz.

Los dos umbrales contestan preguntas distintas y no son intercambiables:

- `corte_jornada()` (6 h) responde *"¿este **ingreso** abre sesión nueva?"*. Presupone que ya se sabe el tipo de la marca, así que usarlo para **decidir** el tipo es circular.
- `max_jornada()` (16 h) responde *"¿hay una sesión abierta?"*, que es la pregunta correcta — y es el mismo umbral con el que `jornadas_de_empresa` calcula `en_curso`. Con eso las dos capas quedan alineadas: si la jornada figura en curso, la próxima marca la cierra; si no, abre otra.

### Tests

**Nuevos (Jest):** `deteccionFacial.test.ts` (9 casos) verifica con un doble de face-api que `detectarOjos` **no** invoca `withFaceDescriptors` y que reusa la pasada preferida; `enroladoFacial.test.ts` (5 casos) cubre `tieneRostroEnrolado` en los dos backends.

**Nuevos (SQL, en `rpc.test.sql`):** geocerca del empleado dentro/fuera, modo remoto exento, sin zona cargada → `null`; kiosco 1:N no evalúa zona ni con coordenadas; la regla de sesión caso por caso (sin marcas, 3 h, egreso reciente, **8 h = turno noche**, 30 h, y los dos bordes de `max_jornada()`); la jornada nocturna cierra, tiene salida y se fecha por el ingreso; `empleados_lectura` sin `descriptor_facial` y con `tiene_rostro`, y `authenticated` sin SELECT sobre la columna en la tabla base.

**Corregidos:** `rls_migration66_68.test.sql` (la redacción por rol dejó de ser la defensa: ahora la columna no existe) y los fixtures de `rpc.test.sql` / `concurrencia_fichaje.sh`, que escribían `config.geocerca` a mano — el fixture que tapaba F-04.

### Resultados de ejecución (2026-08-14, Supabase local)

```
Jest            42 suites / 456 tests PASS   (antes: 40 / 442)
tsc --noEmit    sin errores
next lint       sin warnings ni errores
SQL             16 de 18 archivos PASS
concurrencia    PASS (alternancia + empleados distintos no se bloquean)
```

Los dos SQL que fallan —`prod_baseline_verify.test.sql` (*permission denied for table documento_firma_destinatarios*) y `rls_firma_recibos.test.sql` (*permission denied for table ausencias*)— **fallan igual sin esta migración**: se verificó apartándola y corriendo un `db reset` limpio. Son preexistentes, ajenos a fichaje, y quedan fuera de este alcance.

### Lo que sigue abierto tras esta tanda

F-01 (cerrado después, ver §10). Sin tocar: F-06, F-07, F-08, F-09, F-10, F-11, F-12, F-13 y los P2/P3.

---

## 10. F-01 cerrado — terminal vinculada en el servidor

Migración nueva: `20260814000075_terminal_vinculada.sql`.

### Cómo funciona ahora

`terminales` (la tabla de la migración 08, reutilizada) suma `activa`, `secreto_hash` y `secreto_creado_en`. El alta pasa por `autorizar_terminal(nombre)`, un RPC `SECURITY DEFINER` que sólo acepta `admin_rrhh` del tenant, genera 256 bits con `gen_random_bytes`, guarda **sólo** `sha256(id || ':' || secreto)` y devuelve el valor en claro una única vez, que el dispositivo guarda localmente.

`fichar_con_rostro` suma `p_terminal_id` y `p_terminal_secreto`, y bifurca:

| Camino | Requisitos |
|---|---|
| **1:1** (`p_empleado_id` presente) | `auth_empleado() = p_empleado_id`. **No usa terminal.** Sin cambios. |
| **1:N** (kiosco) | `es_gestor()` **y** par (terminal, secreto) válido, activo y del mismo `auth_empresa()` |

La validación es una sola consulta con id + empresa + `activa` + hash en el mismo `WHERE`: no hay ventana entre "encontré la terminal" y "verifiqué de quién es". Devuelve booleano y el RPC da un único mensaje para los cuatro modos de falla, para no servir de oráculo de enumeración.

### Por qué no se puede saltear desde PostgREST

- La versión de 6 argumentos se **dropea** explícitamente. Un `create or replace` con parámetros nuevos habría creado una sobrecarga, y PostgREST resuelve por las claves del JSON: la firma vieja habría quedado como F-01 intacto por otra puerta. Hay un test que exige que exista **una sola** `fichar_con_rostro`.
- `terminal_habilitada` y `hash_secreto_terminal` están revocadas de `authenticated`: no hay oráculo de validación ni gadget para fabricar el hash de un secreto elegido.
- `secreto_hash` no está en los grants de `authenticated`, ni para leer ni para escribir. `select *` sobre `terminales` ahora falla.
- `INSERT` directo sobre `terminales` revocado: toda terminal nace del RPC, con secreto y con auditoría.
- Dos factores independientes: rol de gestor **y** posesión del secreto. Un empleado que copie el secreto de la tablet sigue sin poder usar 1:N; un supervisor sin el secreto tampoco.

### Riesgo residual (declarado, no resuelto)

El secreto vive en el `localStorage` del dispositivo, porque un kiosco de navegador no tiene otro lugar donde llevar una credencial. Quien tenga acceso físico a la tablet puede leerlo — igual que ya podía leer la sesión de Supabase del gestor que está ahí. **Lo que F-01 cierra es que cualquier *otro* dispositivo pueda hacerse pasar por la terminal**, que es lo que estaba abierto. La decisión de autorización dejó de estar en el cliente: está en Postgres.

Las terminales que ya existían quedan sin `secreto_hash` y por lo tanto dejan de fichar hasta que RRHH las vuelva a autorizar. Es deliberado: no hay forma de inventarle un secreto a un dispositivo que nunca lo recibió. El 1:1 y la carga manual no se ven afectados.

### Tests

`supabase/tests/terminal_vinculada.test.sql`, agregado al job de base de datos del CI. Cubre los 13 casos pedidos y, además, una pasada asumiendo de verdad el rol `authenticated` — porque el resto del archivo corre como `postgres`, que saltea los GRANT, y un test que sólo mire `information_schema` verifica el catálogo, no lo que pasa con una petición real.

`src/tests/terminal.test.ts` (8 casos) cubre la credencial local, incluida la migración de la clave vieja `iseo_terminal_id`: un id suelto ya no vincula nada y se borra, para que la pantalla no ofrezca un Modo planta que la base va a rechazar.

### Veredicto de F-01: 🟢 PASS

**El veredicto global del módulo pasa a 🟡 GO WITH RISKS.** Quedan abiertos F-06 a F-13 y los P2/P3; ninguno impide que el registro horario sirva como evidencia, pero F-07 (el cliente elige `p_metodo`) y F-12 (no existe anulación auditable) son los que conviene cerrar antes de la primera liquidación.

---

## 11. F-07 y F-12 cerrados

Migración: `20260814000076_metodo_y_anulacion.sql`.

### F-07 — el método lo decide la base

Había **dos** caminos por los que el cliente escribía `metodo`, no uno:

1. `fichar_con_rostro(p_metodo => …)`, con cast directo al enum.
2. **INSERT directo por PostgREST.** `imponer_actor_fichaje` forzaba `manual` sólo cuando el actor no era el titular; en el camino self-service hacía `return new` temprano y conservaba lo que mandara el cliente. Un empleado podía POSTear `{"metodo":"facial_tablet"}` y fabricarse una marca con cara de fichaje en la terminal.

Ahora el método es función del camino: 1:N por terminal → `facial_tablet`; 1:1 → `remoto` o `celular` según `empleados.modo_fichaje` (dato del servidor); cualquier INSERT directo → `manual`, con actor y auditoría. `p_metodo` **desapareció de la firma**: no hay string que manipular. La firma anterior se dropea explícitamente para que no quede como sobrecarga.

### F-12 — anulación auditable

Columnas `anulado_en` / `anulado_por` / `anulado_motivo`, con CHECK de que van las tres juntas y el motivo no vacío. El único camino de escritura es `anular_fichaje(id, motivo)`: exige motivo, impone el actor, valida tenencia, toma el mismo advisory lock que `fichar_con_rostro` y audita en la misma transacción guardando qué marca se sacó.

Un trigger BEFORE UPDATE rechaza cualquier UPDATE que no venga del RPC y, cuando viene, exige que sólo hayan cambiado las tres columnas de anulación. No hay des-anulación.

El filtro `anulado_en is null` va en `marcas_numeradas`, que es el único origen de `jornadas_de_empresa` y `fichajes_del_periodo`: con eso las anuladas salen de jornadas, resumen, Excel y liquidación de una sola vez. También en `tipo_de_marca_siguiente` y en las cinco consultas directas de `real.ts`.

**Política de anulación: `admin_rrhh` de la empresa y `superadmin`. El supervisor NO.** Cargar una marca es aditivo y deja evidencia nueva; anular RESTA horas de un registro que puede terminar en una liquidación o un reclamo, y el supervisor suele ser la contraparte directa en esa discusión. Además es el criterio que el repo ya aplicó dos veces a operaciones que tocan plata (migración 32, recibos; migración 50, adelantos).

### Hallazgo del camino: `app.fichaje_validado` quedaba encendido

`set_config(…, true)` dura toda la transacción, no la sentencia, y el flag nunca se apagaba. Cualquier INSERT directo posterior **en la misma transacción** se hacía pasar por validado: se salteaba el trigger del método y también el guard que impide afirmar `confianza` y `fuera_de_zona` a mano. Por PostgREST cada request es su propia transacción, así que no era explotable desde la API, pero era un permiso armado esperando que alguien agrupara dos operaciones. Lo encontró el test de F-07. Ahora los dos flags (`fichaje_validado` y `fichaje_anulacion`) se apagan apenas se usan.

### Veredictos

- **F-07: 🟢 PASS**
- **F-12: 🟢 PASS**

Falta la UI de anulación: la capa de servicio (`anularFichaje`) está lista, pero no hay botón en `HistorialFichadas`. Es un agregado chico y aparte.
