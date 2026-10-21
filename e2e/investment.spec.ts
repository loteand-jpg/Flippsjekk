import { expect, test, type Page } from '@playwright/test';

const INV = '/design/investment';

/** Tall fra en tekst som «2 733 000 kr» eller «−2 930 800 kr» (nb-NO bruker mellomrom/NBSP og minustegn). */
function numberIn(text: string): number {
  const m = text.replace(/[  \s]/g, '').match(/[−-]?\d+(?:[.,]\d+)?/);
  if (!m) throw new Error(`Fant ikke tall i «${text}»`);
  return Number(m[0].replace('−', '-').replace(',', '.'));
}

async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(ok, `Horisontal rulling på ${page.url()}`).toBe(true);
}

async function signIn(page: Page, base: string) {
  await page.goto(`/#${base}/logg-inn`);
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(new RegExp(`#${base}/oversikt`));
}

async function openElvekanten(page: Page, base: string) {
  await signIn(page, base);
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`#${base}/objekter/`));
  if (base === INV) await expect(page.getByTestId('inv-maxbid')).toBeVisible();
}

const value = async (page: Page, testId: string) => Number(await page.getByTestId(testId).first().getAttribute('data-value'));
const floorK = (n: number) => Math.floor(n / 1000) * 1000;

test.describe('Investment: ruting og galleri', () => {
  test('åpnes fra galleriet, direkte, ved oppdatering og som dyp lenke i ny fane', async ({ page }) => {
    await page.goto('/#/design');
    await page.getByTestId('variant-investment').getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`#${INV}`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/hvor høyt du kan by/i);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/hvor høyt du kan by/i);

    await openElvekanten(page, INV);
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId('inv-maxbid')).toBeVisible();
    const fresh = await page.context().newPage();
    await fresh.goto(url);
    await expect(fresh.getByTestId('inv-maxbid')).toBeVisible();
    await fresh.close();
  });

  test('ukjent adresse gir en tydelig feilside med vei tilbake', async ({ page }) => {
    await page.goto(`/#${INV}/finnes-ikke`);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByRole('link').first()).toBeVisible();
  });

  test('bytte mellom Original, Finance og Investment bevarer økten og rutingen', async ({ page }) => {
    await signIn(page, '');
    await page.goto(`/#${INV}/oversikt`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Pipeline/);
    await page.goto('/#/design/finance/oversikt');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Investeringsoversikt/);
    await page.goto('/#/oversikt');
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(/Pipeline|Investeringsoversikt/);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Investeringsoversikt/);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Pipeline/);
  });
});

test.describe('Investment: forside og pipeline', () => {
  test('forside: FINN-felt og levende eksempelcase', async ({ page }) => {
    await page.goto(`/#${INV}`);
    await expect(page.getByLabel(/FINN-lenke/).first()).toBeVisible();
    await expect(page.getByTestId('inv-home-maxbid')).toBeVisible();
    // tallet animeres inn, men det endelige tallet står alltid i data-value
    expect(await value(page, 'inv-home-maxbid')).toBeGreaterThan(1_000_000);
    await noHorizontalScroll(page);
  });

  test('pipeline: tabell på bred skjerm og kort på smal, oppsummering og aldri 0 for ukjent', async ({ page }, info) => {
    await signIn(page, INV);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Pipeline/);
    await expect(page.getByRole('region', { name: /Oppsummering av pipeline/ })).toContainText(/Samlet egenkapitalbehov/);
    await expect(page.getByRole('region', { name: /Oppsummering av pipeline/ })).toContainText(/Snitt prosjektavkastning/);
    if (info.project.name === 'mobil') {
      await expect(page.getByTestId('inv-cards')).toBeVisible();
      await expect(page.getByTestId('inv-table')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('inv-table')).toBeVisible();
      await expect(page.getByTestId('inv-row')).toHaveCount(9);
      const head = page.getByRole('columnheader', { name: /Fortjeneste/ });
      await expect(head).toHaveAttribute('aria-sort', /descending|ascending/);
    }
    await expect(page.getByText('Mangler grunnlag').first()).toBeVisible();
    await noHorizontalScroll(page);
  });
});

