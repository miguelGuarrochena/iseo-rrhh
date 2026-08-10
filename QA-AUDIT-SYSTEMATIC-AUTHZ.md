# Systematic Database Authorization Audit

**Date:** 2026-08-10  
**Focus:** Class vulnerability `FOR ALL` + weak `WITH CHECK (empresa_id = auth_empresa())` (RT-001 pattern)  
**Scope:** Entire live Supabase schema (`public` + `storage`) — every table, policy, SECURITY DEFINER RPC  
**Method:** Live `pg_policy` inventory + adversarial employee-JWT SQL probes (rollback)  
**Evidence:** `supabase/tests/redteam_systematic_probe.test.sql`  
**Product code / migrations:** **NOT modified**

---

## Verdict

# 🔴 RED

Any of P0/P1 authorization, tenant isolation, financial, document, or privilege-adjacent issues remain.

An authenticated **empleado** can create management/financial/document records via PostgREST because **12 `FOR ALL` policies** grant INSERT through a WITH CHECK that only validates tenant membership, not role.

---

## 1. Table-by-table authorization matrix

Legend for **emp / ges / adm** (authenticated PostgREST, no service_role):

- ✅ allowed as designed  
- 🔴 exploitable hole (confirmed probe or same policy class confirmed)  
- 🟠 integrity gap (confirmed)  
- ⬜ denied  
- — N/A / no policy for that op  

`FORCE RLS` = **false** on all public tables (owners/bypass risk for table owner roles — residual).

| Table | SELECT | INSERT | UPDATE | DELETE | FOR ALL? | Weak CHECK INSERT? | empresa_id | empleado∈empresa | Notes |
|-------|--------|--------|--------|--------|----------|--------------------|------------|------------------|-------|
| **recibos** | own/adm | 🔴 emp via gestion | ⬜ emp (no UPDATE policy for emp; firma via RPC) | ⬜ emp | **YES** `recibos_gestion` | **YES** | yes on CHECK | **NO** | RT-A1/C2 CONFIRMED |
| **remuneraciones** | own/adm | 🔴 emp | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | **NO** | A2 CONFIRMED |
| **cupos_licencia** | tenant | 🔴 emp | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | N/A | A3 CONFIRMED DoS |
| **descuentos_recurrentes** | tenant/adm | 🔴 emp | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | **NO** | A4 CONFIRMED |
| **documentos_legajo** | own/adm | 🔴 emp | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | **NO** | A5 + storage chain |
| **documentos_firma** | tenant rules | 🔴 emp | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | N/A | A6 CONFIRMED |
| **empleados** | own/ges | 🔴 emp ghost | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | N/A | A7 CONFIRMED |
| **facturas_monotributo** | rules | 🔴 emp | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | **NO** | A8 CONFIRMED |
| **turnos** | tenant | 🔴 emp | ⬜ emp | ⬜ emp | **YES** (`es_gestor` USING) | **YES** | yes | **NO** | A9 CONFIRMED |
| **eventos_agenda** | tenant | 🔴 emp | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | N/A | A11 CONFIRMED |
| **alertas** | tenant | 🔴 emp (policy) | ⬜ emp | ⬜ emp | **YES** | **YES** | yes | **NO** | Same class; enum fixed in probe |
| **usuarios** | self/ges | 🟠 PROBABLE | ⬜ emp (USING blocks) | ⬜ emp | **YES** | **YES** | yes | N/A | INSERT needs auth.users FK; L3 blocked creating auth row |
| **ausencias** | own/ges | ✅ pendiente only (emp) | ⬜ emp resolve | ⬜ emp | No (split) | No | yes | **NO** (adm cross-link 🟠) | B1/C1 DENIED; O2 CONFIRMED |
| **adelantos** | own/adm | ✅ pendiente only | ⬜ emp; 🔴 adm reopen | adm delete | No (split, mig56) | No | yes | **NO** | B2/E2 DENIED; O1 CONFIRMED |
| **fichajes** | own/ges | ✅ self (🟠 forge ts) | — | — | No | N/A | yes | self or ges | O3 CONFIRMED historical ts |
| **feriados** | tenant | ⬜ emp | ⬜ emp | ⬜ emp | YES matched rol | No | yes | N/A | FP1 correctly denied |
| **convenios** | tenant | ⬜ emp | ⬜ emp | ⬜ emp | YES matched | No | yes | N/A | FP2 denied |
| **vacaciones_pendientes** | narrowed | ⬜ emp | ⬜ emp | ⬜ emp | YES matched | No | yes | — | FP3 denied |
| **notas_internas** | adm | ⬜ emp | ⬜ emp | ⬜ emp | YES matched | No | yes | — | FP4 denied |
| **terminales** | tenant | ⬜ emp | ⬜ emp | ⬜ emp | YES matched | No | yes | N/A | policy OK |
| **notificaciones** | own | ⬜ emp→admin (EXISTS∩usuarios RLS); ges can | own mark | — | No | — | via destino | — | N1 DENIED for emp; ges spam PROBABLE |
| **comunicaciones** | own/ges | ✅ own/ges | ges | — | No | — | yes | partial | |
| **comunicacion_mensajes** | via parent | ✅ | — | — | No | — | via parent | — | |
| **comunicacion_lecturas** | own | own | own | own | YES own uid | OK | — | — | |
| **auditoria_acciones** | ges | 🔴 emp forge | — | — | No | actor=self | optional weak | — | N2 CONFIRMED |
| **errores_app** | super | 🔴 emp any empresa_id | — | super | No | uid only | **NO** | — | N3 CONFIRMED |
| **empresas** | member | ⬜ | adm limited | super ALL | super ALL | OK | — | — | |
| **config_plataforma** | — | super | super | super | YES super | OK | — | — | |
| **movimientos_financieros** | super | ⬜ emp | super | super | YES super | OK | — | — | M1 DENIED |
| **avisos_facturacion** | super | super | — | — | — | OK | — | — | |
| **avisos_resumen_semanal** | super | super | — | — | — | OK | — | — | |
| **invitaciones** | ⬜ | ⬜ | ⬜ | ⬜ | RLS on, **0 policies** | deny-all | — | — | FP5 DENIED |
| **documento_firma_destinatarios** | split | adm insert | locked | adm | No | OK-ish | via doc | — | |
| liquidaciones / reportes | — | — | — | — | **tables do not exist** | — | — | — | False target |

