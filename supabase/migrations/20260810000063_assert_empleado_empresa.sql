-- ============================================================
-- Migración 63: invariante empleado_id ∈ empresa_id
--
-- RLS no alcanza: un admin_rrhh podía INSERT/UPDATE con
-- empresa_id = su tenant y empleado_id de otra empresa (O2 / FRT-11a).
--
-- Autoridad en DB: assert_empleado_de_empresa + triggers BEFORE
-- INSERT/UPDATE en tablas con el par (empresa_id, empleado_id).
-- También: empleados.empresa_id inmutable; usuarios.empleado_id
-- coherente; destinatarios de firma alineados al doc padre.
-- Idempotente.
-- ============================================================

create or replace function public.assert_empleado_de_empresa(
  p_empleado_id uuid,
  p_empresa_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp_empresa uuid;
begin
  if p_empleado_id is null then
    raise exception 'Falta el colaborador';
  end if;
  if p_empresa_id is null then
    raise exception 'Falta la empresa';
  end if;

  select e.empresa_id into v_emp_empresa
  from empleados e
  where e.id = p_empleado_id;

  if v_emp_empresa is null then
    raise exception 'El colaborador no existe';
  end if;

  if v_emp_empresa is distinct from p_empresa_id then
    raise exception
      'El colaborador no pertenece a la empresa indicada';
  end if;
end;
$$;

comment on function public.assert_empleado_de_empresa(uuid, uuid) is
  'Invariante: empleados.empresa_id debe coincidir con el empresa_id de la fila hija.';

revoke all on function public.assert_empleado_de_empresa(uuid, uuid) from public;
revoke all on function public.assert_empleado_de_empresa(uuid, uuid) from anon;
-- Usada por triggers SECURITY DEFINER; no hace falta GRANT a authenticated.

create or replace function public.trg_assert_empleado_de_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- alertas.empleado_id es opcional (alerta de empresa sin legajo).
  if new.empleado_id is null then
    return new;
  end if;
  perform assert_empleado_de_empresa(new.empleado_id, new.empresa_id);
  return new;
end;
$$;

-- empleados.empresa_id no se mueve de tenant
create or replace function public.lock_empleado_empresa_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.empresa_id is distinct from old.empresa_id
  then
    raise exception 'No se puede cambiar la empresa de un legajo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_empleado_empresa_id on public.empleados;
create trigger trg_lock_empleado_empresa_id
  before update on public.empleados
  for each row execute function public.lock_empleado_empresa_id();

-- usuarios: empleado null OK; si hay vínculo, misma empresa (salvo superadmin sin empresa)
create or replace function public.trg_assert_usuario_empleado_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empleado_id is null then
    return new;
  end if;
  if new.empresa_id is null then
    raise exception 'Un usuario vinculado a un legajo debe tener empresa';
  end if;
  perform assert_empleado_de_empresa(new.empleado_id, new.empresa_id);
  return new;
end;
$$;

drop trigger if exists trg_assert_usuario_empleado_empresa on public.usuarios;
create trigger trg_assert_usuario_empleado_empresa
  before insert or update on public.usuarios
  for each row execute function public.trg_assert_usuario_empleado_empresa();

-- destinatarios de firma: empleado ∈ empresa del documento padre
create or replace function public.trg_assert_destinatario_firma_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  select df.empresa_id into v_empresa
  from documentos_firma df
  where df.id = new.documento_id;

  if v_empresa is null then
    raise exception 'Documento de firma inexistente';
  end if;

  perform assert_empleado_de_empresa(new.empleado_id, v_empresa);
  return new;
end;
$$;

drop trigger if exists trg_assert_destinatario_firma_empresa
  on public.documento_firma_destinatarios;
create trigger trg_assert_destinatario_firma_empresa
  before insert or update on public.documento_firma_destinatarios
  for each row execute function public.trg_assert_destinatario_firma_empresa();

-- Tablas con (empresa_id, empleado_id) directos
do $$
declare
  t text;
  tables text[] := array[
    'ausencias',
    'adelantos',
    'recibos',
    'remuneraciones',
    'documentos_legajo',
    'descuentos_recurrentes',
    'turnos',
    'fichajes',
    'comunicaciones',
    'facturas_monotributo',
    'alertas',
    'notas_internas',
    'vacaciones_pendientes'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists trg_assert_empleado_de_empresa on public.%I', t);
    execute format(
      'create trigger trg_assert_empleado_de_empresa
         before insert or update on public.%I
         for each row execute function public.trg_assert_empleado_de_empresa()',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
