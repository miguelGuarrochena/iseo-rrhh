-- Reparación: cuentas invitadas que quedaron sin perfil
-- =====================================================
--
-- Síntoma: la persona pone su contraseña, entra, y le aparece
-- "Tu cuenta existe pero todavía no tiene un perfil asignado". En
-- Permisos figura la invitación en el historial pero "Usuarios (0)".
--
-- Causa: la migración 33 hizo que `crear_perfil_usuario` ignore las
-- invitaciones con `rol: superadmin` —para que nadie se haga superadmin
-- mandando metadata—, pero `/api/equipo-iseo` seguía confiando en el
-- trigger. La cuenta se creaba en `auth.users` y nunca en
-- `public.usuarios`. Ya está arreglado en el código: la ruta ahora crea
-- el perfil ella misma. Este archivo es sólo para las cuentas que
-- quedaron colgadas antes del arreglo.
--
-- NO se corre solo. Da acceso total a la plataforma: mirá la lista
-- primero y reparar sólo a quien corresponda.

-- ---------------------------------------------------------------------
-- PASO 1 — Ver quién quedó colgado (sólo lectura, corré esto primero)
-- ---------------------------------------------------------------------
select
  u.id,
  u.email,
  u.invited_at,
  u.last_sign_in_at,
  u.raw_user_meta_data ->> 'rol'             as rol_pedido,
  u.raw_user_meta_data ->> 'nombre_completo' as nombre,
  u.raw_user_meta_data ->> 'empresa_id'      as empresa_id,
  e.nombre                                   as empresa
from auth.users u
left join public.usuarios p on p.id = u.id
left join public.empresas e
       on e.id = nullif(u.raw_user_meta_data ->> 'empresa_id', '')::uuid
where p.id is null          -- sin perfil
  and u.invited_at is not null   -- fue invitada, no un signup suelto
order by u.invited_at desc;

-- Leé la columna `rol_pedido`:
--
--   * 'superadmin'  → equipo de ISEO. Reparar con el PASO 2A.
--   * otro rol      → usuario de un cliente. Reparar con el PASO 2B,
--                     pero revisá antes que `empresa` no sea NULL: si lo
--                     es, la empresa no existe y hay que crearla primero
--                     (o la invitación se mandó mal y conviene borrar la
--                     cuenta y volver a invitar desde la app).

-- ---------------------------------------------------------------------
-- PASO 2A — Reparar un superadmin del equipo de ISEO
--
-- Reemplazá el email. De a uno, mirando lo que devolvió el paso 1:
-- esto da acceso a los datos y la facturación de TODOS los clientes.
-- ---------------------------------------------------------------------
-- insert into public.usuarios (id, email, rol, nombre_completo, empresa_id)
-- select u.id,
--        u.email,
--        'superadmin',
--        coalesce(nullif(u.raw_user_meta_data ->> 'nombre_completo', ''), u.email),
--        null
--   from auth.users u
--  where u.email = 'PONER_EL_EMAIL_ACA'
--    and u.invited_at is not null
--    and not exists (select 1 from public.usuarios p where p.id = u.id)
-- on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- PASO 2B — Reparar un usuario de un cliente
--
-- Toma el rol y la empresa de la metadata de la invitación, que es lo
-- que se eligió en la pantalla. Nunca crea superadmins.
-- ---------------------------------------------------------------------
-- insert into public.usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
-- select u.id,
--        u.email,
--        (u.raw_user_meta_data ->> 'rol')::rol_usuario,
--        coalesce(nullif(u.raw_user_meta_data ->> 'nombre_completo', ''), u.email),
--        nullif(u.raw_user_meta_data ->> 'empresa_id', '')::uuid,
--        nullif(u.raw_user_meta_data ->> 'empleado_id', '')::uuid
--   from auth.users u
--  where u.email = 'PONER_EL_EMAIL_ACA'
--    and u.invited_at is not null
--    and (u.raw_user_meta_data ->> 'rol') in ('admin_rrhh', 'supervisor', 'empleado')
--    and nullif(u.raw_user_meta_data ->> 'empresa_id', '')::uuid is not null
--    and not exists (select 1 from public.usuarios p where p.id = u.id)
-- on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- PASO 3 — Confirmar que quedó bien
-- ---------------------------------------------------------------------
-- select u.email, p.rol, p.empresa_id
--   from auth.users u join public.usuarios p on p.id = u.id
--  where u.email = 'PONER_EL_EMAIL_ACA';
