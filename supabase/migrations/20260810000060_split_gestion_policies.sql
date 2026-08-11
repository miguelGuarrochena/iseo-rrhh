-- ============================================================
-- Migración 60: cerrar el bypass INSERT de policies `FOR ALL`
--
-- Problema (clase red-team / BUG-004 residual):
--   Varias policies `FOR ALL` tenían
--     USING  (admin_rrhh | es_gestor + tenant)
--     CHECK  (empresa_id = auth_empresa())
--   En INSERT Postgres evalúa sólo WITH CHECK → cualquier miembro
--   del tenant podía crear filas de gestión (recibos, remu, docs, …).
--
-- Solución (autoridad en DB, sin confiar en la UI):
--   Sustituir cada `FOR ALL` débil por INSERT/UPDATE/DELETE explícitos
--   con el mismo gate de rol en USING y WITH CHECK.
--   SELECT existentes se conservan.
--
-- Matriz: QA-AUTHZ-REMEDIATION-DESIGN.md §1 / §3.
-- No incluye mig 61–65 (RPC saldo, storage docs, empleado∈empresa,
-- máquina adelantos, last-admin).
-- Idempotente: drop if exists + recreate.
-- ============================================================

-- Predicado admin de escritura (repite en policies; no hay helper nuevo
-- para no ampliar la superficie SECURITY DEFINER en este bloque).
--   es_superadmin()
--   or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
--
-- Predicado gestor de escritura:
--   es_superadmin()
--   or (es_gestor() and empresa_id = auth_empresa())

-- ---------- 1. recibos (admin_rrhh; firma empleado vía RPC) ----------
drop policy if exists recibos_gestion on recibos;
drop policy if exists recibos_gestion_insert on recibos;
drop policy if exists recibos_gestion_update on recibos;
drop policy if exists recibos_gestion_delete on recibos;

create policy recibos_gestion_insert on recibos for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy recibos_gestion_update on recibos for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy recibos_gestion_delete on recibos for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

comment on policy recibos_gestion_insert on recibos is
  'Sólo admin_rrhh/superadmin crean recibos. Empleado firma vía firmar_recibo.';

-- ---------- 2. remuneraciones ----------
drop policy if exists remuneraciones_gestion on remuneraciones;
drop policy if exists remuneraciones_gestion_insert on remuneraciones;
drop policy if exists remuneraciones_gestion_update on remuneraciones;
drop policy if exists remuneraciones_gestion_delete on remuneraciones;

create policy remuneraciones_gestion_insert on remuneraciones for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy remuneraciones_gestion_update on remuneraciones for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy remuneraciones_gestion_delete on remuneraciones for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- ---------- 3. cupos_licencia ----------
drop policy if exists cupos_licencia_gestion on cupos_licencia;
drop policy if exists cupos_licencia_gestion_insert on cupos_licencia;
drop policy if exists cupos_licencia_gestion_update on cupos_licencia;
drop policy if exists cupos_licencia_gestion_delete on cupos_licencia;

create policy cupos_licencia_gestion_insert on cupos_licencia for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy cupos_licencia_gestion_update on cupos_licencia for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy cupos_licencia_gestion_delete on cupos_licencia for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- ---------- 4. descuentos_recurrentes ----------
drop policy if exists descuentos_gestion on descuentos_recurrentes;
drop policy if exists descuentos_gestion_insert on descuentos_recurrentes;
drop policy if exists descuentos_gestion_update on descuentos_recurrentes;
drop policy if exists descuentos_gestion_delete on descuentos_recurrentes;

create policy descuentos_gestion_insert on descuentos_recurrentes for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy descuentos_gestion_update on descuentos_recurrentes for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy descuentos_gestion_delete on descuentos_recurrentes for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- ---------- 5. documentos_legajo ----------
drop policy if exists documentos_gestion on documentos_legajo;
drop policy if exists documentos_gestion_insert on documentos_legajo;
drop policy if exists documentos_gestion_update on documentos_legajo;
drop policy if exists documentos_gestion_delete on documentos_legajo;

create policy documentos_gestion_insert on documentos_legajo for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy documentos_gestion_update on documentos_legajo for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy documentos_gestion_delete on documentos_legajo for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- ---------- 6. documentos_firma ----------
drop policy if exists documentos_firma_gestion on documentos_firma;
drop policy if exists documentos_firma_gestion_insert on documentos_firma;
drop policy if exists documentos_firma_gestion_update on documentos_firma;
drop policy if exists documentos_firma_gestion_delete on documentos_firma;

