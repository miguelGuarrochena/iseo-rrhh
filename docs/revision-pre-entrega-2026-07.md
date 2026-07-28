# Revisión pre-entrega — julio 2026

Repaso completo antes de que el cliente pruebe. El foco fue el ciclo de
vida de los archivos: **que todo lo que se sube se suba, y que todo lo
que se subió se pueda volver a abrir**. Se revisaron además permisos,
rutas de API y estado del proyecto.

---

## Resumen

| | |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ limpio |
| ESLint | ✅ sin warnings ni errores |
| Prettier | ✅ todo formateado |
| Bugs críticos encontrados | 3 (arreglados) |
| Bugs altos encontrados | 4 (arreglados) |
| Puntos a decidir con el cliente | 3 |

**Pendiente de correr en tu máquina** (el sandbox de esta revisión es ARM
emulado y no puede ejecutar el binario SWC): `npm run build`,
`npm run test:ci` y `npm run test:e2e`.

---

## 1. Críticos — arreglados

### 1.1 El colaborador no podía adjuntar el certificado médico

**Síntoma para el cliente:** un empleado pide una licencia por enfermedad,
adjunta el certificado y la solicitud entera falla. No se guarda ni la
ausencia, porque el archivo se sube *antes* del insert.

**Causa:** la política `storage_insert_gestores` sólo dejaba escribir en
los buckets a `superadmin` y `admin_rrhh`. Pero el certificado lo sube el
propio colaborador —y también un supervisor cargando la ausencia de
alguien de su equipo—. Los dos chocaban contra RLS.

**Arreglo:** migración `20260727000031_storage_adjuntos_ausencias.sql`.
El colaborador ahora puede escribir **sólo** en el bucket `documentos` y
**sólo** dentro de su propia carpeta (`<empresa>/<su empleado_id>/…`). El
supervisor, en `documentos` dentro de su empresa. Nada de recibos, fotos
ni logos para ninguno de los dos.

### 1.2 El certificado subido no se podía volver a abrir

**Síntoma:** el botón "Certificado" en la propia solicitud no hacía nada.

**Causa:** `storage_select_documentos` contemplaba el legajo y los
documentos a firmar, pero no las ausencias — sus adjuntos viven en
`ausencias.adjuntos` (jsonb), que no estaba en la política.

**Arreglo:** misma migración. Se agregó la cláusula para que el
colaborador vea el archivo que él mismo adjuntó.

### 1.3 Escalación de privilegios en `/api/invitaciones`

**Riesgo:** el rol viajaba en el body y terminaba tal cual en la metadata
de la invitación, que el trigger `crear_perfil_usuario` copia a
`public.usuarios`. El tipo de TypeScript decía
`'admin_rrhh' | 'supervisor' | 'empleado'`, pero **no había validación en
runtime**. Cualquier `admin_rrhh` con sesión válida podía mandar
`{"rol":"superadmin"}` con curl y crearse una cuenta con acceso a los
datos y la facturación de **todos** los clientes.

**Arreglo:** allowlist validada en el servidor
(`src/app/api/invitaciones/route.ts`). `superadmin` no se reparte por
invitación; se da a mano desde la base.

---

## 2. Altos — arreglados

### 2.1 Los errores al abrir archivos eran mudos

`verRecibo`, `abrirDocumento` (mi legajo y ficha del colaborador) y
`verAdjunto` llamaban al servicio sin `try/catch`. Si la URL firmada
fallaba —sesión vencida, archivo borrado, política que no deja— la
promesa quedaba rechazada sin dueño: el usuario apretaba "Ver PDF" y **no
pasaba nada**. En una devolución, eso es lo peor que puede pasar.

Además, `window.open` después de un `await` ya no cuenta como respuesta al
click, así que Safari lo bloquea como popup.

**Arreglo:** nuevo `src/lib/archivosUi.ts` con `abrirArchivo` y
`descargarArchivo`. La pestaña se abre en el mismo tick del click y
recién después se le pone la URL; cualquier fallo cierra la pestaña y
muestra un aviso. Aplicado en recibos, ausencias, mi legajo y ficha del
colaborador.

