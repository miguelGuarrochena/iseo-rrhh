# ISEO RH — Guía operativa (para Miguel)

Todo lo que necesitás para operar y mantener la plataforma: dónde vive
cada cosa, qué hace, y los procedimientos paso a paso. Pensada para
poder retomarla en 6 meses sin acordarte de nada.

---

## 1. Mapa de la infraestructura

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| **Código** | GitHub `miguelGuarrochena/iseo-rrhh` | Repo único: landing + plataforma. Push a `main` = deploy automático. |
| **Hosting** | Vercel, proyecto `iseo-rrhh` | Builds, dominios y variables de entorno. |
| **Landing** | `www.iseo-rh.com` | Marketing. El botón "Ingresar" lleva al subdominio de la app. |
| **Plataforma** | `app.iseo-rh.com` | La app con URLs limpias (`/colaboradores`, `/ausencias`…). Un middleware la separa de la landing por dominio. |
| **Base de datos + Auth + Storage** | Supabase, proyecto `iseo-rrhh` | Postgres con RLS multi-tenant, login, buckets de archivos. |
| **Emails** | Resend (`iseo-rh.com` verificado) | Envía invitaciones y recuperación vía SMTP conectado a Supabase. |
| **IA** | Google AI Studio (Gemini) | Asistente de ayuda y del convenio. Solo requiere la API key. |
| **Migraciones** | `supabase/migrations/` en el repo | Al mergear a `main`, la integración de GitHub las aplica sola a la base productiva. |

### En local (tu Mac)

- `npm run dev` levanta todo en `localhost:3000`.
- **La app se prueba en `app.localhost:3000`** (por la separación de dominios); la landing en `localhost:3000`.
- Si el dev server se rompe (páginas en blanco, clicks muertos): `Ctrl+C`, `rm -rf .next && npm run dev`, y recargar con Cmd+Shift+R.
- Las claves locales viven en `.env` en la raíz del proyecto (no se sube al repo).

---

## 2. Variables de entorno

Se cargan en **Vercel → Settings → Environment Variables** (producción) y en tu `.env` local. Después de cambiar una en Vercel hay que **redeployar**.

| Variable | Dónde se usa | Qué hace |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | navegador | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | navegador | Clave pública (`sb_publishable_…`). La protege RLS, es segura de exponer. |
| `SUPABASE_SECRET_KEY` | solo servidor | Clave secreta (`sb_secret_…`) para invitaciones y admin. **Nunca** con prefijo `NEXT_PUBLIC_`. |
| `GEMINI_API_KEY` | solo servidor | Activa la IA (Ayuda y Convenio). Sin ella, esas funciones avisan "no disponible" y nada se rompe. |
| `GEMINI_MODEL` | solo servidor | Opcional. Por defecto `gemini-2.5-flash-lite` (el más barato). |
| `NEXT_PUBLIC_MOSTRAR_INGRESO` | navegador | Con `0`, la landing oculta "Ingresar" y muestra "Próximamente". Sin la variable, todo visible (estado lanzado). |
| `NEXT_PUBLIC_SITE_URL` | build | URL canónica del sitio para SEO. |

---

## 3. La app: qué hace cada sección y quién la ve

**Roles**: `superadmin` (vos), `admin_rrhh`, `supervisor`, `empleado`.
El superadmin puede **entrar a cualquier empresa** desde Empresas y
operarla como admin ("Salir de la empresa" en el menú lateral para volver).

| Sección | Quién la ve | Qué hace |
| --- | --- | --- |
| Inicio | todos | Resumen del día según el rol. Todo clickeable. |
| Empresas | superadmin | Alta/edición de clientes, **Suspender/Reactivar** (bloquea el ingreso de toda la empresa: tu llave de cobro), entrar a operarla. |
| Finanzas | superadmin | Tu negocio: facturación por empresa, ingresos/gastos, vencidas. |
| Colaboradores | admin, supervisor | Listado + ficha completa: legajo, documentos, checklist, notas internas, remuneraciones, baja. **Importar Excel** para el alta masiva. |
| Mi legajo | empleado, supervisor | La propia ficha del empleado: datos y documentos. |
| Ausencias | todos | Empleado solicita; admin/supervisor aprueba o rechaza. Saldo de vacaciones por LCT. |
| Fichaje | todos | Ingreso/egreso por celular (con foto y GPS opcional), reconocimiento facial en tablet de planta, o carga manual del admin. Export CSV de novedades. |
| Turnos | todos | Horarios asignados vs. fichada real: tardes, salidas anticipadas. |
| Recibos | todos | Admin sube el PDF por período; el empleado lo ve y **firma digitalmente**. |
| Remuneraciones | todos (cada uno lo suyo) | Admin carga bruto/no remunerativo/descuentos; aportes y neto se calculan solos. Empleado ve su evolución, aumentos y aguinaldo estimado. **Exportar para liquidación** (CSV al contador). |
| Agenda | todos | Calendario compartido + cumpleaños automáticos. |
| Organigrama | admin, supervisor | Quién reporta a quién; el admin reasigna supervisores tocando. |
| Convenio | todos | El convenio colectivo cargado, consultable con IA. |
| Reportes | admin, supervisor | Ausentismo, tardes, extras, presentismo — calculados de fichajes reales contra el horario configurado. |
| Permisos | superadmin, admin | Invitar usuarios (email debe coincidir con el legajo), cambiar roles. |
| Configuración | superadmin, admin | Superadmin: defaults de la plataforma. Admin: datos de su empresa, logo, horarios, tolerancia, alertas. |
| Ayuda | todos | FAQ + asistente con IA. |

