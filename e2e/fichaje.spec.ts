import { test, expect, Page } from '@playwright/test';

/**
 * Flujos críticos de Fichaje sobre el modo demo.
 *
 * Qué NO está acá y por qué
 * -------------------------
 * Fichar con la cara (el ingreso/egreso del colaborador y el kiosco de
 * planta) necesita cámara y los modelos de reconocimiento facial. Un e2e
 * que los simule no probaría el flujo real sino el simulador, así que esa
 * parte se cubre donde de verdad se decide: `fichaje_reglas.test.sql` y
 * `rpc.test.sql` contra Postgres, más los unitarios de `fichadas.ts` y
 * `turnos.ts`.
 *
 * Lo que sí se prueba acá es todo lo que una persona hace con el mouse:
 * la carga manual con sus validaciones, que la marca aparezca en el
 * historial, que anularla la saque de los cálculos, y que un colaborador
 * no vea las herramientas que no le corresponden.
 */

const entrarComo = async (page: Page, rol: RegExp) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: rol }).first().click();
  await expect(page).toHaveURL(/\/$|\/#/);
};

/** Hoy en la zona de la empresa, como lo tipearía alguien: dd/mm/aaaa. */
const hoyCorta = (): string => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [a, m, d] = partes.split('-');
  return `${d}/${m}/${a}`;
};

/** Mañana en dd/mm/aaaa, para probar que el campo de fecha la rechaza. */
const maniana = (): string => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/**
 * El campo de texto de un campo con etiqueta.
 *
 * `getByLabel` no alcanza: `CampoFecha` y `CampoHora` ponen el
 * `aria-label` en el input Y tienen al lado un botón ("Elegir hora") cuyo
 * nombre accesible también contiene la etiqueta, así que el selector
 * resuelve a varios elementos.
 */
const campo = (raiz: ReturnType<Page['getByRole']>, etiqueta: string) =>
  raiz.getByRole('textbox', { name: etiqueta, exact: true });

/**
 * Escribe en un campo y saca el foco para que se cierre su desplegable.
 *
 * `CampoHora` y `CampoFecha` abren su propio selector al recibir el foco,
 * y ese panel queda por encima del botón de guardar: sin cerrarlo, el
 * click siguiente se lo come el desplegable.
 *
 * Se sale con Tab y no con Escape: Escape lo toma el Modal de Mantine y
 * cierra el formulario entero.
 */
const escribir = async (
  raiz: ReturnType<Page['getByRole']>,
  etiqueta: string,
  valor: string
) => {
  const input = campo(raiz, etiqueta);
  await input.fill(valor);
  await input.press('Tab');
};

/** Abre "Cargar a mano" y devuelve el diálogo. */
const abrirCargaManual = async (page: Page) => {
  await page.goto('/fichaje');
  await expect(
    page.getByRole('heading', { level: 1, name: /Fichaje/i })
  ).toBeVisible();
  await page.getByRole('button', { name: /Cargar a mano/i }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('Cargar fichaje a mano')).toBeVisible();
  return modal;
};

/** Elige un colaborador en el selector propio (no es un <select> nativo). */
const elegirColaborador = async (modal: ReturnType<Page['getByRole']>) => {
  await modal.locator('button[aria-haspopup="listbox"]').first().click();
  const opcion = modal.page().getByRole('option').first();
  await opcion.waitFor();
  const nombre = (await opcion.textContent())?.trim() ?? '';
  await opcion.click();
  return nombre;
};

test.describe('Fichaje — carga manual', () => {
  test('carga una marca con motivo y aparece en los fichajes de hoy', async ({
    page,
  }) => {
    await entrarComo(page, /Admin RRHH/);
    const modal = await abrirCargaManual(page);

    const nombre = await elegirColaborador(modal);
    // Fecha y hora se dejan como vienen: el formulario arranca en el día
    // y la hora de la EMPRESA, que es justo lo que hay que cargar cuando
    // se ficha a mano en el momento. Poner una hora fija haría el test
    // dependiente de cuándo corre — una hora "de la mañana" es futura si
    // el CI arranca a las siete.
    await modal
      .getByRole('textbox', { name: /^Motivo/ })
      .fill('Se cayó la tablet');
    await modal.getByRole('button', { name: /Cargar fichaje/i }).click();

    await expect(page.getByText(/Fichaje cargado a mano/i)).toBeVisible();

    // Y queda a la vista en "Fichajes de hoy", con el método correcto:
    // todo INSERT directo es carga manual, lo haga quien lo haga (F-07).
    // Cada fila es un link al legajo, así que el nombre accesible lleva
    // el nombre de la persona y el detalle del método juntos.
    await expect(
      page
        .getByRole('link', {
          name: new RegExp(`${nombre.split(' ')[0]}.*Carga manual`),
        })
        .first()
    ).toBeVisible();
  });

  test('sin motivo no deja cargar', async ({ page }) => {
    // El motivo es lo que permite entender después por qué esa hora la
    // escribió alguien en vez de salir del reloj. La base también lo
    // exige (`imponer_actor_fichaje`); acá se comprueba que la pantalla
    // no mande un pedido que va a rebotar.
    await entrarComo(page, /Admin RRHH/);
    const modal = await abrirCargaManual(page);

    await elegirColaborador(modal);
    await modal.getByRole('button', { name: /Cargar fichaje/i }).click();

    await expect(modal.getByText(/por qué la cargás a mano/i)).toBeVisible();
    await expect(page.getByText(/Fichaje cargado a mano/i)).toHaveCount(0);
  });

  test('sin elegir colaborador no deja cargar', async ({ page }) => {
    await entrarComo(page, /Admin RRHH/);
    const modal = await abrirCargaManual(page);

    await modal.getByRole('textbox', { name: /^Motivo/ }).fill('Prueba');
    await modal.getByRole('button', { name: /Cargar fichaje/i }).click();

    await expect(modal.getByText(/Elegí un colaborador/i)).toBeVisible();
  });

  test('el campo de fecha no acepta un día que todavía no llegó', async ({
    page,
  }) => {
    // A04 desde la pantalla: tipear mañana no deja mañana, deja hoy.
    //
    // Esto es la cortesía, no el control. La garantía está en la base
    // (`trg_rechazar_fichaje_futuro`), porque un campo de formulario lo
    // saltea cualquiera que hable PostgREST directo; eso se prueba en
    // `fichaje_reglas.test.sql` y en `fichajeReglas.test.ts`.
    await entrarComo(page, /Admin RRHH/);
    const modal = await abrirCargaManual(page);

    await elegirColaborador(modal);
    await escribir(modal, 'Fecha', maniana());
    await expect(campo(modal, 'Fecha')).toHaveValue(hoyCorta());
  });
});

