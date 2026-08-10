# Authorization Remediation Design

**Date:** 2026-08-10  
**Status:** Design only — **no migrations or product code applied**  
**Inputs:** `QA-AUDIT-SYSTEMATIC-AUTHZ.md`, live `pg_policy` inventory, product UI/services semantics  
**Goal:** Precise implementation plan before changing production security policies

---

## Executive principle

Postgres evaluates **only `WITH CHECK`** on `INSERT`.  
Any `FOR ALL` policy whose `USING` requires `admin_rrhh` / `es_gestor` but whose `WITH CHECK` only requires `empresa_id = auth_empresa()` is an **employee INSERT backdoor**.

**Canonical fix pattern (already proven in mig 56 for adelantos):**

1. Drop the weak `FOR ALL`.
2. Recreate as **operation-specific** policies.
3. Put the **same role gate in both `USING` and `WITH CHECK`** wherever both apply.
4. Never grant management `INSERT` through a tenant-only check.
5. Prefer triggers for invariants that span columns/tables (`empleado∈empresa`, state machines, last-admin).

**Do not** blindly expand `FOR ALL` into four identical ops without role semantics.

---

## Role vocabulary (product)

| Role | Meaning in this design |
|------|------------------------|
| `empleado` | Linked legajo; self-service only |
| `supervisor` | Operational gestor: turnos, agenda, resolve ausencias; **not** payroll/docs write |
| `admin_rrhh` | Full tenant RRHH |
| `superadmin` | Platform; when “visiting” a company, UI treats as admin_rrhh |
| `es_gestor()` | `superadmin \| admin_rrhh \| supervisor` |

Reference: mig `recibos_solo_rrhh` removed supervisor from payroll visibility — supervisors must not get salary INSERT either.

---

## Proposed migration structure (not applied)

```text
supabase/migrations/20260811000060_cerrar_for_all_insert_bypass.sql
  - Split/replace all 12 weak FOR ALL policies
  - Add usuarios_actualizar_propio (self nombre)
  - Optional: revoke unused anon EXECUTE on helpers

supabase/migrations/20260811000061_rpc_saldo_tenant_check.sql
  - Wrap saldo_vacaciones_disponible / saldo_licencia_disponible
  - Tighten dias_habiles_entre / empresa_de_documento_firma grants or checks

supabase/migrations/20260811000062_storage_documentos_tenant.sql
  - Rewrite storage_select_documentos (mirror mig 57)

supabase/migrations/20260811000063_invariante_empleado_empresa.sql
  - BEFORE INSERT/UPDATE trigger on tables with (empresa_id, empleado_id)

supabase/migrations/20260811000064_adelantos_maquina_estados.sql
  - Trigger lock_adelanto_maquina_estados (mirror ausencias)

supabase/migrations/20260811000065_last_admin_invariant.sql
  - Trigger on usuarios preventing demote/unlink of last admin_rrhh per empresa
```

**Order matters:** 60 first (stops bleeding), then 61–62 (read paths), then 63–65 (integrity).

**Rollback:** each migration should be reversible by restoring previous policy SQL from git history of migrations `00001`, `00006`, `00021`, `00023`, etc. Prefer `DROP POLICY` + recreate prior definition in a down script kept in the PR description (Supabase typically doesn’t auto-down).

---

# 1. Table-by-table remediation

For each table: CURRENT → PROBLEM → INTENDED → PROPOSED.

---

## 1.1 `recibos`

### Intended model

| Op | empleado | supervisor | admin_rrhh | superadmin |
|----|----------|------------|------------|------------|
| SELECT | own published | own only (as employee) | tenant | all |
| INSERT | **no** | **no** | yes | yes |
| UPDATE | **no** (sign via RPC) | **no** | yes (publish/archive/rectify) | yes |
| DELETE | **no** | **no** | yes | yes |

- **Tenant:** always `empresa_id = auth_empresa()` (except superadmin).  
- **Ownership:** `empleado_id` must belong to `empresa_id`.  
- **State:** employee firma one-shot via `firmar_recibo` (already).  
- **Immutable for non-admin:** `archivo_url`, `empresa_id`, `empleado_id`, `periodo`, `tipo`, publish fields (existing trigger).  
- **Never client-controlled on INSERT by employee:** N/A (no INSERT).  
- **Employee INSERT:** no.  
- **RPC-only employee write:** yes (`firmar_recibo`).  
- **DELETE:** admin allowed (product eliminates/archives).

