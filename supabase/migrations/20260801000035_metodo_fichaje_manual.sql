-- ============================================================
-- El fichaje a mano nunca pudo funcionar en producción.
--
-- El enum de la base quedó como se creó en el esquema inicial:
--
--   create type metodo_fichaje as enum ('facial_tablet', 'celular');
--
-- pero el código manda 'manual' (carga de respaldo de RRHH) y 'remoto'
-- (fichaje fuera de la zona de la empresa). El tipo de TypeScript
-- `MetodoFichaje` los tiene desde hace rato; la migración que los
-- agregaba a Postgres nunca se escribió.
--
-- Resultado: cualquier carga manual rebota con
-- "invalid input value for enum metodo_fichaje: manual", que la app
-- traduce como "Esa opción todavía no está habilitada en la base".
-- Es exactamente lo que reportó el cliente el 28/7.
--
-- No alcanza con aplicar migraciones viejas: esto faltaba.
-- ============================================================

alter type metodo_fichaje add value if not exists 'manual';
alter type metodo_fichaje add value if not exists 'remoto';

notify pgrst, 'reload schema';
