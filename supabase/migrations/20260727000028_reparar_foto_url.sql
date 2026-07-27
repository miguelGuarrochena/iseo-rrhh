-- ============================================================
-- Reparar las fotos que quedaron guardadas como URL firmada.
--
-- En `empleados.foto_url` va el path dentro del bucket. Al leer, la app
-- lo cambia por una URL firmada para poder mostrar la imagen, y el form
-- de edición devolvía esa URL tal cual: al guardar cualquier cambio del
-- colaborador —aunque no se tocara la foto— el path se pisaba con un
-- enlace que caduca en una hora. Pasada esa hora la foto dejaba de verse.
--
-- El archivo nunca se perdió: el path está adentro de la propia URL,
-- después de "/object/sign/fotos/". Se extrae y se vuelve a guardar.
--
-- Sólo toca filas que tengan exactamente esa forma. Cualquier otro valor
-- queda como está.
-- ============================================================

update empleados
set foto_url = substring(foto_url from '/object/sign/fotos/([^?]+)')
where foto_url like 'http%/object/sign/fotos/%'
  and substring(foto_url from '/object/sign/fotos/([^?]+)') is not null;

notify pgrst, 'reload schema';
