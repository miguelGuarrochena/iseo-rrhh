-- Adelantos de sueldo: sólo RRHH y el propio dueño.
--
-- Es el mismo agujero que se cerró en la migración 32 para recibos y
-- facturas de monotributo, que quedó abierto por esta puerta.
--
-- El cliente decidió entonces que **el detalle salarial es sólo de RRHH**:
-- `remuneraciones_select` y `recibos_select` pasaron a
-- `auth_rol() = 'admin_rrhh'`. Pero `adelantos_select` siguió usando
-- `es_gestor()`, que incluye supervisor. Un supervisor no ve la grilla de
-- sueldos ni los recibos, pero sí veía cuánto adelanto pidió cada persona
-- de la empresa — que es información salarial y, encima, dice algo sobre
-- la situación económica de un compañero.
--
-- El supervisor sigue viendo **los suyos**, porque entra por la rama de
-- "empleado dueño": es una persona que también cobra.

drop policy if exists adelantos_select on adelantos;
create policy adelantos_select on adelantos for select
  using (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado())
    )
  );

-- Mismo criterio, dato menos sensible: los días de vacaciones que se
-- arrastran de un año a otro. No es plata, pero es del legajo de la
-- persona y no hay motivo para que lo vea toda la línea de supervisión.
drop policy if exists vacaciones_pendientes_select on vacaciones_pendientes;
create policy vacaciones_pendientes_select on vacaciones_pendientes for select
  using (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado())
    )
  );
