-- ============================================================
-- Registro de errores de la app.
--
-- Problema real: los errores los reporta el cliente por WhatsApp, con
-- una captura de pantalla. El mensaje que se ve ahí ya está traducido
-- para que se entienda ("falta aplicar una migración pendiente"), así
-- que el detalle crudo de Postgres —el que dice exactamente qué
-- constraint, qué columna, qué policy— se pierde. Pedirle al cliente
-- que abra la consola del navegador no es una opción.
--
-- Con esto, cada error que la app traduce queda guardado con el mensaje
-- original, quién lo provocó, en qué empresa y en qué pantalla. El
-- soporte lo mira después, sin molestar a nadie.
--
-- No guarda datos del negocio: sólo el texto del error y el contexto.
-- ============================================================

create table if not exists errores_app (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas (id) on delete set null,
  usuario_id uuid references usuarios (id) on delete set null,
  -- Pantalla donde ocurrió, ej. "/app/recibos".
  ruta text,
  -- Qué estaba intentando hacer, ej. "carga masiva de recibos".
  contexto text,
  -- El mensaje crudo, sin traducir. Es lo que sirve para diagnosticar.
  mensaje text not null,
  creado_en timestamptz not null default now()
);

create index if not exists errores_app_creado_idx
  on errores_app (creado_en desc);

alter table errores_app enable row level security;

-- Cualquiera con sesión puede dejar constancia de su propio error: si no,
-- justo los errores de permisos serían los que no se registran. Se exige
-- sesión a propósito: la clave anónima es pública y sin esto cualquiera
-- podría llenar la tabla desde afuera.
drop policy if exists errores_app_insert on errores_app;
create policy errores_app_insert on errores_app for insert
  with check (auth.uid() is not null and usuario_id = auth.uid());

-- Leerlos es de soporte. Un error puede contener nombres de constraints
-- y estructura de la base; no es para el cliente.
drop policy if exists errores_app_select on errores_app;
create policy errores_app_select on errores_app for select
  using (es_superadmin());

drop policy if exists errores_app_borrar on errores_app;
create policy errores_app_borrar on errores_app for delete
  using (es_superadmin());

notify pgrst, 'reload schema';
