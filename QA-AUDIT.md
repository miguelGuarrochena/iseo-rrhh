# QA Audit

**Producto:** ISEO RH — gestión de RRHH multi-tenant para PyMEs  
**Fecha:** 2026-08-10  
**Alcance:** auditoría funcional, de negocio, seguridad, API, DB, Next.js, UX, performance y tests  
**Método:** revisión estática exhaustiva del código + ejecución de lint / typecheck / unit tests / build. Sin modificar código de producto. E2E no re-ejecutado en esta sesión (último run local reportado como passed en `test-results/.last-run.json`; suite E2E usa modo demo).  
**Auditor:** QA Lead / Senior QA (perfil atacante + usuario + admin)

---

## Executive Summary

ISEO RH es una aplicación SaaS madura en alcance (empleados, ausencias, fichaje facial, recibos, remuneraciones, turnos, multi-empresa) con buena disciplina de migraciones RLS y una suite unitaria en verde. **No está lista para producción con datos reales de clientes** hasta cerrar varios fallos de autorización e integridad que el atacante puede ejercer **saltándose la UI** (cliente Supabase / PostgREST).

Los hallazgos más graves **P0** (escalada por cuentas a medias, auto-aprobación de ausencias/adelantos, manipulación de recibos/PDF cross-tenant) fueron **remediados en Bloques 1–3** (2026-08-10). **BUG-007 / BUG-008** (máquina de estados + saldo atómico) cerrados en **Bloque 4**. Quedan P1 de UI/cupos (BUG-009, BUG-010) y menores.

**Veredicto actualizado:** 🟡 **READY WITH MINOR FIXES** (ver Remediation Log).

---

## Application Architecture

### Stack

| Capa | Tecnología |
|------|------------|
| UI | Next.js 14 App Router, React 18, Mantine 7, Tailwind, Zustand |
| Datos | Supabase (Auth + Postgres + Storage + RLS) |
| Servicios | Facade `src/lib/services/rrhh.ts` → `supabase/real.ts` o `rrhh.demo.ts` |
| APIs propias | Route Handlers en `src/app/api/*` (sin Server Actions) |
| IA / email | Gemini, Resend |
| Biometría | `@vladmandic/face-api` + RPC `fichar_con_rostro` |
| Deploy | Vercel + crons |

### Mapa mental

```
USER → auth.users (JWT)
     → public.usuarios (rol, empresa_id, empleado_id)
     → rolEfectivo (UI) / auth_rol() (RLS)
     → permisos por feature (nav + Require* + policies)
     → entidades (empleados, ausencias, fichajes, recibos, …)
```

### Autenticación

- Login: `signInWithPassword` (Supabase) o demo (`localStorage`) si `demoHabilitado()`.
- API routes: `Authorization: Bearer` + `auth.getUser` + fila en `public.usuarios`.
- **Middleware no autentica** (solo routing de dominios). Seguridad = `RequireAuth` (cliente) + RLS + checks en APIs admin.
- Empresa `suspendida` → logout.

### Autorización

| Capa | Rol | ¿Es seguridad real? |
|------|-----|---------------------|
| Nav / pages / `RequireModulo` | Oculta UI | No |
| RLS Postgres | Isolation tenant + dueño | **Sí** (cliente publishable) |
| APIs con `supabaseAdmin` | Re-validan rol/empresa | **Sí** (si están bien escritas) |

### Multi-tenant

Casi todas las tablas llevan `empresa_id`. Superadmin opera con `empresaVista`. Storage namespaced por prefijo `empresa_id/…` en ramas de admin; algunas ramas `exists` por `archivo_url` **no** revalidan el prefijo (ver Bugs).

### Funcionalidades principales

Landing, login/recuperación, empresas (superadmin), colaboradores/legajo, ausencias/vacaciones, fichaje (facial/celular/manual/kiosco), turnos, recibos, remuneraciones/adelantos/descuentos, agenda, comunicaciones, documentos a firmar, organigrama, convenio+IA, reportes, permisos/invitaciones, configuración, finanzas plataforma, crons de facturación/resumen.

---

## User Roles & Permissions

| Capacidad | superadmin | admin_rrhh | supervisor | empleado |
|-----------|:----------:|:----------:|:----------:|:--------:|
| Todas las empresas / finanzas / plataforma | ✓ | | | |
| Operar como admin al “entrar” a empresa | ✓ (`rolEfectivo`) | | | |
| Alta/edición/baja colaboradores | ✓* | ✓ | ver equipo | |
| Permisos / invitaciones | ✓* | ✓ | | |
| Configuración empresa | ✓* | ✓ | | |
| Aprobar ausencias | ✓* | ✓ | ✓ | propias (solicitud) |
| Recibos/sueldos de terceros | ✓* | ✓ | solo propios | propios |
| Adelantos de terceros | ✓* | ✓ | solo propios | propios |
| Fichaje / turnos / reportes | ✓* | ✓ | ✓ | parcial |
| Notas internas | | ✓ | | |

\*Con empresa en vista.

**Nota:** la UI es coherente con esta matriz; varios bugs se explotan **fuera de la UI**.

---

## Functional Testing

Evaluación por evidencia de código + diseño de flujos (no se simuló sesión real contra Supabase de producción en esta pasada).

| Área | Happy path | Observación QA |
|------|------------|----------------|
| Login / demo | Cubierto en E2E demo | Demo off en prod por defecto — bien |
| Colaboradores CRUD | Implementado | Validaciones UI + unique DNI en DB |
| Ausencias | Flujo UI completo | Backend no cierra saldo/estado (P0/P1) |
| Aprobación ausencias | `resolverAusencia` filtra `pendiente` | UPDATE RLS permite cualquier transición |
| Recibos firma | App actualiza solo firma | RLS UPDATE demasiado amplio |
| Fichaje facial | RPC servidor (mig. 49) | Descriptor sigue del cliente (riesgo residual) |
| Invitaciones | Allowlist de roles en API | `completar`/`reenviar` confían metadata |
| Cupos licencia | Panel de config | **No se aplican** al solicitar |
| Cancelar solicitud pendiente (empleado) | — | **No existe**; pendientes congelan saldo |

