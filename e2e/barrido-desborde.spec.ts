import { test, expect, Page } from '@playwright/test';

/**
 * Barrido de control: ninguna sección puede salirse de la pantalla a lo
 * ancho. Una tabla, un título largo o una fila de botones que no envuelve
 * alcanzan para que el celular haga scroll horizontal y se coma la mitad
 * de la interfaz.
 *
 * Recorre todas las rutas de la app en los dos anchos donde duele.
 */

const RUTAS_ADMIN = [
  '/',
  '/colaboradores',
  '/colaboradores/nuevo',
  '/ausencias',
  '/fichaje',
  '/turnos',
  '/agenda',
  '/recibos',
  '/remuneraciones',
  '/finanzas',
  '/reportes',
  '/organigrama',
  '/comunicaciones',
  '/documentos-firma',
  '/convenio',
  '/permisos',
  '/configuracion',
  '/mi-legajo',
  '/mi-cuenta',
  '/ayuda',
];

const RUTAS_SUPERADMIN = ['/empresas', '/plataforma'];

const entrarComo = async (page: Page, rol: RegExp) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: rol }).first().click();
  await expect(
    page.getByRole('heading', { name: /Hola|Empresas/i })
  ).toBeVisible();
};

const anchoQueSobra = (page: Page) =>
  page.evaluate(() => {
    const raiz = document.documentElement;
    const sobra = raiz.scrollWidth - window.innerWidth;
    if (sobra <= 0) return { sobra, culpable: '' };
    // Quién se pasa del borde derecho: sirve para saber qué mirar.
    const culpable = [...document.querySelectorAll('main *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`
      )[0];
    return { sobra, culpable: culpable ?? '(fuera de main)' };
  });

for (const ancho of [375, 800]) {
  test(`ninguna sección desborda a ${ancho}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: ancho, height: 800 });
    await entrarComo(page, /Admin RRHH/);

    const rotas: string[] = [];
    for (const ruta of RUTAS_ADMIN) {
      await page.goto(ruta);
      await page.waitForTimeout(700);
      const { sobra, culpable } = await anchoQueSobra(page);
      if (sobra > 0) rotas.push(`${ruta} (+${sobra}px, ${culpable})`);
    }

    await entrarComo(page, /Superadmin/);
    for (const ruta of RUTAS_SUPERADMIN) {
      await page.goto(ruta);
      await page.waitForTimeout(700);
      const { sobra, culpable } = await anchoQueSobra(page);
      if (sobra > 0) rotas.push(`${ruta} (+${sobra}px, ${culpable})`);
    }

    expect(
      rotas,
      `Secciones que se salen de pantalla:\n${rotas.join('\n')}`
    ).toEqual([]);
  });
}