### CURRENT
```text
recibos_select  — SELECT (own / admin)
recibos_gestion — FOR ALL
  USING:  admin_rrhh + tenant | superadmin
  CHECK:  tenant only | superadmin
```

### PROBLEM
Employee INSERT (confirmed A1/C2): forge published recibos for self or peers.

### PROPOSED
```sql
-- DROP recibos_gestion

recibos_gestion_insert FOR INSERT
  WITH CHECK (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

recibos_gestion_update FOR UPDATE
  USING (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  WITH CHECK (same);

recibos_gestion_delete FOR DELETE
  USING (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- Keep recibos_select; keep firmar_recibo RPC; keep lock_recibo_firma_empleado
```

**Dependencies:** Storage `recibos-pdf` already hardened (mig 57). Creating ghost recibos enabled fake “published” rows; closing INSERT closes that path.

---

## 1.2 `remuneraciones`

### Intended

| Op | emp | sup | admin | super |
|----|-----|-----|-------|-------|
| SELECT | own | own | tenant | all |
| INSERT/UPDATE/DELETE | no | no | yes | yes |

- No employee INSERT. No RPC needed (admin client OK if RLS tight).  
- Server should keep computing aportes/neto (already in service); optional CHECK `monto_neto >= 0`.  
- **Immutable keys:** `(empleado_id, periodo, tipo)` unique.  
- **empleado∈empresa** required.

### CURRENT → PROBLEM
`remuneraciones_gestion FOR ALL` weak CHECK → employee INSERT fake salary (A2).

### PROPOSED
Same split as recibos: INSERT/UPDATE/DELETE only `admin_rrhh` + tenant; keep SELECT.

---

## 1.3 `cupos_licencia`

### Intended

| Op | emp | sup | admin | super |
|----|-----|-----|-------|-------|
| SELECT | tenant (for UI saldo) | tenant | tenant | all |
| INSERT/UPDATE | no | no | yes | yes |
| DELETE | no | no | optional (or forbid; upsert to 0) | yes |

- Employee INSERT **must not** create `dias_anuales = 0` DoS (A3).  
- No state machine.  
- Config-only table.

### PROPOSED
```sql
cupos_licencia_gestion_write FOR INSERT, UPDATE  -- or separate
  WITH CHECK / USING: admin_rrhh + tenant | superadmin
-- DELETE: either same or omit (product doesn’t delete)
```

Keep `cupos_licencia_select`.

---

## 1.4 `descuentos_recurrentes`

### Intended

| Op | emp | sup | admin | super |
|----|-----|-----|-------|-------|
| SELECT | own | own | tenant | all |
| INSERT | no | no | yes | yes |
| UPDATE | no | no | yes (or delete+recreate) | yes |
| DELETE | no | no | yes | yes |

### PROPOSED
Split FOR ALL → INSERT/UPDATE/DELETE admin_rrhh only. Keep SELECT.  
**empleado∈empresa** on write.

---

## 1.5 `documentos_legajo`

### Intended

| Op | emp | sup | admin | super |
|----|-----|-----|-------|-------|
| SELECT | own | tenant (read) | tenant | all |
| INSERT | **no** | **no** | yes | yes |
| UPDATE | no | no | rare/none in product | yes |
| DELETE | no | no | yes | yes |

- Employee must **not** INSERT (blocks poisoned `archivo_url` A5).  
- Storage SELECT still needs path/`empresa_id` hardening (section 5).  
- Fields never employee-controlled: `archivo_url`, `empresa_id`, `empleado_id`.

### PROPOSED
Admin-only INSERT/UPDATE/DELETE. Keep gestor/owner SELECT.  
Trigger: `archivo_url` must start with `empresa_id || '/'` (defense in depth with storage).

---

## 1.6 `documentos_firma`

### Intended

| Op | emp | sup | admin | super |
|----|-----|-----|-------|-------|
| SELECT | if destinatario | if destinatario/ges | tenant | all |
| INSERT | no | no | yes | yes |
| UPDATE | no on header | no | limited | yes |
| DELETE | no | no | yes | yes |

Employee writes only `documento_firma_destinatarios.firmado_en` (already locked).