test.describe('Investment: objektside', () => {
  test('investeringscase først: maksbud, grenser, nøkkeltall, scorecard og oppside/nedside', async ({ page }, info) => {
    await openElvekanten(page, INV);
    expect(await value(page, 'inv-maxbid')).toBeGreaterThan(0);
    await expect(page.getByTestId('inv-maxbid-reason')).toContainText(/begrenses av/i);
    // maksbudet ligger i første skjermbilde – også på mobil
    const box = await page.getByTestId('inv-maxbid').boundingBox();
    expect(box && box.y < page.viewportSize()!.height, 'Anbefalt maksbud skal ligge i første skjermbilde').toBe(true);
    for (const id of ['inv-profit', 'inv-return', 'inv-hourly', 'inv-equity', 'inv-sale']) await expect(page.getByTestId(id)).toBeAttached();
    await expect(page.getByTestId('inv-limits').locator('li')).not.toHaveCount(0);
    await expect(page.getByTestId('inv-limits')).toContainText(/Til informasjon/);
    await expect(page.getByText('Hva begrenser budet?')).toBeVisible();
    await expect(page.getByText('Oppside og nedside')).toBeVisible();
    // scorecard: seks vurderinger med tekst og forklaring
    for (const id of ['okonomi', 'marked', 'gjennomforbarhet', 'kapital', 'risiko', 'arbeid']) {
      const card = page.getByTestId(`inv-score-${id}`);
      await expect(card).toBeVisible();
      await expect(page.getByTestId(`inv-score-${id}-text`)).not.toBeEmpty();
    }
    await expect(page.getByTestId('inv-scorecard').locator('li')).toHaveCount(6);
    await expect(page.getByTestId('inv-cost')).toBeVisible();
    if (info.project.name === 'mobil') await expect(page.getByTestId('inv-scenario-base')).toBeVisible();
    else await expect(page.getByTestId('inv-scenarios')).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('alle diagrammer har et tallalternativ som kan åpnes', async ({ page }) => {
    await openElvekanten(page, INV);
    const toggles = page.locator('figure details > summary');
    expect(await toggles.count()).toBeGreaterThanOrEqual(4);
    await page.getByTestId('inv-cost').locator('xpath=ancestor::figure[1]').locator('details > summary').click();
    await expect(page.getByRole('table', { name: 'Kostnadsfordeling' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Kostnadsfordeling' })).toContainText('Kjøpspris');
  });

  test('scenarioer som delta: alternativene viser netto oppside/nedside og kan tas i bruk', async ({ page }) => {
    await openElvekanten(page, INV);
    const nets = page.getByTestId('inv-delta-net');
    await expect(nets).toHaveCount(2);
    await expect(nets.first()).toContainText(/netto (oppside|nedside)/);
    const before = await value(page, 'inv-maxbid');
    await page.locator('button:visible', { hasText: 'Bruk i kalkylen' }).first().click();
    await expect.poll(() => value(page, 'inv-maxbid')).not.toBe(before);
    await expect(page.getByText('Ulagrede endringer').locator('visible=true').first()).toBeVisible();
    await page.getByRole('button', { name: /Tilbakestill til grunnlag/ }).first().click();
    await expect(page.getByTestId('inv-maxbid')).toBeVisible();
  });

  test('sensitivitet: glideren forhåndsviser via motoren og kan brukes i kalkylen', async ({ page }) => {
    await openElvekanten(page, INV);
    const profit0 = await value(page, 'inv-profit');
    const slider = page.getByTestId('inv-price-slider');
    await slider.focus();
    const price0 = numberIn(await page.getByTestId('inv-preview-price').innerText());
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    const price1 = numberIn(await page.getByTestId('inv-preview-price').innerText());
    expect(price1).toBeLessThan(price0);
    // lavere kjøpspris gir høyere fortjeneste i forhåndsvisningen, og kalkylen (hero) er uendret før den brukes
    const readout = await page.getByTestId('inv-preview-readout').innerText();
    expect(numberIn(readout.split('\n').find((l) => /kr/.test(l)) ?? readout)).toBeGreaterThan(profit0);
    expect(await value(page, 'inv-profit')).toBe(profit0);
    await page.getByRole('button', { name: /som kjøpspris i kalkylen/ }).click();
    await expect.poll(() => value(page, 'inv-profit')).toBeGreaterThan(profit0);
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const field = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
    await expect(field).toHaveValue(new RegExp(String(price1).replace(/(\d)(?=(\d{3})+$)/g, '$1\\s?')));
  });

  test('tabell for sensitivitet: raden for dagens kjøpspris er lik kalkylen', async ({ page }) => {
    await openElvekanten(page, INV);
    const profit = await value(page, 'inv-profit');
    const row = page.getByTestId('inv-sens-table').locator('tr[aria-current="true"]');
    await expect(row).toHaveCount(1);
    expect(numberIn((await row.locator('td').first().innerText()) as string)).toBe(Math.round(profit));
  });

  test('marked: oversikt, referanser på akse (tastaturvennlig) og tydelig merking av aktive annonser', async ({ page }) => {
    await openElvekanten(page, INV);
    await page.getByRole('tab', { name: 'Marked' }).click();
    await expect(page.getByTestId('inv-market-values')).toBeVisible();
    expect(await value(page, 'inv-market-base')).toBeGreaterThan(0);
    await expect(page.getByTestId('inv-ref').first()).toBeVisible();
    const points = page.locator('svg[role="group"] g[role="button"]');
    expect(await points.count()).toBeGreaterThan(2);
    await points.first().focus();
    await expect(page.getByTestId('inv-strip-readout')).toContainText(/per m²/);
    await expect(page.getByText('Ikke faktisk salgspris').first()).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('risiko: base, downside og stress fra motoren, og seks dimensjoner', async ({ page }) => {
    await openElvekanten(page, INV);
    await page.getByRole('tab', { name: 'Risiko' }).click();
    await expect(page.getByTestId('inv-stress-summary')).toContainText(/Downside/);
    await expect(page.getByTestId('inv-stress-summary')).toContainText(/Stress/);
    await expect(page.getByTestId('inv-risk-dim')).toHaveCount(6);
    await expect(page.getByTestId('inv-risk-meter')).toContainText(/risiko|Uavklart/i);
    await noHorizontalScroll(page);
  });
});

test.describe('Investment: kalkulator og private overstyringer', () => {
  test('levende resultat følger feltene, og feltet kan tilbakestilles til grunnlaget', async ({ page }, info) => {
    await openElvekanten(page, INV);
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    for (const g of ['g-kjop', 'g-oppussing', 'g-finans', 'g-salg', 'g-mal']) await expect(page.getByTestId(`inv-group-${g}`)).toBeVisible();
    const profit0 = await value(page, 'inv-calc-profit');
    const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
    await price.fill('2 750 000');
    await price.blur();
    await expect.poll(() => value(page, 'inv-calc-profit')).toBeGreaterThan(profit0);
    // hero og kalkulator viser samme tall
    expect(await value(page, 'inv-calc-profit')).toBe(await value(page, 'inv-profit'));
    if (info.project.name === 'mobil') await expect(page.getByTestId('inv-calc-strip')).toBeVisible();
    await expect(page.getByText('Din verdi').first()).toBeVisible();
    await page.getByRole('button', { name: /Tilbakestill Kjøpspris \(kontant\) til grunnlag/ }).click();
    await expect(price).toHaveValue(/2\s?890\s?000/);
  });
});

/** Les de seks nøkkeltallene fra hver variant. Original: kalkylefanen. Finance: beslutningstoppen. Investment: investeringscaset. */
async function readOriginal(page: Page) {
  await page.goto('/#/oversikt');
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await page.getByRole('tab', { name: 'Kalkyle' }).click();
  const td = (label: RegExp) => page.locator('tr', { has: page.locator('th', { hasText: label }) }).first().locator('td').first();
  return {
    profit: numberIn(await td(/^Resultat før skatt og eget arbeid/).innerText()),
    maxBid: numberIn(await page.getByTestId('recommended-maxbid').locator('td').first().innerText()),
    returnPct: numberIn(await td(/^Prosjektavkastning/).innerText()),
    hourly: numberIn(await td(/^Fortjeneste per egeninnsatstime/).innerText()),
    sale: numberIn(await td(/^Salgspris \(/).innerText()),
    equity: numberIn(await td(/^Egenkapitalbehov/).innerText()),
  };
}
async function readFinance(page: Page) {
  await page.goto('/#/design/finance/oversikt');
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  const t = async (id: string) => numberIn(await page.getByTestId(id).first().innerText());
  return { profit: await t('fin-profit'), maxBid: await t('fin-maxbid'), returnPct: await t('fin-return'), hourly: await t('fin-hourly'), sale: await t('fin-sale'), equity: await t('fin-equity') };
}
async function readInvestment(page: Page) {
  await page.goto(`/#${INV}/oversikt`);
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await expect(page.getByTestId('inv-maxbid')).toBeVisible();
  return {
    profit: Math.round(await value(page, 'inv-profit')),
    maxBid: floorK(await value(page, 'inv-maxbid')),
    returnPct2: Math.round((await value(page, 'inv-return')) * 10000) / 100,
    hourly: Math.round(await value(page, 'inv-hourly')),
    sale: Math.round(await value(page, 'inv-sale')),
    equity: Math.round(await value(page, 'inv-equity')),
  };
}

test.describe('Økonomisk paritet: Original, Finance og Investment viser identiske tall', () => {
  test('samme objekt, bruker og scenario – også etter privat overstyring', async ({ page }) => {
    await signIn(page, '');
    const check = async () => {
      const o = await readOriginal(page);
      const f = await readFinance(page);
      const i = await readInvestment(page);
      // Original viser maksbud med alle sifre; Finance og Investment viser det avrundet ned til hele tusen
      // Prosjektavkastning: Original viser to desimaler, Finance og Investment én (samme tall, ulik avrunding i visningen)
      expect({ ...f }).toEqual({ ...o, maxBid: floorK(o.maxBid), returnPct: Math.round(o.returnPct * 10) / 10 });
      const { returnPct2, ...iRest } = i;
      expect({ ...iRest, returnPct: returnPct2 }).toEqual({ ...o, maxBid: floorK(o.maxBid) });
      return o;
    };
    const before = await check();

    // Privat overstyring gjort i Investment og lagret – skal slå likt ut overalt
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
    await price.fill('2 700 000');
    await price.blur();
    await page.getByRole('button', { name: 'Lagre', exact: true }).first().click();
    await expect(page.getByText('Ulagrede endringer')).toHaveCount(0);
    const after = await check();
    expect(after.profit).not.toBe(before.profit);
    expect(after.profit).toBeGreaterThan(before.profit);
  });
});

/** Scenariosammenligningen (Basis, Alternativ A, Alternativ B) slik hver variant viser den. */
const SCENARIO_TITLES = ['Standardheving', 'Åpen løsning mellom kjøkken og stue', 'Tre rom (nytt soverom)'];
const firstNumber = (t: string) => numberIn(t.split('\n')[0]);

async function compareOriginal(page: Page) {
  await page.goto('/#/oversikt');
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await page.getByRole('tab', { name: 'Kalkyle' }).click();
  const rows = page.getByTestId('rank-row');
  await expect(rows).toHaveCount(3);
  const profit: Record<string, number> = {};
  const kt: Record<string, number> = {};
  for (let i = 0; i < 3; i++) {
    const row = rows.nth(i);
    const title = (await row.locator('.font-semibold').first().innerText()).trim();
    const dd = (label: string) => row.locator(`xpath=.//dt[normalize-space(.)="${label}"]/following-sibling::dd[1]`).innerText();
    profit[title] = numberIn(await dd('Fortjeneste før skatt'));
    kt[title] = numberIn(await dd('Per egeninnsatstime'));
  }
  const recommended = (await page.getByText(/Anbefalt scenario: /).first().innerText()).replace(/^.*Anbefalt scenario: /, '').split('.')[0].trim();
  return { profit: SCENARIO_TITLES.map((t) => profit[t]), hourly: SCENARIO_TITLES.map((t) => kt[t]), recommended };
}

async function tableRow(page: Page, tableId: string, label: RegExp) {
  const cells = page.getByTestId(tableId).locator('tr', { has: page.locator('th[scope="row"]', { hasText: label }) }).first().locator('td');
  const n = await cells.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(await cells.nth(i).innerText());
  return out;
}

async function compareFinance(page: Page) {
  await page.goto('/#/design/finance/oversikt');
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await expect(page.getByTestId('fin-scenarios')).toBeVisible();
  const profit = (await tableRow(page, 'fin-scenarios', /^Forventet fortjeneste/)).map(firstNumber);
  const hourly = (await tableRow(page, 'fin-scenarios', /^Per egeninnsatstime/)).map(firstNumber);
  const recommended = (await page.getByText('Beste scenario', { exact: true }).locator('xpath=following-sibling::dd[1]').innerText()).split('\n')[0].trim();
  return { profit, hourly, recommended };
}

async function compareInvestment(page: Page) {
  await page.goto(`/#${INV}/oversikt`);
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await expect(page.getByTestId('inv-scenarios')).toBeVisible();
  const price = (await tableRow(page, 'inv-scenarios', /^Kjøpspris/)).map(firstNumber);
  const profit = (await tableRow(page, 'inv-scenarios', /^Forventet fortjeneste/)).map(firstNumber);
  const hourly = (await tableRow(page, 'inv-scenarios', /^Per egeninnsatstime/)).map(firstNumber);
  const heroTags = await page.locator('#case').locator('xpath=ancestor::section[1]').innerText();
  const recommended = /Anbefalt scenario/.test(heroTags) ? (heroTags.match(/Scenario i bruk: ([^\n]+)/)?.[1] ?? '').trim() : (heroTags.match(/Anbefalt: ([^\n]+)/)?.[1] ?? '').trim();
  return { price, profit, hourly, recommended };
}

test.describe('Økonomisk paritet i scenariosammenligningen (felles produktlogikk)', () => {
  test('Basis, A og B har samme kjøpspris som kalkylen, og alle tre variantene viser identiske tall og anbefalt scenario', async ({ page }, info) => {
    test.skip(info.project.name === 'mobil', 'Tabellene sammenlignes på desktop; logikken er den samme på mobil');
    await signIn(page, '');
    const o = await compareOriginal(page);
    const f = await compareFinance(page);
    const i = await compareInvestment(page);
    // kjøpsprisen i sammenligningen: brukerens kalkyle (2 950 000), ikke analysens grunnlag (2 890 000), for alle tre scenarioene
    expect(i.price).toEqual([2_950_000, 2_950_000, 2_950_000]);
    // fortjeneste og kr/time per scenario er identiske i alle varianter
    expect(f.profit).toEqual(o.profit);
    expect(i.profit).toEqual(o.profit);
    expect(f.hourly).toEqual(o.hourly);
    expect(i.hourly).toEqual(o.hourly);
    // alternativene er regnet ved samme pris som Basis (de lå tidligere 60 000 kr lavere i pris og dermed langt høyere i fortjeneste)
    expect(o.profit[0]).toBe(172_600);
    expect(o.profit[1]).toBeLessThan(126_615 - 55_000);
    // anbefalt scenario er det samme
    expect(o.recommended).toBe('Standardheving');
    expect(f.recommended).toBe('Standardheving');
    expect(i.recommended).toBe('Standardheving');
  });

  test('Investment viser ingen «ulik kjøpspris»-advarsel i vanlig Basis/A/B-sammenligning', async ({ page }) => {
    await openElvekanten(page, INV);
    await expect(page.getByTestId('inv-delta-net')).toHaveCount(2);
    await expect(page.getByTestId('inv-delta-price-note')).toHaveCount(0);
    await expect(page.getByText(/Ulik kjøpspris i kalkylene/)).toHaveCount(0);
    await expect(page.getByText('Kjøpspris og kjøpskostnader')).toHaveCount(0);
  });

  test('«Bruk i kalkylen» beholder privat kjøpspris og rente, og sammenligningen følger den nye kalkylen', async ({ page }) => {
    await openElvekanten(page, INV);
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const set = async (name: string, v: string) => {
      const f = page.getByRole('textbox', { name, exact: true });
      await f.fill(v);
      await f.blur();
    };
    await set('Kjøpspris (kontant)', '3 100 000');
    await set('Rente', '7,2');
    await page.locator('button:visible', { hasText: 'Bruk i kalkylen' }).first().click();
    await expect(page.getByRole('textbox', { name: 'Kjøpspris (kontant)', exact: true })).toHaveValue(/3\s?100\s?000/);
    await expect(page.getByRole('textbox', { name: 'Rente', exact: true })).toHaveValue(/7,2/);
    const price = (await tableRow(page, 'inv-scenarios', /^Kjøpspris/)).map(firstNumber);
    expect(price).toEqual([3_100_000, 3_100_000, 3_100_000]);
    await expect(page.getByTestId('inv-delta-price-note')).toHaveCount(0);
  });
});

test.describe('Fellesgjeld ved salg: samme konsistente tall i Original, Finance og Investment', () => {
  test('gjeld 200 000: totalverdien (4 050 000) beholdes, kontant = 3 850 000, og alle tre variantene viser identiske tall', async ({ page }, info) => {
    test.skip(info.project.name === 'mobil', 'Tabellene sammenlignes på desktop; logikken er den samme på mobil');
    await signIn(page, '');
    const before = await compareOriginal(page);

    // Brukeren endrer fellesgjeld ved salg i Investment-kalkylen og lagrer. Feltet bruker den felles logikken.
    await page.goto(`/#${INV}/oversikt`);
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    await expect(page.getByTestId('inv-maxbid')).toBeVisible();
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const debt = page.getByRole('textbox', { name: 'Fellesgjeld ved salg', exact: true });
    await debt.fill('200 000');
    await debt.blur();
    await expect.poll(() => value(page, 'inv-sale')).toBe(3_850_000);
    expect(Math.round(await value(page, 'inv-profit'))).toBe(172_600 - 200_000);
    await page.getByRole('button', { name: 'Lagre', exact: true }).first().click();
    await expect(page.getByText('Ulagrede endringer')).toHaveCount(0);

    // Alle tre variantene: samme kontant salgsverdi, fortjeneste, avkastning, kr/time, EK-behov, maksbud og scenarioer
    const o = await readOriginal(page);
    const f = await readFinance(page);
    const i = await readInvestment(page);
    expect(o.sale).toBe(3_850_000);
    expect(o.sale + 200_000).toBe(4_050_000); // totalverdien er uendret
    expect(o.profit).toBe(-27_400);
    expect({ ...f }).toEqual({ ...o, maxBid: floorK(o.maxBid), returnPct: Math.round(o.returnPct * 10) / 10 });
    const { returnPct2, ...iRest } = i;
    expect({ ...iRest, returnPct: returnPct2 }).toEqual({ ...o, maxBid: floorK(o.maxBid) });

    const oc = await compareOriginal(page);
    const fc = await compareFinance(page);
    const ic = await compareInvestment(page);
    expect(fc.profit).toEqual(oc.profit);
    expect(ic.profit).toEqual(oc.profit);
    expect(fc.hourly).toEqual(oc.hourly);
    expect(ic.hourly).toEqual(oc.hourly);
    expect(fc.recommended).toBe(oc.recommended);
    expect(ic.recommended).toBe(oc.recommended);
    // Basis, A og B beholder hver sin totalverdi og bruker samme gjeld: hver er nøyaktig 200 000 lavere i kontantsalg og fortjeneste
    oc.profit.forEach((p, k) => expect(p, `scenario ${k}`).toBe(before.profit[k] - 200_000));
    expect(ic.price).toEqual([2_950_000, 2_950_000, 2_950_000]);
  });
});

test.describe('Investment: bevegelse', () => {
  test('tall som endres animeres og får et lysglimt – og det hoppes over med «reduser bevegelse»', async ({ browser }) => {
    for (const reduce of [false, true]) {
      const ctx = await browser.newContext({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      await openElvekanten(page, INV);
      const before = await value(page, 'inv-maxbid');
      await page.locator('button:visible', { hasText: 'Bruk i kalkylen' }).first().click();
      await expect.poll(() => value(page, 'inv-maxbid')).not.toBe(before);
      const flashing = await page.getByTestId('inv-maxbid').locator('.inv-flash').count();
      if (reduce) expect(flashing, 'Ingen lysglimt med redusert bevegelse').toBe(0);
      else expect(flashing).toBeGreaterThan(0);
      const longest = await page.evaluate(() => {
        const root = document.querySelector('.inv') as HTMLElement;
        const parse = (v: string) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1)));
        return Math.max(0, ...Array.from(root.querySelectorAll('a, button, input, svg, span')).map((e) => parse(getComputedStyle(e).transitionDuration)));
      });
      if (reduce) expect(longest).toBeLessThan(0.05);
      await ctx.close();
    }
  });
});

test.describe('Tilgjengelighet i Investment', () => {
  test('tastatur: faner med piltaster, glider, referansepunkter og navn på alle knapper og lenker', async ({ page }) => {
    await openElvekanten(page, INV);
    await page.getByRole('tab', { name: 'Sammendrag' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Kalkyle' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Visninger og bud' })).toHaveAttribute('aria-selected', 'true');
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll('button, a[href], input, select')).filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('title') || (e as HTMLElement).innerText || e.textContent || (e as HTMLInputElement).labels?.length || e.getAttribute('aria-labelledby') || '').toString().trim()).length);
    expect(unnamed).toBe(0);
    // diagrammer har tekstalternativ (role/label)
    const svgs = await page.evaluate(() => Array.from(document.querySelectorAll('main svg')).filter((s) => !s.closest('button') && !s.getAttribute('aria-hidden') && !s.getAttribute('aria-label') && !s.getAttribute('role')).length);
    expect(svgs, 'SVG-diagrammer uten aria-label eller rolle').toBe(0);
  });

  test('berøringsflater på mobil er minst 44 px for faner og handlinger', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobil', 'Gjelder mobil');
    await openElvekanten(page, INV);
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main [role="tab"], main button, main summary'))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < 43.5;
        })
        .map((e) => `${e.tagName}:${(e.textContent || '').trim().slice(0, 30)}:${Math.round(e.getBoundingClientRect().height)}`),
    );
    expect(small, `For små berøringsflater: ${small.join(' | ')}`).toEqual([]);
  });

  test('kontrast: tekst mot bakgrunn oppfyller WCAG AA på alle Investment-flater', async ({ page }) => {
    const failures: string[] = [];
    const scan = async (label: string) => {
      await expect(page.locator('.inv').first()).toBeVisible();
      await page.waitForTimeout(450); // la fargeoverganger (faner) bli ferdige
      const f = await page.evaluate(() => {
        // Nettleseren normaliserer alle fargeformater (også oklch/color-mix fra Tailwind) via canvas
        const ctx2d = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        const parse = (c: string) => {
          if (!c || c === 'transparent') return null;
          ctx2d.clearRect(0, 0, 1, 1);
          ctx2d.fillStyle = '#000';
          ctx2d.fillStyle = c;
          ctx2d.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx2d.getImageData(0, 0, 1, 1).data;
          return { r, g, b, a: a / 255 };
        };
        const lin = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const lum = (c: { r: number; g: number; b: number }) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
        const mix = (fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number }) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) });
        const bgOf = (el: Element) => {
          // Gradienter: bruk den lyseste fargen i .inv-dark (verste tilfelle for lys tekst)
          let bg = { r: 238, g: 242, b: 247 };
          const stack: Element[] = [];
          for (let a: Element | null = el; a; a = a.parentElement) stack.push(a);
          for (const a of stack.reverse()) {
            const cs = getComputedStyle(a);
            if (a.classList.contains('inv-dark')) bg = { r: 23, g: 41, b: 74 };
            const c = parse(cs.backgroundColor);
            if (c && c.a > 0 && !a.classList.contains('inv-dark')) bg = mix(c, bg);
          }
          return bg;
        };
        const out: string[] = [];
        const walker = document.createTreeWalker(document.querySelector('.inv')!, NodeFilter.SHOW_TEXT);
        const seen = new Set<Element>();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || seen.has(el) || !(n.textContent || '').trim()) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('.sr-only, [aria-hidden="true"], option, select, svg, dialog:not([open]), details:not([open]) > :not(summary)')) continue;
          if (el.closest('[disabled], :disabled')) continue;
          const fg = parse(cs.color);
          if (!fg) continue;
          const bg = bgOf(el);
          const f = mix(fg, bg);
          const L1 = lum(f);
          const L2 = lum(bg);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) out.push(`${(n.textContent || '').trim().slice(0, 40)} [${ratio.toFixed(2)}:1, ${cs.color}]`);
        }
        return out;
      });
      failures.push(...f.map((x) => `${label}: ${x}`));
    };
    await page.goto(`/#${INV}`);
    await scan('forside');
    await signIn(page, INV);
    await scan('pipeline');
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    await expect(page.getByTestId('inv-maxbid')).toBeVisible();
    await scan('objekt');
    for (const tab of ['Kalkyle', 'Marked', 'Risiko']) {
      await page.getByRole('tab', { name: tab }).click();
      await scan(`fane ${tab}`);
    }
    expect(failures, failures.slice(0, 12).join('\n')).toEqual([]);
  });
});

test.describe('Investment: kanttilfeller og smale skjermer', () => {
  test('ingen sideveis rulling på noen flate', async ({ page }) => {
    await page.goto(`/#${INV}`);
    await noHorizontalScroll(page);
    await openElvekanten(page, INV);
    await noHorizontalScroll(page);
    for (const tab of ['Kalkyle', 'Marked', 'Risiko', 'Oppussing', 'Rapport og kilder', 'Visninger og bud']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    for (const path of ['/kalender', '/sammenligning', '/konto', '/kurs', '/import']) {
      await page.goto(`/#${INV}${path}`);
      await noHorizontalScroll(page);
    }
  });

  test('320 px: ingen overflow, og negative og store tall er lesbare', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openElvekanten(page, INV);
    await noHorizontalScroll(page);
    // negativ fortjeneste: gjør kjøpsprisen høy og lagre ikke – bare se på utkastet
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
    await price.fill('24 500 000');
    await price.blur();
    await expect.poll(() => value(page, 'inv-profit')).toBeLessThan(0);
    await noHorizontalScroll(page);
    await expect(page.getByTestId('inv-profit')).toContainText(/[−-]/);
    for (const tab of ['Marked', 'Risiko']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
  });
});