---

## 2. Every suspicious `FOR ALL` policy

### WEAK_INSERT (USING requires admin/gestor; WITH CHECK only tenant) — **P0**

| Policy | Table | USING role gate | WITH CHECK |
|--------|-------|-----------------|------------|
| `recibos_gestion` | recibos | `admin_rrhh` | `empresa_id = auth_empresa()` |
| `remuneraciones_gestion` | remuneraciones | `admin_rrhh` | same |
| `cupos_licencia_gestion` | cupos_licencia | `admin_rrhh` | same |
| `descuentos_gestion` | descuentos_recurrentes | `admin_rrhh` | same |
| `documentos_gestion` | documentos_legajo | `admin_rrhh` | same |
| `documentos_firma_gestion` | documentos_firma | `admin_rrhh` | same |
| `empleados_gestion` | empleados | `admin_rrhh` | same |
| `facturas_mono_gestion` | facturas_monotributo | `admin_rrhh` | same |
| `alertas_gestion` | alertas | `admin_rrhh` | same |
| `usuarios_admin` | usuarios | `admin_rrhh` | same |
| `turnos_gestion` | turnos | `es_gestor` | same |
| `eventos_gestion` | eventos_agenda | `es_gestor` | same |

**Root cause:** For `INSERT`, Postgres evaluates **only WITH CHECK**. Role gates in USING are ignored. Same class as fixed `adelantos_gestion` (mig 56).

### FOR ALL with matched CHECK (OK for this class)

| Policy | Table |
|--------|-------|
| `convenios_gestion` | convenios |
| `feriados_gestion` | feriados |
| `terminales_gestion` | terminales |
| `vacaciones_pendientes_gestion` | vacaciones_pendientes |
| `notas_internas_admin` | notas_internas |
| `config_superadmin` | config_plataforma |
| `empresas_superadmin` | empresas |
| `comunicacion_lecturas_propias` | comunicacion_lecturas |

---

## 3. SECURITY DEFINER inventory

