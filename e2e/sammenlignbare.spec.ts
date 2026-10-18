import { expect, test } from '@playwright/test';

test('sammenlignbare objekter: grunnlag med nye felt og egne objekter (legg til, valider, endre, slett)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(/#\/oversikt/);
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await page.getByRole('tab', { name: 'Marked' }).click();

  // Grunnlaget har de nye kolonnene
  const shared = page.getByRole('table', { name: 'Sammenlignbare objekter fra analysen' });
  for (const h of ['Prisantydning', 'Solgt pris', 'Felleskostn./mnd', 'Solgt totalpris', 'Areal', 'kr/m²', 'Dato', 'Merknad']) {
    await expect(shared.getByRole('columnheader', { name: h })).toBeVisible();
  }
  await expect(shared.getByText('Ikke dokumentert').first()).toBeVisible(); // solgt uten sum – ikke 0
  await expect(page.getByText('Median kr/m² for faktiske salg')).toBeVisible();

  // Seedet eget objekt
  const mine = page.getByRole('table', { name: 'Mine sammenlignbare objekter' });
  await expect(mine.getByText('Elvekanten 13, 3 rom (min egen)')).toBeVisible();

  // Legg til: validering først
  await page.getByRole('button', { name: 'Legg til objekt' }).click();
  const dlg = page.getByRole('dialog', { name: 'Legg til sammenlignbart objekt' });
  await dlg.getByLabel('Objekt', { exact: true }).fill('Testgata 7');
  await dlg.getByRole('button', { name: 'Lagre' }).click();
  await expect(dlg.getByText(/Faktisk salg krever solgt pris/).first()).toBeVisible();

  await dlg.getByLabel('Prisantydning').fill('3 600 000');
  await dlg.getByLabel('Felleskostnader per måned').fill('2 400');
  await dlg.getByLabel('Solgt pris').fill('3 500 000');
  await dlg.getByLabel('Solgt totalpris').fill('3 500 000');
  await dlg.getByLabel('Areal').fill('50');
  await expect(dlg.getByText(/70\s000\skr \(solgt totalpris\)/)).toBeVisible();
  await dlg.getByLabel('Dato').fill('2026-10-12');
  await dlg.getByLabel('Merknad').fill('Pent oppusset');
  await dlg.getByRole('button', { name: 'Lagre' }).click();
  await expect(page.getByText('Objektet er lagt til')).toBeVisible();
  const row = mine.getByRole('row', { name: /Testgata 7/ });
  await expect(row).toContainText('Pent oppusset');
  await expect(row).toContainText('70');
  await expect(mine.getByRole('row').nth(1)).toContainText('Testgata 7'); // nyeste dato først

  // Endre
  await page.getByRole('button', { name: 'Rediger Testgata 7' }).click();
  const edit = page.getByRole('dialog', { name: 'Rediger sammenlignbart objekt' });
  await edit.getByLabel('Merknad').fill('Endret merknad');
  await edit.getByRole('button', { name: 'Lagre' }).click();
  await expect(mine.getByRole('row', { name: /Testgata 7/ })).toContainText('Endret merknad');

  // Gjenåpning bevarer data
  await page.reload();
  await page.getByRole('tab', { name: 'Marked' }).click();
  await expect(page.getByRole('table', { name: 'Mine sammenlignbare objekter' }).getByText('Testgata 7')).toBeVisible();

  // Slett
  await page.getByRole('button', { name: 'Slett Testgata 7' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Slett', exact: true }).click();
  await expect(page.getByText('Objektet er slettet')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Mine sammenlignbare objekter' }).getByText('Testgata 7')).toHaveCount(0);

  // Ingen horisontal siderulling (tabellen ruller i egen beholder)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('analysen til et objekt forsvinner aldri: manglende analyse gjenopprettes automatisk ved innlasting', async ({ page }) => {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(/#\/oversikt/);
  await page.evaluate(() => {
    const key = 'flipprom.mockdb';
    const env = JSON.parse(localStorage.getItem(key)!);
    const p = env.state.properties.find((x: { finnId: string }) => x.finnId === '900000101');
    env.state.analyses = env.state.analyses.filter((a: { propertyId: string }) => a.propertyId !== p.id);
    localStorage.setItem(key, JSON.stringify(env));
  });
  await page.reload();
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await expect(page.getByText('Grunnanalysen for objektet mangler')).toHaveCount(0);
  await expect(page.getByText(/Analyse fra \d/)).toBeVisible();
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();
  await expect(page.getByLabel('Kjøpspris (kontant)', { exact: true })).toHaveValue(/^2\s950\s000$/); // Adas lagrede verdi er beholdt
});
