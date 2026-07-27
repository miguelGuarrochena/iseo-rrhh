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

## Segunda tanda

### Recibos — asignación (el que más importaba)

El detector que reparte los PDF de la carga masiva buscaba el CUIL, DNI o
legajo **como subcadena de todos los dígitos del nombre del archivo
concatenados**, y aceptaba legajos de un solo dígito. Con eso, un archivo
como `Recibo 1. Noviembre 2025.pdf` matcheaba contra el legajo "1", "11",
"2", "5"… y el recibo se le asignaba a quien no era.

Ahora (`src/lib/asignarRecibos.ts`):

- La comparación es **exacta contra cada número suelto** del nombre, no
  por subcadena.
- El legajo se acepta solo con 3 dígitos o más: "1", "2" y "13" son
  indistinguibles del mes o del día.
- **Ante dos candidatos posibles, no se asigna.** Un recibo sin asignar
  cuesta un minuto de RRHH; uno mal asignado es una filtración de datos
  salariales.
- Si dos PDF quedan apuntando a la misma persona, la subida **se bloquea**
  y se marcan las filas en rojo.
- Aviso cuando un PDF pesa mucho más de lo normal, que es la pinta del
  archivo con toda la nómina junta exportado del sistema de sueldos.

### Recibos — lectura del PDF (tercera tanda)

El nombre del archivo nunca iba a ser confiable: lo pone el sistema de
sueldos y cambia según la empresa. Peor: **no hay forma de saber desde
afuera cuántas personas hay adentro de un PDF**, así que "subí uno por
persona" era un pedido, no una regla que se pudiera hacer cumplir.

Ahora se abre cada PDF en el navegador y se leen los CUIL impresos
adentro (`src/lib/recibosPdf.ts` + `src/lib/pdfArchivos.ts`). Eso permite:

- **Asignar con certeza.** El CUIL del recibo es el dato correcto por
  definición. El nombre del archivo quedó como último recurso, para
  cuando el PDF no se puede leer.
- **Detectar el export con toda la nómina** y cortarlo solo en un PDF por
  persona. RRHH sube el archivo como se lo da el sistema de sueldos y
  cada uno recibe únicamente el suyo.
- **Explicar lo que no se pudo**: distingue el PDF escaneado (sin texto)
  de aquel donde aparece gente que no está cargada en el sistema.

Nada de esto sale de la computadora de quien sube: el análisis es local y
sólo se suben los recibos ya separados.

Dos cosas aparecieron recién al probar contra PDFs generados de verdad, y
ninguna se veía con texto de ejemplo:

1. **El CUIT del empleador está impreso en todas las hojas**, duplicado
   incluido. Sin excluirlo, cada hoja de continuación parecía tener el
   documento de un desconocido y el agrupado se rompía. Por eso
   `duenoDePagina` recibe el CUIT de la empresa.
2. **Un importe argentino tiene la misma forma que un DNI con puntos**
   (`1.707.317,07`). Cada monto del recibo se leía como un documento. La
   expresión regular ahora descarta lo que venga con `$` o con decimales.

Cuidado que quedó explícito en el código: una hoja con el CUIL de alguien
que **no** está cargado en el sistema arranca un tramo nuevo en vez de
pegarse al recibo anterior. Si se pegara, esa persona abriría su recibo y
vería el de un tercero, que es exactamente lo que estamos evitando.

El worker de pdf.js se sirve desde `public/` y lo copia
`scripts/copiar-worker-pdf.mjs` en cada `npm install` y antes de cada
build, para que su versión no se despegue de la librería.

### Recibos — histórico

Ya se veían todos los períodos; faltaba poder usarlos. Se agregó botón de
descarga (con nombre `recibo-2026-07.pdf`) y filtro por año cuando hay más
de uno.

### Organigrama — opcional por empresa

Nuevo tilde en Configuración → Secciones. Apagarlo lo saca del menú, del
buscador y de la barra inferior para toda la empresa; entrar por la URL
directa muestra un cartel con el link para volver a prenderlo. No se borró
nada: el código, la dependencia y los `supervisor_id` quedan intactos.

Está armado como `config.modulos` (un `Record<string, boolean>` donde lo
que no figura está encendido), así que cuando definan los módulos por tipo
de negocio se suman claves ahí sin migrar nada.

