import { test, expect, Page } from '@playwright/test';

/**
 * Flujos completos sobre el modo demo (datos de ejemplo en memoria,
 * sin tocar Supabase): ausencias, recibos, adelantos, descuentos fijos
 * y navegación por secciones. Complementa happy-paths.spec.ts.
 *
 * Nota: los mocks viven en el navegador, así que cada recarga de página
 * arranca con los datos de ejemplo originales. Cada test es autónomo.
 */

const entrarComo = async (page: Page, rol: RegExp) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: rol }).first().click();
  await expect(page).toHaveURL(/\/$|\/#/);
};

/** Fecha de hoy + días, en dd/mm/aaaa (como la tipearía un usuario). */
const fechaCorta = (masDias = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + masDias);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

test.describe('Navegación por secciones', () => {
  test('el admin recorre sus secciones y cada una carga', async ({ page }) => {
    await entrarComo(page, /Admin RRHH/);
    const secciones: [string, RegExp][] = [
      ['/ausencias', /Ausencias/i],
      ['/recibos', /Recibos de sueldo/i],
      ['/remuneraciones', /Remuneraciones/i],
      ['/turnos', /Turnos/i],
      ['/agenda', /Agenda/i],
      ['/reportes', /Reportes/i],
      ['/ayuda', /Ayuda/i],
    ];
    for (const [ruta, titulo] of secciones) {
      await page.goto(ruta);
      await expect(
        page.getByRole('heading', { level: 1, name: titulo })
      ).toBeVisible();
    }
  });

  test('el superadmin ve su panel de empresas', async ({ page }) => {
    await entrarComo(page, /Superadmin/);
    await page.goto('/empresas');
    await expect(
      page.getByRole('heading', { level: 1, name: /Empresas/i })
    ).toBeVisible();
  });
});

test.describe('Ausencias', () => {
  test('el empleado pide una ausencia tipeando las fechas', async ({
    page,
  }) => {
    await entrarComo(page, /Empleado/);
    await page.goto('/ausencias');
    await page.getByRole('button', { name: /Nueva solicitud/i }).click();

    // Fechas tipeadas con números (dd/mm/aaaa), sin abrir el calendario.
    const desde = page.getByLabel('Desde');
    await desde.fill(fechaCorta(7));
    const hasta = page.getByLabel('Hasta');
    await hasta.fill(fechaCorta(9));
    await hasta.blur();

    await expect(page.getByText(/Total:/)).toContainText('3 días');
    await page.getByRole('button', { name: /Enviar solicitud/i }).click();
    await expect(page.getByText('Solicitud enviada')).toBeVisible();
  });

  test('el admin aprueba una solicitud pendiente con aviso', async ({
    page,
  }) => {
    await entrarComo(page, /Admin RRHH/);
    await page.goto('/ausencias');
    await page
      .getByRole('button', { name: /^Aprobar$/ })
      .first()
      .click();
    await expect(page.getByText('Solicitud aprobada')).toBeVisible();
  });
});

test.describe('Recibos', () => {
  test('el empleado firma su recibo pendiente', async ({ page }) => {
    await entrarComo(page, /Empleado/);
    await page.goto('/recibos');
    await page
      .getByRole('button', { name: /^Firmar$/ })
      .first()
      .click();
    await page.getByRole('button', { name: /Firmar recibo/i }).click();
    await expect(page.getByText('Recibo firmado')).toBeVisible();
  });

  test('el admin tiene carga individual y carga masiva por CUIL', async ({
    page,
  }) => {
    await entrarComo(page, /Admin RRHH/);
    await page.goto('/recibos');
    await expect(
      page.getByRole('button', { name: /Cargar recibo/i })
    ).toBeVisible();
    await page.getByRole('button', { name: /Carga masiva/i }).click();
    await expect(page.getByText(/contiene el CUIL o DNI/i)).toBeVisible();
    await expect(
      page.getByText(/Firmar como empleador y publicar al subir/i)
    ).toBeVisible();
  });
});

test.describe('Adelantos', () => {
  test('el empleado pide un adelanto', async ({ page }) => {
    await entrarComo(page, /Empleado/);
    await page.goto('/remuneraciones');
    await page.getByRole('button', { name: /Pedir adelanto/i }).click();
    await page.getByLabel(/Monto/).fill('120000');
    await page.getByRole('button', { name: /Enviar pedido/i }).click();
    await expect(page.getByText('Adelanto solicitado')).toBeVisible();
  });

  test('el admin aprueba el adelanto pendiente eligiendo el período', async ({
    page,
  }) => {
    await entrarComo(page, /Admin RRHH/);
    await page.goto('/remuneraciones');
    await expect(page.getByText(/por resolver/i)).toBeVisible();
    await page
      .getByRole('button', { name: /^Aprobar$/ })
      .first()
      .click();
    await page.getByRole('button', { name: /Aprobar adelanto/i }).click();
    await expect(page.getByText('Adelanto aprobado')).toBeVisible();
  });
});

test.describe('Descuentos fijos', () => {
  test('el admin agrega un descuento fijo en la ficha', async ({ page }) => {
    await entrarComo(page, /Admin RRHH/);
    await page.goto('/colaboradores/ple-3');
    const bloque = page.getByTestId('descuentos-fijos');
    await expect(bloque).toBeVisible();
    // El mock ya trae "Sindicato"; agregamos otro concepto.
    await bloque.getByRole('button', { name: /^Agregar$/ }).click();
    await bloque.getByLabel('Concepto').fill('Comedor');
    await bloque.getByLabel('Monto').fill('15000');
    await bloque.getByRole('button', { name: /^Guardar$/ }).click();
    await expect(page.getByText('Descuento fijo agregado')).toBeVisible();
    await expect(bloque.getByText(/Comedor ·/)).toBeVisible();
  });
});
