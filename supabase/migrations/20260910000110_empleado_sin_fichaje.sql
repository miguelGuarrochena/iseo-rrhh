-- ============================================================
-- Colaboradores que no registran asistencia.
--
-- El fichaje se prende o se apaga por empresa, y eso alcanza cuando
-- toda la empresa ficha o no ficha ninguno. El caso que faltaba es el
-- mixto —planta que ficha y administración que no—: al que no ficha,
-- el tablero le mostraba "Mis horas 0 hs", "Mis extras 0 hs" y
-- "Llegadas tarde 0 · estás impecable".
--
-- Un cero es una afirmación: dice que la persona trabajó cero horas.
-- La verdad es otra —esa persona no registra asistencia— y no había
-- forma de distinguir las dos cosas, porque `modo_fichaje` sólo dice
-- CÓMO ficha (planta, celular, remoto), nunca "no ficha".
--
-- Se guarda explícito y no se deduce de "no tiene marcas", por lo
-- mismo que `sin_usuario` no se deduce de "no tiene cuenta": no tener
-- fichadas es un estado (todavía no fichó, estuvo de licencia) y esto
-- es una decisión (esta persona no ficha).
--
-- Sólo apaga lo que se le MUESTRA. No toca fichajes, jornadas, horas
-- extras, llegadas tarde ni ningún cálculo: lo ya registrado sigue
-- donde está y se sigue leyendo igual.
--
-- Los colaboradores que ya existen quedan en false, que es como
-- venían funcionando.
-- ============================================================

alter table empleados
  add column if not exists sin_fichaje boolean not null default false;

comment on column empleados.sin_fichaje is
  'El colaborador no registra asistencia: no se le muestran horas, '
  'extras ni llegadas tarde. No afecta ningún cálculo ni las marcas '
  'ya registradas.';

-- La columna se lee por `empleados_lectura` (mig 66), pero el grant
-- por columna sobre la tabla se mantiene al día igual que el resto de
-- las no sensibles: si no, un select directo a la tabla la rechaza.
grant select (sin_fichaje) on table public.empleados to authenticated;

-- ---------------------------------------------------------------------
-- `empleados_lectura` es la vista por la que PostgREST lee empleados.
-- La lista es la de la vista vigente (migración 77) con `sin_fichaje`
-- agregada AL FINAL: un `create or replace view` sólo admite columnas
-- nuevas al final del conjunto previo, y cualquier diferencia en las
-- anteriores lo rechaza.
-- ---------------------------------------------------------------------
create or replace view public.empleados_lectura as
select
  e.id,
  e.empresa_id,
  e.nombre,
  e.apellido,
  e.dni,
  e.cuil,
  e.fecha_nacimiento,
  e.estado_civil,
  e.nivel_estudios,
  e.domicilio,
  e.telefono,
  e.email,
  e.contacto_emergencia,
  e.grupo_familiar,
  e.foto_url,
  e.fecha_ingreso,
  e.puesto,
  e.sector,
  e.supervisor_id,
  e.modalidad_contratacion,
  e.fecha_fin_contrato,
  e.modalidad_pago,
  e.banco,
  case
    when puede_ver_datos_sensibles_empleado(e.id) then e.cbu
    else null
  end as cbu,
  e.obra_social,
  e.art,
  e.activo,
  e.fecha_baja,
  e.motivo_baja,
  e.checklist_alta,
  e.creado_en,
  -- El descriptor NO se expone a nadie, ni al titular ni a admin_rrhh.
  -- Sólo si la persona está enrolada o no.
  (e.descriptor_facial is not null) as tiene_rostro,
  case
    when puede_ver_datos_sensibles_empleado(e.id) then e.consentimiento_biometrico
    else null
  end as consentimiento_biometrico,
  e.modo_fichaje,
  e.geocerca,
  e.convenio,
  e.numero_legajo,
  e.sin_usuario,
  -- Metadato de despliegue: con qué pipeline se generó la plantilla.
  e.descriptor_version,
  e.sin_fichaje
from public.empleados e
where
  es_superadmin()
  or (
    e.empresa_id = auth_empresa()
    and (e.id = auth_empleado() or es_gestor())
  );

comment on view public.empleados_lectura is
  'Read path for PostgREST: same row visibility as empleados_select; CBU '
  'redacted for supervisors. descriptor_facial is never exposed — only '
  'tiene_rostro (FIC-011) and descriptor_version (deployment metadata).';

grant select on public.empleados_lectura to authenticated;
revoke all on public.empleados_lectura from anon;
