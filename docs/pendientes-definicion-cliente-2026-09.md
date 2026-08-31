# Pendientes de definición del cliente — septiembre 2026

Dos puntos de las respuestas del 30/08 **no se pueden resolver bien sin
una decisión más**. No se implementaron a propósito: cualquiera de los
dos, resuelto por nuestra cuenta, sería inventar una regla de negocio.

Este documento existe para que cuando llegue la definición, el que la
implemente no tenga que reconstruir el análisis.

---

## 1. Recibos → remuneraciones

> «Se podrá tomar desde el recibo información y que vaya directo a
> remuneraciones? Para no estar cargando manualmente en remuneraciones.»

### Por qué hoy no se puede

El recibo, en ISEO RH, es **un archivo y nada más**:

```
recibos
  id · empresa_id · empleado_id · periodo · tipo
  archivo_url        ← el PDF, opaco
  estado_firma · firmado_en · firmado_empleador_en
  archivado_en · rectifica_a
```

No hay una sola columna con un importe. Los números que hoy alimentan
Remuneraciones —bruto, no remunerativo, aportes, otros descuentos— se
cargan a mano en `remuneraciones`, en paralelo al PDF. Esa duplicación
es exactamente lo que el cliente quiere evitar, y no hay forma de
evitarla leyendo lo que hoy existe: **el dato estructurado no está en
ninguna parte**.

### Lo que haría falta

Un modelo de conceptos, colgando del recibo:

```
recibo_conceptos
  id
  empresa_id        -- tenant, como toda tabla
  recibo_id         -- de qué recibo salió
  empleado_id       -- redundante con el recibo, pero es como se consulta
  periodo           -- YYYY-MM, idem
  codigo            -- el del sistema de sueldos (ej. "1010")
  descripcion       -- "Sueldo básico", "Antigüedad", "Presentismo"
  cantidad          -- horas, días, unidades; nullable
  importe           -- siempre positivo
  remunerativo      -- boolean: tributa aportes o no
  es_descuento      -- boolean: resta en vez de sumar
```

Con eso, `remuneraciones` se arma sumando: bruto = suma de los
remunerativos que no son descuento, y así. Deja de haber dos cargas.

**No se creó la tabla.** Una tabla que nadie escribe es complejidad sin
beneficio, y el modelo de arriba no se puede cerrar bien sin ver los
datos reales de la fuente. Se crea cuando haya fuente.

### Las dos vías de entrada, y cuál conviene

**a) Importación desde el export del sistema de sueldos — recomendada.**

Todo sistema de liquidación (Tango, Bejerman, Holistor, el que use cada
estudio) exporta la liquidación en CSV o Excel con una fila por concepto.
Eso ya es exactamente la forma de la tabla de arriba.

A favor: el dato viene de la fuente autoritativa, sin ambigüedad; el
proyecto ya lee planillas (`src/lib/planillas.ts`, con ExcelJS) y ya
tiene un precedente de importación con mapeo de columnas
(`ImportarEmpleadosModal`); y si el formato del export cambia, falla
ruidosamente en vez de leer mal.

En contra: hay que pedirle el export al estudio contable de cada
cliente, y mapear las columnas una vez por estudio.

**b) Extracción del PDF — no recomendada hoy.**

`pdfjs-dist` ya está en el proyecto y `recibosPdf.ts` ya extrae texto de
los recibos (busca el CUIL impreso para repartirlos). O sea: leer el PDF
es técnicamente posible.

El problema no es leerlo, es **entenderlo**. Cada estudio maquetea el
recibo distinto, y un concepto se identifica por su posición en la hoja.
Sin una plantilla por proveedor, el resultado es frágil de una forma
peligrosa: no falla, lee mal. Un importe leído de la columna equivocada
entra a la liquidación sin que nadie lo note.

Si alguna vez se hace, tiene que ser con plantilla declarada por
proveedor y con revisión humana antes de confirmar — nunca automático.

### Qué falta decidir

1. ¿El estudio contable puede exportar la liquidación en CSV/Excel?
2. ¿Qué sistema de sueldos usa cada cliente? (define cuántos mapeos)
3. ¿La importación reemplaza la carga manual o convive con ella?

### Fuera de alcance por decisión del cliente

Las facturas de monotributistas: «es mucho lío me parece». No se toca.

---

## 2. Tope de la base imponible para aportes

> «Esto no tengo idea, imagino que debe ser por ganancias, pero ni idea.»

### Cómo está hoy

Centralizado y configurable, sin ningún valor cableado:

```
empresas.config.topeImponibleAportes   (jsonb, opcional)
        ↓
baseImponibleAportes()   ← el único lugar donde se aplica
        ↓
calcularAportes() → calcularLiquidacion()
```

**Sin valor cargado no se aplica tope**: los aportes salen sobre el
bruto completo. Es conservador y es lo que la app hacía antes de que el
campo existiera, así que nadie cambió de número por esto.

### El estado real en producción

**Ninguna de las 13 empresas tiene el tope cargado.** O sea: hoy a todos
se les calculan los aportes sobre el bruto entero. Para sueldos por
debajo del tope eso es correcto; por encima, el neto que la app muestra
es más bajo que el que la persona cobra.

### Qué falta decidir

El tope existe: lo fija el art. 9 de la Ley 24.241 y **ANSES lo
actualiza cada trimestre**. No depende de Ganancias — es otra cosa.

Lo que falta no es el criterio, es **quién lo carga y lo mantiene al
día**: son cuatro actualizaciones por año, iguales para todos los
clientes. Hoy el campo es por empresa, así que habría que cargarlo trece
veces cada trimestre.

Si ISEO se hace cargo de mantenerlo —que es lo razonable, porque es lo
mismo para todos— conviene moverlo a `config_plataforma` con override
por empresa. Eso es un cambio de modelo chico, pero **no se hace hasta
que alguien confirme que ISEO lo va a mantener**: un campo que nadie
actualiza es peor que no tenerlo, porque parece que el cálculo está
contemplado.

### Lo que no hay que hacer

Cablear un número. Queda viejo en tres meses y nadie se entera.
