# Devolución del cliente — julio 2026

Estado de cada punto del documento "Errores Iseo RH".

## Causa raíz común

Cuatro de los problemas reportados vienen del mismo lugar: **un superadmin
no tiene `empresa_id` en la tabla `usuarios`** (opera sobre la empresa que
elige en el selector), así que la función `auth_empresa()` devuelve `NULL`.

Las políticas RLS de `SELECT` y `UPDATE` siempre tuvieron una salida por
`es_superadmin()`, pero las de `INSERT` quedaron sin ella. Resultado: todo
lo que el superadmin intenta **crear** en una empresa que no es la propia
rebota con `new row violates row-level security policy`.

## Resuelto

| #   | Reporte                                                   | Qué pasaba                                                                                                                                                                                              | Fix                                                                                                                                                                    |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No se puede cargar un año que empiece en 19; salta a 20xx | El campo tomaba la fecha apenas el año tenía 2 dígitos: al tipear `05/03/19` se cerraba en 2019 y reescribía el texto, así que nunca se llegaba a `1985`                                                | `CampoFecha` ahora solo confirma la fecha con el año de 4 dígitos. El año corto se sigue aceptando al salir del campo, con ventana móvil (`85` → 1985, `28` → 2028)    |
| 2   | Error al cargar ausencias                                 | Política `ausencias_solicitar` sin salida por superadmin                                                                                                                                                | Migración `20260727000024`                                                                                                                                             |
| 3   | No deja cargar fichada manual                             | Falta `fichajes.registrado_por` en la base (migración 10 sin aplicar) + política `fichajes_fichar` sin salida por superadmin                                                                            | Migración `20260727000024` (agrega la columna de forma idempotente y refresca el cache de PostgREST)                                                                   |
| 4   | Error de CUIL en carga masiva y de DNI duplicado          | El CUIL se rechazaba si venía con puntos o espacios (los Excel los mezclan); el DNI duplicado mostraba el error crudo de Postgres                                                                       | CUIL y DNI se normalizan a solo dígitos antes de validar; el importador detecta DNI repetidos dentro del archivo y ahora informa el motivo real de cada fila que falla |
| 5   | Los cumpleaños dejaron de aparecer en Eventos             | Dos causas: `cumples_de_empresa()` filtraba por `auth_empresa()` (NULL para superadmin → cero filas), y el cumpleaños **de hoy** se comparaba contra la hora actual, así que se corría al año siguiente | La función acepta la empresa que se está viendo; la comparación es contra medianoche                                                                                   |

De yapa, dos cosas que aparecieron en el camino:

- `hoyISO()` usaba `toISOString()` (UTC). En Argentina, después de las
  21:00 devolvía el día siguiente y los eventos de hoy quedaban fuera de
  los listados. Ahora usa la fecha local.
- Los errores crudos de Postgres se traducen a mensajes entendibles
  (`src/lib/erroresDb.ts`). En vez de
  `duplicate key value violates unique constraint "empleados_empresa_id_dni_key"`
  ahora se lee _"Ya hay un colaborador cargado con ese DNI en esta empresa.
  Buscalo en la lista y editá su ficha en vez de darlo de alta otra vez."_

## Cómo aplicar

1. Correr `supabase/diagnostico_devolucion_cliente.sql` en el SQL Editor
   para confirmar el estado real de la base (es solo de lectura).
2. Aplicar `supabase/migrations/20260727000024_fix_permisos_superadmin.sql`.
3. Deployar el front.

El punto 2 no es opcional: los fixes 2, 3 y 5 son de base de datos, no de
código.

## Pendiente de decisión (no tocado)

- **Recibos**: el empleado abre uno y ve el de todos. Hay que revisar el
  filtro de la vista de recibos y dejar el histórico accesible para que no
  tenga que pedírselo a RRHH. _(Es el pedido más urgente de los que
  quedan: hoy es una filtración de datos entre empleados.)_
- **Módulos por tipo de negocio**: empresas en blanco vs. en negro vs.
  monotributistas. Poder tildar módulos al dar de alta la empresa, ocultar
  convenio en las que están en negro, y cargar el costo del monotributo a
  mano. Es un rediseño grande, conviene definir bien los dos o tres
  paquetes antes de empezar.
- **Permisos de empresa**: qué pasa cuando se cede la administración de
  una empresa. Hoy si el mail no está en los permisos, se pierde la
  visibilidad. Definir el modelo antes de tocar código.
- **Reconocimiento facial**: el cliente no pudo probarlo con su cámara.
  Espera repetir la prueba en LAK con dos personas más antes de reportar.
- **Borrar organigrama**: el cliente dice que hoy no aporta. Decisión de
  producto, no bug.
