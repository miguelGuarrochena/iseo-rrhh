-- ============================================================
-- Diagnóstico de la devolución del cliente (jul 2026).
-- Correr en el SQL Editor de Supabase ANTES de aplicar la migración
-- 20260727000024_fix_permisos_superadmin.sql, para confirmar el estado
-- real de la base. Es solo de lectura: no modifica nada.
-- ============================================================

-- 1. ¿Existe la columna que pide el fichaje manual?
--    Si no devuelve ninguna fila, la migración 10 nunca se aplicó.
select 'fichajes.registrado_por' as chequeo,
       count(*) as existe
from information_schema.columns
where table_schema = 'public'
  and table_name = 'fichajes'
  and column_name = 'registrado_por';

-- 2. ¿Cómo están hoy las políticas de INSERT que fallan?
--    Mirar la columna with_check: si no menciona es_superadmin(),
--    un superadmin (empresa_id NULL) no puede insertar.
select tablename, policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('ausencias', 'fichajes', 'comunicaciones', 'adelantos')
  and cmd = 'INSERT'
order by tablename;

-- 3. ¿Los usuarios que reportaron el problema tienen empresa_id?
--    Un superadmin normalmente lo tiene en NULL: ahí está la causa raíz.
select id, email, rol, empresa_id, empleado_id
from usuarios
order by rol, email;

-- 4. ¿Existen los tipos de ausencia nuevos? (confirma si corrió la mig. 23)
select enumlabel
from pg_enum
where enumtypid = 'tipo_ausencia'::regtype
order by enumsortorder;

-- 5. ¿Qué firma tiene hoy la función de cumpleaños?
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'cumples_de_empresa';

-- 6. ¿Cuántos empleados activos tienen fecha de nacimiento cargada?
--    Si da 0, los cumpleaños no aparecen simplemente porque falta el dato.
select e.empresa_id,
       em.nombre as empresa,
       count(*) filter (where e.activo) as activos,
       count(*) filter (where e.activo and e.fecha_nacimiento is not null)
         as con_fecha_nacimiento
from empleados e
join empresas em on em.id = e.empresa_id
group by e.empresa_id, em.nombre
order by em.nombre;

-- 7. DNIs duplicados que puedan estar chocando con la constraint única.
select empresa_id, dni, count(*), string_agg(apellido || ', ' || nombre, ' | ')
from empleados
group by empresa_id, dni
having count(*) > 1;
