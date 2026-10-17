import { expect, test, type Page } from '@playwright/test';

async function goNav(page: Page, isMobile: boolean, name: 'Oversikt' | 'Kalender' | 'Konto') {
  const nav = page.getByRole('navigation', { name: isMobile ? 'Hovedmeny (mobil)' : 'Hovedmeny' });
  await nav.getByRole('link', { name }).click();
}

/** Ingen horisontal siderulling (brede tabeller skal rulle inne i egen beholder). */
async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(ok, `Horisontal rulling på ${page.url()}`).toBe(true);
}

test('hovedflyt: innlogging → abonnement → FINN-lenke → analyse → scenario → lagring → liste → kalender → nytt besøk', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Innlogging (simulert)
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Fra FINN-lenke til en begrunnet budgrense/ })).toBeVisible();
  await page.getByRole('link', { name: 'Prøv gratis' }).first().click();
  await expect(page.getByText('Simulert innlogging', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(/#\/oversikt/);

  // Abonnementstilstand
  await goNav(page, isMobile, 'Konto');
  await expect(page.getByRole('heading', { name: 'Abonnement' })).toBeVisible();
  await expect(page.locator('main').getByText('Aktivt', { exact: true })).toBeVisible();

  // FINN-lenke → analyse (cachemiss → simulert jobb med fem steg)
  await goNav(page, isMobile, 'Oversikt');
  if (isMobile) {
    await page.getByRole('button', { name: 'Analyser bolig' }).first().click();
  }
  const input = page.getByPlaceholder(/Lim inn FINN-lenke/).last();
  await input.fill('ugyldig.no/123');
  await page.getByRole('button', { name: 'Analyser bolig' }).last().click();
  await expect(page.getByRole('alert').filter({ hasText: 'finn.no' })).toBeVisible();
  await input.fill('https://www.finn.no/realestate/homes/ad.html?finnkode=478027403&utm_source=test');
  await page.getByRole('button', { name: 'Analyser bolig' }).last().click();
  await expect(page.getByRole('dialog').getByText('Vurderer oppussing')).toBeVisible();
  await expect(page).toHaveURL(/#\/objekter\//, { timeout: 20_000 });
  await expect(page.getByText('Demodata – ingen annonse hentet').first()).toBeVisible();
  await noHorizontalScroll(page);
  const propertyUrl = page.url();

  // Scenarioendring
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();
  const price = page.getByLabel('Kjøpspris (kontant)', { exact: true });
  await price.fill('4 000 000');
  await price.blur();
  await expect(page.getByText('Ulagrede endringer')).toBeVisible();
  await noHorizontalScroll(page);

  // Vakt mot ulagrede endringer ved navigering
  await page.getByRole('link', { name: 'Mine objekter' }).click();
  await expect(page.getByRole('dialog', { name: 'Du har ulagrede endringer' })).toBeVisible();
  await page.getByRole('button', { name: 'Bli her' }).click();

  // Lagring
  await page.getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(page.getByText('Scenarioet er lagret')).toBeVisible();
  await expect(page.getByText('Grunnlaget er lagret som «Nettsidens vurdering»')).toBeVisible();
  await expect(page.getByText('Ulagrede endringer')).toHaveCount(0);

  // Liste
  await goNav(page, isMobile, 'Oversikt');
  const row = page.locator(isMobile ? 'li' : 'tr').filter({ hasText: 'Testbakken 8' });
  await expect(row.first()).toBeVisible();
  await expect(row.first().getByText('Mitt scenario')).toBeVisible();
  await noHorizontalScroll(page);

  // Kalender: vanlig månedskalender (uker nedover, dager bortover) er standard
  await goNav(page, isMobile, 'Kalender');
  await expect(page.getByRole('heading', { name: 'Kalender' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Kalender' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('table caption', { hasText: 'Månedskalender' })).toBeAttached();
  await expect(page.locator('table thead th', { hasText: 'Man' })).toBeVisible();
  await noHorizontalScroll(page);
  // Velg en dag med visning og se dagens hendelser under kalenderen
  const dayWithViewing = page.locator('table').getByRole('button', { name: /\d+ visning/ }).first();
  if ((await dayWithViewing.count()) === 0) await page.getByRole('button', { name: 'Neste måned' }).click();
  await dayWithViewing.click();
  await expect(page.locator('section[aria-labelledby="valgt-dag"]').getByText('Visning', { exact: true }).first()).toBeVisible();

  // Listevisning som valg
  await page.getByRole('radio', { name: 'Liste' }).click();
  await expect(page.getByText('Elvekanten 17 B').first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.locator('main').getByRole('button').filter({ hasText: 'Forventet buddag' }).first().click();
  await expect(page.getByRole('dialog').getByText('Prognose – ikke bekreftet budstart')).toBeVisible();
  await page.keyboard.press('Escape');

  // Nytt besøk: data er lagret lokalt
  await page.goto(propertyUrl.replace(/\?.*$/, '') + '?fane=kalkyle');
  await page.reload();
  await expect(page.getByLabel('Kjøpspris (kontant)', { exact: true })).toHaveValue(/^4\s000\s000$/);

  expect(errors).toEqual([]);
});
