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
  // Scenariorisiko er med i sammenligningen, og hvert kort viser den
  await expect(cards.nth(2)).toContainText('Scenariorisiko');
  await expect(cards.nth(2)).toContainText('myndighets-/godkjenningsrisiko høy');
  await expect(page.getByText('Risiko (objekt + scenario)').first()).toBeVisible();
  // Salgsverdien er fastsatt av markedsmotoren, og agentens estimat er historisk referanse
  await expect(cards.nth(0).getByTestId('sale-source')).toContainText('Beregnet av markedsmotoren');
  await expect(cards.nth(0)).toContainText('Sluttstandard: nyoppusset');
  // Maksbudgrenser vises hver for seg, og det vises hva som begrenser anbefalt maksbud
  await expect(page.getByTestId('recommended-maxbid')).toContainText('Begrenset av');
  await expect(page.getByText(/Grense: fortjenestemål/)).toBeVisible();
  await expect(page.getByText(/Grense: minimum .* per egeninnsatstime/)).toBeVisible();

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
  // Alternativets salgsverdi fastsettes av markedsmotoren (ikke agentens historiske 4 290 000)
  expect(salesAfter).toMatch(/^4\s131\s000$/);

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

  // Én autoritativ flyt: markedsmotoren er fasit, agentens estimat er historisk referanse, og din kalkyle er privat
  await expect(page.getByTestId('sale-source').first()).toContainText('Beregnet av markedsmotoren');
  const values = page.getByTestId('sale-values');
  await expect(values).toContainText('Markedsmotoren (fasit i kalkylen)');
  await expect(values).toContainText('Agentens historiske estimat');
  await expect(values).toContainText('Din kalkyle (privat)');
  await expect(values).toContainText('Ikke endret av deg');
  // Aktive annonser er markedssignal med dokumentert maksimum – ikke faktiske salg
  await expect(page.getByTestId('market-positioning').first()).toContainText(/aktiv/i);

  // Overstyr salgsverdien privat i kalkylen, og hent markedsmotorens verdi tilbake derfra
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();
  const normal = page.getByLabel('Normal', { exact: true });
  const engineValue = await normal.inputValue();
  await normal.fill('5000000');
  await normal.blur();
  await expect(page.getByText('Ulagrede endringer')).toBeVisible();
  await page.getByRole('tab', { name: 'Marked' }).click();
  await expect(page.getByTestId('sale-values')).toContainText('Endret av deg');
  await page.getByRole('button', { name: 'Bruk som salgsverdi i scenarioet' }).click();
  await expect(page.getByText('Salgsverdien er lagt inn i scenarioet')).toBeVisible();
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();
  await expect(page.getByLabel('Normal', { exact: true })).toHaveValue(engineValue);
});

test('konto: relevant kompetanse for regulert arbeid bekreftes per arbeidsområde', async ({ page }) => {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await page.goto('/#/konto');
  const elektro = page.getByRole('switch', { name: /Relevant kompetanse\/ansvar bekreftet for elektro/ });
  const ror = page.getByRole('switch', { name: /Relevant kompetanse\/ansvar bekreftet for rør/ });
  const bad = page.getByRole('switch', { name: /Relevant kompetanse\/ansvar bekreftet for bad og våtrom/ });
  for (const sw of [elektro, ror, bad]) await expect(sw).toHaveAttribute('aria-checked', 'false');
  await elektro.click();
  await expect(elektro).toHaveAttribute('aria-checked', 'true');
  await expect(ror).toHaveAttribute('aria-checked', 'false'); // kompetanse på ett område gjelder ikke de andre
  await expect(bad).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Lagre forutsetninger' }).click();
  await expect(page.getByText('Forutsetningene er lagret')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: /Relevant kompetanse\/ansvar bekreftet for elektro/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /Relevant kompetanse\/ansvar bekreftet for rør/ })).toHaveAttribute('aria-checked', 'false');
  await noHorizontalScroll(page);
});

