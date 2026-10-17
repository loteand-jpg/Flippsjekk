import { expect, test } from '@playwright/test';

test('risiko: grunnlagets risikoer kan endres, tilbakestilles og skjules, og egne kan legges til', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await page.getByRole('tab', { name: 'Risiko og sjekkliste' }).click();

  const rows = page.getByTestId('risk-row');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  const firstTitle = (await rows.first().locator('p.font-medium').first().innerText()).trim();

  // Endre en risiko fra grunnlaget
  await rows.first().getByRole('button', { name: /^Rediger risiko/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Rediger risiko' });
  await dlg.getByLabel('Alvorlighet').selectOption('10');
  await dlg.getByLabel('Mulig kostnad – laveste').fill('100 000');
  await dlg.getByLabel('Mulig kostnad – høyeste').fill('50 000');
  await dlg.getByRole('button', { name: 'Lagre' }).click();
  await expect(dlg.getByText('Høyeste kostnad kan ikke være lavere enn laveste.')).toBeVisible();
  await dlg.getByLabel('Mulig kostnad – høyeste').fill('300 000');
  await dlg.getByRole('button', { name: 'Lagre' }).click();
  await expect(page.getByText('Risikoen er oppdatert')).toBeVisible();
  const edited = page.getByTestId('risk-row').filter({ hasText: 'Endret av deg' });
  await expect(edited).toHaveCount(1);
  await expect(edited).toContainText('Alvorlighet 10/10');
  await expect(page.getByRole('heading', { name: /Samlet risiko: 10\/10/ })).toBeVisible();

  // Tilbakestill
  await edited.getByRole('button', { name: /^Tilbakestill/ }).click();
  await expect(page.getByTestId('risk-row').filter({ hasText: 'Endret av deg' })).toHaveCount(0);
  await expect(page.getByTestId('risk-row')).toHaveCount(n);

  // Skjul og vis igjen
  await page.getByTestId('risk-row').filter({ hasText: firstTitle }).first().getByRole('button', { name: /^Skjul risiko/ }).click();
  await expect(page.getByTestId('risk-row')).toHaveCount(n - 1);
  await expect(page.getByText(/Skjult av deg \(1\)/)).toBeVisible();
  await page.getByRole('button', { name: /^Vis igjen/ }).click();
  await expect(page.getByTestId('risk-row')).toHaveCount(n);

  // Egen risiko
  await page.getByRole('button', { name: 'Legg til risiko' }).click();
  const add = page.getByRole('dialog', { name: 'Legg til risiko' });
  await add.getByRole('button', { name: 'Lagre' }).click();
  await expect(add.getByText('Gi risikoen en tittel.')).toBeVisible();
  await add.getByLabel('Tittel').fill('Naboen klager på støy');
  await add.getByRole('button', { name: 'Lagre' }).click();
  await expect(page.getByTestId('risk-row')).toHaveCount(n + 1);
  const mine = page.getByTestId('risk-row').filter({ hasText: 'Naboen klager på støy' });
  await expect(mine).toContainText('Ukjent alvorlighet');
  await expect(mine).toContainText('Din risiko');
  await mine.getByRole('button', { name: /^Slett risiko/ }).click();
  await expect(page.getByTestId('risk-row')).toHaveCount(n);

  // Ingen horisontal rulling
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
