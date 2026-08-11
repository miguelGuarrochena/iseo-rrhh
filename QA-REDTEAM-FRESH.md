# QA Red Team — Fresh Security Audit (post claimed mig 60–65)

**Product:** ISEO RH — multi-tenant RRHH SaaS  
**Date:** 2026-08-10  
**Auditor posture:** external attacker with employee / supervisor / admin_rrhh JWTs, publishable key, PostgREST, RPC, Storage; **no** `service_role`  
**Rule:** product code not modified; UI not trusted  
**Evidence:** live `pg_policy` / `pg_proc` inventory + `supabase/tests/redteam_fresh_probe.test.sql` + systematic / prior red-team harnesses + concurrency scripts  

---

## 0. Remediation status (blocking fact)

**Migrations 60–65 are not implemented.**

| Check | Result |
|-------|--------|
| Files `supabase/migrations/*00060*` … `*00065*` | **Absent** |
| `supabase_migrations.schema_migrations` versions matching `0006[0-5]` | **0** |
| Max recorded migration | `20260807000053` |
| Live `recibos_gestion` | still **`FOR ALL`** |
| `assert_empleado_de_empresa` | **MISSING** |
| Design doc `QA-AUTHZ-REMEDIATION-DESIGN.md` | still **“Design only — no migrations applied”** |

A green verdict cannot be issued against a remedia­tion that does not exist on disk or in the database. This audit treats the live system as the source of truth.

---

## 1. Executive verdict

# 🔴 RED — NOT READY FOR PRODUCTION

| GREEN gate | Status |
|------------|--------|
| No exploitable P0/P1 | **FAIL** |
| No cross-tenant data access | **FAIL** (RPC saldo IDOR; storage path poison; admin cross-link) |
| No privilege escalation | **FAIL** (employee management INSERT; supervisor payroll INSERT; last-admin demote) |
| No unauthorized financial/payroll manipulation | **FAIL** |
| No unauthorized document/storage access | **FAIL** |
| No critical state-machine bypass | **FAIL** (adelanto reopen; payroll invent via INSERT) |

Lint / typecheck / unit / build / prior business-rule SQL harnesses are green. That does **not** imply authorization is safe.

---

## 2. Verification suite results

