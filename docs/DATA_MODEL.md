# Modelo de datos — ISEO RH (App)

Multi-tenant: **una sola DB, aislamiento por `empresaId` + RLS en Supabase**.
Todas las entidades (salvo `Usuario` superadmin) pertenecen a una empresa.

## Roles

| Rol | Alcance |
|---|---|
| `superadmin` | Dueño de la app. Cross-empresa: crea empresas, ve todo. |
| `admin_rrhh` | Configura su empresa, administra empleados, ve reportes. |
| `supervisor` | Aprueba solicitudes de su equipo, ve indicadores del equipo. |
| `empleado` | Ve su información, ficha, solicita ausencias, firma recibos. |

## Entidades

### Empresa (tenant)
`id, nombre, cuit, logoUrl, config` — config: método de fichaje habilitado
(facial_tablet / celular), tolerancia llegada tarde (min), horario laboral por defecto.

### Usuario
`id, email, rol, empresaId?, empleadoId?` — superadmin no tiene empresa.
Un empleado con app tiene usuario vinculado a su ficha.

### Empleado
- **Personales**: nombre, apellido, dni, cuil, fechaNacimiento, estadoCivil,
  nivelEstudios, domicilio, telefono, email, contactoEmergencia, grupoFamiliar[]
- **Laborales**: fechaIngreso, puesto, sector, supervisorId, modalidadContratacion
  (indeterminado / plazo_fijo / eventual / pasantia / monotributista),
  fechaFinContrato? (dispara alerta de vencimiento), modalidadPago, banco, cbu,
  obraSocial, art
- **Estado**: activo / baja (fechaBaja, motivoBaja)
- `checklistAlta[]`: ítems de documentación pendiente/completa

### DocumentoLegajo
`id, empleadoId, categoria, nombre, archivoUrl, fechaVencimiento?, creadoEn`
Categorías: dni, contrato, alta_afip, certificado, licencia, estudio_medico,
titulo, curso, otro. `fechaVencimiento` alimenta alertas.

### Remuneracion (historial salarial)
`id, empleadoId, periodo (YYYY-MM), montoBruto, montoNeto`
% de incremento y evolución gráfica se calculan, no se guardan.

### ReciboSueldo
`id, empleadoId, periodo, archivoUrl, estadoFirma (pendiente|firmado), firmadoEn?`

### Ausencia
`id, empleadoId, tipo, fechaDesde, fechaHasta, dias, estado
(pendiente|aprobada|rechazada), adjuntos[], comentarioEmpleado?,
resueltaPor?, comentarioResolucion?, resueltaEn?`
Tipos: vacaciones, enfermedad, estudio, mudanza, fallecimiento, especial.

### Saldo de vacaciones (calculado)
Días por antigüedad según LCT (art. 150): <5 años → 14, 5-10 → 21,
10-20 → 28, >20 → 35. Antigüedad al 31/12. `AjusteVacaciones` permite
correcciones manuales (días adeudados de años anteriores, etc.).

### Fichaje
`id, empleadoId, tipo (ingreso|egreso), timestamp, metodo (facial_tablet|celular),
fotoUrl?, geo? {lat,lng}, dispositivoId?`

### JornadaCalculada (derivada, cacheada por día)
`empleadoId, fecha, horasTrabajadas, horasExtras, llegadaTardeMin,
salidaAnticipadaMin, incompleta?` — exportable como novedades para el contador.

### Alerta / Vencimiento
`id, empresaId, tipo (contrato_plazo|examen_medico|art|documento|custom),
titulo, fecha, empleadoId?, diasAviso, estado (pendiente|notificada|resuelta)`

### EventoAgenda
`id, empresaId, tipo (evento|capacitacion|cumpleanios|vencimiento), titulo,
fecha, descripcion?` — cumpleaños y vencimientos se generan automáticamente.

### Notificacion
`id, usuarioId, tipo, titulo, cuerpo, link?, leida, creadaEn`
Canales: push (PWA) + email. In-app siempre.

## Reglas clave

- Toda query filtra por `empresaId` (RLS). El front nunca lo pasa a mano:
  sale de la sesión.
- Supervisor solo ve/aprueba empleados con `supervisorId = su empleadoId`.
- Fichaje facial: la foto es dato biométrico sensible (Ley 25.326) →
  consentimiento firmado del empleado (documento en legajo) + retención limitada.
- `modalidadContratacion = plazo_fijo` obliga `fechaFinContrato` y genera
  alerta automática N días antes (default 30).
