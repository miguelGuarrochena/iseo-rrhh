-- Consentimiento biométrico exigido por la base (Ley 25.326).
--
-- Qué pasaba antes
-- ----------------
-- La pantalla de enrolamiento pedía tildar un checkbox de consentimiento,
-- pero ese tilde nunca salía del navegador: `enrolarRostro` escribía
-- siempre `consentimiento_biometrico = { aceptado: true, fecha: hoy }`
-- sin recibir ningún parámetro. Es decir, el sistema **registraba que el
-- consentimiento existía sin que hubiera ocurrido**, y cualquier llamada
-- directa al REST de Supabase podía enrolar un rostro sin pasar por la
-- pantalla.
--
-- La Ley 25.326 exige consentimiento previo, informado y expreso para
-- tratar datos biométricos. Un checkbox sin efecto no lo es.
--
-- Qué hace esta migración
-- -----------------------
-- Mueve la regla a donde no se puede saltear: si se guarda un descriptor
-- facial, en la misma operación tiene que venir el consentimiento
-- aceptado. Vale para la app, para el REST y para cualquier script.

create or replace function exigir_consentimiento_biometrico()
returns trigger
language plpgsql
as $$
begin
  -- Sólo se controla cuando el descriptor **cambia**. Si se controlara en
  -- cada update, las filas viejas que ya tienen rostro sin consentimiento
  -- registrado quedarían imposibles de editar: cambiarle el teléfono a esa
  -- persona fallaría por un motivo que no tiene nada que ver.
  if new.descriptor_facial is not distinct from old.descriptor_facial then
    return new;
  end if;

  -- Borrar el rostro siempre se puede: es el camino de salida (ARCO).
  if new.descriptor_facial is null then
    return new;
  end if;

  if coalesce((new.consentimiento_biometrico->>'aceptado')::boolean, false)
     is not true then
    raise exception
      'No se puede guardar un rostro sin el consentimiento del titular (Ley 25.326).'
      using errcode = 'check_violation';
  end if;

  if (new.consentimiento_biometrico->>'fecha') is null then
    raise exception
      'El consentimiento biométrico tiene que registrar la fecha en que se otorgó.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists exigir_consentimiento_biometrico on empleados;
create trigger exigir_consentimiento_biometrico
  before insert or update on empleados
  for each row
  execute function exigir_consentimiento_biometrico();

comment on function exigir_consentimiento_biometrico is
  'Impide guardar descriptor_facial sin consentimiento aceptado y fechado (Ley 25.326).';

comment on column empleados.consentimiento_biometrico is
  'Consentimiento del titular para usar su rostro: { aceptado, fecha, otorgadoPor, texto }. '
  'Obligatorio para guardar descriptor_facial (ver trigger exigir_consentimiento_biometrico).';

-- Nota sobre los datos que ya están
-- ---------------------------------
-- Las filas enroladas antes de esta migración tienen
-- `consentimiento_biometrico = { aceptado: true }` puesto por el código,
-- no por una persona. Esta migración **no las toca**: invalidarlas
-- obligaría a re-enrolar a todo el personal, y esa es una decisión del
-- cliente, no del despliegue.
--
-- Para invalidarlas y forzar el re-enrolamiento con consentimiento real,
-- correr a mano:
--
--   update empleados
--      set descriptor_facial = null,
--          consentimiento_biometrico = null
--    where descriptor_facial is not null
--      and consentimiento_biometrico->>'otorgadoPor' is null;
--
-- (`otorgadoPor` sólo lo escribe el código nuevo, así que distingue los
-- consentimientos reales de los autogenerados.)
