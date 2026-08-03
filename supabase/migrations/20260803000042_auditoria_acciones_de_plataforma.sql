-- ============================================================
-- Auditoría: permitir acciones de plataforma (sin empresa).
--
-- `empresa_id` era `not null` porque hasta ahora todo lo auditado pasaba
-- dentro de una empresa. Dar de alta a otro superadmin no: el equipo de
-- ISEO no pertenece a ninguna empresa, y esa es justamente la acción más
-- sensible de la app — la que hay que poder rastrear.
--
-- Sobre visibilidad: la policy de SELECT ya dice
--   es_superadmin() or (es_gestor() and empresa_id = auth_empresa())
-- Con `empresa_id` nulo, la segunda condición da falso (null = x nunca es
-- verdadero en SQL), así que estas filas las ve sólo el superadmin. Es lo
-- que corresponde: son movimientos internos de ISEO, no del cliente.
--
-- Idempotente.
-- ============================================================

alter table auditoria_acciones
  alter column empresa_id drop not null;

comment on column auditoria_acciones.empresa_id is
  'Empresa donde ocurrió la acción. Nulo = acción de plataforma (ISEO), '
  'p. ej. dar de alta a otro superadmin. Esas filas sólo las ve el superadmin.';

-- Para listar la actividad de plataforma sin barrer toda la tabla.
create index if not exists auditoria_plataforma_fecha_idx
  on auditoria_acciones (creada_en desc)
  where empresa_id is null;

notify pgrst, 'reload schema';
