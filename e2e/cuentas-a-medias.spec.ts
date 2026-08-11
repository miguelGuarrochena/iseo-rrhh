import { test, expect } from '@playwright/test';

/**
 * La cuenta que existe en Auth pero no tiene perfil.
 *
 * Era el peor callejón sin salida de la app: la persona recibía el mail,
 * ponía su contraseña, entraba, y leía que su cuenta no tenía perfil;
 * del otro lado figuraba como si nunca se hubiera dado de alta. Se
 * arreglaba a mano en la base. Ahora se resuelve desde Permisos.
 */
test('el admin completa el alta de una cuenta que quedó a medias', async ({
  page,
}) => {
  await page.goto('/demo');
  await page
    .getByRole('button', { name: /Admin RRHH/ })
    .first()
    .click();
  // Sin esperar a que la sesión quede armada, el goto siguiente se cruza
  // con el redirect al login y el test falla por otra cosa.
  await expect(page.getByRole('heading', { name: /Hola/i })).toBeVisible();
  await page.goto('/permisos');

  const panel = page.getByText('Cuentas que quedaron a medias');
  await expect(panel).toBeVisible();
  await expect(page.getByText('sofia.acosta@ejemplo.com')).toBeVisible();

  await page.getByRole('button', { name: 'Completar el alta' }).click();

  await expect(page.getByText('Alta completada')).toBeVisible();
  // El panel desaparece cuando no queda ninguna a medias, y la persona
  // pasa a la lista de usuarios como una cuenta más.
  await expect(panel).toBeHidden();
  await expect(
    page.getByText('Sofía Acosta', { exact: false }).first()
  ).toBeVisible();
});