| Function | search_path | EXECUTE to authenticated | Auth / tenant checks | Verdict |
|----------|-------------|--------------------------|----------------------|---------|
| `auth_*` / `es_*` | public | yes (+anon) | self | OK helpers |
| `firmar_recibo` | public | yes | uid, owner, tenant, published | ✅ OK (J5) |
| `fichar_con_rostro` | public | yes | empresa; server face match | OK / RISK client descriptor |
| `saldo_vacaciones_disponible` | public | yes | **none on p_empleado_id** | 🔴 P1 IDOR J1 |
| `saldo_licencia_disponible` | public | yes | **none** | 🔴 P1 IDOR J2 |
| `dias_habiles_entre` | public | yes (+anon) | any `p_empresa` | 🟠 P2 J4 |
| `empresa_de_documento_firma` | public | yes (+anon) | returns empresa for any doc id | 🟠 P2 oracle (null if missing) |
| `es_destinatario_documento` | public | yes (+anon) | boolean | LOW |
| `cumples_de_empresa` | public | yes | scoped | OK |
| `vacaciones_aprobadas_mi_sector` | public | yes | caller sector | OK (peer IDs by design) |
| `crear_perfil_usuario` | public | trigger/anon | metadata | RISK dual-authority |
| `prevenir_escalada_rol_usuario` | public | trigger | blocks superadmin assign | ✅ L2 |
| lock/exigir_* triggers | public | n/a | state/saldo/cupo | ✅ for ausencias |
| `exigir_fichaje_facial_validado` | — | trigger | blocks forged face fields | ✅ |

---

## 4. Storage policies

| Policy | Op | Bucket(s) | Assessment |
|--------|----|-----------|------------|
| `storage_select_recibos` | SELECT | recibos-pdf | ✅ tenant + publicado + path prefix (mig 57) |
| `storage_select_documentos` | SELECT | documentos | 🔴 `exists` on `archivo_url` **without** `empresa_id` / path prefix for legajo & firma destinatario |
| `storage_select_fotos` | SELECT | fotos | ✅ prefix |
| `storage_select_logos` | SELECT | logos | RISK open read (often intentional) |
| `storage_insert_gestores` | INSERT | multi | adm all; emp/sup documentos under own prefix |
| `storage_update_gestores` | UPDATE | multi | similar |
| `storage_delete_gestores` | DELETE | multi | adm/super |

**Chain exploit:** A5 INSERT `documentos_legajo` with `archivo_url = '<tenantB>/…'` + SELECT storage via exists → cross-tenant read if object exists (P1).

---

## 5. Confirmed exploits (probe notices)

| ID | Result | Severity |
|----|--------|----------|
| A1 INSERT recibos | CONFIRMED | **P0** |
| A2 INSERT remuneraciones | CONFIRMED | **P0** |
| A3 INSERT cupos=0 | CONFIRMED | **P0** |
| A4 INSERT descuentos | CONFIRMED | **P0** |
| A5 INSERT docs_legajo foreign path | CONFIRMED | **P0/P1** |
| A6 INSERT documentos_firma | CONFIRMED | **P0** |
| A7 INSERT empleados ghost | CONFIRMED | **P0** |
| A8 INSERT facturas_mono | CONFIRMED | **P0** |
| A9 INSERT turnos | CONFIRMED | **P0** |
| A11 INSERT eventos | CONFIRMED | **P0** |
| C2 INSERT recibo de peer | CONFIRMED | **P0** |
| J1/J2 saldo_* cross-tenant | CONFIRMED | **P1** |
| N2 auditoria forjada | CONFIRMED | **P2** |
| N3 errores_app empresa B | CONFIRMED | **P2** |
| O1 admin reopen adelanto | CONFIRMED | **P1** |
| O2 admin cross-link ausencia | CONFIRMED | **P1** |
| O3 fichaje ts histórico | CONFIRMED | **P2** |

### Correctly denied (controls that work)

B1/B2 approved self-insert, C1 peer ausencia, D1 other tenant recibo, E1–E3/F1/G1/H1–H2 updates/deletes, I1–I2 cross SELECT, L1–L2 escalate, M1 movimientos, FP1–FP5 matched FOR ALL / invitaciones, N1 notif to admin as empleado.

---

## 6. False positives / non-issues

