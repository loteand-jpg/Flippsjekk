import { expect, test, type Page } from '@playwright/test';

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('innlogging med e-postkode, Google og abonnement med Vipps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // --- E-post med bekreftelseskode (ny konto) ---
  await page.goto('/#/logg-inn');
  await expect(page.getByRole('button', { name: 'Fortsett med Google' })).toBeVisible();
  await expect(page.getByText(/Det finnes ingen passord/)).toBeVisible();
  await expect(page.getByLabel(/passord/i)).toHaveCount(0);
  await noHorizontalScroll(page);
  await page.getByLabel('E-post').fill('ikke-en-epost');
  await page.getByRole('button', { name: 'Send kode på e-post' }).click();
  await expect(page.getByText('Skriv inn en gyldig e-postadresse.')).toBeVisible();

  await page.getByLabel('E-post').fill('test.bruker@eksempel.no');
  await page.getByRole('button', { name: 'Send kode på e-post' }).click();
  await expect(page.getByText('Simulert e-post (demo)')).toBeVisible();
  const code = (await page.getByTestId('demo-code').innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);
  await expect(page).toHaveURL(/#\/logg-inn/); // ikke innlogget uten kode
  await noHorizontalScroll(page);

  const wrong = code === '000000' ? '111111' : '000000';
  await page.getByLabel('Bekreftelseskode').fill(wrong);
  await page.getByRole('button', { name: 'Bekreft og logg inn' }).click();
  await expect(page.getByText(/Feil kode\. Du har 4 forsøk igjen/)).toBeVisible();
  await page.getByLabel('Bekreftelseskode').fill(code);
  await page.getByRole('button', { name: 'Bekreft og logg inn' }).click();
  await expect(page).toHaveURL(/#\/konto/);
  await expect(page.getByText('Kontoen er opprettet')).toBeVisible();

  // --- Abonnement med Vipps: avvis først, deretter godkjenn ---
  await page.getByRole('button', { name: 'Velg abonnement' }).click();
  const dlg = page.getByRole('dialog', { name: 'Start abonnement med Vipps' });
  await expect(dlg.getByText('Kampanjeperiode: prøv 1 måned gratis')).toBeVisible();
  await dlg.getByRole('radio', { name: 'Årlig' }).click();
  await expect(dlg.getByText(/2\s000\skr/)).toBeVisible();
  await dlg.getByLabel('Mobilnummer i Vipps').fill('123');
  await dlg.getByRole('button', { name: 'Fortsett med Vipps' }).click();
  await expect(dlg.getByText(/norsk mobilnummer med 8 siffer/)).toBeVisible();
  await dlg.getByLabel('Mobilnummer i Vipps').fill('912 34 567');
  await dlg.getByRole('button', { name: 'Fortsett med Vipps' }).click();
  const vipps = page.getByRole('dialog', { name: 'Godkjenn i Vipps' });
  await expect(vipps.getByText('+47 9•• •• 567')).toBeVisible();
  await expect(vipps.getByText('Flippsjekk', { exact: true })).toBeVisible();
  await vipps.getByRole('button', { name: 'Avvis' }).click();
  await expect(page.getByText(/Avtalen ble avvist i Vipps/)).toBeVisible();
  await expect(page.getByText('Aktivt', { exact: true })).toHaveCount(0);

  await dlg.getByLabel('Mobilnummer i Vipps').fill('912 34 567');
  await dlg.getByRole('button', { name: 'Fortsett med Vipps' }).click();
  await page.getByRole('dialog', { name: 'Godkjenn i Vipps' }).getByRole('button', { name: 'Godkjenn' }).click();
  await expect(page.getByText('Prøveperioden er startet')).toBeVisible();
  await expect(page.locator('main').getByText('Vipps', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText('Prøveperiode', { exact: true }).first()).toBeVisible();

  // Logg ut
  await page.getByRole('button', { name: 'Logg ut' }).first().click();
  await expect(page).toHaveURL(/#\/(logg-inn)?$/);

  // --- Google (simulert kontovelger) ---
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: 'Fortsett med Google' }).click();
  const g = page.getByRole('dialog', { name: 'Velg en Google-konto' });
  await expect(g.getByText('kari.nordmann@gmail.com')).toBeVisible();
  await g.getByRole('button', { name: /Kari Nordmann/ }).click();
  await expect(page).toHaveURL(/#\/konto/); // ny konto via Google, ingen kode nødvendig
  await expect(page.getByText('Kontoen er opprettet')).toBeVisible();
  expect(errors).toEqual([]);
});

test('innlogging: «glemt passord» finnes ikke lenger, og testprofiler hopper over koden', async ({ page }) => {
  await page.goto('/#/glemt-passord');
  await expect(page).toHaveURL(/#\/logg-inn/);
  await expect(page.getByText('Glemt passord')).toHaveCount(0);
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(/#\/oversikt/);
});
