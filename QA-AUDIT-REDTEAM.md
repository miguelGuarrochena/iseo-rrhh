# QA Audit — Red Team (Second Pass)

**Producto:** ISEO RH — SaaS multi-tenant de RRHH  
**Fecha:** 2026-08-10  
**Alcance:** auditoría adversarial independiente post-remediación Bloques 1–6  
**Método:** revisión estática + ejecución lint/tsc/unit/build + harnesses RLS/Storage/concurrencia existentes + **probes SQL adversariales nuevos** (`supabase/tests/redteam_probe.test.sql`)  
**Postura:** Principal Security Engineer + Senior QA + Red Team + especialista Postgres/RLS  
**Regla:** no se modificó producto; solo inspección, ataques y documentación  

---

## 1. Executive Summary

Tras cerrar BUG-001→010, la app **sigue atacable vía PostgREST** con un JWT de empleado legítimo. La remediación anterior fue **profunda pero estrecha**: corrigió invitaciones, auto-aprobación de solicitudes, firma de recibos, máquina de estados/saldos de ausencias y cupos — y dejó intacto el patrón estructural que ya había explotado BUG-004 (`FOR ALL` + `WITH CHECK` débil).

**Hallazgo dominante (nuevo, CRITICAL):** un empleado puede **INSERT** en tablas de gestión pensadas solo para `admin_rrhh` (`recibos`, `remuneraciones`, `cupos_licencia`, `documentos_legajo`, …) porque Postgres evalúa solo `WITH CHECK` en INSERT y ese predicado solo exige `empresa_id = auth_empresa()`.

**Hallazgos HIGH nuevos** introducidos o dejados por migraciones 58/59: RPCs `saldo_vacaciones_disponible` / `saldo_licencia_disponible` son `SECURITY DEFINER` sin check de tenant → **IDOR cross-tenant** de saldos. Storage de **documentos** conserva el anti-patrón de recibos pre-BUG-006. Adelantos no tienen máquina de estados en UPDATE. Integridad `empleado_id`↔`empresa_id` sigue rota para gestores.

**Lo que sí resiste (re-probado):** auto-aprobación empleado ausencias/adelantos; máquina de estados ausencias; saldo vacaciones atómico; cupos licencia al aprobar; firma recibo vía RPC; storage recibos con prefijo tenant; invitaciones sin metadata; SELECT cross-tenant de empleados.

**Veredicto:** 🔴 **NOT READY FOR PRODUCTION** con datos reales de clientes hasta cerrar al menos RT-001→RT-006 / RT-010.

---

## 2. Overall Verdict

| Dimensión | Estado |
|-----------|--------|
| Auth / invitaciones (post-55) | 🟢 Sólido en API |
| Ausencias / vacaciones / cupos (56–59) | 🟢 Controles de negocio OK; RPC saldo IDOR 🔴 |
| Recibos firma + storage PDF | 🟢 OK |
| Gestión RRHH (recibos/remu/docs/cupos/…) | 🔴 INSERT abierto a empleado |
| Documentos storage | 🔴 Residual cross-tenant class |
| Adelantos post-resolución | 🟠 Reabrir estados |
| Multi-tenant integridad FK lógica | 🟠 Cross-link gestor |
| APIs Next.js | 🟡 AuthZ OK; abuso operativo |
| E2E | 🟡 Solo demo |
| Unit suite | 🟢 414 verdes; cobertura RLS parcial |

---

## 3. Attack Surface

```
Browser / DevTools
  → Supabase JS (anon key) → PostgREST / Storage / RPC
  → Next.js /api/* (Bearer) → service_role

Roles JWT → public.usuarios (rol, empresa_id, empleado_id)
RLS helpers: auth_rol(), auth_empresa(), auth_empleado(), es_gestor(), es_superadmin()
```

**Vectores preferidos del red team:** PostgREST directo, RPC, Storage `exists`, body de APIs con service_role, concurrencia.

---

## 4. Architecture