### PROPOSED
Admin-only INSERT/UPDATE/DELETE on `documentos_firma`.  
Do not reopen destinatario policies.  
`archivo_url` prefix = `empresa_id/`.

---

## 1.7 `empleados`

### Intended

| Op | emp | sup | admin | super |
|----|-----|-----|-------|-------|
| SELECT | own | tenant (PII risk separate) | tenant | all |
| INSERT | **no** | **no** | yes | yes |
| UPDATE | no | no | yes | yes |
| DELETE | **prohibit hard delete** | no | no (use baja) | rare |

### Dependency analysis if employee INSERT remains
Ghost legajos → can attach ausencias/recibos/remu/fichajes/turnos/docs → fake payroll/attendance → invite/vincular identity confusion → organigrama pollution.

### PROPOSED
```sql
empleados_gestion_insert/update — admin_rrhh + tenant | superadmin
-- NO DELETE policy for authenticated (or only superadmin)
-- Soft-delete = UPDATE activo=false (admin)
```

Keep `empleados_select`.  
**Immutable:** `empresa_id` never changes (trigger reject UPDATE of `empresa_id`).

---

## 1.8 `facturas_monotributo`

### Intended
Admin write; employee SELECT own only. Same pattern as remuneraciones.

### PROPOSED
Admin-only INSERT/UPDATE/DELETE. Keep privacy SELECT from mig 32.

---

## 1.9 `turnos`

### Intended — **gestor, not admin-only**

| Op | emp | supervisor | admin | super |
|----|-----|------------|-------|-------|
| SELECT | own | tenant | tenant | all |
| INSERT/UPDATE/DELETE | no | **yes** | **yes** | yes |

### CURRENT PROBLEM
`WITH CHECK` tenant-only → **empleado** can INSERT turnos (A9).

### PROPOSED
```sql
turnos_gestion_insert FOR INSERT
  WITH CHECK (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );
-- UPDATE/DELETE: USING + WITH CHECK both require es_gestor() + tenant
```

**empleado∈empresa** mandatory (prevent assigning turnos to foreign legajo under own tenant id).

---

## 1.10 `eventos_agenda`

### Intended — **gestor write; no employee write**

| Op | emp | supervisor | admin | super |
|----|-----|------------|-------|-------|
| SELECT | tenant | tenant | tenant | all |
| INSERT | no | yes | yes | yes |
| UPDATE/DELETE | no product path; allow gestor for cleanup | yes | yes | yes |

### PROPOSED
Same as turnos: `es_gestor()` in WITH CHECK for INSERT/UPDATE/DELETE.

---

## 1.11 `alertas`

### Intended
Product **does not persist** alertas (computed in `getAlertas`). Table is legacy/unused for writes.

### Options
| Option | Choice |
|--------|--------|
| A | Admin-only write (safe if unused) |
| B | **Revoke all write policies**; SELECT only for gestores | **Preferred** |

### PROPOSED (preferred)
```sql
DROP alertas_gestion;
-- Keep alertas_select for gestores
-- No INSERT/UPDATE/DELETE for authenticated
```

If future product needs persistence, add admin INSERT then — not now.

---

## 1.12 `usuarios`

### Intended

| Op | emp | supervisor | admin | super |
|----|-----|------------|-------|-------|
| SELECT | self; ges see tenant | tenant | tenant | all |
| INSERT | **no** (API service_role only) | no | **no via PostgREST** | service / equipo-iseo |
| UPDATE | **own `nombre_completo` only** | same | rol/vínculo (not superadmin) | all |
| DELETE | no | no | no | rare |

### CURRENT PROBLEM
Weak FOR ALL INSERT → if orphan `auth.users` exists, employee could INSERT `admin_rrhh` profile (PROBABLE).  
UPDATE blocked for emp by USING today → **`actualizarMiPerfil` may already fail under RLS** (product intent vs DB mismatch). Design must **add** explicit self-update.

### PROPOSED
```sql
DROP usuarios_admin FOR ALL;

-- Admin management (no INSERT via PostgREST)
usuarios_admin_update FOR UPDATE
  USING (superadmin or (admin_rrhh and empresa_id = auth_empresa()))
  WITH CHECK (same
    and rol <> 'superadmin'  -- non-super cannot set/keep escalate; trigger already helps
  );

-- Optional: usuarios_admin_delete — omit (no product delete)

-- Self-service name
usuarios_actualizar_propio FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
-- + trigger: non-admin may only change nombre_completo
--   (rol, empresa_id, empleado_id, email immutable)

-- INSERT: no authenticated policy → only service_role / security definer paths
```

