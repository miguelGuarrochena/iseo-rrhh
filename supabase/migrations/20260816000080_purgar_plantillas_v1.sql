-- Arranque limpio: se retiran todas las plantillas faciales V1.
--
-- Por qué
-- -------
-- Las plantillas V1 se calcularon con el pipeline anterior, que le daba
-- al modelo recortes **sin alinear**. El pipeline actual alinea, así que
-- los descriptores de una y otra versión pertenecen a distribuciones
-- distintas y no son comparables: por eso `fichar_con_rostro` filtra por
-- versión y nunca las cruza.
--
-- La consecuencia práctica es que una plantilla V1 hoy no sirve para
-- nada. No se puede convertir —haría falta la foto original, que nunca
-- se guardó y por diseño no se guarda— y sólo genera ruido: la persona
-- figura como "enrolada", la pantalla le muestra un aviso, y en la
-- terminal escucha "No reconocimos el rostro" contra una cámara que
-- nunca la va a reconocer.
--
-- Se retiran todas de una y se vuelve a empezar. Es más simple de
-- explicar y de operar que un estado mixto que además no aporta nada.
--
-- Qué pasa después de esta migración
-- ----------------------------------
-- **Nadie tiene rostro enrolado.** Todos figuran como "Sin rostro
-- registrado" —que es la verdad— y hay que volver a tomarles la cara
-- desde su ficha, una vez, con el pipeline nuevo.
--
-- Mientras tanto, el fichaje facial no está disponible para nadie. Hay
-- que avisarlo antes y tener a mano la carga manual.
--
-- Qué NO toca
-- -----------
-- Empleados, usuarios, terminales, fichajes ya registrados, auditoría,
-- RLS, actores y configuración quedan intactos. De cada empleado se
-- limpian exactamente tres campos, y sólo si su plantilla es V1.
--
-- El consentimiento biométrico se limpia junto con la plantilla porque
-- van juntos: el consentimiento autoriza a tratar un dato que ya no
-- existe, y al re-enrolar se vuelve a pedir y se vuelve a registrar con
-- su fecha nueva. Dejarlo suelto haría figurar un consentimiento vigente
-- sobre nada.

do $$
declare
  v_total integer;
  v_v1 integer;
  v_v2 integer;
begin
  select
    count(*) filter (where descriptor_facial is not null),
    count(*) filter (where descriptor_facial is not null
                       and coalesce(descriptor_version, 1) = 1),
    count(*) filter (where descriptor_facial is not null
                       and coalesce(descriptor_version, 1) = 2)
  into v_total, v_v1, v_v2
  from empleados;

  raise notice 'Plantillas antes de la purga: % en total (% V1, % V2).',
    v_total, v_v1, v_v2;

  -- Aviso, no error: si ya hay gente en V2 la purga igual es correcta
  -- —sólo toca las V1— pero conviene que quede en el log del deploy.
  if v_v2 > 0 then
    raise notice 'Hay % plantillas V2 que NO se tocan.', v_v2;
  end if;
end $$;

-- El filtro por versión es lo que hace segura a esta migración: si
-- alguien ya se re-enroló con el pipeline nuevo, su plantilla no se
-- toca. Sin el filtro, correr esto dos veces borraría trabajo hecho.
update empleados
   set descriptor_facial = null,
       descriptor_version = null,
       consentimiento_biometrico = null
 where descriptor_facial is not null
   and coalesce(descriptor_version, 1) = 1;

-- Los hashes antirreplay de las plantillas retiradas.
--
-- `fichajes_descriptor_usado` guarda un md5 por reconocimiento usado
-- para que el mismo descriptor no se reutilice. Los de las plantillas
-- que acaban de irse ya no protegen de nada, y dejarlos haría que la
-- tabla creciera arrastrando datos derivados de biometría borrada.
--
-- **No toca los fichajes.** Es una tabla auxiliar de hashes; las marcas
-- de asistencia quedan donde están.
delete from fichajes_descriptor_usado
 where empleado_id in (
   select id from empleados where descriptor_facial is null
 );

do $$
declare v_quedan integer;
begin
  select count(*) into v_quedan
    from empleados
   where descriptor_facial is not null
     and coalesce(descriptor_version, 1) = 1;

  assert v_quedan = 0,
    format('Quedaron %s plantillas V1 sin retirar', v_quedan);

  raise notice 'Purga completa. Todos tienen que re-enrolarse con el pipeline actual.';
end $$;

notify pgrst, 'reload schema';
