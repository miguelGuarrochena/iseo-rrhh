-- ============================================================
-- Limpieza de datos biométricos del pipeline V1
--
-- ⚠ ESTE ARCHIVO NO SE EJECUTA SOLO. NO ES UNA MIGRACIÓN.
--
-- Vive fuera de `supabase/migrations/` a propósito: `supabase db push`
-- no lo va a tocar. Es un procedimiento manual, para correr a mano,
-- leyendo la salida de cada paso antes de pasar al siguiente.
--
-- Qué hace
-- --------
-- PARTE A — inspección. Sólo lee. Contesta "qué hay y qué se iría".
-- PARTE B — borrado. Está **comentada**. Hay que descomentarla a mano.
--
-- Qué NO toca, en ningún caso
-- ---------------------------
-- empleados (la fila), usuarios, terminales, fichajes, auditoría, RLS,
-- actores, configuración, fotos de perfil, ni ningún otro dato de
-- negocio. Lo único que borra son plantillas faciales de la versión
-- indicada.
--
-- Antes de correr la PARTE B
-- --------------------------
-- 1. Que la PARTE A muestre 0 personas pendientes de re-enrolar.
-- 2. Que el listado de requisitos de la app no muestre ninguna
--    "Rostro registrado con una versión anterior".
-- 3. Que haya un respaldo del día.
--
-- Una plantilla borrada NO se recupera: sólo se vuelve a generar
-- volviendo a poner a la persona frente a la cámara.
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'PARTE A — INSPECCIÓN (sólo lectura)'
\echo '=========================================='
\echo ''

-- ---------------------------------------------------------------------
-- A.1 · Estado del re-enrolamiento, por empresa
-- ---------------------------------------------------------------------
\echo '--- A.1 Plantillas faciales por versión ---'
select
  em.nombre as empresa,
  count(*) filter (where e.descriptor_facial is not null) as con_plantilla,
  count(*) filter (
    where e.descriptor_facial is not null
      and coalesce(e.descriptor_version, 1) = 1
  ) as version_1_a_retirar,
  count(*) filter (
    where e.descriptor_facial is not null
      and coalesce(e.descriptor_version, 1) = 2
  ) as version_2_vigente,
  count(*) filter (
    where e.descriptor_facial is null and e.activo
  ) as activos_sin_plantilla
from empleados e
join empresas em on em.id = e.empresa_id
group by em.nombre
order by em.nombre;

-- ---------------------------------------------------------------------
-- A.2 · Quiénes son, con nombre y apellido
--
-- El detalle importa: el borrado los deja sin poder fichar con la cara
-- hasta que alguien los vuelva a enrolar. Conviene saber a quién hay que
-- avisarle antes, no después.
-- ---------------------------------------------------------------------
\echo ''
\echo '--- A.2 Personas cuya plantilla V1 se borraría ---'
select
  e.id,
  e.apellido || ', ' || e.nombre as persona,
  e.activo,
  e.modo_fichaje,
  coalesce(e.descriptor_version, 1) as version,
  (e.consentimiento_biometrico->>'fecha') as consentimiento_desde
from empleados e
where e.descriptor_facial is not null
  and coalesce(e.descriptor_version, 1) = 1
order by e.activo desc, e.apellido, e.nombre;

-- ---------------------------------------------------------------------
-- A.3 · Fotos: dónde están y de quién son
--
-- Contesta la pregunta de si existen "fotos de enrolamiento". No
-- existen: el pipeline facial nunca materializa una imagen. Lo que hay
-- son dos cosas **de negocio**, que no se tocan:
--
--   * `empleados.foto_url` → avatar del legajo, que sube RRHH a mano
--     desde la ficha. Se ve en el listado de colaboradores.
--   * `usuarios.avatar_url` → foto de la cuenta.
--
-- Esta consulta está para confirmarlo con datos, no para borrar nada.
-- ---------------------------------------------------------------------
\echo ''
\echo '--- A.3 Fotos existentes (NO se borran: son de negocio) ---'
select 'empleados.foto_url (avatar de legajo)' as origen, count(*) as filas
  from empleados where foto_url is not null
union all
select 'usuarios.avatar_url (foto de cuenta)', count(*)
  from usuarios where avatar_url is not null
union all
select 'fichajes.foto_url (columna en desuso)', count(*)
  from fichajes where foto_url is not null;

