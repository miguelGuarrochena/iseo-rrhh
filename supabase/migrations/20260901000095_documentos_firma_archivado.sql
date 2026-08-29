-- ============================================================
-- F-10: no borrar una constancia de firma.
--
-- Qué pasaba
-- ----------
-- `eliminarDocumentoFirma` hacía DELETE sobre `documentos_firma` y los
-- destinatarios cascadeaban, incluidas las filas de quienes ya habían
-- firmado. La firma es la prueba de que a esa persona se le notificó algo
-- y lo aceptó; borrarla desde la app deja sólo el rastro de la
-- eliminación en `auditoria_acciones`, que no es lo mismo.
--
-- Solución
-- --------
-- La misma que ya usan los recibos rectificados: baja lógica con
-- `archivado_en`. El documento sale de circulación —no se lista, no pide
-- más firmas— y las constancias quedan. El DELETE duro se conserva sólo
-- para el documento que nadie firmó todavía, que es el caso que la
-- función vino a resolver: el PDF equivocado recién subido.
--
-- Idempotente.
-- ============================================================

alter table documentos_firma
  add column if not exists archivado_en timestamptz;

comment on column documentos_firma.archivado_en is
  'Si tiene fecha, el documento salió de circulación. Se archiva en vez '
  'de borrarse cuando ya hay firmas: la constancia es prueba.';

-- El índice de la pantalla de RRHH ya filtra por empresa y fecha; los
-- archivados son minoría al principio y mayoría con el tiempo, así que
-- el parcial es el que corresponde (mismo criterio que recibos).
create index if not exists documentos_firma_vigentes_idx
  on documentos_firma (empresa_id, creado_en desc)
  where archivado_en is null;

-- ------------------------------------------------------------
-- Un documento archivado no le pide la firma a nadie.
--
-- La policy de lectura del destinatario deja de alcanzarlo; RRHH y
-- superadmin lo siguen viendo, que es lo que hace falta para auditar.
-- ------------------------------------------------------------
drop policy if exists documentos_firma_select on documentos_firma;
create policy documentos_firma_select on documentos_firma for select
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
    or (
      empresa_id = auth_empresa()
      and archivado_en is null
      and es_destinatario_documento(id)
    )
  );

comment on policy documentos_firma_select on documentos_firma is
  'Gestores ven todo (incluido lo archivado, para auditar). El '
  'destinatario ve sólo los vigentes.';

notify pgrst, 'reload schema';