---

## Business Rules

### Vacaciones (LCT)

Implementadas en `src/lib/vacaciones.ts`:

- Escala 14/21/28/35 por antigüedad al 31/12.
- &lt; 6 meses: 1 día cada 20 (aprox. calendario, no “días trabajados” estrictos).
- Unidad corridos vs hábiles según `config.vacacionesDiasHabiles`.
- Saldo = corresponden + ajuste − utilizados − pendientes.
- Pendientes restan del disponible (diseño correcto para evitar doble pedido en UI secuencial).
- Imputación de consumo por año de `fechaDesde` (cruce de año: todos los días al año de inicio).

### Ausencias

Estados: `pendiente` → `aprobada` | `rechazada`.  
Servicio `resolverAusencia` exige `estado = pendiente`.  
RLS UPDATE de gestores **sin** máquina de estados.

### Remuneraciones / liquidación

Helpers LCT en `liquidacionFinal.ts` (vacaciones no gozadas, SAC). Preaviso/indemnización fuera de alcance (documentado).

### Fichaje

Match y geocerca en servidor. Liveness en cliente (no validado con cámara real en audit previo). Gestores pueden insertar fichajes manuales vía RLS (puerta amplia, posiblemente intencional).

---

## Vacation & Absence Testing

| Caso | Resultado |
|------|-----------|
| Empleado pide ≤ saldo | UI bloquea si excede |
| Empleado pide &gt; saldo | Bloqueado en UI |
| Admin/supervisor carga &gt; saldo | Permitido con aviso — OK de producto si es override; **sin auditoría de override** |
| Doble submit concurrente | **Race**: ambos INSERT pasan → saldo negativo |
| `aprobarAutomaticamente` como empleado | **Pasa** (servicio + RLS) |
| INSERT directo `estado=aprobada` | **Pasa** RLS |
| Re-aprobar vía `resolverAusencia` | Bloqueado (OK) |
| Cambiar `rechazada`→`aprobada` vía REST | **Pasa** RLS gestor |
| Solape misma persona / sector | Warning UI, no enforce |
| Cupos mudanza/casamiento/etc. | Config exist; **nunca consultada** al crear |
| Empleado cancela pendiente | No soportado |
| Ver ausencias de otro (empleado) | Bloqueado por RLS (OK) |
| Cruzar año (28/12–10/01) | Días enteros al año de `fechaDesde` |
| Empresa en días hábiles | UI cuenta **corridos**; backend **hábiles** |

---

## Date & Calendar Testing

| Escenario | Evaluación |
|-----------|------------|
| Helpers locales (`aISOLocal`, `diasEntre`) | Razonables; evitan UTC shift típico |
| Fin de mes / bisiesto | Cubierto en tests de fechas/helpers |
| Hábiles + feriados | En `diasAusencia` (servicio); **no** en modal |
| Demo vs real | Demo usa `diasEntre` siempre → tests E2E/demo no detectan bug hábiles |
| Timezone | Riesgo residual bajo en paths que usen `toISOString()` para fechas de día |

---

## Security Testing

### Controles sólidos (no inventar fallos)

- Invitaciones: `ROLES_INVITABLES`; admin no elige `empresaId` ajeno.
- Avisos: destinatario resuelto en servidor; roles por evento.
- Crons: fail-closed sin `CRON_SECRET`.
- Recibos/adelantos SELECT: supervisor fuera del detalle salarial (mig. 32/50).
- Bloqueo de auto-asignación a `superadmin` (trigger mig. 33) — **excepto** service role.
- Fichaje facial: trigger exige RPC para confianza/geocerca.
- Empleado **no** puede UPDATE su propia fila `usuarios` (rol/empresa).

### Ataques que sí funcionan (evidencia en código)

Ver sección **Bugs** (BUG-001 …). Resumen:

- Confianza en `user_metadata` en completar/reenviar cuentas.
- INSERT ausencias/adelantos sin forzar estado pendiente.
- `recibos_firma` WITH CHECK mínimo + storage por `archivo_url`.
- Notificaciones: cualquier miembro de la empresa puede INSERT a cualquier compañero.
- Rate limit in-memory (bypass multi-instancia).
- `listUsers` global en cada GET/POST de cuentas.

---

## API Testing

| Ruta | Auth | Hallazgo |
|------|------|----------|
| `POST /api/invitaciones` | admin/superadmin | OK roles; rate limit débil |
| `GET/POST /api/cuentas` | admin/superadmin | **P0** metadata; **P1** listUsers global |
| `POST /api/equipo-iseo` | superadmin | Rol fijado en server — OK |
| `POST /api/avisos` | rol por evento | OK post-hardening; HTML no escapado |
| `POST /api/ayuda`, `/api/convenio` | Bearer + rate | OK funcional; costo Gemini |
| `GET/POST /api/cron/*` | `CRON_SECRET` | Fail-closed — OK |

No hay Server Actions que auditar.

---

## Database Testing

| Tema | Estado |
|------|--------|
| RLS SELECT multi-tenant (mayoría) | Bien |
| Binding `ausencias.empresa_id` = `empleados.empresa_id` | **Falta** |
| Binding `usuarios.empleado_id` misma empresa | **Falta** |
| Unique un usuario por legajo (mig. 54) | Puede no crearse si hay duplicados (`WARNING` only) |
| Máquina de estados ausencias/adelantos | Solo en app, no en DB |
| Checks montos (mig. 51) | `NOT VALID` — histórico no validado |
| Soft delete empresa | App + trigger purga explícita (mig. 52) — bien |
| FORCE RLS | No activado |

---

## Next.js Testing