| Capa | Tech |
|------|------|
| UI | Next.js 14, React, Mantine, Zustand |
| Datos | Supabase Auth + Postgres RLS + Storage |
| Facade | `rrhh.ts` → `real.ts` / `rrhh.demo.ts` |
| APIs | 8 route handlers (`invitaciones`, `cuentas`, `equipo-iseo`, `avisos`, `ayuda`, `convenio`, 2 crons) |
| Middleware | **no autentica** (solo routing) |

Seguridad = RLS + checks en APIs admin + (pocos) triggers/RPC.

---

## 5. Authentication

| Control | Evaluación |
|---------|------------|
| Login password / demo | OK |
| Autoridad de rol en API | `public.usuarios` (no metadata) ✅ |
| Invitaciones (`public.invitaciones`) | Deny-all browser; service role ✅ |
| `crear_perfil_usuario` desde metadata | **RISK**: dual authority vs tabla invitaciones |
| Escalada a `superadmin` vía metadata | Bloqueada (trigger mig 33) ✅ |
| Recovery password | Anti-enumeración UI; rate = Supabase |
| Sesión suspendida | Logout por estado empresa |

---

## 6. Authorization

### Matriz resumida (PostgREST, no UI)

| Acción | empleado | supervisor | admin_rrhh | superadmin |
|--------|----------|------------|------------|------------|
| INSERT recibo/remuneración/cupo/doc_legajo | **SÍ (bug)** | **SÍ (bug)** | sí | sí |
| INSERT ausencia `aprobada` | no | sí | sí | sí |
| UPDATE ausencia resuelta | no | no (trigger) | no (trigger) | service |
| RPC saldo_* otro tenant | **SÍ (bug)** | **SÍ** | **SÍ** | sí |
| Firmar recibo ajeno | no | no | no | — |
| SELECT empleados otro tenant | no | no | no | sí |
| SELECT CBU mismo tenant | propio | **sí (PII)** | sí | sí |
| Demote last admin | — | — | **sí vía REST** | sí |
| Reabrir adelanto resuelto | no | no | **sí** | sí |

---

## 7. RLS

Todas las tablas app tienen RLS habilitado. `invitaciones`: RLS + sin policies authenticated = deny.

### Patrón crítico residual

```sql
-- USING exige admin_rrhh
-- WITH CHECK solo empresa_id  → INSERT de cualquier miembro del tenant
create policy *_gestion for all
  using (… auth_rol() = 'admin_rrhh' …)
  with check (es_superadmin() or empresa_id = auth_empresa());
```

Mig **56** lo cerró en `adelantos`. **Sigue abierto** en (al menos):

`recibos_gestion`, `remuneraciones_gestion`, `empleados_gestion`, `documentos_gestion`, `cupos_licencia_gestion`, `descuentos_gestion`, `facturas_mono_gestion`, `documentos_firma_gestion`, `alertas_gestion`, `eventos_gestion`, `turnos_gestion`, `usuarios_admin`.

Policies **bien hechas** (WITH CHECK con rol): `convenios`, `terminales`, `feriados`, `vacaciones_pendientes`, `notas_internas`.

---

## 8. Storage

| Bucket | SELECT | Riesgo |
|--------|--------|--------|
| `recibos-pdf` | tenant + publicado + `name like empresa_id/%` (mig 57) | ✅ |
| `documentos` | `exists` por `archivo_url` **sin** `empresa_id` ni prefijo (mig 40) | 🔴 con RT-006 |
| `fotos` | prefijo empresa | ✅ |
| `logos` | amplio | RISK (a menudo intencional) |

Ausencias adjuntos: rama storage de mig 31 fue **pisada** por mig 40; además usaba `?` (keys) sobre un array JSON → BUG-016 sigue abierto / mal implementado.

---

## 9. API

8 endpoints auditados. Ninguno sin auth (crons: `CRON_SECRET` fail-closed).