| Claim | Status |
|-------|--------|
| Employee INSERT feriados/convenios/vacaciones_pendientes/notas | **False** — matched WITH CHECK; FP denied |
| Employee SELECT cross-tenant empleados/remu | **False** — blocked |
| Employee self-promote admin/superadmin | **False** — blocked |
| Employee INSERT movimientos_financieros | **False** — blocked |
| Employee resolve ausencia/adelanto | **False** — blocked |
| Employee UPDATE/DELETE via weak FOR ALL | **False** — USING blocks UPDATE/DELETE; hole is **INSERT-only** |
| Tables `liquidaciones` / `reportes` | **N/A** — do not exist |
| Employee spam notificaciones to admin | **False** for empleado (usuarios_select hides peers; EXISTS fails). **PROBABLE for gestor** |
| `empresa_de_documento_firma` always leaks | **False** on missing id (null); still an unauthenticated oracle if doc id known |
| A10 alertas | Policy class confirmed via siblings; first probe failed on enum `estado_alerta` only |

---

## 7. Severity summary

### P0 Critical
Systemic **employee INSERT** into: recibos, remuneraciones, descuentos, cupos, documentos_*, empleados, facturas_mono, turnos, eventos, alertas (class).

### P1 High
- RPC `saldo_*` IDOR cross-tenant  
- Storage documentos + poisoned `archivo_url`  
- Admin adelanto state reopen  
- Admin cross-link `empleado_id` / `empresa_id`  
- (Gestor) notification spam if confirmed  

### P2 Medium
- Forged `auditoria_acciones`  
- `errores_app.empresa_id` unbound  
- Historical `fichajes.ts` forge  
- `dias_habiles_entre` / doc empresa oracle  
- No FORCE RLS  
- `usuarios` INSERT hole contingent on orphan auth user  

### P3 Low
- Logos public SELECT  
- Anon EXECUTE on several helpers  

---

## 8. Recommended remediation order

1. **P0 — Fix all WEAK_INSERT policies** (same recipe as mig 56):
   - Split `FOR ALL` → `FOR SELECT/UPDATE/DELETE` with role in USING **and** WITH CHECK  
   - Add dedicated `FOR INSERT` with `auth_rol() = 'admin_rrhh'` (or `es_gestor()` only where product intends gestor create)  
2. **P1 — Harden `saldo_vacaciones_disponible` / `saldo_licencia_disponible`**: require `empleados.empresa_id = auth_empresa() OR es_superadmin()`; consider revoking EXECUTE from clients.  
3. **P1 — Mirror mig 57 on `storage_select_documentos`**: `empresa_id` + `name like empresa_id || '/%'`.  
4. **P1 — Trigger** `NEW.empleado_id` must belong to `NEW.empresa_id` on ausencias, adelantos, recibos, remuneraciones, turnos, fichajes, docs, descuentos, facturas.  
5. **P1 — Adelantos state machine** (mirror ausencias).  
6. **P2 —** auditoria service-only insert; bind `errores_app.empresa_id`; constrain fichaje `ts`; revoke anon EXECUTE where unused.  
7. **CI:** run `redteam_systematic_probe.test.sql` on every migration PR.

---

## 9. Probe coverage checklist

| Category | Covered |
|----------|---------|
| A unauthorized management INSERT | ✅ |
| B approved/resolved INSERT | ✅ |
| C another employee | ✅ |
| D another tenant | ✅ |
| E protected state UPDATE | ✅ |
| F tenant ownership UPDATE | ✅ |
| G employee ownership UPDATE | ✅ |
| H DELETE immutable | ✅ |
| I cross-tenant SELECT | ✅ |
| J cross-tenant RPC | ✅ |
| K Storage | policy audit + A5 chain (object read needs live object) |
| L privilege escalation | ✅ |
| M financial | ✅ |
| N documents / audit / errors | ✅ |
| O state-machine / cross-link / fichaje | ✅ |

---

## 10. Final answer

**Can a low-privileged employee use PostgREST/RPC to create or manipulate HR/business data that should require manager/admin?**

**YES — systematically.** The same authorization antipattern that caused RT-001/002 exists on **at least 12 tables**. Mig 56 fixed adelantos only. Employee UPDATE/DELETE of those tables is generally blocked; **INSERT is wide open** within the tenant (and for peers). Additional P1 issues: saldo RPC IDOR, document storage chain, adelanto reopen, cross-link integridad.

**Verdict: 🔴 RED**

---

*Evidence command:*

```bash
docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
  -v ON_ERROR_STOP=0 -f supabase/tests/redteam_systematic_probe.test.sql
```