**Last-admin:** separate trigger (section 6E).

---

# 2. Cross-cutting design A–E

---

## A. `saldo_*` SECURITY DEFINER IDOR

### Change
```sql
-- Inside saldo_vacaciones_disponible / saldo_licencia_disponible:
IF NOT (
  es_superadmin()
  OR EXISTS (
    SELECT 1 FROM empleados e
    WHERE e.id = p_empleado_id
      AND e.empresa_id = auth_empresa()
  )
) THEN
  RAISE EXCEPTION 'forbidden';  -- or RETURN NULL
END IF;
```

Also: `REVOKE EXECUTE ON … FROM anon` where granted; keep `authenticated` only after check.

### `dias_habiles_entre`
- **SAFE WITH CONDITIONS** if only called from triggers: `REVOKE FROM PUBLIC/authenticated/anon`; leave for definer triggers.  
- Or require `p_empresa = auth_empresa() OR es_superadmin()`.

### `empresa_de_documento_firma` / `es_destinatario_documento`
- Restrict EXECUTE to authenticated; require doc visible under RLS-equivalent check; or inline into storage policy only (no direct GRANT).

---

## B. Storage `documentos` / poisoned `archivo_url`

### Mirror mig 57 pattern
```sql
storage_select_documentos
  bucket = documentos AND (
    superadmin
    OR (es_gestor() AND name LIKE auth_empresa()::text || '/%')
    OR EXISTS (
      SELECT 1 FROM documentos_legajo d
      WHERE d.archivo_url = name
        AND d.empleado_id = auth_empleado()
        AND d.empresa_id = auth_empresa()
        AND name LIKE d.empresa_id::text || '/%'
    )
    OR EXISTS (
      SELECT 1 FROM documentos_firma df
      WHERE df.archivo_url = name
        AND es_destinatario_documento(df.id)
        AND df.empresa_id = auth_empresa()
        AND name LIKE df.empresa_id::text || '/%'
    )
  )
```

**Depends on:** closing `documentos_legajo` / `documentos_firma` employee INSERT (1.5 / 1.6).

**INSERT storage:** already prefix-scoped; keep.

---

## C. `empleado_id ↔ empresa_id` invariant

### Must be impossible
| Pair | Rule |
|------|------|
| `empleados.empresa_id` change | Immutable after insert |
| `ausencias.(empresa_id, empleado_id)` | empleado.empresa_id = row.empresa_id |
| `adelantos` | same |
| `recibos` | same |
| `remuneraciones` | same |
| `fichajes` | same |
| `turnos` | same |
| `documentos_legajo` | same |
| `descuentos_recurrentes` | same |
| `facturas_monotributo` | same |
| `alertas` (if writes kept) | same |
| `usuarios.empleado_id` | empleado null OR empleado.empresa_id = usuarios.empresa_id (null empresa for pure superadmin) |
| `documento_firma_destinatarios.empleado_id` | empleado.empresa_id = parent doc.empresa_id |

### Mechanism
Single function `assert_empleado_de_empresa(emp_id, empresa_id)` called from `BEFORE INSERT OR UPDATE` triggers on each table.  
Reject with clear exception.

**Does not replace RLS** — complements it (admin cross-link O2).

---

## D. Adelantos state machine

Mirror `lock_ausencia_maquina_estados`:

| From | To | Who |
|------|----|-----|
| pendiente | aprobado \| rechazado | admin_rrhh / superadmin |
| aprobado / rechazado | * | **forbidden** (immutable) |

On resolve: only resolution fields change; `monto`, `empleado_id`, `empresa_id` immutable.  
`resuelto_en` required.

Employee already cannot UPDATE (policy). This closes **admin reopen** (O1).

---

## E. Last-admin invariant

### Must be impossible
- Demote or delete the **last** `admin_rrhh` of an `empresa_id` leaving zero admins.  
- Change `empresa_id` of last admin away from tenant.  
- (Optional) unlink all admins.

