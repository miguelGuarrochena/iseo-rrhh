-- Crear un documento a firmar y sus destinatarios en una sola operación.
--
-- Antes eran dos llamadas HTTP sueltas: primero el insert en
-- `documentos_firma`, después el de `documento_firma_destinatarios`. Si
-- la segunda fallaba —un `empleado_id` que ya no existe, un corte de red,
-- la pestaña que se cierra— quedaba un documento **sin destinatarios**:
-- visible en la lista de enviados de RRHH, contando como mandado, y sin
-- una sola persona a la que se le hubiera pedido la firma. Nadie se
-- entera hasta que alguien pregunta por qué no le llegó.
--
-- Desde el cliente no hay forma de abrir una transacción, así que la
-- atomicidad tiene que vivir acá: en una función, las dos inserciones son
-- una sola unidad y cualquier error las deshace a las dos.
--
-- `security invoker` (el default): la función corre con los permisos de
-- quien llama, así que las policies de ambas tablas se siguen aplicando
-- igual que con los inserts sueltos. No hace falta `definer` porque no
-- necesita ver nada que quien llama no pueda ver.

create or replace function crear_documento_firma(
  p_titulo text,
  p_descripcion text,
  p_archivo_url text,
  p_empleado_ids uuid[]
)
returns setof documentos_firma
language plpgsql
as $$
declare
  v_doc documentos_firma;
begin
  insert into documentos_firma (
    empresa_id, titulo, descripcion, archivo_url, creado_por
  ) values (
    auth_empresa(), p_titulo, nullif(p_descripcion, ''), p_archivo_url, auth.uid()
  )
  returning * into v_doc;

  -- Un documento sin destinatarios no le pide la firma a nadie: es un
  -- error de uso, no un caso válido que convenga dejar pasar en silencio.
  if p_empleado_ids is null or array_length(p_empleado_ids, 1) is null then
    raise exception 'Elegí al menos una persona que tenga que firmar.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into documento_firma_destinatarios (documento_id, empleado_id)
  select v_doc.id, unnest(p_empleado_ids);

  return next v_doc;
  return;
end;
$$;

comment on function crear_documento_firma is
  'Crea el documento y sus destinatarios en una transacción: si falla '
  'cualquiera de los dos, no queda un documento sin nadie a quien pedirle firma.';

revoke all on function crear_documento_firma(text, text, text, uuid[]) from public;
grant execute on function crear_documento_firma(text, text, text, uuid[]) to authenticated;
