# Manejo de errores y carga de datos

Cómo se piden datos y qué pasa cuando algo falla. Si vas a tocar una
pantalla, esto es lo que hay que respetar.

## El problema que resuelve

La app cargaba datos así:

```tsx
void getEmpleados().then(setEmpleados); // ❌
```

Ese `void` dice "no me espero el resultado". Si la promesa falla, nadie
la atrapa: queda un `Uncaught (in promise)` en la consola y la pantalla
vacía. Para quien usa la app, **"no cargó" y "no hay datos" se ven
igual** — y eso hace que alguien concluya que el mes está vacío cuando en
realidad se cayó la conexión.

Había 80 llamadas así y ninguna con `.catch()`.

## Las cuatro capas

Van de la más específica a la más general. Cuanto más arriba resolvés, mejor.

| Capa | Qué cubre | Dónde |
| --- | --- | --- |
| 1. `useCarga` + `EstadoCarga` | Datos de una pantalla | `lib/useCarga.ts`, `components/app/EstadoCarga.tsx` |
| 2. `try/catch` + `avisoError` | Acciones (guardar, borrar, firmar) | en cada handler |
| 3. `RedDeSeguridad` | Cualquier promesa sin atrapar | `components/app/RedDeSeguridad.tsx` |
| 4. `app/error.tsx` | Errores durante el render | `app/app/error.tsx` |

Las capas 3 y 4 son **red, no diseño**: que algo caiga ahí significa que
faltó resolverlo arriba.

## Cómo se cargan datos

```tsx
const carga = useCarga(() => getEmpleados(), [], {
  contexto: 'colaboradores',
  inicial: [] as Empleado[],
});

<EstadoCarga carga={carga} vacio="Todavía no hay colaboradores.">
  {(empleados) => empleados.map((e) => <Fila key={e.id} empleado={e} />)}
</EstadoCarga>
```

Cuando la lista que se muestra es **derivada** (filtrada, ordenada,
paginada) no sirve `EstadoCarga`, porque no renderiza `carga.datos` sino
otra cosa. Ahí se usan las primitivas:

```tsx
{carga.fase === 'error' && carga.error && (
  <BloqueError error={carga.error} onReintentar={carga.recargar} />
)}
<ListaCard cargando={carga.fase === 'cargando'} vacio="…">
  {visibles.map(...)}
</ListaCard>
```

Pasá siempre `inicial: [] as X[]` en las listas. No es cosmético: sin eso
hay que escribir `carga.datos ?? []`, que crea un array nuevo en cada
render y hace que todo `useMemo` que dependa de él se recalcule siempre.
Con `inicial`, TypeScript además sabe que `datos` nunca es `undefined`.

### Varias consultas en una pantalla

Una por `useCarga`, no un `Promise.all`, salvo que de verdad se necesiten
todas juntas. Tienen importancia distinta: en Ausencias, si falla la
lista de colaboradores —que sólo resuelve nombres y llena el filtro— no
tiene sentido dejar la pantalla sin las ausencias, que es a lo que se
vino. Separadas, cada una degrada sola.

La excepción es cuando las consultas arman **un mismo cuadro coherente**.
En Reportes las cuatro van juntas en un `Promise.all` a propósito:
mostrar el ausentismo de una empresa con el presentismo de otra sería
peor que no mostrar nada.

El bloque de error va **arriba de la lista, no adentro**: si la consulta
falló, "no hay solicitudes pendientes" es mentira y hace que alguien dé
por aprobado lo que en realidad no se pudo leer.

`useCarga` resuelve tres cosas que las pantallas hacían mal o no hacían:

1. **Atrapa el error** y lo interpreta.
2. **Evita carreras.** Si cambian los filtros rápido, la respuesta de la
   consulta vieja puede llegar después de la nueva y pisarla. Cada pedido
   lleva número y sólo escribe el último. Está cubierto en
   `tests/useCarga.test.tsx`.
3. **No escribe después de desmontar.**

Cuando falta un dato para poder pedir (el id del empleado, por ejemplo),
usá `activo` en vez de un `if` antes del hook —eso rompe el orden de los
hooks de React:

```tsx
const carga = useCarga(() => getRecibos(empleadoId!), [empleadoId], {
  activo: Boolean(empleadoId),
});
```

## Cómo se manejan las acciones

Guardar, borrar y firmar **no** van por `useCarga`: son cosas que la
persona disparó y espera respuesta inmediata.

```tsx
try {
  await guardarAlgo(datos);
  avisoExito('Guardado');
  carga.recargar();
} catch (err) {
  const { titulo, detalle } = interpretarError(err);
  avisoError(titulo, detalle);
}
```

Si el error es de un campo puntual, marcalo en el campo con `error={...}`
en vez de tirar un toast: un aviso flotante que dice "revisá los datos"
obliga a adivinar cuál de los seis campos está mal.

## `interpretarError`

Único lugar donde un error crudo se vuelve mostrable
(`lib/errores.ts`). Devuelve tipo, título, detalle y —lo importante—
**`reintentable`**.