### Permisos de empresa

La respuesta a la pregunta del cliente es **no, no perdés visibilidad**:
el superadmin ve todas las empresas por `es_superadmin()` en las políticas
de SELECT, figure o no en la lista de permisos. Estar en esa lista solo
hace falta para operar _como_ admin de esa empresa.

Como eso no se entendía desde la pantalla, se explicó ahí mismo. Y se
tapó el agujero real: **ya no se puede dejar una empresa sin ningún
admin**. Bajarle el rol al único admin ahora da un error claro en vez de
fallar en silencio, y si queda uno solo aparece un aviso sugiriendo
nombrar un segundo.

### Reconocimiento facial

No pude reproducirlo sin el dispositivo, así que ataqué las tres causas
probables y mejoré el diagnóstico para la prueba en LAK:

- **Umbral.** Estaba en 0.5 para todo. Ahora verificar 1:1 (celular) usa
  0.6 —el default de face-api— y identificar 1:N (tablet) se queda en 0.5.
  Son riesgos distintos: en 1:1 la sesión ya dice quién sos y la cara solo
  confirma; en 1:N cada candidato es una chance más de equivocarse. Con
  0.5 parejo rebotaba gente legítima que se había enrolado con otra luz.
- **Detección.** Una sola pasada a 320px. Ahora reintenta a 512 y 608 con
  menos exigencia si no encuentra nada: es lo que salva a las tablets con
  cámara pobre y a la oficina con mala luz.
- **Contexto inseguro.** Si entran a la tablet por `http://` o por la IP
  de la red local, el navegador no expone la cámara y el mensaje era un
  genérico "no pudimos acceder a la cámara". Ahora lo dice explícito, y lo
  mismo con la cámara ocupada por otra app. **Es mi principal sospecha de
  lo que le pasó al cliente con la tablet.**
- Los mensajes distinguen "no vi ninguna cara" de "vi varias" de "no
  cargó el modelo", y en el 1:N se agregó un margen mínimo entre el mejor
  y el segundo candidato: ante la duda no ficha a nadie.

### Del repaso general

- **Auditoría rota en silencio.** Misma causa raíz que todo lo demás: la
  política de INSERT de `auditoria_acciones` pedía
  `empresa_id = auth_empresa()`, NULL para un superadmin. Pero acá el
  error se descartaba a propósito para no romper la acción principal, así
  que **todo lo que el superadmin hacía en las empresas cliente quedaba
  sin registrar y nadie se enteraba**. Migración `20260727000025`. El
  código ahora avisa por consola en desarrollo si vuelve a fallar.
- **Cuatro `toISOString()` más** con el mismo problema de zona horaria que
  `hoyISO()`: en el dashboard, en el consentimiento biométrico, en las
  notas internas y en el cálculo de vencimientos. Todos pasados a fecha
  local vía `aISOLocal()`.
- Barrí las políticas RLS de escritura buscando el mismo agujero. Además
  de auditoría, las que quedan sin salida por superadmin están bien así
  (son personales o ya tienen otra política que cubre al superadmin).

## Cómo aplicar (segunda tanda)

Aplicar `supabase/migrations/20260727000025_auditoria_superadmin.sql` y
deployar. El resto es código.

## Pendiente de decisión (no tocado)

- **Módulos por tipo de negocio**: empresas en blanco vs. en negro vs.
  monotributistas. Es el rediseño grande y conviene definir bien los dos o
  tres paquetes antes de empezar —hay un documento mandado al cliente
  esperando respuesta—. La base ya quedó puesta con `config.modulos`.

## Probar antes de dar por cerrado

La lectura de PDFs se verificó con archivos generados para la prueba, no
con un export real del sistema de sueldos del cliente. Vale pedirle un
recibo de verdad (con datos reales) y confirmar dos cosas:

1. Que el CUIL se lee (si el PDF viene escaneado, no hay texto que leer y
   la app lo va a decir: ahí habría que sumar OCR o pedir el PDF nativo).
2. Que la empresa tiene los CUIL cargados en las fichas. Sin eso, la
   identificación cae al DNI y, si tampoco está, queda sin asignar.
