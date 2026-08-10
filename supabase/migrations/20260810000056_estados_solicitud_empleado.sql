-- ============================================================
-- BUG-003 / BUG-004: el empleado no decide el estado de resolución
--
-- Antes, `ausencias_solicitar` y `adelantos_pedir` permitían INSERT con
-- cualquier `estado` mientras el legajo/empresa coincidieran. Un empleado
-- con el JWT y PostgREST podía saltarse la UI y crear
-- `estado = 'aprobada'` / `'aprobado'` (o rechazado) sin pasar por un
-- gestor. `crearAusencia({ aprobarAutomaticamente: true })` era el mismo
-- camino; la UI no lo ofrecía al empleado, pero la DB no lo impedía.
--
-- Solución (mínima, autoridad en DB):
--   - Empleado (no gestor): INSERT sólo con estado pendiente y sin
--     campos de resolución.
--   - Gestor / superadmin: siguen pudiendo cargar ya aprobadas (flujo
--     legítimo de RRHH) y resolver vía UPDATE.
--   - Empleado no tiene policy de UPDATE → no puede mutar pendiente a
--     aprobada después (ya era así; se documenta y se prueba).
-- ============================================================

-- ---------- Ausencias ----------
drop policy if exists ausencias_solicitar on ausencias;
create policy ausencias_solicitar on ausencias for insert
  with check (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (
        -- Carga de RRHH / supervisor / superadmin: pueden dejarla
        -- aprobada (o pendiente) al crear.
        es_gestor()
        or (
          -- Empleado: sólo su legajo, sólo solicitud pendiente, sin
          -- forjar resolución.
          empleado_id = auth_empleado()
          and estado = 'pendiente'
          and resuelta_por is null
          and resuelta_en is null
          and comentario_resolucion is null
        )
      )
    )
  );

comment on policy ausencias_solicitar on ausencias is
  'Empleado: INSERT pendiente propio. Gestor: INSERT libre (carga manual).';

-- ---------- Adelantos ----------
-- La resolución (UPDATE a aprobado/rechazado) sigue siendo de admin_rrhh.
-- OJO: `adelantos_gestion` era `FOR ALL` con
--   with check (empresa_id = auth_empresa())
-- Eso, en INSERT, permitía a CUALQUIER miembro de la empresa crear un
-- adelanto (incluso `aprobado`), porque en INSERT Postgres sólo evalúa
-- WITH CHECK y las policies se OR-ean con `adelantos_pedir`. Había que
-- cerrar las dos puertas.
drop policy if exists adelantos_pedir on adelantos;
create policy adelantos_pedir on adelantos for insert
  with check (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (empleado_id = auth_empleado() or es_gestor())
      and estado = 'pendiente'
      and resuelto_en is null
      and periodo is null
    )
  );

comment on policy adelantos_pedir on adelantos is
  'Pedidos siempre pendientes. Aprobar/rechazar es UPDATE de admin_rrhh.';

drop policy if exists adelantos_gestion on adelantos;
create policy adelantos_gestion on adelantos for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

comment on policy adelantos_gestion on adelantos is
  'Sólo admin_rrhh resuelve/edita adelantos. INSERT va por adelantos_pedir; DELETE por adelantos_borrar.';

notify pgrst, 'reload schema';
