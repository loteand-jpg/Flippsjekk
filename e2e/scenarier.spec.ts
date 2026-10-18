import { expect, test, type Page } from '@playwright/test';

async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(ok, `Horisontal rulling på ${page.url()}`).toBe(true);
}

async function openElvekanten(page: Page, tab: string) {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(/#\/oversikt/);
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await page.getByRole('tab', { name: tab }).click();
}

test('konto: nye standardforutsetninger for finansiering og egeninnsats', async ({ page }) => {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await page.goto('/#/konto');
  await expect(page.getByRole('heading', { name: 'Standardforutsetninger' })).toBeVisible();
  await expect(page.getByLabel('Arbeidstimer egeninnsats per uke')).toHaveValue('10');
  await expect(page.getByLabel('Minimum fortjeneste per egeninnsatstime')).toHaveValue('500');
  await expect(page.getByLabel('Tilgjengelig egenkapital')).toHaveValue(/^300\s000$/);
  await expect(page.getByLabel('Låneandel kjøpesum')).toHaveValue('90');
  await expect(page.getByLabel('Låneandel oppussing')).toHaveValue('0');
  await expect(page.getByLabel('Salgskostnader (fast sum)')).toHaveValue(/^120\s000$/);
  await expect(page.getByLabel('Hvem utfører rør')).toHaveValue('innleid');
  await expect(page.getByLabel('Hvem utfører maling og sparkling')).toHaveValue('selv');
  await expect(page.getByLabel('Timeverdi eget arbeid')).toHaveCount(0);
  await noHorizontalScroll(page);

  await page.getByLabel('Minimum fortjeneste per egeninnsatstime').fill('750');
  await page.getByLabel('Hvem utfører gulv').selectOption('selv');
  await page.getByRole('button', { name: 'Lagre forutsetninger' }).click();
  await expect(page.getByText('Forutsetningene er lagret')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Minimum fortjeneste per egeninnsatstime')).toHaveValue('750');
  await expect(page.getByLabel('Hvem utfører gulv')).toHaveValue('selv');
});

test('scenarioer: basis og to alternativer med egen salgsverdi, privat overstyring og rangering', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openElvekanten(page, 'Min kalkyle');

  // Basis + to alternativer med egen gjennomførbarhet
  const cards = page.getByTestId('scenario-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Standardheving');
  await expect(cards.nth(0)).toContainText('Gjennomførbart');
  await expect(cards.nth(1)).toContainText('Åpen løsning mellom kjøkken og stue');
  await expect(cards.nth(1)).toContainText('Betinget');
  await expect(cards.nth(2)).toContainText('Tre rom (nytt soverom)');
  await expect(cards.nth(2)).toContainText('Uavklart');
  await expect(cards.nth(0)).toContainText('Brukt i dette scenarioet');
  await noHorizontalScroll(page);

  // Rangering: betinget og uavklart styrer ikke anbefalingen
  await expect(page.getByRole('heading', { name: 'Sammenligning av scenarioer' })).toBeVisible();
  await expect(page.getByText(/Anbefalt scenario: Standardheving/)).toBeVisible();
  await expect(page.getByText('Betinget – styrer ikke anbefalt maksbud').first()).toBeVisible();
  await expect(page.getByTestId('rank-row')).toHaveCount(3);

  // Egeninnsats og finansiering: egen tid er ikke en kostnad
  await expect(page.getByText(/Fortjeneste per egeninnsatstime:/)).toBeVisible();
  await expect(page.getByText('Timeverdi for eget arbeid')).toHaveCount(0);
  await expect(page.getByText('Kjøpslån').first()).toBeVisible();
  await expect(page.getByText('Oppussingslån').first()).toBeVisible();

  // Bytt til alternativ 1: egen salgsverdi og egne tiltak, ulagret
  const salesBefore = await page.getByLabel('Normal', { exact: true }).inputValue();
  await cards.nth(1).getByRole('button', { name: 'Bruk i dette scenarioet' }).click();
  await expect(page.getByText('Ulagrede endringer')).toBeVisible();
  await expect(cards.nth(1)).toContainText('Brukt i dette scenarioet');
  const salesAfter = await page.getByLabel('Normal', { exact: true }).inputValue();
  expect(salesAfter).not.toBe(salesBefore);
  expect(salesAfter).toMatch(/^4\s290\s000$/);

  // Privat overstyring: grunnverdi og tilbakestilling per felt
  const reno = page.getByRole('textbox', { name: 'Låneandel oppussing' });
  await reno.fill('50');
  await reno.blur();
  await expect(page.getByText(/Endret av deg · grunnlag 0/).first()).toBeVisible();
  // Tilbakestill-knappen i samme felt (andre felt kan også være endret fra grunnverdien)
  await reno.locator('xpath=ancestor::*[.//button[normalize-space(.)="Tilbakestill"]][1]').getByRole('button', { name: 'Tilbakestill' }).click();
  await expect(reno).toHaveValue('0');
  expect(errors).toEqual([]);
});

test('oppussing: arbeid skilles fra materialer, og regulert arbeid regnes aldri som gratis', async ({ page }) => {
  await openElvekanten(page, 'Oppussing');
  await expect(page.getByText('Basis og alternative planløsninger')).toBeVisible();
  await page.getByRole('button', { name: /Arbeid og egeninnsats for Nytt bad/ }).click();
  await expect(page.getByLabel('Arbeidskategori for Nytt bad (membran, sluk, fliser)')).toHaveValue('bad_vatrom');
  await page.getByLabel('Hvem utfører Nytt bad (membran, sluk, fliser)').selectOption('selv');
  await expect(page.getByText(/regulert arbeid regnes som innleid/i).first()).toBeVisible();
  await expect(page.getByText(/Regulert arbeid er regnet som innleid for/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Egeninnsats og innleid arbeid per kategori' })).toBeVisible();
  await noHorizontalScroll(page);
});

test('marked: verdivurdering vekter referanser, aktive annonser er ikke salg, og samme bygg i gammel standard dominerer ikke', async ({ page }) => {
  await openElvekanten(page, 'Marked');
  await expect(page.getByRole('heading', { name: 'Verdivurdering fra sammenlignbare objekter' })).toBeVisible();
  await expect(page.getByText(/Svært godt grunnlag|Normalt grunnlag|Svakt grunnlag/).first()).toBeVisible();
  await expect(page.getByText('Aktiv annonse – ikke faktisk salg')).toBeVisible();
  const refs = page.getByTestId('market-ref');
  expect(await refs.count()).toBeGreaterThanOrEqual(6);
  // Oppussingsobjektet i samme bygg er sekundær og ikke med i ankeret
  const old = refs.filter({ hasText: 'oppussingsobjekt' }).first();
  await expect(old).toContainText('Sekundærreferanse');
  await expect(old.locator('td').last()).toHaveText('Nei');
  // Nyoppusset i samme bygg er primær og med i ankeret
  const same = refs.filter({ hasText: 'Elvekanten 17 C' }).first();
  await expect(same).toContainText('Primærreferanse');
  await expect(same.locator('td').last()).toHaveText('Ja');
  await expect(page.getByText('Salgsverdi etter oppussing – Standardheving')).toBeVisible();
  await noHorizontalScroll(page);

  // Bruk estimatet i scenarioet
  await page.getByRole('button', { name: 'Bruk som salgsverdi i scenarioet' }).click();
  await expect(page.getByText('Salgsverdien er lagt inn i scenarioet')).toBeVisible();
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();
  await expect(page.getByText('Ulagrede endringer')).toBeVisible();
});
