import { test, expect, Page } from '@playwright/test';

/**
 * La app en pantallas chicas: que nada se salga de la pantalla y que
 * siempre haya cómo volver.
 *
 * Son los dos problemas que se veían en un celular: el header empujaba el
 * avatar fuera de la pantalla cuando el nombre era largo, y adentro de una
 * ficha no quedaba más salida que el botón del navegador.
 */

const ANCHOS = [
  { nombre: 'movil-375', ancho: 375, alto: 667 },
  { nombre: 'tablet-800', ancho: 800, alto: 1280 },
  { nombre: 'desktop-1440', ancho: 1440, alto: 900 },
];

const entrarComo = async (page: Page, rol: RegExp) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: rol }).first().click();
  await expect(page.getByRole('heading', { name: /Hola/i })).toBeVisible();
};

const sinDesborde = async (page: Page) => {
  const sobra = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(sobra).toBeLessThanOrEqual(0);
  await expect(
    page.getByRole('button', { name: /Menú de usuario/ })
  ).toBeInViewport();
};

for (const { nombre, ancho, alto } of ANCHOS) {
  test(`el header entra en la pantalla (${nombre})`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await entrarComo(page, /Admin RRHH/);
    await sinDesborde(page);
    await page.screenshot({ path: `e2e/capturas/${nombre}.png` });
  });
}

test('el header entra con el nombre de la empresa al lado del rol', async ({
  page,
}) => {
  // El subtítulo más largo que existe: "Superadmin · <empresa>". Es donde
  // el header se rompía.
  await page.setViewportSize({ width: 375, height: 667 });
  await entrarComo(page, /Superadmin/);
  await page.goto('/empresas');
  await page
    .getByRole('button', { name: /Ingresar/ })
    .first()
    .click();
  await expect(page.getByText(/Superadmin ·/)).toBeVisible();
  await sinDesborde(page);
  await page.screenshot({ path: 'e2e/capturas/movil-375-empresa.png' });
});

test('desde una ficha se vuelve al listado sin usar el navegador', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await entrarComo(page, /Admin RRHH/);
  await page.goto('/colaboradores');
  await page
    .getByRole('main')
    .locator('a[href^="/colaboradores/"]:not([href$="/nuevo"])')
    .first()
    .click();

  const contenido = page.getByRole('main');
  await expect(
    contenido.getByRole('link', { name: 'Colaboradores' })
  ).toBeVisible();
  await page.screenshot({ path: 'e2e/capturas/movil-375-ficha.png' });

  await contenido.getByRole('link', { name: 'Colaboradores' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /Colaboradores/ })
  ).toBeVisible();
});

test('desde Mi cuenta se vuelve al inicio', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await entrarComo(page, /Admin RRHH/);
  await page.goto('/mi-cuenta');
  await page.getByRole('main').getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { name: /Hola/i })).toBeVisible();
});