### 2.2 La factura de monotributo se subía y no había forma de verla

El panel permitía adjuntar el PDF de la cuota, lo guardaba en el bucket…
y no tenía ningún botón para volver a abrirlo. Quedaba guardado y sin
salida.

**Arreglo:** `abrirFacturaMonotributo` en la capa de servicios (real,
demo y facade) y botón de adjunto en `MonotributoPanel`.

### 2.3 Corregir el monto de una factura borraba el PDF adjunto

El upsert mandaba `archivo_url: null` cuando no se elegía archivo nuevo.
Cambiar sólo el importe dejaba el PDF huérfano en el bucket, sin
referencia.

**Arreglo:** se conserva el archivo previo si no viene uno nuevo; si
viene, el anterior se borra del bucket.

### 2.4 Los recibos archivados no se podían descargar

El admin **sí** los ve y los abre (la RLS de `recibos` y de storage lo
permiten para gestores), pero en el modal de versiones sólo había "Ver
PDF". Una versión archivada es la prueba de lo que se firmó en su
momento: a RRHH se la pide un contador o un abogado como archivo, no como
pestaña.

**Arreglo:** botón "Descargar" en cada versión, con nombre
`recibo-<periodo>-<tipo>-v<N>.pdf`.

> **Respondiendo directo a tu pregunta:** sí, el admin ve y descarga los
> recibos archivados. El colaborador **no** los ve, y es a propósito: la
> política `recibos_select` le muestra sólo los vigentes. Ve el que está
> en curso, no el historial de rectificaciones.

---

## 2.5 Faltante — agregado

**Los documentos a firmar no se podían borrar.** Si RRHH subía el PDF
equivocado, ponía mal el título o lo mandaba a toda la empresa cuando era
para un sector, quedaba ahí pidiéndole la firma a gente que no
correspondía. No hizo falta migración: `documentos_firma_gestion` ya es
`for all` para `admin_rrhh` y los destinatarios cascadean.

Se agregó `eliminarDocumentoFirma` (borra la fila, el PDF del bucket y
deja registro en auditoría) y el botón en la lista de enviados. La
confirmación avisa cuántas firmas se pierden si alguien ya firmó: esa
constancia se va con el documento, así que conviene que sea una decisión
y no un click de más.

---

## 3. Medios — arreglados

- **Archivos huérfanos.** Borrar un recibo, un documento del legajo, una
  factura o una ausencia sacaba la fila de la base pero dejaba el PDF en
  el bucket para siempre: sin referencia desde la app, pero ocupando el
  espacio contratado. Con recibos de sueldo y certificados médicos es
  además un problema de datos personales — si se borra, tiene que irse de
  verdad. Se agregó `borrarDeStorage` y se conectó a los cuatro flujos.

- **Rectificar un recibo podía dejar al colaborador sin ninguno.** El
  índice único obliga a archivar el anterior antes de insertar el nuevo, y
  son dos llamadas sueltas (no hay transacción desde el cliente). Si la
  segunda fallaba, quedaba el viejo archivado y el nuevo inexistente. Ahora
  se deshace el archivado y se limpia el PDF ya subido.

- **Borrar un documento del legajo era mudo.** Sin `try/catch` ni aviso.
  Arreglado.

---

## 4. A decidir con el cliente (no toqué nada)

### 4.1 El supervisor podía descargar todos los recibos — RESUELTO

Había una inconsistencia de privacidad: `remuneraciones_select` restringía
los sueldos a `admin_rrhh`, pero `recibos_select` y la política de storage
usaban `es_gestor()`, que **incluye supervisor**. Un supervisor no veía la
grilla de remuneraciones, pero sí podía abrir y bajar el recibo de
cualquiera — que tiene el sueldo impreso adentro.

**Decisión del cliente: el detalle salarial es sólo de RRHH.** Aplicado en
la migración `20260728000032_recibos_solo_rrhh.sql`:

- `recibos_select` y `storage_select_recibos` pasan a `auth_rol() = 'admin_rrhh'`.
  El supervisor sigue viendo **los suyos**, porque entra por la rama de
  "empleado dueño" que ya existía: es una persona que cobra.