| Issue | Evidencia | Sev |
|-------|-----------|-----|
| Rate limit `Map` in-memory | `src/lib/api/limiteDeUso.ts` | MEDIUM |
| `listUsers` global en `/api/cuentas` | hasta ~4000 users/request | MEDIUM |
| `redirectTo` desde `req.url` origin | invitaciones/cuentas/equipo-iseo | MEDIUM (PROBABLE) |
| HTML sin escape en avisos/resumen | `avisos/route.ts`, cron resumen | LOW |
| IA `ayuda`/`convenio` — contexto cliente | coste Gemini | LOW/RISK |

Invitaciones/completar/reenviar: autoridad por `invitaciones` ✅ (no reabre BUG-001/002).

---

## 10. RPC / SECURITY DEFINER

| Función | search_path | Tenant check | Verdict |
|---------|-------------|--------------|---------|
| `firmar_recibo` | public | sí | ✅ |
| `fichar_con_rostro` | public | empresa | RISK (descriptor cliente) |
| `saldo_vacaciones_disponible` | public | **NO** | 🔴 IDOR |
| `saldo_licencia_disponible` | public | **NO** | 🔴 IDOR |
| `dias_habiles_entre` | public | param libre | RISK |
| `vacaciones_aprobadas_mi_sector` | public | sector propio | OK (leak IDs peers by design) |
| Triggers ausencias 58/59 | public | N/A | ✅ |
| `crear_perfil_usuario` | public | metadata | RISK dual-authority |

---

## 11. Multi-tenant

| Vector | Resultado live |
|--------|----------------|
| SELECT empleado otro tenant | **Blocked** (RT-009) |
| RPC saldo otro tenant | **Leaked** (RT-004/005) |
| INSERT ausencia `empresa_id=A` + `empleado_id=B` | **Allowed** as admin (RT-010) |
| Poison `documentos_legajo.archivo_url` → path B | **Allowed** insert (RT-006); download si objeto existe |
| Storage recibos path B | Mitigado mig 57 |

No hay FK compuesta `(empresa_id, empleado_id)` ni trigger de pertenencia.

---

## 12. Business Logic

| Regla | UI | DB | Notas |
|-------|----|----|-------|
| Ausencias pendiente-only empleado | sí | sí (56) | ✅ |
| Máquina estados ausencias | sí | sí (58) | ✅ |
| Saldo vacaciones atómico | sí | sí (58) | ✅; RPC lectura IDOR |
| Cupos licencia al aprobar | sí | sí (59) | ✅; pendientes no reservan |
| Adelantos pendiente-only INSERT | sí | sí (56) | ✅ |
| Adelantos no reabrir | cliente `.eq(pendiente)` | **NO** | 🔴 RT-007 |
| Tope monto adelanto | UI mínimo | solo `>0` | RISK |
| Remuneraciones neto≤bruto | parcial | no | RISK |
| Last-admin | API/UI | **NO** | 🔴 RT-008 |
| Días hábiles unificados | sí (09) | trigger | ✅ |

---

## 13. State Machines

| Entidad | Estados | DB lock |
|---------|---------|---------|
| Ausencias | pendiente→aprobada\|rechazada; terminales inmutables | ✅ trigger |
| Adelantos | pendiente→aprobado\|rechazado | ❌ UPDATE libre admin |
| Recibos firma | pendiente→firmado one-shot | ✅ RPC + trigger |
| Docs firma destinatario | one-shot empleado | ✅; admin puede alterar |
| Comunicaciones | abierta/en_curso/cerrada | parcial |

---

## 14. Concurrency

| Recurso | Test | Resultado |
|---------|------|-----------|
| Vacaciones cupo completo ×2 | `concurrencia_vacaciones.sh` | PASS |
| Cupos licencia aprobada ×2 | `concurrencia_cupos_licencia.sh` | PASS |
| Adelantos / fichajes / firmas docs | — | sin harness; RISK |
| Invitaciones completar race | — | RISK |

---