create policy documentos_firma_gestion_insert on documentos_firma for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy documentos_firma_gestion_update on documentos_firma for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy documentos_firma_gestion_delete on documentos_firma for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- ---------- 7. empleados (sin hard DELETE autenticado; baja = UPDATE) ----------
drop policy if exists empleados_gestion on empleados;
drop policy if exists empleados_gestion_insert on empleados;
drop policy if exists empleados_gestion_update on empleados;
drop policy if exists empleados_gestion_delete on empleados;

create policy empleados_gestion_insert on empleados for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy empleados_gestion_update on empleados for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- Sin policy DELETE para authenticated: el producto usa baja lógica.

comment on policy empleados_gestion_insert on empleados is
  'Sólo admin_rrhh/superadmin crean legajos. Sin DELETE duro vía PostgREST.';

-- ---------- 8. facturas_monotributo ----------
drop policy if exists facturas_mono_gestion on facturas_monotributo;
drop policy if exists facturas_mono_gestion_insert on facturas_monotributo;
drop policy if exists facturas_mono_gestion_update on facturas_monotributo;
drop policy if exists facturas_mono_gestion_delete on facturas_monotributo;

create policy facturas_mono_gestion_insert on facturas_monotributo for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy facturas_mono_gestion_update on facturas_monotributo for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy facturas_mono_gestion_delete on facturas_monotributo for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- ---------- 9. turnos (gestor: supervisor + admin_rrhh) ----------
drop policy if exists turnos_gestion on turnos;
drop policy if exists turnos_gestion_insert on turnos;
drop policy if exists turnos_gestion_update on turnos;
drop policy if exists turnos_gestion_delete on turnos;

create policy turnos_gestion_insert on turnos for insert
  with check (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );

create policy turnos_gestion_update on turnos for update
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );

create policy turnos_gestion_delete on turnos for delete
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );

-- ---------- 10. eventos_agenda (gestor) ----------
drop policy if exists eventos_gestion on eventos_agenda;
drop policy if exists eventos_gestion_insert on eventos_agenda;
drop policy if exists eventos_gestion_update on eventos_agenda;
drop policy if exists eventos_gestion_delete on eventos_agenda;

create policy eventos_gestion_insert on eventos_agenda for insert
  with check (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );

create policy eventos_gestion_update on eventos_agenda for update
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );

create policy eventos_gestion_delete on eventos_agenda for delete
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );

-- ---------- 11. alertas: sin escritura PostgREST (legacy / no persistidas) ----------
drop policy if exists alertas_gestion on alertas;
drop policy if exists alertas_gestion_insert on alertas;
drop policy if exists alertas_gestion_update on alertas;
drop policy if exists alertas_gestion_delete on alertas;
-- alertas_select se conserva.

-- ---------- 12. usuarios: sin INSERT PostgREST; admin UPDATE; self nombre ----------
drop policy if exists usuarios_admin on usuarios;
drop policy if exists usuarios_admin_update on usuarios;
drop policy if exists usuarios_admin_delete on usuarios;
drop policy if exists usuarios_admin_insert on usuarios;
drop policy if exists usuarios_actualizar_propio on usuarios;

-- Gestión RRHH: vínculo / rol / perfil ajeno. Sin INSERT (API service_role).
create policy usuarios_admin_update on usuarios for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- Self-service: actualizarMiPerfil (sólo nombre; trigger cierra el resto).
create policy usuarios_actualizar_propio on usuarios for update
  using (id = auth.uid())
  with check (id = auth.uid());

comment on policy usuarios_actualizar_propio on usuarios is
  'Cualquier autenticado puede tocar su fila; lock_usuario_autoedicion limita columnas.';

comment on policy usuarios_admin_update on usuarios is
  'admin_rrhh/superadmin gestionan usuarios del tenant. INSERT sólo service_role / triggers.';

-- Columnas sensibles inmutables para no-admin (defense in depth vs payload).
create or replace function public.lock_usuario_autoedicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / SQL sin JWT: altas por API de invitaciones, etc.
  if auth.uid() is null then
    return new;
  end if;

  if es_superadmin() or auth_rol() = 'admin_rrhh' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.email is distinct from old.email
       or new.rol is distinct from old.rol
       or new.empresa_id is distinct from old.empresa_id
       or new.empleado_id is distinct from old.empleado_id
       or new.avatar_url is distinct from old.avatar_url
       or new.creado_en is distinct from old.creado_en
       or new.id is distinct from old.id
    then
      raise exception
        'Solo podés actualizar tu nombre completo';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lock_usuario_autoedicion on public.usuarios;
create trigger trg_lock_usuario_autoedicion
  before update on public.usuarios
  for each row execute function public.lock_usuario_autoedicion();

comment on function public.lock_usuario_autoedicion() is
  'No-admin: sólo nombre_completo. Admin/superadmin y service_role sin restricción de columnas (escalada: trg_prevenir_escalada_rol).';

notify pgrst, 'reload schema';
