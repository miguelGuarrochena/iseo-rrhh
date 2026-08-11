# Independent Final Production-Readiness Security Audit

**Date:** 2026-08-10  
**Scope:** Live Postgres schema + migrations on disk (60–69), PostgREST/RPC/RLS/Storage/triggers  
**Method:** Fresh inventory + new `IND-*` adversarial probes (rollback-wrapped). No product code or migrations were modified.  
**Evidence:** `supabase/tests/independent_final_probe.test.sql` + live `psql` reproduction  

---

## 1. Executive verdict

# 🟡 YELLOW — NOT PRODUCTION-GREEN

Migrations **60–69 are on disk and applied**. Prior FRT/RT classes remain blocked. Tooling is green. Legitimate flows (employee pending ausencia, admin CBU via view, supervisor turnos) work.

**However, this independent review found one exploitable P2** that prior probes did not catch (they only tested `empresa_de_documento_firma` with a non-existent UUID):

| Sev | ID | Finding |
|-----|-----|---------|
| **P2** | IND-04 / IND-06b | `empresa_de_documento_firma(uuid)` SECURITY DEFINER returns another tenant’s `empresa_id` to any `authenticated` **or `anon`** caller who knows a `documentos_firma.id` |

No new exploitable **P0/P1** found. One **P3** residual (admin can store cross-tenant `archivo_url`; Storage RLS still blocks the read).

---

## 2. New findings

### IND-04 / IND-06b — `empresa_de_documento_firma` cross-tenant / anonymous oracle

| Field | Detail |
|-------|--------|
| **Severity** | **P2** |
| **Exploitability** | PostgREST RPC: `GET/POST /rest/v1/rpc/empresa_de_documento_firma` with anon or user JWT |
| **Object** | `public.empresa_de_documento_firma(doc_id uuid)` SECURITY DEFINER |
| **Root cause** | Function body is `select empresa_id from documentos_firma where id = doc_id` with **no** `auth_empresa()` / role check. `EXECUTE` granted to `authenticated` **and** `anon`/`public`. |
| **Reproduction** | See probe IND-04/06b. Confirmed live: employee JWT of tenant A calling with tenant B’s `documentos_firma.id` returns B’s `empresa_id`. Same call as `role anon` also returns B’s id. |
| **Impact** | Tenant-mapping / existence oracle (not document content). Requires knowledge of a document UUID (unguessable) **or** leakage of that UUID from another channel. Anonymous callability raises severity vs tenant-only. |
| **Not fixed** | Per audit charter — reported only. |

### IND-18 — Admin INSERT `documentos_legajo` with foreign storage path

| Field | Detail |
|-------|--------|
| **Severity** | **P3** |
| **Exploitability** | PostgREST INSERT as `admin_rrhh` |
| **Object** | `documentos_legajo.archivo_url` (no DB CHECK that path prefix = `empresa_id`) |
| **Root cause** | Mig 62 hardened **Storage SELECT** (path must match row `empresa_id`), not INSERT path validation on the table. |
| **Impact** | Broken/poisoned references in DB. Cross-tenant **file read remains blocked** by `storage_select_documentos` (`name like d.empresa_id || '/'`). |
| **Accepted residual** | Yes, unless product wants CHECK/trigger on `archivo_url`. |

### Intentional (not vulnerabilities)

| Behavior | Why |
|----------|-----|
| FRT-13 / employee UPDATE `nombre_completo` | Policy + `lock_usuario_autoedicion` |
| FRT-14a / supervisor INSERT turnos | Design (gestor scheduling) |
| Supervisor INSERT pending adelanto for peer (`es_gestor` on `adelantos_pedir`) | Explicit policy since mig 56; SELECT of peer adelantos still denied |
| Public `logos` bucket | Branding via `getPublicUrl`; authenticated SELECT scoped to tenant prefix (mig 67) |

---

## 3. Attack matrix by role

