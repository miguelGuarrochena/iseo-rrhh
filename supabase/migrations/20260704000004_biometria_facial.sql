-- Reconocimiento facial para el fichaje.
--
-- El "descriptor" es un arreglo de 128 números que representa el rostro;
-- no permite reconstruir la imagen. Es un dato biométrico (sensible), por
-- eso guardamos también el consentimiento del empleado (Ley 25.326).
-- Las policies RLS existentes de `empleados` y `fichajes` ya cubren estas
-- columnas nuevas (son parte de la misma fila/tenant).

alter table empleados
  add column if not exists descriptor_facial jsonb,
  add column if not exists consentimiento_biometrico jsonb;

-- Confianza del match facial (0 a 1) al momento del fichaje.
alter table fichajes
  add column if not exists confianza real;

comment on column empleados.descriptor_facial is
  'Descriptor facial (128 nros) del rostro enrolado. Dato biométrico sensible.';
comment on column empleados.consentimiento_biometrico is
  'Consentimiento del empleado para el uso de su rostro: { aceptado, fecha }.';
comment on column fichajes.confianza is
  'Confianza del reconocimiento facial (0 a 1) cuando el método es facial.';