## 15. Privacy / Data Exposure

- Supervisor/`es_gestor` SELECT `empleados` incluye **CBU** y campos biométricos (RT-011 / BUG-022).
- RPC saldo_* filtra información laboral cross-tenant.
- `/api/cuentas` materializa emails Auth globales en memoria del server.
- `select *` frecuente en servicios; RLS acota filas pero no columnas.

---

## 16. Input Security

- HTML mail injection en avisos/resumen (CONFIRMED, LOW).
- Facturación cron **sí** escapa.
- PostgREST filters: riesgo clásico mitigado por RLS (no SQLi app-level visto).
- `redirectTo` Host-derived (PROBABLE).

---

## 17. File Uploads

- Prefijos por empresa en uploads gestores (mig 31) — OK en INSERT storage.
- Overwrite / MIME / SVG: no endurecido en app (RISK).
- Cadena peligrosa: INSERT fila `documentos_legajo` con URL ajena + SELECT storage `exists` (RT-006 + policy mig 40).

---

## 18. Rate Limiting

`dentroDelLimite` = `Map` en proceso. En Vercel: **N instancias × límite**. GET `/api/cuentas` sin rate limit + `listUsers`.

---

## 19. Performance

| Ítem | Clasificación |
|------|----------------|
| `listUsers` paginado en cuentas | CONFIRMED coste/PII |
| Queries sin paginación en listados grandes | PROBABLE |
| Gemini con contexto 12k | RISK coste |
| Números de latencia 10k empleados | no medidos |

---

## 20. Database Integrity

- FKs a `empleados(id)` sin exigir misma `empresa_id`.
- Unique cupos `(empresa, tipo)` OK.
- Índice un usuario por legajo (mig 54) puede no aplicarse si hay duplicados históricos (RISK).
- `NOT VALID` checks en remuneraciones: aplican a filas nuevas.

---

## 21. Migration Review (55–59)

| Mig | Intent | Residual |
|-----|--------|----------|
| 55 | Invitaciones confiables | `crear_perfil_usuario` aún lee metadata |
| 56 | Estados solicitud + adelantos UPDATE-only | **No generalizó** el fix FOR ALL a otras tablas |
| 57 | Firma recibo + storage recibos | Documentos no espejados |
| 58 | Ausencias + saldo vacaciones | RPC `saldo_*` grant sin tenant |
| 59 | Cupos licencia | Mismo IDOR en RPC lectura; pendientes no reservan |

No se editaron migraciones históricas en esta auditoría.

---

## 22. Test Coverage

| Área | Cobertura |
|------|-----------|
| Unit negocio | Alta (414) |
| RLS ausencias/adelantos/firma/cupos | Buena (SQL harness) |
| RLS recibos/remu/docs/cupos INSERT empleado | **Ausente** hasta `redteam_probe` |
| Storage documentos | Ausente |
| APIs invite/cuentas | Unit confianza; no integration auth real |
| Concurrencia vacaciones/cupos | Sí |
| E2E Supabase real | No |

---

## 23. E2E Coverage

Todos los specs bajo `e2e/` navegan a `/demo` (estado en memoria). **No** ejercitan Auth real, RLS ni Storage. Riesgos de esta auditoría quedan fuera del E2E.

---

## 24. Attack Matrix