| Tema | Hallazgo |
|------|----------|
| Middleware | Solo hosts; no auth — documentado |
| RequireAuth | Client-side redirect |
| Caching | Páginas app mayormente client + fetch Supabase |
| Exposición al browser | Publishable key + RLS (diseño). Descriptor facial ya no se baja en masa (RPC). Empleados `select *` incluye CBU/biometría a gestores |
| Error boundaries | `app/error.tsx`, `CapturarErrores` |
| Hydration / demo | Riesgo bajo; demo gated |

---

## UX Testing

| Problema | Severidad |
|----------|-----------|
| Empleado no puede retirar solicitud pendiente | Medium funcional |
| Cupos de licencia se configuran pero no se ven al pedir | High (promesa rota) |
| Modal vacaciones muestra días distintos a los guardados (hábiles) | High |
| Rate limit / errores técnicos en APIs | Mensajes en español — bien |
| Double-click en UI | Depende de `enviando` en modales; no hay idempotency keys en backend |

---

## Performance Testing

Sin benchmarks medidos. Riesgos por diseño:

| Riesgo | Evidencia | Escala problemática |
|--------|-----------|---------------------|
| `listUsers` Auth completo (hasta 4000 users) por GET cuentas | `traerCuentasDeAuth` | Decenas de empresas / miles de users → latencia/DoS |
| Muchos `select('*')` en servicios | `real.ts` | Payloads grandes (biometría, docs) |
| Paginación parcial | Existe `paginado.ts` / `.range` en varios listados | Verificar listados sin tope (reportes, historial) |
| Rate limit Map en memoria | `limiteDeUso.ts` | Ineficaz en serverless multi-instancia |
| N+1 | Posible en notificaciones / avisos | Medir con 1k empleados |

**No inventado:** no se midió p95. Recomendación: load test con 100 / 1.000 empleados antes de clientes grandes.

---

## Automated Tests

### Ejecutado en esta auditoría (2026-08-10)

| Check | Comando | Resultado |
|-------|---------|-----------|
| Unit | `npm run test:ci` | ✅ **32 suites / 347 tests passed** |
| Lint | `npm run lint` | ✅ 0 issues |
| Typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Build | `npm run build` | ✅ exit 0 |
| npm audit (prod) | `npm audit --omit=dev` | ⚠️ 4 vulns (2 high postcss vía next, 2 moderate uuid/exceljs) |
| E2E | no re-run | Último `.last-run.json`: `passed` (demo) |

### Cobertura vs riesgo

| Crítico | ¿Cubierto? |
|---------|------------|
| Authn/Authz API + RLS | ❌ casi nada automatizado contra policies |
| Auto-aprobación empleado | ❌ |
| Saldo negativo / race | ❌ |
| Cupos licencia | ❌ |
| Hábiles vs corridos UI | ❌ |
| Recibos UPDATE columns | ❌ |
| Cross-tenant storage | ❌ |
| Escalas LCT / liquidación helpers | ✅ unit |
| Re-resolver ausencia (demo) | ✅ |
| Liveness / fichadas math | ✅ unit (sin cámara real) |

Los E2E actuales validan happy paths en **demo**, no RLS ni APIs admin.

---

## Test Matrix

| Feature | Happy Path | Validation | Edge Cases | Permissions | Security | Data Integrity | Status |
| ------- | ---------- | ---------- | ---------- | ----------- | -------- | -------------- | ------ |
| Login / sesión | OK | OK | Suspendida OK | UI OK | Middleware no auth | — | Pass w/ notes |
| Invitaciones | OK | Roles OK | Email dup | API OK | — | Perfil race | Pass |
| Cuentas a medias | Parcial | — | Orphans | Admin only | **Fail P0** | Metadata trust | **Fail** |
| Colaboradores | OK | UI+DB | Baja | Rol UI+RLS | IDOR tenant OK-ish | Binding empleado | Pass w/ notes |
| Ausencias | OK UI | Fechas UI | Solapes warn | RLS lectura OK | **Auto-approve P0** | Saldo no DB | **Fail** |
| Saldos vacaciones | Cálculo OK | UI empleado | Race/año | — | Bypass UI | Negativo posible | **Fail** |
| Cupos licencia | Config UI | — | — | Admin | — | No enforce | **Fail** |
| Recibos | Flujo OK | — | Re-firma demo | SELECT OK | **UPDATE P0** | Storage leak | **Fail** |
| Adelantos | OK UI | — | — | SELECT OK | INSERT estado | — | **Fail** |
| Fichaje facial | RPC OK | Server match | Spoof tipo | Gestores insert | Descriptor client | Race marca | Pass w/ residual |
| Remuneraciones | OK | — | — | Admin | — | — | Pass |
| Turnos / extras | OK | — | — | Gestores | — | — | Pass |
| Comunicaciones | OK | — | — | Tenant | Notif spam | — | Pass w/ notes |
| Reportes | OK | — | Scale? | Gestores | — | — | Risk perf |
| Multi-tenant | OK lectura | — | Superadmin vista | RLS | Storage exists | Binding gaps | **Fail** partial |
| Crons | OK secret | — | — | Secret | — | — | Pass |

---

## Bugs

## BUG-001 — Completar cuenta a medias confía en `user_metadata` (escalada a admin_rrhh)

**Severity:** Critical  
**Priority:** P0  
**Area:** Security / API  
**Status:** Fixed (2026-08-10)  

**Description:**  
`POST /api/cuentas` acción `completar` crea el perfil con `rol` y `empleado_id` leídos de `user_metadata` del usuario Auth. Esa metadata es controlable en un `signUp` público. El GET lista como “sin perfil” cualquier Auth user cuya metadata diga `empresa_id` de la empresa. Un admin legítimo que pulse “Completar” materializa el rol pedido (incl. `admin_rrhh`) vía service role (bypassa triggers pensados para el cliente).

**Steps to reproduce:**

1. Con Auth permitiendo registro (o creando usuario Auth sin perfil), crear cuenta con metadata `{ empresa_id: "<uuid víctima>", rol: "admin_rrhh", nombre_completo: "…" }`.
2. Iniciar sesión como `admin_rrhh` de esa empresa → Permisos → aparece cuenta `sin_perfil`.
3. Acción “Completar”.