| Attack class | empleado | supervisor | admin_rrhh | anon |
|--------------|----------|------------|------------|------|
| INSERT payroll/recibos/cupos | DENIED | DENIED | ALLOW (own tenant) | DENIED |
| SELECT peer CBU / biometrics | own only (view) | **DENIED** (view null + column REVOKE) | ALLOW | DENIED |
| SELECT peer remu / adelantos | DENIED | DENIED | ALLOW | DENIED |
| UPDATE peer CBU / own biometrics | DENIED | DENIED (0 rows RLS) | ALLOW | DENIED |
| Self-promote / rebind legajo | DENIED | — | — | DENIED |
| Absence approved self-insert / reopen | DENIED | — | resolve OK; reopen blocked by SM | — |
| Mutate dias after approve | — | DENIED (SM) | DENIED (SM) | — |
| Cross-link remu empB+empA | — | — | DENIED (mig 63) | — |
| Rebind `empleado.empresa_id` | — | — | DENIED (trigger) | — |
| Last-admin demote | — | — | DENIED | — |
| Forge audit name / foreign errores_app | DENIED | DENIED | — | — |
| Historical fichaje `ts` | forced `now()` | gestor may backdate | may backdate | — |
| Saldo / dias_habiles cross-tenant | DENIED | DENIED | DENIED | DENIED |
| Storage logos list other tenant | DENIED | DENIED | DENIED | public URL if path known |
| **`empresa_de_documento_firma` other tenant** | **HIT (oracle)** | **HIT** | **HIT** | **HIT** |
| Poison docs path (INSERT) | DENIED | DENIED | HIT (P3 integrity) | DENIED |

---

## 4. DB / RLS / RPC / Storage audit summary

### Migrations 60–69

| Check | Result |
|-------|--------|
| On disk | `20260810000060` … `69` present (10 files) |
| Applied (`schema_migrations`) | All 10 present |
| PII column SELECT (`cbu`, `descriptor_facial`) for `authenticated` | `false` after mig 69 / reassert |

### FOR ALL policies remaining

`comunicacion_lecturas`, `config_plataforma`, `convenios`, `empresas`, `feriados`, `movimientos_financieros`, `notas_internas`, `terminales`, `vacaciones_pendientes` — inspected; USING/WITH CHECK aligned (admin/superadmin scoped). No weak payroll `FOR ALL` of the pre-60 class.

### SECURITY DEFINER

32 functions; all set `search_path=public`. Sensitive saldo/dias/fichar/firmar correctly deny anon EXECUTE. **Gap:** `empresa_de_documento_firma` (and several trigger helpers) still `EXECUTE` for `anon`/`public`.

### View `empleados_lectura`

Owner `postgres`, `security_barrier=true`, redacts CBU/biometrics unless admin/self; WHERE mirrors gestor/self tenant visibility. App reads this view.

### Storage

| Bucket | public | Auth SELECT |
|--------|--------|-------------|
| documentos / fotos / recibos-pdf | private | tenant-prefixed policies |
| logos | **public** | authenticated SELECT prefix `auth_empresa()/` |

### Tables with `empresa_id`

All have RLS enabled; none without RLS.

---

## 5. Regression results

| Suite | Result |
|-------|--------|
| lint | ✅ |
| tsc | ✅ |
| unit tests | ✅ 415 |
| build | ✅ |
| `rls_migration60`…`65`, `66_68`, cupos | ✅ PASS |
| concurrency vacaciones / cupos | ✅ PASS |
| fresh red-team FRT-* | attack classes BLOCKED; design HITs 13/14a only |
| **independent IND-*** | **HIT IND-04, IND-06b, IND-18**; all other attacks BLOCKED; IND-20 legit ALLOW |

---

## 6. Remaining accepted risks

| Sev | Risk | Notes |
|-----|------|-------|
| **P2** | `empresa_de_documento_firma` oracle (auth + anon) | **Not accepted for GREEN** — must be remediated (authz gate and/or revoke anon EXECUTE) before declaring production-green |
| P3 | Public `logos` bucket | Branding by design |
| P3 | Admin may store cross-tenant `archivo_url` | Storage read still denied |
| — | Invite metadata → `crear_perfil_usuario` | Trusted invite path; open signup without `invited_at` does not auto-provision |

---

## 7. Final production recommendation

**Do not ship as GREEN** until IND-04/06b is closed (authorize callers or stop exposing the RPC to clients/anon; keep DEFINER only for policy use as needed).

After that fix and a re-probe:

- P0/P1 remain clear in this review  
- Prior 60–69 controls hold under fresh attack  
- Tooling and concurrency remain healthy  

**Current recommendation:** 🟡 **YELLOW — hold production “security-ready” claim** pending DEFINER oracle remediation.

---

## Remediation note (2026-08-10)

**IND-04 / IND-06b CLOSED** by migration `20260810000070_empresa_documento_firma_tenant_gate.sql`:

- Function returns `empresa_id` only for `es_superadmin()` or `d.empresa_id = auth_empresa()`
- `EXECUTE` revoked from `anon`/`public`; retained for `authenticated` (RLS policy invoker)
- Independent probe: `BLOCKED IND-04` (`e=null`), `BLOCKED IND-06b`
- Test: `supabase/tests/rls_migration70.test.sql` PASS

Accepted residual unchanged: **P3** IND-18 admin poison `archivo_url`; **P3** public logos.