test('30 dager: gammel analyse tilbyr grundig markedsoppfriskning – ikke full ny analyse', async ({ page }) => {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await page.getByRole('link', { name: /Elgeseter gate 51/ }).first().click();
  await expect(page.getByText(/Markedsdataene er \d+ dager gamle/)).toBeVisible();
  await expect(page.getByText('Det tekniske grunnlaget (dokumenter, risiko, oppussingsbehov og scenarioer) leses ikke på nytt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bestill full ny analyse' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bestill ny teknisk analyse' })).toHaveCount(0);
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Oppdater markedsdata' }).click();
  await expect(page.getByText('Markedsoppfriskning pågår')).toBeVisible();
  await expect(page.getByText(/Markedsdataene er \d+ dager gamle/)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText('Markedsoppfriskning pågår')).toHaveCount(0, { timeout: 15_000 });
});

/** Fortjeneste før skatt per scenario i rangeringen («Sammenligning av scenarioer»). */
async function rankProfits(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const rows = page.getByTestId('rank-row');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const row = rows.nth(i);
    const title = (await row.locator('.font-semibold').first().innerText()).trim();
    const text = (await row.locator('xpath=.//dt[normalize-space(.)="Fortjeneste før skatt"]/following-sibling::dd[1]').innerText()).replace(/[  \s]/g, '');
    out[title] = Number(text.match(/[−-]?\d+/)![0].replace('−', '-'));
  }
  return out;
}

test('rangering: Basis, Alternativ A og B sammenlignes med samme kjøpspris som kalkylen din', async ({ page }) => {
  await openElvekanten(page, 'Min kalkyle');
  const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
  await expect(price).toHaveValue(/2\s?950\s?000/); // brukerens private kalkyle; analysens grunnlag er 2 890 000
  const atPrivate = await rankProfits(page);

  // Samme kjøpspris som analysens grunnlag (tilbakestill feltet) – alle tre får da 60 000 kr lavere kjøpspris
  await price.locator('xpath=ancestor::*[.//button[normalize-space(.)="Tilbakestill"]][1]').getByRole('button', { name: 'Tilbakestill' }).click();
  await expect(price).toHaveValue(/2\s?890\s?000/);
  const atBase = await rankProfits(page);

  // Før rettingen endret bare det aktive scenarioet seg (alternativene lå fast på 2 890 000). Nå flytter prisen alle tre
  // omtrent like mye (60 000 kr + 2,5 % avgift + renter), så forskjellen mellom dem er ren scenarioeffekt.
  const delta = (t: string) => atBase[t] - atPrivate[t];
  const titles = Object.keys(atBase);
  expect(titles).toHaveLength(3);
  const basisDelta = delta('Standardheving');
  expect(basisDelta).toBeGreaterThan(60_000);
  for (const t of titles) expect(Math.abs(delta(t) - basisDelta), `${t}: prisendringen skal slå likt ut`).toBeLessThan(1500);
});

test('«Bruk i dette scenarioet» beholder private forutsetninger (kjøpspris, rente, finansiering) og bytter tiltak og salgsverdi', async ({ page }) => {
  await openElvekanten(page, 'Min kalkyle');
  const cards = page.getByTestId('scenario-card');
  const set = async (name: string, value: string) => {
    const f = page.getByRole('textbox', { name, exact: true });
    await f.fill(value);
    await f.blur();
  };
  await set('Kjøpspris (kontant)', '3 050 000');
  await set('Rente', '7,2');
  await set('Låneandel kjøpesum', '85');
  await set('Låneandel oppussing', '25');
  await cards.nth(1).getByRole('button', { name: 'Bruk i dette scenarioet' }).click();
  await expect(cards.nth(1)).toContainText('Brukt i dette scenarioet');
  await expect(page.getByRole('textbox', { name: 'Kjøpspris (kontant)', exact: true })).toHaveValue(/3\s?050\s?000/);
  await expect(page.getByRole('textbox', { name: 'Rente', exact: true })).toHaveValue(/7,2/);
  await expect(page.getByRole('textbox', { name: 'Låneandel kjøpesum', exact: true })).toHaveValue('85');
  await expect(page.getByRole('textbox', { name: 'Låneandel oppussing', exact: true })).toHaveValue('25');
  // scenarioets egne verdier er byttet
  expect(await page.getByLabel('Normal', { exact: true }).inputValue()).toMatch(/^4\s131\s000$/);
});

test('lagrede private scenarioer påvirkes ikke av rangeringen eller av å bytte analysescenario', async ({ page }) => {
  await openElvekanten(page, 'Min kalkyle');
  const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)', exact: true });
  const profitsBefore = await rankProfits(page);
  // Lagre et ekstra privat scenario med en helt annen kjøpspris
  await price.fill('3 400 000');
  await price.blur();
  await page.getByRole('button', { name: 'Lagre som nytt' }).click();
  const dlg = page.getByRole('dialog', { name: 'Lagre som nytt scenario' });
  await dlg.getByRole('textbox').fill('Høy pris');
  await dlg.getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(dlg).toBeHidden();
  // Tilbake til hovedscenarioet: kjøpsprisen er uendret (2 950 000), og rangeringen er som før
  await page.locator('#scenario-select').selectOption({ label: 'Hovedscenario (primært)' });
  await expect(price).toHaveValue(/2\s?950\s?000/);
  expect(await rankProfits(page)).toEqual(profitsBefore);
  // Og scenarioet med høy pris har fortsatt sin egen pris
  await page.locator('#scenario-select').selectOption({ label: 'Høy pris' });
  await expect(price).toHaveValue(/3\s?400\s?000/);
});

test('fellesgjeld ved salg: totalverdien beholdes, og kontantprisen og alle scenarioene følger brukerens gjeld', async ({ page }) => {
  await openElvekanten(page, 'Min kalkyle');
  const normal = page.getByLabel('Normal', { exact: true });
  const low = page.getByLabel('Lav', { exact: true });
  const high = page.getByLabel('Høy', { exact: true });
  await expect(normal).toHaveValue(/^4\s050\s000$/);
  const before = await rankProfits(page);

  // Brukeren setter fellesgjeld ved salg til 200 000: markedsmotorens totalverdi (4 050 000 + 0) er uendret, så kontant faller til 3 850 000
  const debt = page.getByRole('textbox', { name: 'Fellesgjeld ved salg', exact: true });
  await debt.fill('200 000');
  await debt.blur();
  await expect(normal).toHaveValue(/^3\s850\s000$/);
  await expect(low).toHaveValue(/^3\s721\s000$/); // 3 921 000 − 200 000
  await expect(high).toHaveValue(/^3\s980\s000$/);
  const after = await rankProfits(page);
  // Alle tre scenarioene bruker samme gjeld og beholder sin totalverdi: kontantsalget – og dermed fortjenesten – er 200 000 lavere
  for (const t of Object.keys(before)) expect(after[t] - before[t], t).toBe(-200_000);

  // Tilbakestill til grunnlaget: verdiene er tilbake
  await debt.locator('xpath=ancestor::*[.//button[normalize-space(.)="Tilbakestill"]][1]').getByRole('button', { name: 'Tilbakestill' }).click();
  await expect(normal).toHaveValue(/^4\s050\s000$/);
  expect(await rankProfits(page)).toEqual(before);
});