**Expected result:**  
Solo se completan altas originadas en invitaciones server-side; el rol no sale de metadata mutable.

**Actual result:**  
Se crea `public.usuarios` con el rol de la metadata.

**Impact:**  
Toma de control del tenant (invitar, recibos, sueldos, bajas).

**Root cause:**  
Trust en metadata + detección de huérfanas por `empresa_id` en metadata (`src/app/api/cuentas/route.ts` ~166–177, ~296–335).

**Affected files/functions:**  
`src/app/api/cuentas/route.ts` (`completar`, `GET`), `crearPerfilDeInvitado`

**Recommended fix:**  
Tabla/registro de invitaciones firmado; allowlist; nunca leer rol/empleado/empresa desde metadata del usuario final. Completar solo si existe invitación pendiente creada por API.

**Fix aplicado (2026-08-10):** ver [Remediation Log — Bloque 1](#bloque-1--bug-001--bug-002-2026-08-10).

---

## BUG-002 — `empleado_id` desde metadata al completar (IDOR de legajo)

**Severity:** High  
**Priority:** P0  
**Area:** Security / API  
**Status:** Fixed (2026-08-10)  

**Description:**  
En el mismo flujo, `empleado_id` de metadata se asigna sin validar `empleados.empresa_id === ctx.empresaId`. Un atacante puede vincularse al legajo de un compañero y heredar “mis recibos / mi ficha” vía `auth_empleado()`.

**Steps to reproduce:**

1. Cuenta a medias con metadata `empleado_id` de otro colaborador de la misma empresa.
2. Admin completa el alta.

**Expected result:**  
Rechazo si el legajo no pertenece a la empresa o no fue el de la invitación.

**Actual result:**  
Perfil vinculado al legajo ajeno (si no está ocupado).

**Impact:**  
Acceso a datos personales, recibos y ausencias del legajo víctima.

**Root cause / fix:**  
Misma que BUG-001; validar pertenencia del legajo.

**Fix aplicado (2026-08-10):** completar solo usa `empleado_id` de `public.invitaciones` y exige `empleados.empresa_id === empresa` del contexto. Ver Remediation Log — Bloque 1.

---

## BUG-003 — Empleado puede auto-aprobar ausencias (INSERT)

**Severity:** Critical  
**Priority:** P0  
**Area:** Security / Database / Functional  
**Status:** Fixed (2026-08-10)  

**Description:**  
`crearAusencia` inserta `estado: 'aprobada'` si `aprobarAutomaticamente`. La UI solo lo manda en modo admin, pero el cliente Supabase es público: cualquier empleado puede llamar el insert (o PostgREST) con `estado: 'aprobada'`. RLS `ausencias_solicitar` no exigía `pendiente`.

**Fix aplicado:** ver [Remediation Log — Bloque 2](#bloque-2--bug-003--bug-004-2026-08-10). Policy `ausencias_solicitar` exige `estado = pendiente` (+ sin campos de resolución) para no-gestores; gestores conservan carga manual aprobada.

---

## BUG-004 — Empleado puede auto-aprobar adelantos (INSERT)

**Severity:** High  
**Priority:** P0  
**Area:** Security / Database  
**Status:** Fixed (2026-08-10)  

**Description:**  
`adelantos_pedir` no forzaba `pendiente`. Además, `adelantos_gestion FOR ALL` tenía `WITH CHECK (empresa_id = auth_empresa())`, lo que en INSERT permitía a **cualquier** miembro de la empresa crear adelantos (incluso `aprobado`) porque las policies se OR-ean.

**Fix aplicado:** `adelantos_pedir` solo `pendiente`; `adelantos_gestion` reducido a `FOR UPDATE` solo `admin_rrhh`. Ver Remediation Log — Bloque 2.
## BUG-005 — Policy `recibos_firma` permite mutar columnas críticas

**Severity:** Critical  
**Priority:** P0  
**Area:** Security / Database  
**Status:** Fixed (2026-08-10)  

**Description:**  
`recibos_firma` permitía UPDATE amplio al dueño; RLS no whitelistea columnas.

**Fix aplicado:** ver [Remediation Log — Bloque 3](#bloque-3--bug-005--bug-006-2026-08-10). Se eliminó `recibos_firma`; firma vía RPC `firmar_recibo` + trigger de columnas.

---

## BUG-006 — Lectura cross-tenant de PDF vía `archivo_url` en storage

**Severity:** Critical  
**Priority:** P0  
**Area:** Security / Database  
**Status:** Fixed (2026-08-10)  

**Description:**  
Rama `exists` de storage sin validar tenant/prefijo.

**Fix aplicado:** `storage_select_recibos` exige `r.empresa_id = auth_empresa()`, recibo publicado/vigente y `name like r.empresa_id || '/%'`. Defensa en profundidad aunque se envenene `archivo_url`. Ver Bloque 3.

---

## BUG-007 — Gestores pueden reabrir/alterar ausencias ya resueltas vía RLS

**Severity:** High  
**Priority:** P1  
**Area:** Security / Database / Functional  
**Status:** Fixed  

**Description:**  
`ausencias_gestion` UPDATE sin filtrar estado ni columnas. Un supervisor/admin puede `rechazada` → `aprobada`, cambiar fechas/`dias` post-facto.

**Expected result:**  
Máquina de estados; campos inmutables tras resolución (o solo soft-cancel auditado).

**Actual result (pre-fix):**  
Cualquier UPDATE de gestor en la empresa es RLS-válido.

**Impact:**  
Auditoría rota; saldos inconsistentes; disputas laborales.

**Fix aplicado (2026-08-10):** ver [Remediation Log — Bloque 4](#bloque-4--bug-007--bug-008-2026-08-10). Trigger `lock_ausencia_maquina_estados`: solo `pendiente` → `aprobada`|`rechazada` (campos de solicitud inmutables); resueltas bloqueadas en UPDATE. No hay cancelación de empleado en el producto; DELETE admin se conserva.

---

## BUG-008 — Saldo de vacaciones no enforced en backend (overbooking / race)

**Severity:** High  
**Priority:** P1  
**Area:** Functional / Data Integrity  
**Status:** Fixed  

**Description:**  
`crearAusencia` no valida saldo. Solo la UI frena al empleado. Dos solicitudes concurrentes del cupo completo ambas pasan. `diasDisponibles` puede ser negativo.

**Expected result:**  
RPC/transacción o constraint que impida disponible &lt; 0 (con override admin auditado).

**Actual result (pre-fix):**  
Overbooking posible.

**Impact:**  
Saldos ilegales; conflicto con LCT/convenio operativo.

**Fix aplicado (2026-08-10):** ver [Remediation Log — Bloque 4](#bloque-4--bug-007--bug-008-2026-08-10). BEFORE INSERT con `SELECT … FOR UPDATE` del legajo + `saldo_vacaciones_disponible`; gestores/superadmin conservan override.

---

## BUG-009 — UI cuenta días corridos; backend puede guardar hábiles

**Severity:** High  
**Priority:** P1  
**Area:** Functional / UX  
**Status:** Confirmed  

**Description:**  
`NuevaAusenciaModal` usa `diasEntre` (corridos) para mostrar y validar saldo. `crearAusencia` en `real.ts` recalcula con `diasAusencia` (hábiles si config). Demo siempre corridos.

**Steps to reproduce:**  
Empresa con `vacacionesDiasHabiles=true`; rango que incluye fin de semana.

**Expected result:**  
Misma unidad en UI, validación y persistencia.

**Actual result:**  
Números distintos; falsos bloqueos o saldos engañosos.

**Affected files:**  
`NuevaAusenciaModal.tsx`, `real.ts`, `rrhh.demo.ts`

---

## BUG-010 — Cupos de licencia configurables pero nunca aplicados

**Severity:** High  
**Priority:** P1  
**Area:** Functional / Business Rules  
**Status:** Confirmed  

**Description:**  
Existen tabla, RLS, panel UI y `getSaldosLicencia`, pero **ningún** caller en UI/create. El texto del panel promete saldo al solicitar.

**Expected result:**  
Validar/mostrar cupo al pedir mudanza, casamiento, etc.

**Actual result:**  
Config cosmética; se puede exceder sin freno.

---

## BUG-011 — `reenviar` invitación sin allowlist de roles (camino a superadmin)

**Severity:** High  
**Priority:** P1  
**Area:** Security / API  
**Status:** Fixed (parcial, 2026-08-10 — mismo bloque que BUG-001/002)  

**Description:**  
`reenviar` tomaba `rol` de perfil o metadata sin allowlist.  

**Fix:** `datosParaReenviarInvitacion` usa perfil o `public.invitaciones` con `esRolInvitable`; ya no lee metadata.

---

## BUG-012 — Vacaciones que cruzan año imputan todo al año de inicio

**Severity:** Medium  
**Priority:** P2  
**Area:** Functional / Business Rules  
**Status:** Confirmed  

**Description:**  
`getSaldoVacaciones` / `diasVacacionesGozadosEn` filtran por `fechaDesde` y suman `dias` completo.

**Impact:**  
Saldos anuales incorrectos en períodos 28/12–10/01.

---

## BUG-013 — INSERT ausencia sin validar pertenencia del empleado a la empresa

**Severity:** Medium  
**Priority:** P2  
**Area:** Data Integrity  
**Status:** Confirmed  

**Description:**  
Gestor puede insertar `empleado_id` de otro tenant con `empresa_id` propio (FK solo a `empleados.id`). Lectura cross-tenant mitigada; integridad rota.

---

## BUG-014 — Notificaciones in-app: spam/phishing interno

**Severity:** Medium  
**Priority:** P2  
**Area:** Security / UX  
**Status:** Confirmed  

**Description:**  
Policy de INSERT permite a cualquier usuario notificar a cualquier miembro de su empresa.

**Impact:**  
Phishing interno; no cruza tenant.

---

## BUG-015 — Rate limit in-memory bypasseable + `listUsers` global

**Severity:** Medium  
**Priority:** P2  
**Area:** Performance / Security  
**Status:** Confirmed  

**Description:**  
`limiteDeUso` es un `Map` por instancia. `/api/cuentas` pagina todo Auth (hasta ~4000 users) en cada operación.

**Impact:**  
Spam de mails/IA; latencia/DoS; PII de todos los tenants en memoria del proceso.

---

## BUG-016 — Regresión storage: adjuntos de ausencias ilegibles para el colaborador

**Severity:** Medium  
**Priority:** P2  
**Area:** Functional  
**Status:** Confirmed  

**Description:**  
Mig. 31 añadió lectura por `ausencias.adjuntos`; mig. 40 recreó policy sin esa rama (documentado en revisiones previas).

**Impact:**  
Empleado no puede ver su certificado subido (según policy final).

---

## BUG-017 — Empleado no puede cancelar solicitud pendiente

**Severity:** Low–Medium  
**Priority:** P2  
**Area:** Functional / UX  
**Status:** Confirmed  

**Description:**  
Sin UPDATE/DELETE para empleado; pendientes siguen restando del disponible hasta que RRHH actúe.

---

## BUG-018 — HTML no escapado en mails de avisos/resumen

**Severity:** Low  
**Priority:** P3  
**Area:** Security  
**Status:** Confirmed  

**Description:**  
Facturación escapa; avisos/resumen interpolan texto crudo → HTML injection en clientes de correo.

---

## BUG-019 — PII (emails) en logs de API

**Severity:** Low  
**Priority:** P3  
**Area:** Security  
**Status:** Confirmed  

**Description:**  
`logError(..., { email })` en invitaciones/cuentas.

---

## BUG-020 — `redirectTo` de mails derivado de `req.url` origin

**Severity:** Medium  
**Priority:** P2  
**Area:** Security  
**Status:** Probable  

**Description:**  
Sin allowlist `APP_URL`; riesgo de Host header / phishing en links de invitación si el edge no normaliza el host.

---

## BUG-021 — Índice único un-usuario-por-legajo puede no crearse

**Severity:** Medium  
**Priority:** P2  
**Area:** Database  
**Status:** Risk  

**Description:**  
Mig. 54 hace `WARNING` y salta el índice si hay duplicados. Invariante no garantizado en esa DB.

---

## BUG-022 — Supervisor ve CBU / descriptor facial vía `empleados_select`

**Severity:** Medium  
**Priority:** P2  
**Area:** Security / Privacy  
**Status:** Confirmed  

**Description:**  
Tras cerrar sueldos al supervisor, la fila completa de `empleados` (incl. datos bancarios y biometría) sigue visible a `es_gestor()`.

**Impact:**  
Exposición innecesaria de datos sensibles (Ley 25.326 / mínimo privilegio).

---

## BUG-023 — Dependencias npm con vulnerabilidades conocidas

**Severity:** Medium  
**Priority:** P2  
**Area:** Security  
**Status:** Confirmed (scanner)  

**Description:**  
`npm audit --omit=dev`: postcss (high, transitiva de Next) y uuid (moderate, vía exceljs). Fix sugerido implica breaking changes — evaluar con cuidado.

---

## Risks

| ID | Riesgo | Notas |
|----|--------|-------|
| R1 | Descriptor facial calculado en cliente | Nivel 1 aceptado; spoof de embedding posible |
| R2 | Liveness no probado con cámara real | Solo unit tests EAR |
| R3 | Gestores insertan fichajes arbitrarios | Puede ser feature; puerta grande |
| R4 | Race ingreso/egreso fichaje | Sin unique/lock fuerte |
| R5 | `FORCE ROW LEVEL SECURITY` ausente | Depende del modelo de roles PG |
| R6 | Auditoría client-writable (`actor_nombre`, detalle) | Logs falseables |
| R7 | E2E solo demo | No prueba RLS ni Supabase real |
| R8 | Antigüedad &lt;6 meses ≈ calendario/20 | Puede diferir de LCT “días trabajados” |
| R9 | Signup abierto en Supabase Dashboard | Multiplica explotabilidad de BUG-001 |
| R10 | Escala 10k–100k empleados | `listUsers` + payloads — no medido |

---

## Recommended Fix Order

### P0 (bloquear producción)

1. ~~**BUG-001 / 002** — Dejar de confiar en metadata; invitaciones server-side; validar legajo.~~ ✅ Bloque 1
2. ~~**BUG-003 / 004** — RLS: empleado solo `pendiente` en ausencias/adelantos.~~ ✅ Bloque 2
3. ~~**BUG-005 / 006** — Whitelist columnas firma recibo + storage con prefijo tenant.~~ ✅ Bloque 3

### P1

4. ~~**BUG-007** — Máquina de estados en UPDATE ausencias.~~ ✅ Bloque 4
5. ~~**BUG-008** — Enforce saldo (RPC/trigger) + override gestor.~~ ✅ Bloque 4
6. **BUG-009** — Alinear UI/demo a `diasAusencia`.
7. **BUG-010** — Aplicar cupos de licencia en create/UI.
8. ~~**BUG-011** — Allowlist en `reenviar`.~~ ✅ mitigado con Bloque 1

### P2

9. BUG-012–017, 020–022; rate limit distribuido; dejar de listar todo Auth.
10. Tests de integración RLS + API para los P0.

### P3

11. Escape HTML mails; redactar logs; npm audit planificado.

---

## Remediation Log

### Bloque 1 — BUG-001 + BUG-002 (2026-08-10)

**Estado:** Completado y verificado. No se avanzó a BUG-003/004.

**Causa raíz:**  
`/api/cuentas` (GET huérfanas, `completar`, `reenviar`) trataba `auth.users.user_metadata` como autoridad para `rol`, `empresa_id` y `empleado_id`. Esa metadata es mutable en signup abierto.

**Solución:**  
Tabla `public.invitaciones` escrita solo por las APIs de invitación (service role). Completar / listar a medias / reenviar sin perfil leen únicamente de ahí (o del perfil ya existente). Validación server-side del legajo (`empleados.empresa_id`). Allowlist de roles.

**Archivos modificados / creados:**

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20260810000055_invitaciones_confiables.sql` | Tabla + RLS (sin policies al browser) + backfill de invitaciones reales (`invited_at`) |
| `src/lib/api/invitacionConfianza.ts` | Lógica pura (autoridad, BUG-001/002) |
| `src/lib/api/registroInvitacion.ts` | Persistencia `invitaciones` |
| `src/app/api/invitaciones/route.ts` | Registra invitación confiable tras alta |
| `src/app/api/cuentas/route.ts` | GET/completar/reenviar/quitar sin metadata |
| `src/lib/api/perfilInvitado.ts` | Comentario de autoridad |
| `src/tests/invitacionConfianza.test.ts` | 12 tests de regresión BUG-001/002 |

**Migrations:** `20260810000055_invitaciones_confiables.sql` (aplicar en cada entorno antes de desplegar el código).

**Tests agregados:** `src/tests/invitacionConfianza.test.ts` (escalada sin invitación, rol desde invitación, legajo ajeno, legajo ocupado, listado sin metadata, reenviar sin metadata).

**Integración Supabase/RLS:** no ejecutada en esta pasada (requiere instancia con la migración aplicada). La tabla no tiene policies para `authenticated` (solo service role vía API).

**Verificaciones (2026-08-10):**

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run test:ci` | ✅ 33 suites / **359** tests |
| `npm run build` | ✅ |

**Flujo legítimo conservado:** Invitar → perfil + fila `invitaciones` → si queda a medias con invitación registrada → “Completar el alta” usa rol/legajo de la fila. Demo E2E de cuentas a medias sigue válido (mock local).

**Riesgos residuales Bloque 1:**

- Cuentas Auth basura (signup sin `invited_at`) ya **no** aparecen en Permisos; hay que purgarlas en Auth Dashboard si existen.
- Backfill solo cubre invitaciones con `invited_at`; signup envenenados históricos no se completan (intencional).
- Metadata de Auth sigue viajando en el mail de Supabase por compatibilidad, pero **no** es autoridad.
- BUG-011 quedó mitigado en el mismo cambio; otros P0 (003–006) siguen abiertos.

---

### Bloque 2 — BUG-003 + BUG-004 (2026-08-10)

**Estado:** Completado y verificado (incl. test RLS real en Postgres local). No se avanzó a BUG-005/006.

**Causa raíz:**

1. **Ausencias:** `ausencias_solicitar` permitía INSERT con cualquier `estado` a empleado y gestor.
2. **Adelantos:** `adelantos_pedir` igual; y `adelantos_gestion FOR ALL` con `WITH CHECK (empresa_id = auth_empresa())` abría una **segunda puerta de INSERT** a cualquier miembro del tenant (descubierta en QA adversarial al re-probar el fix).

**Solución (autoridad en DB):**

| Policy | Cambio |
|--------|--------|
| `ausencias_solicitar` | Empleado: solo `pendiente` + sin `resuelta_*`. Gestor/superadmin: INSERT libre (carga manual aprobada OK). |
| `adelantos_pedir` | Solo `pendiente`, sin `resuelto_en`/`periodo`. |
| `adelantos_gestion` | De `FOR ALL` → `FOR UPDATE` solo `admin_rrhh` / superadmin. |

Flujo legítimo preservado: empleado pide pendiente → gestor/admin resuelve por UPDATE; RRHH puede INSERT ausencia ya `aprobada`.

**Archivos:**

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20260810000056_estados_solicitud_empleado.sql` | Policies nuevas |
| `supabase/tests/rls_estados_solicitud.test.sql` | **RLS real** (role `authenticated` + JWT) |
| `src/lib/seguridad/estadosSolicitud.ts` | Espejo unitario de predicates (no sustituye RLS) |
| `src/tests/estadosSolicitud.test.ts` | Unit + flujos demo legítimos |

**Migrations:** `20260810000056_estados_solicitud_empleado.sql`

**Tests:**

| Tipo | Qué | Resultado |
|------|-----|-----------|
| Unit (Jest) | Espejo predicates + demo crear/resolver | ✅ en `test:ci` (375 tests) |
| **RLS real (psql)** | Empleado INSERT aprobada/rechazada FAIL; pendiente OK; UPDATE→aprobada FAIL; gestor carga/resuelve OK; idem adelantos | ✅ ejecutado vía `docker exec … psql -f supabase/tests/rls_estados_solicitud.test.sql` |

**Verificaciones (2026-08-10):**

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run test:ci` | ✅ 34 suites / **375** tests |
| `npm run build` | ✅ |
| RLS SQL test | ✅ PASS (local `supabase_db_iseo-rrhh`) |

**QA adversarial (re-ataque tras el primer draft):**

- INSERT `aprobada`/`rechazada` / omitir estado / forjar `resuelta_por` → cubierto.
- UPDATE pendiente→aprobada como empleado → 0 filas / denegado.
- Legajo ajeno → denegado.
- **Hallazgo durante re-ataque:** `adelantos_gestion FOR ALL` bypasseaba `adelantos_pedir` → cerrado en la misma migración.

**Riesgos residuales Bloque 2:**

- ~~Gestores pueden seguir reabriendo ausencias ya resueltas~~ → cerrado en Bloque 4.
- ~~Race de saldo de vacaciones~~ → cerrado en Bloque 4.
- Aplicar migración 56 (+58) en staging/prod es obligatorio antes de confiar en el cierre.

---

### Bloque 3 — BUG-005 + BUG-006 (2026-08-10)

**Estado:** Completado y verificado con RLS + Storage reales.

**Causa raíz:**

1. **BUG-005:** `recibos_firma` UPDATE con WITH CHECK mínimo → el empleado podía mutar cualquier columna de su fila (incl. `archivo_url`).
2. **BUG-006:** `storage_select_recibos` rama `exists` sin `empresa_id` ni prefijo de path → lectura cross-tenant si `archivo_url` apuntaba afuera.

**Solución (Opción C — RPC + trigger + RLS storage):**

| Pieza | Rol |
|-------|-----|
| Drop `recibos_firma` | El empleado ya no tiene UPDATE REST sobre `recibos` |
| RPC `firmar_recibo(uuid)` SECURITY DEFINER (`search_path=public`) | Valida sesión, legajo, tenant, publicado, vigente, `pendiente`; escribe solo `estado_firma` + `firmado_en`; GRANT EXECUTE a `authenticated` |
| Trigger `lock_recibo_firma_empleado` | Defensa: no-admin sólo puede pendiente→firmado sin tocar otras columnas; admin_rrhh/superadmin/sin JWT intactos |
| `storage_select_recibos` | Dueño: `empleado_id` + `empresa_id = auth_empresa()` + publicado/vigente + `name like empresa_id/%` |

**Cliente:** `firmarRecibo` en `real.ts` llama al RPC (demo sin cambios de contrato).

**Archivos:**

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20260810000057_firma_recibo_y_storage_tenant.sql` | RPC + trigger + policies |
| `supabase/tests/rls_firma_recibos.test.sql` | RLS + Storage adversarial (2 tenants) |
| `src/lib/services/supabase/real.ts` | `firmarRecibo` → RPC |
| `src/lib/seguridad/firmaRecibo.ts` | Contrato unitario |
| `src/tests/firmaRecibo.test.ts` | Unit + demo |

**Migrations:** `20260810000057_firma_recibo_y_storage_tenant.sql`

**Ataques ahora bloqueados (verificados en SQL):**

- UPDATE `archivo_url` / `empresa_id` / `empleado_id` / `periodo` / `tipo` / `firmado_empleador_en` / `archivado_en` / firma directa → 0 filas
- SELECT recibo/PDF de empresa B como empleado A → denegado
- Firma legítima por RPC → OK; segunda firma → vacío (one-shot)
- `archivo_url` envenenado a path B (simulado service) → storage sigue denegando PDF B
- RRHH insert + publicar → OK

**Verificaciones (2026-08-10):**

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run test:ci` | ✅ 35 suites / **380** tests |
| `npm run build` | ✅ |
| RLS/Storage SQL | ✅ PASS |
| Regresión Bloque 2 SQL | ✅ PASS |

**Riesgos residuales Bloque 3:**

- Patrón similar `exists` por `archivo_url` en **documentos** (no recibos) sigue como riesgo P2 documentado antes.
- `recibos_gestion FOR ALL` mantiene WITH CHECK amplio en INSERT (fuera de alcance; no es el vector de firma).
- Aplicar migración 57 en todos los entornos.

---

### Bloque 4 — BUG-007 + BUG-008 (2026-08-10)

**Estado:** Completado y verificado (RLS SQL + concurrencia real). No se avanzó a BUG-009/010.

**Estados existentes (sin inventar):** `pendiente` | `aprobada` | `rechazada`. No hay cancelación de empleado; la vía de corrección sigue siendo DELETE de admin.

**Causa raíz:**

1. **BUG-007:** `ausencias_gestion` UPDATE sin máquina de estados → gestor podía reabrir o alterar filas resueltas vía PostgREST.
2. **BUG-008:** validación de saldo TOCTOU en cliente (`leer saldo` → `INSERT`) → dos requests concurrentes del cupo completo ambas pasaban.

**Solución (autoridad en DB):**

| Pieza | Rol |
|-------|-----|
| Trigger `trg_lock_ausencia_maquina_estados` / `lock_ausencia_maquina_estados()` | Resueltas inmutables; desde `pendiente` solo → `aprobada`\|`rechazada` y solo campos de resolución (`resuelta_*`); datos de solicitud bloqueados |
| Trigger `trg_exigir_saldo_vacaciones` / `exigir_saldo_vacaciones_al_insertar()` | Recalcula `dias` server-side; `SELECT … FOR UPDATE` del legajo; empleado: `dias ≤ saldo_vacaciones_disponible`; gestores/`es_superadmin()`: override (mismo criterio UI) |
| Helpers | `dias_corridos_entre`, `dias_habiles_entre`, `dias_vacaciones_corresponden`, `saldo_vacaciones_disponible` |
| Bypass | `auth.uid() is null` (service role / seeds) |

**Flujo legítimo conservado:** empleado INSERT `pendiente` → gestor aprueba/rechaza. Override RRHH al crear vacaciones excediendo saldo: OK. Empleado no puede auto-override (mig 56 + trigger saldo).

**Archivos:**

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20260810000058_ausencias_estados_y_saldo.sql` | Triggers + helpers saldo |
| `supabase/tests/rls_ausencias_estados_saldo.test.sql` | RLS/trigger adversarial |
| `supabase/tests/concurrencia_vacaciones.sh` | Dos INSERT concurrentes del cupo completo |
| `src/lib/seguridad/ausenciasEstados.ts` | Espejo unitario (no sustituye DB) |
| `src/tests/ausenciasEstados.test.ts` | Unit |

**Policies:** sin cambios de RLS de gestión; la autoridad nueva es por **triggers** (PostgREST no puede saltarlos).

**Ataques ahora bloqueados (verificados en SQL):**

- Gestor: `rechazada`→`aprobada`, `aprobada`→`rechazada`, `*`→`pendiente` → EXCEPTION
- Gestor: mutar `fecha_*`/`dias`/`tipo`/`empleado_id` al resolver o post-resolución → EXCEPTION
- Empleado: resolver pendiente → denegado (RLS)
- Empleado: vacaciones > saldo → EXCEPTION
- Empleado concurrente cupo completo ×2 → exactamente 1 OK; `saldo_final ≥ 0`
- Gestor override > saldo → OK
- Empleado INSERT `aprobada` → denegado (mig 56)

**Verificaciones (2026-08-10):**

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run test:ci` | ✅ 36 suites / **385** tests |
| `npm run build` | ✅ |
| RLS SQL Bloque 4 | ✅ PASS |
| Concurrencia | ✅ PASS (`A`/`B` una gana; saldo final 0) |
| Regresión Bloque 2 SQL | ✅ PASS |

**Riesgos residuales Bloque 4:**

- **BUG-009** (UI corridos vs backend hábiles) sigue abierto; el trigger ya recalcula `dias` en INSERT, pero la UI puede mostrar un número distinto.
- **BUG-010** (cupos de licencia) no enforced.
- Override de gestor **no** escribe fila de auditoría dedicada (comportamiento previo; no se inventó).
- Aplicar migración **58** en staging/prod es obligatorio.
- Licencias/otros tipos: el trigger recalcula `dias` para todos; el chequeo de saldo solo aplica a `vacaciones`.

---

## Final Verdict

# 🟡 READY WITH MINOR FIXES

### Justificación

**P0 cerrados** (Bloques 1–3) y **P1 de integridad ausencias/saldo cerrados** (Bloque 4), con tests RLS + concurrencia reales:

- Invitaciones / metadata (001–002)
- Auto-aprobación ausencias/adelantos (003–004)
- Firma de recibos + storage cross-tenant (005–006)
- Máquina de estados ausencias (007)
- Saldo vacaciones atómico + override gestor (008)

**Quedan P1** BUG-009 (días hábiles UI) y BUG-010 (cupos licencia).

Tooling: **385** unit tests, lint/tsc/build OK; harness SQL/concurrencia en `supabase/tests/`.

---

*Remediación Bloques 1–4 completa. No avanzar a BUG-009/010 hasta indicación.*