- `facturas_mono_select` va con el mismo criterio. Usaba `es_gestor()` y
  dejaba la misma puerta abierta por otro lado: la cuota de monotributo es
  lo que cobra un contratado.

En la pantalla: la sección Recibos ahora trata al supervisor como a
cualquier colaborador (ve y **firma** los propios — antes ni siquiera
podía firmarlos, porque el botón pedía rol `empleado`), los paneles de
remuneración y monotributo de la ficha ya no se le muestran (la base no le
devolvía nada y quedaban vacíos), y la tarjeta "Recibos sin firmar" de
Reportes es sólo para RRHH.

### 4.2 Migración renombrada

`20260727000028_seguridad_documentos_firma.sql` pasó a ser `…29`, y el 28
ahora es `reparar_foto_url`. Si el cliente ya aplicó el 28 viejo, el
contenido es idempotente y no rompe nada — pero si usás
`supabase db push` con historial de migraciones, revisá que el historial
remoto no quede desalineado.

### 4.3 Superadmin, cómo se crea

Con el fix de 1.3, `superadmin` ya no se puede asignar por invitación. Se
crea por SQL directo sobre `public.usuarios` (o insertando la metadata
desde el dashboard de Supabase). Vale documentarlo en la guía operativa.

---

## 5. Limpieza pendiente

- **Borrar la carpeta `_qa_pdfs_borrar/`** (tiene `gen.mjs` y
  `nomina-completa.pdf` de pruebas). No pude eliminarla desde acá por
  permisos del sandbox — hacelo a mano antes de entregar.
- `.env` está correctamente en `.gitignore` y no está trackeado. ✅
- La clave secreta de Supabase sólo se usa desde `src/lib/supabase/admin.ts`,
  protegida con `server-only`. ✅
- CSP, HSTS, `X-Frame-Options`, `Permissions-Policy` configurados en
  `next.config.js`. ✅
- Las rutas de API con costo (Gemini) exigen sesión y tienen rate limit
  por usuario; el cron de facturación exige `CRON_SECRET` y falla cerrado
  si falta. ✅

---

## 6. Checklist para probar con el cliente

1. **Empleado** → Ausencias → nueva solicitud **con certificado adjunto**
   → guardar → abrir el certificado desde su propia solicitud.
2. **Supervisor** → cargar una ausencia de alguien del equipo con adjunto.
3. **Admin** → Recibos → cargar un recibo → cargar otro del **mismo
   período y tipo** (rectificación) → abrir el modal de versiones → **ver
   y descargar** la versión archivada.
4. **Admin** → carga masiva de recibos con un PDF de nómina completa.
5. **Admin** → ficha de un monotributista → cargar factura con PDF →
   volver a abrirla → corregir sólo el monto → verificar que el PDF sigue.
6. **Admin** → legajo → subir documento → abrirlo → borrarlo.
7. **Empleado** → Mi legajo → abrir un documento cargado por RRHH.
8. **Admin** → Configuración → cambiar el logo de la empresa.
9. **Admin** → alta de colaborador con foto → editar otro campo → esperar
   más de una hora → verificar que la foto sigue viéndose.
10. Probar los pasos 1, 3 y 7 **en Safari** (es donde pegaba el bloqueo de
    popups).

---

## 7. Archivos tocados

**Nuevos**

- `supabase/migrations/20260727000031_storage_adjuntos_ausencias.sql`
- `src/lib/archivosUi.ts`

**Modificados**

- `src/app/api/invitaciones/route.ts`
- `src/app/app/recibos/page.tsx`
- `src/app/app/ausencias/page.tsx`
- `src/app/app/mi-legajo/page.tsx`
- `src/app/app/colaboradores/[id]/page.tsx`
- `src/components/app/remuneraciones/MonotributoPanel.tsx`
- `src/lib/services/supabase/archivos.ts`
- `src/lib/services/supabase/real.ts`
- `src/lib/services/rrhh.ts`
- `src/lib/services/rrhh.demo.ts`

**Orden de despliegue:** aplicar la migración 31 **antes** de subir el
código (las políticas nuevas no rompen nada del código viejo, pero el
código nuevo asume que ya están).