-- ---------------------------------------------------------------------
-- A.4 · Objetos en Storage
--
-- El bucket `fotos` guarda los avatares del legajo. El pipeline facial
-- **no escribe en ningún bucket**; hay un test que lo fija
-- (`src/tests/minimizacionBiometrica.test.ts`).
-- ---------------------------------------------------------------------
\echo ''
\echo '--- A.4 Objetos por bucket ---'
select bucket_id, count(*) as objetos,
       pg_size_pretty(sum(coalesce((metadata->>'size')::bigint, 0))) as peso
from storage.objects
group by bucket_id
order by bucket_id;

-- ---------------------------------------------------------------------
-- A.5 · Hashes antirreplay derivados de plantillas V1
--
-- `fichajes_descriptor_usado` guarda un md5 por reconocimiento usado,
-- para que el mismo descriptor no se reutilice. Los de V1 quedan sin
-- sentido cuando se retiran las plantillas, pero **no son urgentes** y
-- borrarlos no cambia ninguna garantía: son hashes, no plantillas.
-- ---------------------------------------------------------------------
\echo ''
\echo '--- A.5 Hashes antirreplay ---'
select
  count(*) as total,
  count(*) filter (
    where empleado_id in (
      select id from empleados
       where descriptor_facial is not null
         and coalesce(descriptor_version, 1) = 1
    )
  ) as de_personas_en_v1
from fichajes_descriptor_usado;

-- ---------------------------------------------------------------------
-- A.6 · Qué queda después
-- ---------------------------------------------------------------------
\echo ''
\echo '--- A.6 Estado que quedaría tras borrar las V1 ---'
select
  (select count(*) from empleados) as empleados_intactos,
  (select count(*) from usuarios) as usuarios_intactos,
  (select count(*) from fichajes) as fichajes_intactos,
  (select count(*) from terminales) as terminales_intactas,
  (select count(*) from empleados where descriptor_facial is not null
     and coalesce(descriptor_version,1) = 2) as plantillas_que_quedan,
  (select count(*) from empleados where foto_url is not null) as avatares_intactos;

\echo ''
\echo '=========================================='
\echo 'PARTE B — BORRADO (comentada a propósito)'
\echo '=========================================='
\echo ''
\echo 'Para ejecutarla: descomentá el bloque del archivo y volvé a correrlo.'
\echo 'Antes verificá que A.1 muestre version_1_a_retirar = 0 pendientes'
\echo 'de re-enrolar, o que aceptás dejar a esas personas sin fichaje facial.'
\echo ''

-- ---------------------------------------------------------------------
-- B.1 · Retiro de las plantillas V1
--
-- Se usa la función y no un UPDATE suelto: exige rol de gestor, se niega
-- a borrar la versión con la que se está fichando, y devuelve cuántas
-- borró. Un `update empleados set descriptor_facial = null` a mano no
-- tiene ninguna de esas tres protecciones.
--
-- Corre por empresa, con la sesión de un usuario gestor de esa empresa.
-- ---------------------------------------------------------------------

-- begin;
--
-- -- Contexto de sesión: reemplazar por el uuid de un admin_rrhh real.
-- select set_config(
--   'request.jwt.claims',
--   json_build_object('sub', '<UUID-DEL-ADMIN-RRHH>', 'role', 'authenticated')::text,
--   true
-- );
--
-- select retirar_plantillas_faciales(1::smallint, 2::smallint) as plantillas_retiradas;
--
-- -- Verificación dentro de la misma transacción, antes de confirmar.
-- select count(*) as deberia_ser_cero
--   from empleados
--  where descriptor_facial is not null
--    and coalesce(descriptor_version, 1) = 1;
--
-- -- Si el número de arriba es 0 y el resto se ve bien:
-- --   commit;
-- -- Si algo no cuadra:
-- --   rollback;
-- rollback;

-- ---------------------------------------------------------------------
-- B.2 · Purga de hashes antirreplay huérfanos (OPCIONAL)
--
-- Sólo si se quiere achicar la tabla. No aporta ninguna garantía de
-- seguridad y no hace falta para el re-enrolamiento.
-- ---------------------------------------------------------------------

-- delete from fichajes_descriptor_usado
--  where empleado_id in (
--    select id from empleados where descriptor_facial is null
--  );

\echo 'Fin. La PARTE B no se ejecutó.'
