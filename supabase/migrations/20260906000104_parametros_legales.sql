-- ============================================================
-- Parámetros legales con vigencia, mantenidos por ISEO.
--
-- Qué resuelve
-- ------------
-- El tope de la base imponible para aportes (art. 9, Ley 24.241) lo
-- actualiza ANSES **cada trimestre**. Hoy vive en
-- `empresas.config.topeImponibleAportes`: un número por empresa, sin
-- historia. Eso trae dos problemas.
--
-- 1. Nadie lo carga. En producción, 0 de 13 empresas lo tienen, así que
--    a todos se les calculan los aportes sobre el bruto completo. Para
--    sueldos por encima del tope el neto que se muestra es más bajo que
--    el que la persona cobra.
-- 2. Sin vigencia, el valor es "el de hoy". Si alguien carga el tope de
--    octubre y después se recalcula una liquidación de agosto, agosto
--    cambia de número retroactivamente.
--
-- Acá se guarda el parámetro con su vigencia, así cada período se
-- liquida con el valor que regía en ese período.
--
-- Alcance: SÓLO el tope imponible
-- -------------------------------
-- Es el único parámetro del sistema que cambia seguido. Los otros
-- —aportes 11/3/3, tope de deducciones del 20% (art. 133), tope de
-- adelanto del 50% (art. 130), recargos de extras 50/100 (art. 201),
-- jornada de 192 horas— están en la LCT y en la Ley 24.241 y no se
-- mueven; siguen como constantes en `remuneraciones.ts`, que es donde se
-- leen mejor. Las cargas patronales tampoco entran: el cliente dijo que
-- son iguales para todas las empresas y ya hay un override por empresa.
--
-- Meter todo acá sería una tabla de configuración para valores que nadie
-- va a cambiar nunca, y sacaría de la vista las reglas que hoy se leen
-- al lado del cálculo.
--
-- La tabla arranca VACÍA
-- ----------------------
-- Sin filas, `parametro_legal_vigente()` devuelve null y todo se
-- comporta exactamente como hoy (sin tope). No se siembra ningún valor:
-- los importes legales los carga ISEO desde la resolución, no el código.
--
-- Idempotente.
-- ============================================================

create table if not exists parametros_legales (
  id uuid primary key default gen_random_uuid(),
  /*
   * Qué parámetro es. Texto y no enum: agregar uno nuevo no debería
   * necesitar una migración de tipo, y la lista la manda el código que
   * lo consume (`CLAVES_PARAMETRO` en `parametrosLegales.ts`).
   */
  clave text not null,
  valor numeric(14, 2) not null check (valor >= 0),
  /** Desde qué período rige, inclusive. YYYY-MM. */
  vigencia_desde text not null check (vigencia_desde ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  /** Hasta qué período rige, inclusive. Null = sigue vigente. */
  vigencia_hasta text check (vigencia_hasta ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  /** De dónde salió: "Res. ANSES 123/2026", el boletín, el link. */
  fuente text,
  observacion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references usuarios (id) on delete set null,
  constraint vigencia_coherente
    check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  /*
   * Un solo valor por parámetro y período de inicio. No impide que se
   * solapen dos rangos distintos —eso lo resuelve la consulta tomando el
   * `vigencia_desde` más alto— pero sí evita cargar dos veces el mismo
   * trimestre, que es el error de dedo probable.
   */
  unique (clave, vigencia_desde)
);

comment on table parametros_legales is
  'Valores legales que cambian en el tiempo y mantiene ISEO, con su '
  'vigencia. Hoy: el tope de la base imponible para aportes (art. 9 Ley '
  '24.241), que ANSES actualiza cada trimestre.';

create index if not exists parametros_legales_busqueda_idx
  on parametros_legales (clave, vigencia_desde desc);

alter table parametros_legales enable row level security;

/*
 * Lectura para cualquiera con sesión: no es un dato sensible —es un
 * valor publicado en el Boletín Oficial— y la liquidación lo necesita
 * desde el navegador de quien liquida.
 */
drop policy if exists parametros_legales_select on parametros_legales;
create policy parametros_legales_select on parametros_legales for select
  using (auth.uid() is not null);

/*
 * Escritura sólo del superadmin. El admin de una empresa no puede tocar
 * un parámetro legal: es de ISEO, igual que `servicios` (migración 101).
 */
drop policy if exists parametros_legales_superadmin on parametros_legales;
create policy parametros_legales_superadmin on parametros_legales for all
  using (es_superadmin()) with check (es_superadmin());

/**
 * El valor que regía en un período dado.
 *
 * Se elige el rango que contiene al período y, si hubiera más de uno, el
 * de `vigencia_desde` más alto: el último cargado gana. Devuelve null si
 * no hay ninguno, y quien llama decide qué hacer con eso — nunca se
 * inventa un valor por defecto acá.
 *
 * `stable` y no `immutable`: depende del contenido de la tabla.
 */
create or replace function public.parametro_legal_vigente(
  p_clave text,
  p_periodo text
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select p.valor
  from parametros_legales p
  where p.clave = p_clave
    and p.vigencia_desde <= p_periodo
    and (p.vigencia_hasta is null or p.vigencia_hasta >= p_periodo)
  order by p.vigencia_desde desc
  limit 1;
$$;

comment on function public.parametro_legal_vigente(text, text) is
  'El valor del parámetro que regía en ese período (YYYY-MM), o null si '
  'no hay ninguno cargado. Nunca devuelve un default inventado.';

revoke all on function public.parametro_legal_vigente(text, text) from public;
revoke all on function public.parametro_legal_vigente(text, text) from anon;
grant execute on function public.parametro_legal_vigente(text, text) to authenticated;

/** Sello de quién y cuándo tocó el parámetro. */
create or replace function public.trg_parametros_legales_sello()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actualizado_en := now();
  if auth.uid() is not null then
    new.actualizado_por := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists parametros_legales_sello on parametros_legales;
create trigger parametros_legales_sello
  before insert or update on parametros_legales
  for each row execute function trg_parametros_legales_sello();

notify pgrst, 'reload schema';