test.describe('Fichaje — historial y anulación', () => {
  test('la marca cargada aparece en Movimientos y se puede anular', async ({
    page,
  }) => {
    await entrarComo(page, /Admin RRHH/);
    const modal = await abrirCargaManual(page);
    await elegirColaborador(modal);
    await modal
      .getByRole('textbox', { name: /^Motivo/ })
      .fill('Marca para anular');
    await modal.getByRole('button', { name: /Cargar fichaje/i }).click();
    await expect(page.getByText(/Fichaje cargado a mano/i)).toBeVisible();

    // El historial tiene sus propias consultas y no se entera de la carga
    // hasta que se vuelva a pedir. Se lo fuerza cambiando de vista y
    // volviendo — no con `page.reload()`, porque los datos del modo demo
    // viven en memoria del navegador y una recarga los devuelve al
    // estado inicial, borrando la marca recién creada.
    const refrescarHistorial = async () => {
      await page.getByRole('button', { name: 'Resumen' }).click();
      await page.getByRole('button', { name: 'Movimientos' }).click();
    };
    await refrescarHistorial();

    // El motivo viaja con la marca: sin él sólo se sabe que alguien
    // escribió una hora. Y sirve para encontrar la fila.
    //
    // `li, tr` porque el historial cambia de forma: tarjetas en el
    // teléfono, tabla en el escritorio. Las dos llevan el motivo y su
    // botón de anular, así que el test vale para las dos.
    //
    // `:visible` porque los dos layouts están SIEMPRE en el DOM y se
    // esconden con CSS (`md:hidden`): sin el filtro, en escritorio se
    // engancharía la tarjeta oculta.
    const fila = page
      .locator('li:visible, tr:visible')
      .filter({ hasText: 'Marca para anular' });
    await expect(fila.first()).toBeVisible();

    await fila.first().getByRole('button', { name: 'Anular' }).click();
    const anular = page.getByRole('dialog');
    await expect(
      anular.getByRole('heading', { name: 'Anular fichaje' })
    ).toBeVisible();
    await anular
      .getByRole('textbox', { name: /^Motivo/ })
      .fill('Cargada en el legajo equivocado');
    await anular.getByRole('button', { name: /Anular fichaje/i }).click();

    await expect(page.getByText(/Fichaje anulado/i)).toBeVisible();
    await refrescarHistorial();
    // F-12: la fila sigue en la tabla para la auditoría, pero sale de
    // todos los cálculos y de la vista de movimientos.
    await expect(
      page
        .locator('li:visible, tr:visible')
        .filter({ hasText: 'Marca para anular' })
    ).toHaveCount(0);
  });
});

test.describe('Fichaje — lo que ve cada rol', () => {
  test('el colaborador ve sus fichadas y no puede anular', async ({ page }) => {
    await entrarComo(page, /Empleado/);
    await page.goto('/fichaje');

    await expect(
      page.getByRole('heading', { level: 1, name: /Fichaje/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Mis fichadas/i })
    ).toBeVisible();

    // Anular resta horas de un registro que puede terminar en una
    // liquidación: es de admin_rrhh. Esconder el botón no es la defensa
    // —`anular_fichaje` exige el rol— pero tampoco tiene que estar.
    await expect(page.getByRole('button', { name: 'Anular' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Cargar a mano/i })
    ).toHaveCount(0);
  });

  test('el supervisor puede cargar a mano pero no anular', async ({ page }) => {
    // La asimetría es deliberada (migración 76): cargar es aditivo y deja
    // evidencia nueva; anular RESTA horas del registro de su propio
    // equipo, que es justo el conflicto de interés a evitar.
    await entrarComo(page, /Supervisor/);
    await page.goto('/fichaje');

    await expect(
      page.getByRole('button', { name: /Cargar a mano/i })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anular' })).toHaveCount(0);
  });
});

test.describe('Fichaje — Turnos consume las mismas marcas', () => {
  test('el control de turnos carga y muestra el estado del día', async ({
    page,
  }) => {
    await entrarComo(page, /Admin RRHH/);
    await page.goto('/turnos');

    await expect(
      page.getByRole('heading', { level: 1, name: /Turnos/i })
    ).toBeVisible();
    // Los contadores del resumen salen de cruzar turnos contra jornadas
    // reales: si `controlarTurno` explota, esto no se dibuja.
    await expect(page.getByText(/Llegadas tarde/i).first()).toBeVisible();
  });
});