**Modo demo**: `app.iseo-rh.com/demo` — empresa ficticia, datos mock, no
toca la base real. Sirve para vender. Se apaga con la variable de demo
en `src/lib/entorno.ts` si algún día querés sacarla.

---

## 4. Procedimientos frecuentes

### Alta de un cliente nuevo (el flujo completo)

1. Entrá como superadmin → **Empresas → Nueva empresa** (nombre, CUIT, contacto, plan).
2. Click en la empresa → **entrás a operarla**.
3. **Colaboradores → Importar Excel** con la planilla del cliente (mínimo: nombre, apellido, DNI). Lo que falte se completa después en cada ficha.
4. **Configuración**: horario de entrada/salida, tolerancia, logo.
5. **Permisos → Invitar usuario**: primero el admin de RRHH del cliente (rol Admin RRHH). Le llega el mail y crea su contraseña.
6. El admin del cliente invita al resto (o lo hacés vos), vinculando cada usuario a su ficha.
7. "Salir de la empresa" y listo.

### Cliente que no paga

Empresas → fila del cliente → **Suspender**. Nadie de esa empresa puede
entrar (ven "acceso suspendido, comunicate con ISEO RH"). Cuando paga:
**Reactivar**. Los datos nunca se borran.

### Reenviar una invitación vencida

Las invitaciones vencen a las 24 h. Volvé a invitar desde Permisos con
el mismo email; Supabase reenvía el mail.

### Usuario que no puede entrar — diagnóstico rápido

1. ¿"Email o contraseña incorrectos"? → que use "¿La olvidaste?".
2. ¿"Sin perfil asignado"? → el alta quedó a medias: en Supabase → SQL Editor revisá `select * from usuarios where email = '...'` y completá el insert, o borrá el usuario en Authentication → Users y reinvitá desde la app.
3. ¿"Acceso suspendido"? → la empresa está suspendida en tu panel.
4. ¿No le llegó el mail? → carpeta de spam; verificá en Resend → Logs si salió.

### Cambiar los emails de invitación/recuperación

Supabase → Authentication → Emails → Templates. Los HTML fuente están
en `supabase/templates/` del repo (100% ASCII, las ñ son entidades).

### Activar / desactivar la IA

Vercel → variables → `GEMINI_API_KEY` (crear la key en aistudio.google.com
con la cuenta del cliente) → Redeploy. Para apagarla, borrás la variable.

### Cambios en la base de datos

Nunca toques las tablas a mano en producción. El flujo es: nueva
migración SQL en `supabase/migrations/` con fecha en el nombre → commit →
merge a `main` → la integración la aplica sola. El SQL Editor queda para
consultas y arreglos puntuales.

### Lanzamiento / Próximamente

- Pre-lanzamiento: `NEXT_PUBLIC_MOSTRAR_INGRESO=0` en Vercel (landing sin "Ingresar", con chip "Próximamente").
- Lanzar: borrar esa variable y redeployar.

---

## 5. Tests

- **Unitarios**: `npx jest` (81 tests). Corren sobre lógica y componentes.
- **E2E**: `npx playwright test` (flujos completos en el navegador contra el modo demo). La primera vez: `npx playwright install chromium`.
- Antes de cada push conviene: `npx tsc --noEmit && npx jest && npm run build`.

---

## 6. Costos y servicios (quién factura qué)

| Servicio | Plan | Costo | Cuenta |
| --- | --- | --- | --- |
| Vercel | Pro | US$20/mes | tuya |
| Supabase | Pro | US$25/mes | tuya |
| Resend | Free (hasta 3.000 mails/mes) | US$0 | tuya |
| Dominio iseo-rh.com | anual | ~US$15/año | tuya |
| Gemini | pay-as-you-go | centavos/mes | del cliente |

Detalle de pricing sugerido al cliente: ver `docs/PRICING.md`.

---

## 7. Si algo se rompe

- **La app no carga en producción**: Vercel → Deployments → mirá el último build; "Redeploy" del anterior si hace falta volver atrás.
- **Errores de datos / permisos**: Supabase → Logs → Postgres. Los errores de RLS aparecen como "row-level security".
- **Mails que no salen**: Resend → Logs, y Supabase → Authentication → Rate Limits (30/hora con SMTP propio).
- **Storage**: los archivos viven en Supabase → Storage, organizados por bucket (`fotos`, `documentos`, `recibos-pdf`, `logos`) y carpeta = id de la empresa.
- Todo el código está comentado en castellano; la capa de datos vive en `src/lib/services/` (facade `rrhh.ts`: demo vs real).