| Tipo | Ejemplo | ¿Reintentar? |
| --- | --- | --- |
| `sesion` | JWT expired | No |
| `empresa` | Sin empresa activa | No |
| `red` | Failed to fetch | Sí |
| `permisos` | RLS, recursión de policies | No |
| `datos` | constraint de Postgres | No |
| `desconocido` | — | Sí |

Ofrecer "Reintentar" ante un "elegí una empresa" hace que la persona lo
apriete tres veces y concluya que la app está rota. Por eso la decisión
es del sistema y no de quien escribe la pantalla.

Los errores de Postgres se delegan a `mensajeDeErrorDb`, que ya traduce
constraints conocidas a algo legible.

## Reglas

- **Nunca** `void algo().then(...)` sin `catch` para cargar datos. Usá `useCarga`.
- **Nunca** mostrar el mensaje crudo del error. Pasá por `interpretarError`.
- Si agregás un error nuevo reconocible, va en `lib/errores.ts` con su
  caso en `tests/errores.test.ts`. Se traduce solo en toda la app.
- El estado "vacío" siempre necesita texto propio. `vacio=""` no alcanza:
  hay que decir por qué está vacío y qué hacer.

## Actualizar sin volver a pedir

Cuando la operación ya devolvió el registro nuevo (tildar un ítem del
checklist, por ejemplo), `actualizar` evita el viaje de vuelta:

```tsx
const actualizado = await toggleChecklistItem(empleado.id, itemId);
if (actualizado) carga.actualizar(actualizado);
```

No sirve para adivinar el resultado *antes* de que el servidor conteste:
si la operación falla, la pantalla queda mintiendo.

## Estado de la migración

**Terminada.** No queda ningún `void getX().then()` sin atrapar: de 80
pasamos a 0. Todas las pantallas y componentes cargan datos con
`useCarga`.

Para verificarlo:

```
grep -rn "void get[A-Za-z]*(.*)\.then(" src --include=*.tsx | grep -v catch
```

Debería devolver sólo la línea del comentario en `RedDeSeguridad.tsx`
que documenta el patrón viejo.

Dos casos quedaron a propósito con `try/catch` en vez de `useCarga`,
porque son **acciones** y no cargas de pantalla: abrir el detalle de
destinatarios en A firmar, y refrescar el hilo desde la suscripción
realtime en Comunicaciones. Ahí el error va al toast, que es donde la
persona está mirando.

Las pendientes funcionan gracias a la capa 3 —ningún error queda en
silencio— pero no distinguen "falló" de "está vacío". Migrarlas es
mecánico siguiendo lo de arriba.

---

## Lo que no es un error: faltas (`src/lib/requisitos.ts`)

Hay una segunda familia de problemas que este archivo no cubre y que
durante mucho tiempo no cubrió nadie.

Un **error** es "la acción falló y por qué". Una **falta** es distinta:
la acción sale bien —el recibo se guarda, el documento se manda, el
mensaje queda registrado— pero no tiene el efecto que quien la hizo
esperaba, porque falta un dato en otro lado.

El caso que lo destapó: RRHH subía cuarenta recibos, la app decía
"cargados y visibles para el equipo", y quince de esas personas no
tenían usuario. No hubo ningún error. Simplemente no le llegó a nadie, y
se supo tres semanas después.

### Dónde vive

- **`src/lib/requisitos.ts`** — el catálogo. Una fila por falta, con qué
  es, qué consecuencia tiene, cómo se arregla y a dónde ir. Funciones
  puras: se testean sin base.
- **`src/components/app/Faltas.tsx`** — cómo se ve. `ChipFalta` y
  `ChipsFaltas` para las filas de una lista, `BloqueFaltas` para una
  persona, `BloqueFaltasDeVarios` para un grupo (agrupa por falta, no por
  persona: al subir cuarenta recibos importa "a estos quince les falta
  cuenta", no el mismo párrafo repetido quince veces).

### Bloquear o avisar

Bloquear le cuesta caro a quien está trabajando, así que se reserva para
cuando seguir hace daño que después no se puede deshacer: filtrar el dato
de una persona a otra, o dejar un registro legal mal armado. Hoy la única
falta que bloquea es el consentimiento biométrico (Ley 25.326).

Todo lo demás avisa y deja seguir. Si el trabajo se conserva y el hueco
se puede tapar mañana, frenar una carga entera porque tres personas no
tienen usuario no salva nada.

Lo que no existe es pasar en silencio.

### Ámbitos

Una falta importa según para qué. `faltasDeEmpleado(empleado, ctx,
ambito)` filtra: avisarle a quien sube recibos que a esa persona le falta
la geocerca es ruido. Sin `ambito` devuelve el panorama completo, que es
lo que usa la ficha del colaborador.

### Datos que todavía no se saben

Si algo no se pudo consultar —por ejemplo, quién tiene cuenta— el
contexto se pasa `undefined` y la regla **no dispara**. Una advertencia
inventada es peor que no dar ninguna.

### Agregar una falta nueva

Se agrega una fila a `REGLAS` en `requisitos.ts` y aparece sola en la
ficha, en la lista de Colaboradores y en la pantalla del ámbito que
toque. Si la falta es de la empresa y no de una persona, va en
`faltasDeEmpresa`.
