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

  // Cachetreff: brukeren ser det samme som ved en ny analyse (fremdrift, så «Analysen er klar») – ingen beskjed om at grunnlaget fantes
  await run('Cachetreff');
  await expect(page.getByRole('dialog', { name: 'Analyserer bolig' })).toBeVisible();
  await expect(page.getByText(/Eksisterende analyse|finnes allerede|ikke belastet|felles analyse|koblet til/i)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/objekter\//, { timeout: 30_000 });
  await expect(page.getByText('Analysen er klar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bakkegata 6' })).toBeVisible();
  await expect(page.getByText(/Analyse fra \d/)).toBeVisible(); // dato, uten versjonsnummer
  await expect(page.getByText(/Grunnanalyse v\d|versjon \d/)).toHaveCount(0);

  // Pågående felles jobb: samme fremdriftsvisning som en vanlig analyse, uten beskjed om at den deles
  await run('Pågående felles jobb');
  await expect(page.getByRole('dialog', { name: 'Analyserer bolig' })).toBeVisible();
  await expect(page.getByText(/koblet til|felles analyse|annen abonnent/i)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/objekter\//, { timeout: 40_000 });
  await expect(page.getByText('Analysen er klar')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/ikke belastet|Felles analyse/)).toHaveCount(0);

  // Feil og nytt forsøk: første forsøk feiler, retry lykkes
  await run('Feil og nytt forsøk');
  await expect(page.getByText('Analysen ble ikke fullført')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Ingen analyse er belastet/)).toBeVisible();
  await page.getByRole('button', { name: 'Prøv igjen' }).click();
  await expect(page.getByText('Analysen er klar')).toBeVisible({ timeout: 20_000 });

  // Objekt i egen liste med analyse eldre enn 30 dager: grundig markedsoppfriskning (ikke full analyse), deretter åpnes objektet
  await run('Gammel analyse');
  await expect(page.getByRole('dialog', { name: 'Oppdaterer markedsdata' })).toBeVisible();
  await expect(page.getByText(/Eksisterende analyse|finnes allerede|felles analyse/i)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/objekter\//, { timeout: 15_000 });
  await expect(page.getByText('Markedsdataene er oppdatert')).toBeVisible();
  await expect(page.getByText('Pris, visninger og salgsstatus bør kontrolleres')).toHaveCount(0); // annonsen er fersk etter oppfriskningen
  await expect(page.getByText(/Markedsdataene er \d+ dager gamle/)).toHaveCount(0);
});