| Suite | Result |
|-------|--------|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run test:ci` | PASS — **414** tests |
| `npm run build` | PASS |
| `redteam_fresh_probe.test.sql` | Ran; **14 HIT / 6 BLOCKED** (see §4) |
| `redteam_systematic_probe.test.sql` | Ran; **~20 CONFIRMED** weak-INSERT / IDOR / integrity |
| `redteam_probe.test.sql` | Ran; prior RT-* still open |
| `rls_ausencias_estados_saldo.test.sql` | PASS (rollback) |
| `rls_cupos_licencia.test.sql` | PASS |
| `rls_estados_solicitud.test.sql` | PASS |
| `rls_firma_recibos.test.sql` | PASS |
| `rpc.test.sql` | PASS |
| `concurrencia_vacaciones.sh` | PASS |
| `concurrencia_cupos_licencia.sh` | PASS |

---

## 3. Attack surface (assumed known)

```
JWT (empleado | supervisor | admin_rrhh)
  → PostgREST (anon key) → public.* RLS
  → RPC SECURITY DEFINER
  → Storage objects policies
  → Next.js /api/* (Bearer → service_role server-side)
```

Tenant identity from `public.usuarios` via `auth_empresa()` / `auth_rol()` / `auth_empleado()` / `es_gestor()`.

---

## 4. Fresh probe results (`FRT-*`)

Fixture tenants A/B, roles emp/sup/adm; entire script wrapped in `BEGIN` … `ROLLBACK`.

| ID | Result | One-line |
|----|--------|----------|
| META | **FAIL remediations** | `recibos_gestion FOR ALL` still present; `assert_empleado_de_empresa` missing |
| FRT-1 | **HIT** | Employee INSERT `remuneraciones` |
| FRT-2 | **HIT** | Supervisor INSERT peer `recibos` |
| FRT-3a/b | **HIT** | Supervisor SELECT peer CBU + `descriptor_facial` |
| FRT-4 | BLOCKED* | Ghost+ausencia chain via `RETURNING` (see note) |
| FRT-5 | **HIT** | `saldo_vacaciones_disponible` other-tenant = 21 |
| FRT-6 | **HIT** | Employee poison `documentos_legajo.archivo_url` → tenant B path |
| FRT-7 | BLOCKED | Employee self-promote `admin_rrhh` |
| FRT-8 | BLOCKED | Employee rebind `empleado_id` to peer |
| FRT-9a | **HIT** | Forge `auditoria_acciones` |
| FRT-9b | **HIT** | `errores_app` with foreign `empresa_id` |
| FRT-10 | **HIT** | Last `admin_rrhh` self-demote to `empleado` |
| FRT-11a | **HIT** | Admin cross-link ausencia (`empresa` A + `empleado` B) |
| FRT-11b | **HIT** | Admin reopen adelanto `rechazado` → `aprobado` |
| FRT-12 | BLOCKED | Employee INSERT ausencia `aprobada` (mig 56 holds) |
| FRT-13 | BLOCKED | Employee UPDATE own `nombre_completo` (product self-profile broken) |
| FRT-14a | HIT (by design) | Supervisor INSERT turno |
| FRT-14b | **HIT** | Supervisor INSERT `cupos_licencia` dias=0 |
| FRT-15 | BLOCKED | Employee open `comunicaciones` as peer legajo |

\*FRT-4 false negative for INSERT capability: systematic probe **A7 CONFIRMED** employee ghost `empleados` INSERT. Fresh probe used `RETURNING id`, which also requires SELECT RLS; employee SELECT does not cover the new row, so INSERT+RETURNING fails while Prefer:return=minimal / no RETURNING still inserts.

---

## 5. Exploitable findings (full cards)

### FRT-1 — Employee forges payroll row

| Field | Value |
|-------|-------|
| **EXPECTED** | Only `admin_rrhh` INSERT `remuneraciones` |
| **ACTUAL** | Employee INSERT succeeds |
| **ATTACKER ROLE** | `empleado` |
| **ENTRY POINT** | PostgREST `POST /remuneraciones` |
| **DATABASE OBJECT** | `remuneraciones` / policy `remuneraciones_gestion` (`FOR ALL`, weak CHECK) |
| **IMPACT** | Invent salary history / corrupt liquidaciones inputs |
| **SEVERITY** | **P0** |
| **REPRO** | See `redteam_fresh_probe.test.sql` FRT-1 |

### FRT-2 — Supervisor publishes peer recibo

| Field | Value |
|-------|-------|
| **EXPECTED** | Only `admin_rrhh` creates recibos; supervisor has no payroll write |
| **ACTUAL** | Supervisor INSERT recibo for peer with forged `firmado_empleador_en` |
| **ATTACKER ROLE** | `supervisor` |
| **ENTRY POINT** | PostgREST `POST /recibos` |
| **DATABASE OBJECT** | `recibos` / `recibos_gestion` |
| **IMPACT** | Fake payslips; poison `archivo_url`; payroll privacy breach |
| **SEVERITY** | **P0** |
| **REPRO** | FRT-2 |

Same class for **employee** INSERT recibos (systematic A1 / RT-001).

### FRT-3 — Supervisor harvests peer PII / biometrics

| Field | Value |
|-------|-------|
| **EXPECTED** | CBU / face descriptors limited to self or admin_rrhh |
| **ACTUAL** | Supervisor SELECT peer `cbu`, `descriptor_facial` |
| **ATTACKER ROLE** | `supervisor` |
| **ENTRY POINT** | PostgREST `GET /empleados` |
| **DATABASE OBJECT** | `empleados` / `empleados_select` |
| **IMPACT** | Financial + biometric PII exposure (Ley 25.326) |
| **SEVERITY** | **P1** |
| **REPRO** | FRT-3a/b |

### FRT-5 — RPC saldo IDOR (cross-tenant)

| Field | Value |
|-------|-------|
| **EXPECTED** | RPC rejects `p_empleado_id` outside caller tenant |
| **ACTUAL** | Returns integer for other-tenant employee (e.g. 21) |
| **ATTACKER ROLE** | `empleado` |
| **ENTRY POINT** | `rpc/saldo_vacaciones_disponible` (also `saldo_licencia_disponible`) |
| **DATABASE OBJECT** | SECURITY DEFINER functions — **no tenant check** |
| **IMPACT** | Cross-tenant workforce intelligence / planning oracle |
| **SEVERITY** | **P1** |
| **REPRO** | FRT-5; systematic J1/J2 |

### FRT-6 — Document path poison → Storage read chain

| Field | Value |
|-------|-------|
| **EXPECTED** | Employee cannot create legajo docs; Storage SELECT requires tenant path |
| **ACTUAL** | Employee INSERT `documentos_legajo` with `archivo_url = '<tenantB>/secret.pdf'`; `storage_select_documentos` allows SELECT when row `archivo_url = objects.name` AND `empleado_id = auth_empleado()` **without** path tenant match |
| **ATTACKER ROLE** | `empleado` |
| **ENTRY POINT** | PostgREST INSERT + Storage download |
| **DATABASE OBJECT** | `documentos_legajo` + `storage.objects` policy `storage_select_documentos` |
| **IMPACT** | Cross-tenant document theft if object name known |
| **SEVERITY** | **P0** |
| **REPRO** | FRT-6 / A5 / RT-006 |

### FRT-9 — Forge audit / error telemetry

| Field | Value |
|-------|-------|
| **EXPECTED** | Audit rows only from trusted server paths; `empresa_id` bound to caller |
| **ACTUAL** | Employee INSERT arbitrary `auditoria_acciones`; `errores_app` accepts foreign `empresa_id` |
| **ATTACKER ROLE** | `empleado` |
| **ENTRY POINT** | PostgREST |
| **DATABASE OBJECT** | `auditoria_acciones`, `errores_app` |
| **IMPACT** | Audit integrity loss; cross-tenant noise in error streams |
| **SEVERITY** | **P2** |
| **REPRO** | FRT-9a/b |

### FRT-10 — Last-admin demotion

| Field | Value |
|-------|-------|
| **EXPECTED** | Cannot remove last `admin_rrhh` of a tenant |
| **ACTUAL** | Sole admin updates own `rol` → `empleado` |
| **ATTACKER ROLE** | `admin_rrhh` (compromised or malicious) |
| **ENTRY POINT** | PostgREST `PATCH /usuarios` |
| **DATABASE OBJECT** | `usuarios` — no last-admin trigger |
| **IMPACT** | Tenant lockout / irreversible loss of RRHH control |
| **SEVERITY** | **P1** |
| **REPRO** | FRT-10 / RT-008 |

### FRT-11a — Cross-tenant integrity (`empleado∉empresa`)

| Field | Value |
|-------|-------|
| **EXPECTED** | `ausencias.empleado_id` must belong to `ausencias.empresa_id` |
| **ACTUAL** | Admin inserts ausencia with empresa A + empleado from tenant B |
| **ATTACKER ROLE** | `admin_rrhh` |
| **ENTRY POINT** | PostgREST INSERT |
| **DATABASE OBJECT** | No `assert_empleado_de_empresa` invariant |
| **IMPACT** | Orphan / ghost payroll & absence records spanning tenants |
| **SEVERITY** | **P0** |
| **REPRO** | FRT-11a / O2 / RT-010 |

### FRT-11b — Adelanto state-machine bypass

| Field | Value |
|-------|-------|
| **EXPECTED** | Terminal states (`aprobado`/`rechazado`) immutable except cancel path |
| **ACTUAL** | Admin UPDATE `rechazado` → `aprobado` |
| **ATTACKER ROLE** | `admin_rrhh` |
| **ENTRY POINT** | PostgREST UPDATE |
| **DATABASE OBJECT** | `adelantos` — UPDATE policy without state lock (unlike ausencias mig 58) |
| **IMPACT** | Forge financial approvals; undo rejections |
| **SEVERITY** | **P1** |
| **REPRO** | FRT-11b / O1 |

### FRT-14b — Supervisor zeros license cupos

| Field | Value |
|-------|-------|
| **EXPECTED** | Cupos writable only by `admin_rrhh` |
| **ACTUAL** | Supervisor INSERT `cupos_licencia` with `dias_anuales=0` via weak `FOR ALL` CHECK |
| **ATTACKER ROLE** | `supervisor` |
| **ENTRY POINT** | PostgREST |
| **DATABASE OBJECT** | `cupos_licencia_gestion` |
| **IMPACT** | DoS of license approvals for the tenant |
| **SEVERITY** | **P1** |
| **REPRO** | FRT-14b; employee equivalent A3 |

### Systematic A7 / A9–A11 — Employee management INSERT class

Confirmed independently of FRT labels:

| Probe | Object | Severity |
|-------|--------|----------|
| A1 | `recibos` | P0 |
| A2 | `remuneraciones` | P0 |
| A3 | `cupos_licencia` | P1 |
| A4 | `descuentos_recurrentes` | P0 |
| A5 | `documentos_legajo` | P0 |
| A6 | `documentos_firma` | P0 |
| A7 | `empleados` (ghost) | P0 |
| A8 | `facturas_monotributo` | P1 |
| A9 | `turnos` | P1 |
| A10 | `alertas` | P2 |
| A11 | `eventos_agenda` | P1 |

**Root cause (unchanged):** Postgres evaluates **only `WITH CHECK`** on INSERT. Policies with `USING (admin/gestor…)` and `WITH CHECK (empresa_id = auth_empresa())` grant every authenticated tenant member INSERT.

### O3 — Historical fichaje timestamp

| Field | Value |
|-------|-------|
| **EXPECTED** | Server clocks `ts` / rejects client historical stamps |
| **ACTUAL** | Employee INSERT fichaje with historical `ts` |
| **SEVERITY** | **P2** |
| **REPRO** | systematic O3 |

### Storage — logos world-readable; documentos without path bind

| Policy | Issue | Severity |
|--------|-------|----------|
| `storage_select_logos` | `bucket_id = 'logos'` only — any auth user reads all logos | P3 |
| `storage_select_documentos` | EXISTS on poisoned `archivo_url` without `name ~~ auth_empresa()||'/%'` | P0 (with FRT-6) |
| `storage_select_recibos` | Tenant path + owner checks | **OK** (mig 57) |

### `dias_habiles_entre` — tenant oracle

SECURITY DEFINER accepts arbitrary `p_empresa`; authenticated can compute calendars for other tenants (**P2** / J4).

---

## 6. Attack matrix (current live)

Legend: 🔴 exploitable · 🟢 blocked as designed · 🟠 integrity / residual · ⬜ N/A

| Attack class | Employee | Supervisor | Admin |
|--------------|----------|------------|-------|
| INSERT payroll (`remuneraciones`/`recibos`) | 🔴 | 🔴 | 🟢 (intended) |
| INSERT docs / cupos / descuentos / ghosts | 🔴 | 🔴 (cupos) | 🟢 |
| INSERT ausencia/adelanto already approved | 🟢 | — | 🟢 insert ok |
| UPDATE resolve ausencia (SM) | 🟢 blocked | 🟢 gestor | 🟠 reopen paths differ |
| UPDATE adelanto terminal → approved | 🟢 blocked | — | 🔴 |
| Cross-tenant SELECT empleados | 🟢 | 🟢 | 🟢 |
| Cross-tenant RPC saldo | 🔴 | 🔴 | 🔴 |
| Storage recibos path | 🟢 | — | 🟢 |
| Storage docs poison chain | 🔴 | 🔴 | 🟠 |
| Self-promote rol | 🟢 | 🟢† | 🔴 last-admin |
| Rebind `empleado_id` self | 🟢 | — | 🟠 |
| Cross-link `empleado_id`≠`empresa_id` | — | — | 🔴 |
| Forge audit / errores | 🔴 | 🔴 | 🔴 |
| Invitaciones browser | 🟢 deny-all | 🟢 | API+service |
| Vacaciones/cupo concurrency | 🟢 | 🟢 | 🟢 |

† Role escalation blocked by `prevenir_escalada_rol_usuario` for non-admins; last-admin demote still open for admin.

---

## 7. Schema-wide invariant audit (`empresa_id` ↔ `empleado_id`)

| Table | DB FK / trigger enforcing empleado∈empresa? | Live result |
|-------|-----------------------------------------------|-------------|
| ausencias | **No** | Admin cross-link **HIT** |
| adelantos | **No** | Same class residual |
| recibos | **No** | Weak INSERT + no membership |
| remuneraciones | **No** | Weak INSERT |
| documentos_legajo | **No** | Poison path |
| descuentos_recurrentes | **No** | Weak INSERT |
| turnos | **No** | Weak INSERT |
| fichajes | Self / gestor only | Historical `ts` residual |
| comunicaciones | Partial (own legajo) | Peer insert **BLOCKED** |

**Invariant `assert_empleado_de_empresa` (planned mig 63): MISSING.**

---

## 8. SECURITY DEFINER re-audit

| Function | Tenant / auth gate | Verdict |
|----------|--------------------|---------|
| `auth_*` / `es_*` | self | OK helpers (anon EXECUTE residual) |
| `firmar_recibo` | owner + tenant + published | 🟢 |
| `fichar_con_rostro` | empresa + face match | 🟢 / client descriptor residual |
| `saldo_vacaciones_disponible` | **none** | 🔴 P1 IDOR |
| `saldo_licencia_disponible` | **none** | 🔴 P1 IDOR |
| `dias_habiles_entre` | any empresa id | 🟠 P2 |
| `empresa_de_documento_firma` | returns id / null | 🟠 low oracle |
| `lock_ausencia_maquina_estados` | trigger | 🟢 |
| `exigir_saldo_vacaciones_al_insertar` | trigger + lock | 🟢 |
| `exigir_cupo_licencia_aprobada` | trigger | 🟢 |
| `lock_recibo_firma_empleado` | trigger | 🟢 |
| `prevenir_escalada_rol_usuario` | trigger | 🟢 (not last-admin) |
| `crear_perfil_usuario` | signup path | review operational |
| `cumples_de_empresa` / `vacaciones_aprobadas_mi_sector` | scoped | OK-ish |

---

## 9. RLS policy re-audit (including previously “OK”)

### Weak `FOR ALL` (role in USING, tenant-only WITH CHECK) — still live

`recibos_gestion`, `remuneraciones_gestion`, `cupos_licencia_gestion`, `descuentos_gestion`, `documentos_gestion`, `documentos_firma_gestion`, `empleados_gestion`, `facturas_mono_gestion`, `alertas_gestion`, `usuarios_admin`, `turnos_gestion`, `eventos_gestion`

### Matched `FOR ALL` (role in both USING and CHECK) — OK for this class

`convenios_gestion`, `feriados_gestion`, `terminales_gestion`, `vacaciones_pendientes_gestion`, `notas_internas_admin`, superadmin-only tables

### Split policies holding (mig 56+)

`ausencias_*`, `adelantos_*` INSERT pending-only for employee — **reconfirmed** FRT-12 / B1 / B2

### Grants

Probe harness grants `authenticated` DML on public tables (mirrors PostgREST reality). Table privileges alone are not the control plane — **RLS is**. Weak WITH CHECK is the failure.

### Overlapping / permissive OR

Multiple permissive policies OR together. SELECT policies do not compensate for weak INSERT CHECK. Employee INSERT+RETURNING can fail SELECT while INSERT without representation still succeeds (FRT-4 vs A7).

---

## 10. API routes (service_role behind Bearer)

| Route | AuthZ sketch | Fresh note |
|-------|--------------|------------|
| `/api/invitaciones` | superadmin / admin_rrhh; invite authority in `invitaciones` | 🟢 vs Auth metadata trust (mig 55 class) |
| `/api/cuentas` | admin/superadmin; empresa scoped for admin | 🟢 intent; service_role power = server only |
| cron / avisos / ayuda / convenio / equipo-iseo | role checks vary | No new P0 found without service_role client |

Attacker **without** service_role cannot call admin client; API bypass of DB RLS remains a **server compromise** class, not browser JWT class.

---

## 11. New vulnerabilities only

Relative to claiming “60–65 closed everything,” **nothing in that design is closed**. Findings that are still open are listed in §5.

**Fresh-emphasized / under-called previously:**

1. **Supervisor payroll write** (FRT-2) — not only employees abuse weak CHECK; gestores hit the same hole on admin-intended tables.  
2. **Supervisor cupo wipe** (FRT-14b) — operational DoS without being admin.  
3. **FRT-13 product regression:** employee cannot UPDATE own `nombre_completo` → `actualizarMiPerfil` broken under current RLS (USING requires admin). Not an attacker win; blocks legitimate self-service planned in mig 60 (`usuarios_actualizar_propio`).  
4. **Logos bucket** world-readable among authenticated users.  
5. **INSERT vs RETURNING** nuance on ghost employees (false sense of security if only RETURNING paths are tested).

No brand-new root-cause class beyond **weak FOR ALL INSERT**, **SECDEF IDOR**, **missing empleado∈empresa**, **adelanto SM**, **storage EXISTS without path**, **last-admin** — all still present because 60–65 were never applied.

---

## 12. Previously fixed — remain fixed (regression check)

| Control | Source | Fresh result |
|---------|--------|--------------|
| Employee cannot INSERT ausencia `aprobada` | mig 56 | 🟢 FRT-12 / B1 |
| Employee cannot INSERT adelanto `aprobado` | mig 56 | 🟢 B2 |
| Employee cannot UPDATE request → approved | mig 56/58 | 🟢 E1/E2 |
| Ausencia state machine | mig 58 | 🟢 (employee path) |
| Vacation balance concurrency | mig 58 | 🟢 script PASS |
| License cupo on `aprobada` only + concurrency | mig 59 | 🟢 script PASS |
| `firmar_recibo` path / no employee recibo UPDATE | mig 57 | 🟢 E3 / J5 |
| Storage recibos tenant prefix | mig 57 | 🟢 policy text |
| Cross-tenant SELECT empleados | base RLS | 🟢 I1 / RT-009 |
| Invitaciones deny-all for browser | mig 55 | 🟢 FP5 |
| Self-promote empleado → admin | trigger | 🟢 FRT-7 / L1 |
| Self rebind `empleado_id` | trigger/RLS | 🟢 FRT-8 |
| Peer `comunicaciones` as other legajo | RLS | 🟢 FRT-15 |
| Matched FOR ALL feriados/convenios/terminales/vacaciones_pendientes/notas | base | 🟢 FP1–4 |
| `movimientos_financieros` superadmin-only | base | 🟢 M1 |

**No regression** of Bloques 1–6 business locks was observed. The authorization crater outside those locks remains.

---

## 13. Severity roll-up

### P0
- Weak FOR ALL INSERT on payroll/docs/employees (FRT-1/2/6, A1–A8)  
- Storage document poison chain  
- Admin cross-link `empleado_id` / `empresa_id`  

### P1
- RPC saldo IDOR (both)  
- Supervisor PII/biometrics read  
- Last-admin demote  
- Adelanto reopen  
- Supervisor/employee cupo DoS  
- Ghost employees (INSERT without RETURNING)  
- Turnos/eventos employee forge  

### P2
- Forge auditoria / errores_app tenant  
- Historical fichaje `ts`  
- `dias_habiles_entre` oracle  
- Alertas spam INSERT  

### P3
- Logos SELECT any authenticated  
- Anon EXECUTE on helper SECDEF functions  
- FORCE RLS false (owner bypass residual)

---

## 14. What would be required for GREEN

Implement and verify migrations **60–65** as designed in `QA-AUTHZ-REMEDIATION-DESIGN.md`, then re-run this fresh probe until:

- META shows `recibos_gestion FOR ALL` **gone** and `assert_empleado_de_empresa` **present**  
- All FRT-1/2/5/6/10/11a/11b/14b → **BLOCKED**  
- Systematic A1–A11 / J1–J2 / O1–O2 → **DENIED**  
- No P0/P1 remain exploitable under employee/supervisor/admin JWT  

Until then, verdict stays **RED** regardless of green unit/build suites.

---

## 15. Final production verdict

**🔴 RED**

The claimed remediations 60–65 are **not in the repository and not in the live database**. An employee with a normal JWT can still forge payroll and document rows; supervisors can forge recibos and wipe cupos; SECURITY DEFINER saldo RPCs still leak cross-tenant; storage document SELECT still trusts poisoned DB paths; admins can still cross-link tenants and reopen adelantos; last admin can still demote themselves.

Ship blockers: **close weak FOR ALL INSERT**, **tenant-check saldo RPCs**, **storage documentos path bind**, **empleado∈empresa invariant**, **adelanto state machine**, **last-admin guard** — then repeat this audit from zero.
