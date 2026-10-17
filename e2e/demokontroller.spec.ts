import { expect, test } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'Testkontrollene dekkes på desktop');

test('testkontroller: cachetreff, felles jobb, feil og nytt forsøk, gammel analyse', async ({ page }) => {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(/#\/oversikt/);

  const run = async (label: string) => {
    await page.getByRole('button', { name: 'Testkontroller' }).click();
    const card = page.getByRole('dialog', { name: 'Testkontroller for demo' }).locator('.rounded-xl', { has: page.getByText(label, { exact: true }) });
    await card.getByRole('button', { name: 'Kjør' }).click();
  };

  // Cachetreff: eksisterende analyse hentes uten belastning
  await run('Cachetreff');
  await expect(page).toHaveURL(/#\/objekter\//);
  await expect(page.getByText('Eksisterende analyse hentet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bakkegata 6' })).toBeVisible();

  // Pågående felles jobb: koblet til uten belastning
  await run('Pågående felles jobb');
  await expect(page.getByText('Du er koblet til en felles analyse')).toBeVisible();
  await expect(page).toHaveURL(/#\/objekter\//, { timeout: 40_000 });
  await expect(page.getByText('Felles analyse – du ble ikke belastet.')).toBeVisible({ timeout: 40_000 });

  // Feil og nytt forsøk: første forsøk feiler, retry lykkes
  await run('Feil og nytt forsøk');
  await expect(page.getByText('Analysen ble ikke fullført')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Ingen analyse er belastet/)).toBeVisible();
  await page.getByRole('button', { name: 'Prøv igjen' }).click();
  await expect(page.getByText('Analysen er klar')).toBeVisible({ timeout: 20_000 });

  // Gammel analyse: viser alder og valg for oppdatering
  await run('Gammel analyse');
  await expect(page.getByRole('dialog').getByText(/Grunnanalysen er \d+ dager gammel/)).toBeVisible();
  await page.getByRole('button', { name: 'Lett oppfrisking' }).click();
  await expect(page).toHaveURL(/#\/objekter\//, { timeout: 15_000 });
});