### Mechanism
`BEFORE UPDATE OR DELETE ON usuarios`:
```text
IF old.rol = 'admin_rrhh' AND (new.rol is distinct from 'admin_rrhh' OR TG_OP = 'DELETE') THEN
  IF (SELECT count(*) FROM usuarios
      WHERE empresa_id = old.empresa_id AND rol = 'admin_rrhh' AND id <> old.id) = 0 THEN
    RAISE 'No se puede dejar la empresa sin admin_rrhh';
  END IF;
END IF;
```

API `/api/cuentas` quitar already checks — DB must be authority.

---

# 3. Policy matrix (target end-state)

| Table | emp INSERT | emp UPDATE | emp DELETE | gestor INSERT | admin INSERT | Notes |
|-------|------------|------------|------------|---------------|--------------|-------|
| recibos | no | RPC sign | no | no | yes | |
| remuneraciones | no | no | no | no | yes | |
| cupos_licencia | no | no | no | no | yes | |
| descuentos_recurrentes | no | no | no | no | yes | |
| documentos_legajo | no | no | no | no | yes | |
| documentos_firma | no | no | no | no | yes | sign via dest. |
| empleados | no | no | no | no | yes | no hard delete |
| facturas_monotributo | no | no | no | no | yes | |
| turnos | no | no | no | **yes** | yes | |
| eventos_agenda | no | no | no | **yes** | yes | |
| alertas | no | no | no | no | no | select only |
| usuarios | no | nombre only | no | no | UPDATE rol/vínculo; INSERT service | |

---

# 4. RPC authorization matrix

| Function | Class | Missing check today | Remediation |
|----------|-------|---------------------|-------------|
| `auth_*` / `es_*` | SAFE | — | keep |
| `firmar_recibo` | SAFE | — | keep |
| `fichar_con_rostro` | SAFE WITH CONDITIONS | client descriptor / optional tipo | out of this block unless easy |
| `vacaciones_aprobadas_mi_sector` | SAFE WITH CONDITIONS | peer IDs by design | keep |
| `cumples_de_empresa` | SAFE | — | keep |
| `saldo_vacaciones_disponible` | **VULNERABLE** | tenant on `p_empleado_id` | add check / null |
| `saldo_licencia_disponible` | **VULNERABLE** | tenant on `p_empleado_id` | add check / null |
| `dias_habiles_entre` | **VULNERABLE** / CONDITIONS | any `p_empresa`; anon EXECUTE | revoke client EXECUTE or tenant-gate |
| `empresa_de_documento_firma` | **VULNERABLE** (oracle) | any doc UUID | revoke or gate |
| `es_destinatario_documento` | SAFE WITH CONDITIONS | info leak minimal | revoke anon |
| `crear_perfil_usuario` | SAFE WITH CONDITIONS | metadata dual-authority | align with invitaciones later |
| `prevenir_escalada_rol_usuario` | SAFE | — | keep; complement last-admin |
| `lock_*` / `exigir_*` triggers | SAFE | — | keep |
| `crear_documento_firma` (if invoker) | SAFE WITH CONDITIONS | relies on RLS | verify after policy split |

---

# 5. Storage authorization matrix

| Bucket | SELECT today | Target |
|--------|--------------|--------|
| recibos-pdf | tenant + path + published | keep |
| documentos | exists without tenant/path | **add empresa_id + path prefix** |
| fotos | prefix | keep |
| logos | open | keep or auth-only (P3) |

| Op | emp | gestor | admin |
|----|-----|--------|-------|
| INSERT documentos | own prefix only | own/tenant prefix | tenant prefix |
| SELECT documentos | own rows + path | tenant prefix | tenant prefix |

---

# 6. DB invariants matrix

| Invariant | Enforce with | Priority |
|-----------|--------------|----------|
| No weak FOR ALL INSERT | policies mig 60 | P0 |
| `empleado.empresa_id = row.empresa_id` | trigger mig 63 | P1 |
| `empleados.empresa_id` immutable | trigger | P1 |
| `usuarios.empleado_id` same tenant | trigger | P1 |
| Ausencias state machine | exists (58) | done |
| Adelantos state machine | trigger mig 64 | P1 |
| Last admin_rrhh per empresa | trigger mig 65 | P1 |
| Recibo sign columns | exists (57) | done |
| Destinatario firma one-shot | exists (33) | done |
| Cupo/saldo vacaciones atomic | exists (58/59) | done |
| `archivo_url` prefix = empresa | CHECK or trigger | P1 with storage |
| saldo RPC tenant | function body mig 61 | P1 |