| Attack | Role | Vector | Expected | Actual | Severity | Status |
|--------|------|--------|----------|--------|----------|--------|
| INSERT recibo propio publicado | empleado | PostgREST | DENY | **ALLOW** | CRITICAL | CONFIRMED RT-001 |
| INSERT remuneración 999999 | empleado | PostgREST | DENY | **ALLOW** | CRITICAL | CONFIRMED RT-002 |
| INSERT cupo casamiento=0 | empleado | PostgREST | DENY | **ALLOW** | HIGH | CONFIRMED RT-003 |
| RPC saldo vacaciones emp tenant B | empleado | RPC | DENY/null | **16** | HIGH | CONFIRMED RT-004 |
| RPC saldo licencia emp tenant B | empleado | RPC | DENY/null | **7** | HIGH | CONFIRMED RT-005 |
| INSERT doc_legajo path tenant B | empleado | PostgREST | DENY | **ALLOW** | HIGH | CONFIRMED RT-006 |
| UPDATE adelanto rechazado→aprobado | admin_rrhh | PostgREST | DENY | **ALLOW** | HIGH | CONFIRMED RT-007 |
| Self-demote last admin | admin_rrhh | PostgREST | DENY | **ALLOW** | MEDIUM | CONFIRMED RT-008 |
| SELECT empleado tenant B | admin A | PostgREST | DENY | DENY | — | OK RT-009 |
| Ausencia empresa A + emp B | admin_rrhh | PostgREST | DENY | **ALLOW** | HIGH | CONFIRMED RT-010 |
| Leer CBU colega mismo tenant | gestor | PostgREST | minimize | **ALLOW** | MEDIUM | CONFIRMED RT-011 |
| 2× vacaciones cupo | empleado | concurrent | 1 wins | 1 wins | — | OK |
| 2× cupo licencia aprobada | gestor | concurrent | 1 wins | 1 wins | — | OK |
| Firmar recibo / storage PDF cross-tenant | empleado | REST/Storage | DENY | DENY | — | OK (prior) |
| Completar cuenta con metadata | atacante | API | DENY | DENY | — | OK (prior) |
| listUsers + rate Map | admin | API | bounded | unbounded×instances | MEDIUM | CONFIRMED |
| HTML en mail avisos | admin | API | escaped | raw | LOW | CONFIRMED |

---

## 25. Findings

### RT-001 / RT-002 / RT-003 — FOR ALL INSERT bypass (CRITICAL)

**Evidencia:** policy `*_gestion` en mig `20260703000001` / `20260724000023`; probe live NOTICE CONFIRMED.  
**Por qué:** INSERT solo mira WITH CHECK; rol admin está solo en USING.  
**Repro:** JWT empleado → `POST /rest/v1/recibos` (o remuneraciones / cupos_licencia) con `empresa_id` propia.  
**Impacto:** falsificación de nómina/recibos; DoS de cupos (`dias_anuales=0`); basura en RRHH.  
**Expected:** solo `admin_rrhh`/superadmin.  
**Actual:** cualquier miembro del tenant.  
**Fix:** partir FOR ALL; INSERT WITH CHECK con `auth_rol()='admin_rrhh'` (mismo patrón mig 56).  
**Test:** extender `redteam_probe.test.sql` a CI.

### RT-004 / RT-005 — RPC saldo IDOR (HIGH)

**Evidencia:** mig 58/59 `SECURITY DEFINER` + `GRANT EXECUTE TO authenticated`; probe devolvió saldos de tenant B.  
**Impacto:** filtración de política de vacaciones/licencias cross-tenant (UUID enumerable vía otros leaks o sector).  
**Fix:** `empleados.empresa_id = auth_empresa() OR es_superadmin()`; o revocar EXECUTE y usar solo triggers.

### RT-006 — Documentos storage chain (HIGH)

**Evidencia:** `storage_select_documentos` mig 40 sin prefijo tenant; INSERT docs vía RT-pattern.  
**Impacto:** con path conocido, lectura cross-tenant de objetos en `documentos`.  
**Fix:** espejar mig 57 (`empresa_id` + `name like empresa_id/%`); cerrar INSERT docs.

### RT-007 — Adelantos sin máquina de estados (HIGH)

**Evidencia:** `adelantos_gestion FOR UPDATE` sin trigger de transición; probe reopen OK.  
**Impacto:** auditoría financiera rota; descuentos de período inconsistentes.  
**Fix:** trigger espejo de ausencias.

### RT-010 — Cross-link empleado/empresa (HIGH)

