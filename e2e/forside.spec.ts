import { expect, test } from '@playwright/test';

async function noHorizontalScroll(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('forside og «Slik fungerer det»', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Fra FINN-lenke til en begrunnet budgrense/ })).toBeVisible();
  for (const t of ['Kalkulering av kostnader, utgifter og salgspris', 'Maks budpris', 'Oversiktlig budsjett', 'Oversikt over alle aktuelle boliger', 'Visningskalender', 'Flippekurs']) {
    await expect(page.getByRole('listitem').filter({ hasText: t }).first()).toBeVisible();
  }
  await expect(page.getByText('Ukjent vises som ukjent')).toHaveCount(0);
  await expect(page.getByText('Trondheim først')).toHaveCount(0);
  await expect(page.getByText('Trondheim')).toHaveCount(0);
  await noHorizontalScroll(page);

  // Abonnement nederst: kampanje, månedlig og årlig
  const pris = page.locator('#abonnement');
  await expect(pris.getByText('Kampanjeperiode: prøv 1 måned gratis')).toBeVisible();
  await expect(pris.getByRole('heading', { name: 'Månedlig' })).toBeVisible();
  await expect(pris.getByRole('heading', { name: 'Årlig' })).toBeVisible();
  await expect(pris.getByText(/200\s?kr/)).toBeVisible();
  await expect(pris.getByText('Best verdi')).toBeVisible();
  await expect(pris.getByRole('link', { name: 'Prøv gratis i 1 måned' })).toHaveCount(2);

  await page.getByRole('link', { name: 'Se hvordan det ser ut' }).click();
  await expect(page).toHaveURL(/#\/slik-fungerer-det/);
  await expect(page.getByRole('heading', { level: 1, name: 'Slik fungerer det' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Oversikt over boligene dine' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inni et objekt' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kalenderen' })).toBeVisible();

  // Kalkylen i illustrasjonen kan prøves
  const tiles = page.getByTestId('how-tiles');
  const before = await tiles.innerText();
  await page.getByLabel('Kjøpspris').fill('3000000');
  expect(await tiles.innerText()).not.toBe(before);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('områdefilteret er satt på pause i oversikten, og abonnementet står under Konto', async ({ page }) => {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await page.getByRole('button', { name: /Filtre/ }).first().click();
  await expect(page.getByText('Boligtype', { exact: true })).toBeVisible();
  await expect(page.getByText('Område', { exact: true })).toHaveCount(0);
  await page.goto('/#/konto');
  await expect(page.getByRole('heading', { name: /Dette får du med Flippsjekk/ })).toBeVisible();
});
