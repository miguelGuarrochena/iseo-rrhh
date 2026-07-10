-- ============================================================
-- Notificaciones: cualquier miembro puede notificar a otro usuario
-- de su misma empresa (ej: empleado solicita ausencia → aviso a los
-- admins; admin resuelve/carga recibo → aviso al empleado).
-- ============================================================

create policy notificaciones_insertar on notificaciones for insert
  with check (
    exists (
      select 1
      from usuarios destino
      where destino.id = notificaciones.usuario_id
        and (es_superadmin() or destino.empresa_id = auth_empresa())
    )
  );