**Evidencia:** ausencia insertada con emp tenant B + empresa A.  
**Impacto:** corrupción multi-tenant / reportes cruzados.  
**Fix:** trigger `empleado.empresa_id = NEW.empresa_id` en ausencias, adelantos, turnos, fichajes, remuneraciones, docs, recibos.

### RT-008 — Last admin demote (MEDIUM)

Solo UI/API; PostgREST UPDATE `usuarios.rol` permitido por `usuarios_admin`.

### RT-011 — CBU a gestores (MEDIUM)

Mínimo privilegio no aplicado en columnas sensibles.

### RT-API-01 — listUsers + rate in-memory (MEDIUM)

### RT-API-02 — redirectTo Host (MEDIUM PROBABLE)

### RT-MAIL-01 — HTML injection avisos (LOW)

### Residuales conocidos no re-cerrados

BUG-012, BUG-014 (notificaciones spam), BUG-016 (adjuntos), BUG-018/019/020/021/022, R1 facial client descriptor, R5 no FORCE RLS, R6 auditoría writable.

---

## 26. Recommended Priorities

### P0 (bloquear prod)

1. **Cerrar FOR ALL INSERT** en todas las `*_gestion` (recibos, remuneraciones, empleados, documentos_legajo, cupos, descuentos, facturas_mono, docs_firma, turnos, eventos, alertas, usuarios).  
2. **Tenant-check en `saldo_*` RPCs** (o revocar EXECUTE).  
3. **Storage documentos** con prefijo tenant + empresa_id (clonar 57).

### P1

4. Trigger pertenencia `empleado_id`∈`empresa_id`.  
5. Máquina de estados adelantos.  
6. Last-admin en DB.  
7. Column masking CBU/biometría para supervisor.

### P2

8. Rate limit distribuido; dejar de `listUsers` global.  
9. Allowlist `APP_URL` en redirects.  
10. Escape HTML mails.  
11. Restaurar/fix adjuntos ausencias storage.  
12. Harness CI con `redteam_probe.test.sql`.

---

## 27. Residual Risks

- Incluso tras P0, gestores siguen viendo demasiado PII.  
- E2E demo no detectará regresiones RLS.  
- `crear_perfil_usuario` + metadata = segunda puerta si alguien reintroduce confianza en metadata.  
- FORCE RLS no activado (table owners bypass).  
- Overrides de vacaciones sin auditoría.  
- Cupos: pendientes apilables vía REST (no consumen hasta aprobar).

---

## 28. Final Verdict

# 🔴 NOT READY FOR PRODUCTION

### ¿Puede atacarse vía PostgREST / APIs / Storage / roles / concurrencia / cliente?

**Sí — con evidencia live (2026-08-10).**

Un empleado autenticado pudo:

1. Insertar **recibos** y **remuneraciones** falsos  
2. Insertar **cupos** (DoS de licencias)  
3. Leer **saldos de otro tenant** vía RPC  
4. Preparar lectura cross-tenant de **documentos** envenenando `archivo_url`  

Un admin pudo:

5. Reabrir **adelantos** resueltos  
6. Auto-degradarse siendo el último admin  
7. Cross-link **ausencias** entre tenants  

### Tooling ejecutado

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run test:ci` | ✅ 38 suites / **414** tests |
| `npm run build` | ✅ |
| RLS SQL (estados, firma, ausencias, cupos) | ✅ PASS |
| Concurrencia vacaciones + cupos | ✅ PASS |
| `redteam_probe.test.sql` | 🔴 hallazgos CONFIRMED |

### Relación con la auditoría anterior

Los fixes 001–010 **no se revirtieron**; se re-probaron y siguen efectivos en su perímetro. Esta pasada demuestra que el perímetro era insuficiente: el mismo anti-patrón de BUG-004 sigue en el resto del esquema, y las RPC de saldo de 58/59 abrieron un IDOR nuevo.

---

*Auditoría red team independiente. Sin cambios de producto. Evidencia reproducible en `supabase/tests/redteam_probe.test.sql`.*