---

# 7. Test plan for remediation

### Extend `supabase/tests/redteam_systematic_probe.test.sql`

After mig 60+, **every A1–A11 / C2 must flip to DENIED**.

| Probe | Expected post-fix |
|-------|---------------------|
| A1–A9, A11 employee management INSERT | DENIED |
| A10 alertas INSERT | DENIED (no write policy) |
| C2 recibo peer | DENIED |
| B1/B2/C1/D1/E*/F*/G*/H*/I*/L*/M*/FP* | remain DENIED |
| J1/J2 saldo cross-tenant | DENIED or null |
| O1 adelanto reopen | DENIED |
| O2 cross-link | DENIED |
| N2/N3 | DENIED or constrained |
| Legitimate admin INSERT recibo/remu/turno | OK |
| Legitimate supervisor INSERT turno/evento | OK |
| Legitimate employee ausencia pendiente | OK |
| Legitimate `firmar_recibo` | OK |
| Legitimate `actualizarMiPerfil` nombre | OK |
| Employee UPDATE usuarios.rol | DENIED |
| Concurrent vacaciones/cupos | still PASS |

### New focused SQL files
- `rls_for_all_closure.test.sql` — one INSERT attempt per former weak table  
- `rls_saldo_rpc_tenant.test.sql`  
- `rls_storage_documentos_tenant.test.sql`  
- `rls_empleado_empresa_invariant.test.sql`  
- `rls_adelantos_estados.test.sql`  
- `rls_last_admin.test.sql`

### Regression
Re-run existing: estados_solicitud, firma_recibos, ausencias_estados_saldo, cupos_licencia, concurrencia_*.

### Unit
Espejos TypeScript only if new pure helpers; not a substitute for SQL.

---

# 8. Rollback considerations

| Risk | Mitigation |
|------|------------|
| Admin UI INSERT suddenly fails | Policies must allow `admin_rrhh`; QA smoke: cargar recibo, remu, doc, empleado, cupo |
| Supervisor loses turnos | Use `es_gestor()` not `admin_rrhh` for turnos/eventos |
| Employee cannot change display name | Ship `usuarios_actualizar_propio` + column trigger in same mig as splitting `usuarios_admin` |
| Service-role invites break | Never add authenticated INSERT on `usuarios`; keep API service role |
| Storage over-tight | Staging verify destinatario + legajo downloads |
| Trigger `empleado∈empresa` breaks seed scripts | Bypass when `auth.uid() is null` (service) like other triggers |
| Last-admin blocks intentional wipe | Document set_config escape hatch for support, or superadmin-only override |

**Deploy:** apply 60–65 on staging → run systematic probe (expect green denies on A*) → smoke UI roles → prod.

**Feature flags:** not applicable to RLS; use staged migration + quick revert migration prepared in PR.

---

# 9. Implementation checklist (future coding block)

- [ ] Mig 60: 12 policy splits + alertas write removal + usuarios self-update  
- [ ] Mig 61: saldo RPC tenant + revoke anon where needed  
- [ ] Mig 62: storage documentos  
- [ ] Mig 63: empleado∈empresa trigger family  
- [ ] Mig 64: adelantos state machine  
- [ ] Mig 65: last-admin  
- [ ] Update `redteam_systematic_probe` expectations / CI  
- [ ] Update `QA-AUDIT-SYSTEMATIC-AUTHZ.md` / `QA-AUDIT-REDTEAM.md` statuses  
- [ ] No reliance on UI hiding buttons  

---

# 10. Design verdict

The correct model is **not** “gestor everywhere” and **not** “admin everywhere”:

- **Payroll / identity / cupos / legajo docs / monotributo / descuentos / recibos header:** `admin_rrhh` only.  
- **Turnos / agenda:** `es_gestor()`.  
- **Alertas table writes:** none.  
- **Usuarios INSERT:** service_role only; self UPDATE name; admin UPDATE rol/vínculo.  
- **Employee writes:** continue via dedicated RPCs/policies (firmar recibo, firmar doc dest., pedir ausencia/adelanto pendiente, fichar).

This design closes the systemic INSERT bypass without collapsing supervisor operational workflows.

---

*No product code or migrations were modified in this step.*
