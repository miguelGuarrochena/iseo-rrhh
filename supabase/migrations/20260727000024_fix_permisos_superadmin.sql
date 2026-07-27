-- ============================================================
-- Fix devolución cliente (jul 2026)
--
-- Causa raíz común: un superadmin no tiene `empresa_id` en la tabla
-- `usuarios` (opera sobre la empresa que elige en el selector), así que
-- `auth_empresa()` devuelve NULL. Todas las políticas de INSERT que
-- comparan `empresa_id = auth_empresa()` sin una salida por
-- `es_superadmin()` fallan con "new row violates row-level security
-- policy". Las políticas de SELECT/UPDATE ya tenían esa salida; las de
-- INSERT quedaron sin ella.
--
-- Se corrige acá, y de paso se vuelve idempotente el alta de
-- `fichajes.registrado_por` (migración 10) por si no llegó a aplicarse.
-- ============================================================

-- ---------- 1. Fichaje manual: columna de auditoría ----------
alter table fichajes
  add column if not exists registrado_por text;

comment on column fichajes.registrado_por is
  'Nombre de quien cargó el fichaje a mano (metodo = manual).';

-- ---------- 2. Ausencias: alta por gestor y por superadmin ----------
drop policy if exists ausencias_solicitar on ausencias;
create policy ausencias_solicitar on ausencias for insert
  with check (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (empleado_id = auth_empleado() or es_gestor())
    )
  );

-- ---------- 3. Fichajes: alta manual por gestor y por superadmin ----------
drop policy if exists fichajes_fichar on fichajes;
create policy fichajes_fichar on fichajes for insert
  with check (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (empleado_id = auth_empleado() or es_gestor())
    )
  );

-- ---------- 4. Comunicaciones: mismo criterio ----------
drop policy if exists comunicaciones_insert on comunicaciones;
create policy comunicaciones_insert on comunicaciones for insert
  with check (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (empleado_id = auth_empleado() or es_gestor())
    )
  );

-- ---------- 5. Adelantos: mismo criterio ----------
-- Además de la salida por superadmin, se permite que un gestor cargue el
-- adelanto por el empleado (antes solo lo podía pedir la propia persona).
drop policy if exists adelantos_pedir on adelantos;
create policy adelantos_pedir on adelantos for insert
  with check (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (empleado_id = auth_empleado() or es_gestor())
    )
  );

-- ---------- 6. Cumpleaños: que funcionen viendo otra empresa ----------
-- La versión anterior filtraba siempre por auth_empresa(); para un
-- superadmin eso es NULL y no devolvía ninguna fila (por eso los
-- cumpleaños dejaron de aparecer en Eventos). Ahora acepta la empresa
-- que se está mirando, validando que quien pregunta pueda verla.
drop function if exists public.cumples_de_empresa();
drop function if exists public.cumples_de_empresa(uuid);

create function public.cumples_de_empresa(p_empresa uuid default null)
returns table (
  empleado_id uuid,
  nombre text,
  apellido text,
  fecha_nacimiento date
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nombre, e.apellido, e.fecha_nacimiento
  from empleados e
  where e.empresa_id = (
      case
        when p_empresa is null then auth_empresa()
        when es_superadmin() then p_empresa
        when p_empresa = auth_empresa() then p_empresa
        else null
      end
    )
    and e.activo = true
    and e.fecha_nacimiento is not null;
$$;

grant execute on function public.cumples_de_empresa(uuid) to authenticated;

-- ---------- 7. Refrescar el cache de esquema de PostgREST ----------
-- Sin esto, PostgREST puede seguir respondiendo "Could not find the
-- 'registrado_por' column of 'fichajes' in the schema cache".
notify pgrst, 'reload schema';
