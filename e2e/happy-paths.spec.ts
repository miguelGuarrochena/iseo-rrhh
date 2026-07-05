import { test, expect } from '@playwright/test';

/**
 * Flujos felices sobre el modo demo (datos de ejemplo). Cubren que un
 * usuario de cada rol pueda entrar y llegar a sus pantallas clave. No tocan
 * Supabase: en dev el demo está habilitado.
 *
 * Si estos pasan, lo básico (auth, ruteo, layout por rol) no está roto.
 */

const entrarComo = async (page: import('@playwright/test').Page, rol: RegExp) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: rol }).first().click();
  await expect(page).toHaveURL(/\/$|\/#/);
};

test('la landing carga en el dominio raíz', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await expect(page.getByText(/ISEO RH/i).first()).toBeVisible();
});

test('un empleado entra y ve su tablero', async ({ page }) => {
  await entrarComo(page, /Empleado/);
  await expect(page.getByRole('heading', { name: /Hola/i })).toBeVisible();
});

test('admin RRHH llega a Fichaje y ve la carga manual de respaldo', async ({
  page,
}) => {
  await entrarComo(page, /Admin RRHH/);
  await page.goto('/fichaje');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Fichaje', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Cargar a mano/i })).toBeVisible();
});

test('admin RRHH ve el listado de colaboradores', async ({ page }) => {
  await entrarComo(page, /Admin RRHH/);
  await page.goto('/colaboradores');
  await expect(
    page.getByRole('heading', { name: /Colaboradores/i })
  ).toBeVisible();
});

test('un supervisor entra sin ver la configuración de la empresa', async ({
  page,
}) => {
  await entrarComo(page, /Supervisor/);
  await page.goto('/configuracion');
  await expect(page.getByText(/No tenés permisos/i)).toBeVisible();
});
