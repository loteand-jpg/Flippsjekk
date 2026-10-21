import { expect, test, type Page } from '@playwright/test';

const PROP = '/design/property';
const INV = '/design/investment';

/** Tall fra en tekst som «2 733 000 kr» eller «−2 930 800 kr» (nb-NO bruker mellomrom/NBSP og minustegn). */
function numberIn(text: string): number {
  const m = text.replace(/[  \s]/g, '').match(/[−-]?\d+(?:[.,]\d+)?/);
  if (!m) throw new Error(`Fant ikke tall i «${text}»`);
  return Number(m[0].replace('−', '-').replace(',', '.'));
}

async function noHorizontalScroll(page: Page) {
  const probe = () =>
    page.evaluate(() => {
      const vw = window.innerWidth;
      const wide = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          if (el.getBoundingClientRect().right <= vw + 1) return false;
          // innhold i et eget rullbart område (overflow-x: auto/scroll) gjør ikke siden bredere
          for (let a = el.parentElement; a; a = a.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) return false;
          return true;
        })
        .slice(0, 6)
        .map((el) => `${el.tagName.toLowerCase()}[${(el.className?.toString?.() || '').slice(0, 50)}] «${(el.textContent || '').trim().slice(0, 30)}»`);
      const spill = wide.length
        ? []
        : Array.from(document.querySelectorAll('body *'))
            .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0)
            .slice(0, 14)
            .map((el) => `${el.tagName.toLowerCase()}[${(el.className?.toString?.() || '').slice(0, 40)}] sw=${el.scrollWidth} cw=${el.clientWidth}`);
      return { ok: document.documentElement.scrollWidth <= vw + 1, vw, sw: document.documentElement.scrollWidth, wide: [...wide, ...spill] };
    });
  // Laster innhold inn under målingen, så vi venter til siden har satt seg – men en vedvarende overflow feiler.
  let r = await probe();
  for (let i = 0; i < 8 && !r.ok; i++) {
    await page.waitForTimeout(150);
    r = await probe();
  }
  expect(r.ok, `Horisontal rulling på ${page.url()} (${r.sw} > ${r.vw}): ${r.wide.join(' | ')}`).toBe(true);
}

async function signIn(page: Page, base: string) {
  await page.goto(`/#${base}/logg-inn`);
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(new RegExp(`#${base}/oversikt`));
}

async function openObject(page: Page, name = 'Elvekanten 17 B') {
  await page.getByRole('link', { name: new RegExp(name) }).first().click();
  await expect(page).toHaveURL(new RegExp(`#${PROP}/objekter/`));
  await expect(page.getByTestId('prop-opportunity')).toBeVisible();
}

async function openElvekanten(page: Page) {
  await signIn(page, PROP);
  await openObject(page);
}

/** Prosjektøkonomien ligger i en fast sidestolpe på desktop og bak en stripe på mobil: åpne stripen om den er lukket. */
async function openEconomy(page: Page) {
  const toggle = page.getByTestId('prop-econ-toggle');
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  await expect(page.getByTestId('prop-econ')).toBeVisible();
}

const value = async (page: Page, testId: string) => Number(await page.getByTestId(testId).first().getAttribute('data-value'));
const floorK = (n: number) => Math.floor(n / 1000) * 1000;

const versionTab = (page: Page, i: number) => page.getByTestId('prop-version-tab').nth(i);

test.describe('Property: ruting og galleri', () => {
  test('galleriet viser alle fire varianter, og Property åpnes fra galleriet, direkte, ved oppdatering og som dyp lenke', async ({ page }) => {
    await page.goto('/#/design');
    for (const id of ['original', 'finance', 'investment', 'property']) await expect(page.getByTestId(`variant-${id}`)).toBeVisible();
    await expect(page.getByTestId('variant-property')).toContainText(/Tilgjengelig/);
    await page.getByTestId('variant-property').getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`#${PROP}`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Se potensialet før du byr/);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Se potensialet før du byr/);

    await openElvekanten(page);
    const url = page.url();
    expect(url).toContain(`#${PROP}/objekter/`);
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId('prop-opportunity')).toBeVisible();
    const fresh = await page.context().newPage();
    await fresh.goto(url);
    await expect(fresh.getByTestId('prop-opportunity')).toBeVisible();
    await fresh.close();
  });

  test('underruter: /oversikt og /objekter/<id>, og ukjent adresse gir en tydelig feilside med vei tilbake', async ({ page }) => {
    await signIn(page, PROP);
    await page.goto(`/#${PROP}/oversikt`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hva kan de bli/);
    await page.goto(`/#${PROP}/finnes-ikke`);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByRole('link').first()).toBeVisible();
  });

  test('bytte mellom alle fire variantene bevarer økten og rutingen (også frem og tilbake)', async ({ page }) => {
    await signIn(page, '');
    await page.goto(`/#${PROP}/oversikt`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hva kan de bli/);
    await page.goto(`/#${INV}/oversikt`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Pipeline/);
    await page.goto('/#/design/finance/oversikt');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Investeringsoversikt/);
    await page.goto('/#/oversikt');
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(/Pipeline|Investeringsoversikt|Hva kan de bli/);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Investeringsoversikt/);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Pipeline/);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hva kan de bli/);
  });

  test('«Designforslag» i Property tar deg tilbake til galleriet', async ({ page }) => {
    await page.goto(`/#${PROP}`);
    await page.getByRole('link', { name: 'Designforslag' }).last().click();
    await expect(page).toHaveURL(/#\/design$/);
    await expect(page.getByTestId('variant-property')).toBeVisible();
  });
});

test.describe('Property: forside og boligliste', () => {
  test('forside: FINN-felt, eksempel «fra dette → til dette» merket som demodata, og ingen bilder', async ({ page }) => {
    await page.goto(`/#${PROP}`);
    await expect(page.getByLabel(/FINN-lenke/).first()).toBeVisible();
    const ex = page.getByTestId('prop-home-example');
    await expect(ex).toBeVisible();
    await expect(ex).toContainText(/Eksempel · demodata/);
    await expect(ex).toContainText(/Fra dette/);
    await expect(ex).toContainText(/Til dette/);
    await expect(ex).toContainText(/2\s*soverom/);
    await expect(ex).toContainText(/3\s*soverom/);
    await expect(page.locator('main img')).toHaveCount(0);
    await noHorizontalScroll(page);
  });

  test('boligliste: tabell på bred skjerm og store kort på smal, plassholder i stedet for bilde, og aldri 0 for ukjent', async ({ page }, info) => {
    await signIn(page, PROP);
    await expect(page.getByTestId('prop-summary')).toContainText(/aktive boliger/);
    if (info.project.name === 'mobil') {
      await expect(page.getByTestId('prop-cards')).toBeVisible();
      await expect(page.getByTestId('prop-table')).toHaveCount(0);
      await expect(page.getByTestId('prop-cards').locator('li')).toHaveCount(9);
    } else {
      await expect(page.getByTestId('prop-table')).toBeVisible();
      await expect(page.getByTestId('prop-row')).toHaveCount(9);
      await expect(page.getByRole('columnheader', { name: /Fortjeneste/ })).toHaveAttribute('aria-sort', /descending|ascending/);
      for (const h of [/Bolig og sluttprodukt/, /Salgsverdi/, /Maksbud/, /Risiko/, /Visning/]) await expect(page.getByRole('columnheader', { name: h })).toBeVisible();
    }
    // ingen bilder (datamodellen har ingen) – plassholderne er merkede ikoner
    await expect(page.locator('main img')).toHaveCount(0);
    await expect(page.getByRole('img', { name: /Bilde mangler/ }).first()).toBeVisible();
    // sluttproduktet fra analysen vises for Elvekanten
    await expect(page.getByText(/2 soverom/).first()).toBeVisible();
    await expect(page.getByText('Mangler grunnlag').first()).toBeVisible();
    await noHorizontalScroll(page);
  });
});

test.describe('Property: objektside', () => {
  test('første skjermbilde: boligen, anbefalt versjon, maksbud og fortjeneste – også på mobil', async ({ page }, info) => {
    await openElvekanten(page);
    const vh = page.viewportSize()!.height;
    await expect(page.getByTestId('prop-title')).toHaveText('Elvekanten 17 B');
    await expect(page.getByTestId('prop-facts')).toContainText(/58 m²/);
    await expect(page.getByTestId('prop-hero-version')).toHaveText('Standardheving');
    await expect(page.getByTestId('prop-opportunity')).toContainText(/Anbefalt versjon/);
    await expect(page.getByTestId('prop-hero-placeholder')).toBeVisible();
    // maksbudet ligger i første skjermbilde; på mobil ligger maksbud og fortjeneste også i stripen nederst
    const bid = await page.getByTestId('prop-hero-maxbid').boundingBox();
    expect(bid && bid.y + bid.height < vh, 'Anbefalt maksbud skal ligge i første skjermbilde').toBe(true);
    if (info.project.name === 'mobil') {
      const bar = page.getByTestId('prop-econ-bar');
      await expect(bar).toBeVisible();
      await expect(page.getByTestId('prop-bar-maxbid')).toContainText(/\d/);
      await expect(page.getByTestId('prop-bar-profit')).toContainText(/\d/);
      const b = await bar.boundingBox();
      expect(b && b.y + b.height <= vh + 1, 'Stripen skal være innenfor skjermen').toBe(true);
    } else {
      await expect(page.getByTestId('prop-econ-aside')).toBeVisible();
    }
    expect(await value(page, 'prop-hero-maxbid')).toBeGreaterThan(0);
    await noHorizontalScroll(page);
  });

  test('bilde og plantegning er tydelig merkede plassholdere, og ingen bilder er oppdiktet', async ({ page }) => {
    await openElvekanten(page);
    await expect(page.getByText('Annonsebilde kommer fra datakilden').first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Plassholder for annonsebilde av Elvekanten 17 B/ })).toBeVisible();
    await page.getByTestId('prop-fromto').scrollIntoViewIfNeeded();
    await expect(page.getByText('Plantegning ikke tilgjengelig i demo')).toHaveCount(2);
    await expect(page.getByRole('img', { name: /Plassholder for plantegning: Dagens planløsning/ })).toBeVisible();
    await expect(page.getByTestId('prop-after').getByRole('img', { name: /Plassholder for plantegning/ })).toBeVisible();
    // ingen <img> i innholdet: ingen bilder fra nettet og ingen genererte rom
    await expect(page.locator('main img')).toHaveCount(0);
  });

  test('«Hva kan boligen bli?»: tre versjoner, deltaer mot Basis og forhåndsvisning som ikke endrer kalkylen', async ({ page }) => {
    await openElvekanten(page);
    await expect(page.getByTestId('prop-version-tab')).toHaveCount(3);
    await expect(versionTab(page, 0)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('prop-delta')).toHaveCount(0); // Basis er utgangspunktet
    await openEconomy(page);
    const saleBasis = await value(page, 'prop-sale');
    const profitBasis = await value(page, 'prop-profit');

    await versionTab(page, 2).click();
    await expect(versionTab(page, 2)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('prop-version-title')).toHaveText('Tre rom (nytt soverom)');
    await expect(page.getByTestId('prop-hero-version')).toHaveText('Tre rom (nytt soverom)');
    await expect(page.getByTestId('prop-opportunity')).toContainText(/Forhåndsvisning/);
    await expect(page.getByTestId('prop-version-panel')).toContainText(/Ingenting er endret|ingenting er endret/);
    for (const f of ['invest', 'hours', 'months', 'sale', 'profit']) await expect(page.getByTestId(`prop-delta-${f}`)).toBeVisible();
    await expect(page.getByTestId('prop-delta-sale')).toContainText(/\+/);
    // økonomien følger versjonen
    await openEconomy(page);
    await expect.poll(() => value(page, 'prop-sale')).not.toBe(saleBasis);
    expect(await value(page, 'prop-sale')).toBeGreaterThan(saleBasis);
    // fra dette → til dette viser soverom og endring
    await expect(page.getByTestId('prop-after-bedrooms')).toContainText(/3/);
    await expect(page.getByTestId('prop-after-bedrooms')).toContainText(/\+1 soverom/);
    // forhåndsvisning: kalkylen din (og lagringsstatus) er uendret
    await expect(page.getByTestId('prop-dirty')).toHaveCount(0);

    // tilbake til Basis: tallene er nøyaktig som før
    await versionTab(page, 0).click();
    await openEconomy(page);
    await expect.poll(() => value(page, 'prop-sale')).toBe(saleBasis);
    expect(await value(page, 'prop-profit')).toBe(profitBasis);
  });

  test('«Bruk i kalkylen» tar versjonen i bruk (ulagret) og kan tilbakestilles', async ({ page }) => {
    await openElvekanten(page);
    await versionTab(page, 2).click();
    await page.getByRole('button', { name: 'Bruk i kalkylen' }).filter({ visible: true }).first().click();
    await expect(page.getByTestId('prop-dirty')).toBeVisible();
    await expect(page.getByTestId('prop-opportunity')).toContainText(/I din kalkyle/);
    await page.getByRole('button', { name: /Tilbakestill til grunnlag/ }).first().click();
    await expect(page.getByTestId('prop-opportunity')).toBeVisible();
  });

  test('versjonsvelgeren virker med tastatur: piltaster, Home og End', async ({ page }) => {
    await openElvekanten(page);
    await versionTab(page, 0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(versionTab(page, 1)).toHaveAttribute('aria-selected', 'true');
    await expect(versionTab(page, 1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(versionTab(page, 2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(versionTab(page, 0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(versionTab(page, 0)).toBeFocused();
    // panelet er koblet til fanen
    await expect(page.getByTestId('prop-version-panel')).toHaveAttribute('aria-labelledby', /versjon-tab-/);
    // innholdsfortegnelsen er tastaturvennlig og flytter fokus til overskriften
    await page.getByTestId('prop-sectionnav').getByRole('button', { name: /Oppussing/ }).click();
    await expect(page.locator('#oppussing-t')).toBeFocused();
  });

  test('oppussing: etter rom, etter arbeidstype og mulig rekkefølge – summene stemmer med kalkylen', async ({ page }) => {
    await openElvekanten(page);
    await page.locator('#oppussing').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('prop-groups').locator('> li').first()).toBeVisible();
    const rooms = await page.getByTestId('prop-groups').locator('> li').count();
    expect(rooms).toBeGreaterThanOrEqual(3);
    // åpne alle og tell tiltak
    await page.getByRole('button', { name: /Vis alle tiltak/ }).click();
    expect(await page.getByTestId('prop-item').count()).toBeGreaterThanOrEqual(6);
    // sum + reserve = oppussing inkl. reserve, og samme tall som i sidestolpen
    const total = page.getByTestId('prop-reno-total');
    const nums = (await total.locator('dd').allInnerTexts()).map((t) => numberIn(t));
    expect(nums[0] + nums[1]).toBe(nums[2]);
    await openEconomy(page);
    expect(await value(page, 'prop-renovation')).toBe(nums[2]);
    await page.getByTestId('prop-reno-mode-arbeid').click();
    await expect(page.getByTestId('prop-groups').locator('> li').first()).toBeVisible();
    await page.getByTestId('prop-reno-mode-rekkefolge').click();
    await expect(page.getByTestId('prop-sequence-note')).toContainText(/ikke en tidsplan/);
    // summen er den samme i alle tre grupperinger
    const nums2 = (await page.getByTestId('prop-reno-total').locator('dd').allInnerTexts()).map((t) => numberIn(t));
    expect(nums2[0]).toBe(nums[0]);
    await noHorizontalScroll(page);
  });

  test('økonomi: kostnadsfordeling, «Hvor høyt kan du gå?» og resultat ved maksbud fra motoren', async ({ page }) => {
    await openElvekanten(page);
    await page.locator('#okonomi').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('prop-cost-breakdown')).toContainText(/Kjøpspris/);
    await expect(page.getByTestId('prop-howhigh')).toContainText(/Hvor høyt kan du gå/);
    const bid = numberIn(await page.getByTestId('prop-howhigh-bid').innerText());
    await openEconomy(page);
    expect(bid).toBe(await value(page, 'prop-maxbid'));
    await expect(page.getByTestId('prop-at-bid')).toContainText(/Begrensende faktor/);
    await expect(page.getByTestId('prop-at-bid')).toContainText(/Fortjenestemål|Timekrav|timekrav/);
    // ved maksbudet er fortjenesten minst målet (400 000 kr i demoen)
    expect(numberIn(await page.getByTestId('prop-at-bid-profit').innerText())).toBeGreaterThanOrEqual(400_000);
    await expect(page.getByTestId('prop-limits').locator('li')).not.toHaveCount(0);
    await noHorizontalScroll(page);
  });

  test('sidestolpen (desktop) og stripen (mobil) følger med uten å dekke innhold', async ({ page }, info) => {
    await openElvekanten(page);
    const vh = page.viewportSize()!.height;
    await page.locator('#risiko').scrollIntoViewIfNeeded();
    if (info.project.name === 'mobil') {
      const bar = page.getByTestId('prop-econ-bar');
      await expect(bar).toBeVisible();
      // stripen ligger over bunnmenyen, og den er innenfor skjermen
      const nav = (await page.getByTestId('prop-bottomnav').boundingBox())!;
      const b = (await bar.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(nav.y + 1);
      // helt nederst dekker verken stripe eller meny det siste innholdet
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      const lastBottom = await page.evaluate(() => {
        const root = document.querySelector('#detaljer')!.parentElement!;
        const kids = Array.from(root.children).filter((c) => !(c as HTMLElement).dataset.testid?.startsWith('prop-econ'));
        return Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
      });
      const barTop = (await bar.boundingBox())!.y;
      expect(lastBottom, 'Siste innhold skal ligge over stripen').toBeLessThanOrEqual(barTop + 1);
      // stripen kan foldes ut og inn, og viser alle linjene
      await bar.getByTestId('prop-econ-toggle').click();
      for (const id of ['prop-purchase', 'prop-renovation', 'prop-cost', 'prop-sale', 'prop-profit', 'prop-return', 'prop-hourly', 'prop-maxbid', 'prop-equity']) await expect(page.getByTestId(id)).toBeVisible();
      expect((await bar.boundingBox())!.height).toBeLessThan(vh * 0.8);
      await bar.getByTestId('prop-econ-toggle').click();
      await expect(page.getByTestId('prop-econ')).toHaveCount(0);
    } else {
      const aside = page.getByTestId('prop-econ-aside');
      const box = (await aside.boundingBox())!;
      expect(box.y, 'Sidestolpen skal følge med under rulling').toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(vh);
      // sidestolpen ligger ved siden av innholdet, ikke oppå det
      const main = (await page.locator('#risiko').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(main.x + main.width - 1);
      for (const id of ['prop-purchase', 'prop-renovation', 'prop-cost', 'prop-sale', 'prop-profit', 'prop-return', 'prop-hourly', 'prop-maxbid', 'prop-equity']) await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('marked: boligkort med primærreferanser først, og aktive annonser tydelig merket', async ({ page }) => {
    await openElvekanten(page);
    await page.locator('#marked').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('prop-market-summary')).toBeVisible();
    expect(numberIn(await page.getByTestId('prop-market-base').innerText())).toBeGreaterThan(1_000_000);
    const primary = page.locator('[data-testid="prop-ref"][data-role="primaer"]');
    expect(await primary.count()).toBeGreaterThanOrEqual(1);
    await expect(primary.first()).toContainText(/Solgt/);
    await expect(primary.first()).toContainText(/Match/);
    await expect(primary.first()).toContainText(/soverom/);
    const active = page.locator('[data-testid="prop-ref"][data-role="markedsreferanse"]');
    expect(await active.count()).toBeGreaterThanOrEqual(1);
    await expect(active.first()).toContainText('Aktiv annonse – ikke oppnådd salgspris');
    await expect(page.locator('#marked img')).toHaveCount(0);
    await noHorizontalScroll(page);
  });

  test('«Slik kan den selges»: spenn lavt–normalt–høyt og forsiktig språk (modellert, ikke garantert)', async ({ page }) => {
    await openElvekanten(page);
    await page.locator('#salg').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('prop-sell-range')).toContainText(/Lavt/);
    await expect(page.getByTestId('prop-sell-range')).toContainText(/Høyt/);
    await expect(page.getByTestId('prop-sell-basis')).toContainText(/primærreferanse/);
    const text = await page.locator('#salg').innerText();
    expect(text).toMatch(/Modellert og forventet/);
    expect(text).not.toMatch(/vil selges for|sikker gevinst|garantert gevinst/i);
    expect(text.replace(/ikke garantert/gi, '')).not.toMatch(/garantert/i);
    await noHorizontalScroll(page);
  });

  test('risiko: knyttet til boligen der analysen støtter det, seks dimensjoner og hva vi vet, antar og må sjekke', async ({ page }) => {
    await openElvekanten(page);
    await page.locator('#risiko').scrollIntoViewIfNeeded();
    expect(await page.getByTestId('prop-spot').count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('prop-spots')).toContainText(/Bad og våtrom/);
    await expect(page.getByTestId('prop-spots')).toContainText(/(Lav|Middels|Høy) risiko|Uavklart/);
    await expect(page.getByTestId('prop-risk-dim')).toHaveCount(6);
    await expect(page.getByTestId('prop-known')).toBeVisible();
    await expect(page.getByTestId('prop-assumed')).toBeVisible();
    await expect(page.getByTestId('prop-tocheck')).toBeVisible();
    await expect(page.getByTestId('prop-tocheck')).toContainText(/finansieringsbevis|skattebehandling|avklar/i);
    await noHorizontalScroll(page);
  });

  test('«Ta med på visning»: huskeliste fra analysen, og avkrysning huskes i nettleseren', async ({ page }) => {
    await openElvekanten(page);
    await page.locator('#visning').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('prop-look-for')).toContainText(/Fuktmåling/);
    await expect(page.getByTestId('prop-ask-for')).toContainText(/samsvarserklæring|finansieringsbevis/i);
    await expect(page.getByTestId('prop-next-viewing')).toContainText(/Neste visning/);
    await expect(page.getByTestId('prop-viewing-progress')).toContainText(/0 av \d+ avkrysset/);
    const first = page.getByTestId('prop-look-for').getByRole('checkbox').first();
    await first.check();
    await expect(page.getByTestId('prop-viewing-progress')).toContainText(/1 av \d+ avkrysset/);
    await page.reload();
    await expect(page.getByTestId('prop-look-for').getByRole('checkbox').first()).toBeChecked();
    await expect(page.getByTestId('prop-viewing-progress')).toContainText(/1 av \d+ avkrysset/);
  });

  test('detaljer: kalkyle, oppussing, risiko, marked, rapport og visninger finnes som faner, og dyp lenke ?fane= åpner dem', async ({ page }) => {
    await openElvekanten(page);
    for (const t of ['Oversikt', 'Kalkyle', 'Oppussing', 'Risiko og sjekkliste', 'Marked', 'Rapport og kilder', 'Visninger og bud']) {
      await page.getByRole('tab', { name: t, exact: true }).click();
      await expect(page.locator('[role=tabpanel][id^=panel-]')).toBeVisible();
    }
    await page.getByRole('tab', { name: 'Kalkyle', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Kjøpspris (kontant)' })).toBeVisible();
    // dyp lenke (full innlasting) med ?fane= åpner detaljene og ruller til dem
    const deep = page.url().replace(/fane=[^&]*/, 'fane=risiko');
    const fresh = await page.context().newPage();
    await fresh.goto(deep);
    await expect(fresh.getByTestId('prop-opportunity')).toBeVisible();
    await expect(fresh.getByRole('tab', { name: 'Risiko og sjekkliste', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(fresh.locator('#detaljer')).toBeInViewport();
    await fresh.close();
  });

  test('alle seed-objekter åpnes uten feil og uten sideveis rulling – også de med manglende verdier', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page, PROP);
    await expect(page.getByTestId('prop-table').or(page.getByTestId('prop-cards'))).toBeVisible();
    const hrefs = await page.locator('a[href*="/objekter/"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href')))]);
    expect(hrefs.length).toBeGreaterThanOrEqual(9);
    for (const href of hrefs) {
      await page.goto(`/${href}`);
      await expect(page.getByTestId('prop-opportunity')).toBeVisible();
      await expect(page.getByTestId('prop-title')).not.toBeEmpty();
      await noHorizontalScroll(page);
      // ukjent er aldri 0: uten komplett kalkyle står det tekst – ikke «0 kr» som fortjeneste eller maksbud
      const hero = await page.getByTestId('prop-opportunity').innerText();
      if (/ufullstendig|ugyldige/.test(hero)) expect(hero).not.toMatch(/Forventet fortjeneste\s*\n?\s*0 kr/);
    }
    expect(errors).toEqual([]);
  });
});

/** Økonomisk paritet: samme objekt, bruker og scenario gir identiske tall i Original, Finance, Investment og Property. */
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
    returnPct: Math.round((await value(page, 'inv-return')) * 10000) / 100,
    hourly: Math.round(await value(page, 'inv-hourly')),
    sale: Math.round(await value(page, 'inv-sale')),
    equity: Math.round(await value(page, 'inv-equity')),
  };
}
async function readProperty(page: Page) {
  await page.goto(`/#${PROP}/oversikt`);
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await expect(page.getByTestId('prop-opportunity')).toBeVisible();
  await openEconomy(page);
  return {
    profit: Math.round(await value(page, 'prop-profit')),
    maxBid: await value(page, 'prop-maxbid'),
    returnPct: Math.round((await value(page, 'prop-return')) * 10000) / 100,
    hourly: Math.round(await value(page, 'prop-hourly')),
    sale: Math.round(await value(page, 'prop-sale')),
    equity: Math.round(await value(page, 'prop-equity')),
  };
}

test.describe('Økonomisk paritet: Original, Finance, Investment og Property viser identiske tall', () => {
  test('samme objekt, bruker og scenario – også etter privat overstyring gjort i Property', async ({ page }) => {
    await signIn(page, '');
    const check = async () => {
      const o = await readOriginal(page);
      const f = await readFinance(page);
      const i = await readInvestment(page);
      const p = await readProperty(page);
      expect(f).toEqual({ ...o, maxBid: floorK(o.maxBid), returnPct: Math.round(o.returnPct * 10) / 10 });
      expect(i).toEqual({ ...o, maxBid: floorK(o.maxBid) });
      expect(p, 'Property mot Original').toEqual({ ...o, maxBid: floorK(o.maxBid) });
      return o;
    };
    const before = await check();

    await page.goto(`/#${PROP}/oversikt`);
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    await page.getByRole('tab', { name: 'Kalkyle', exact: true }).click();
    const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
    await price.fill('2 700 000');
    await price.blur();
    await page.getByRole('button', { name: 'Lagre', exact: true }).first().click();
    await expect(page.getByText('Ulagrede endringer')).toHaveCount(0);
    const after = await check();
    expect(after.profit).toBeGreaterThan(before.profit);
  });

  test('scenariosammenligningen: Basis, A og B har samme fortjeneste, kr/time og anbefaling som i Original', async ({ page }, info) => {
    test.skip(info.project.name === 'mobil', 'Sammenlignes på desktop; logikken er den samme på mobil');
    await signIn(page, '');
    // Original: rangeringen i Kalkyle
    await page.goto('/#/oversikt');
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const rows = page.getByTestId('rank-row');
    await expect(rows).toHaveCount(3);
    const orig: Record<string, { profit: number; hourly: number }> = {};
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      const title = (await row.locator('.font-semibold').first().innerText()).trim();
      const dd = (label: string) => row.locator(`xpath=.//dt[normalize-space(.)="${label}"]/following-sibling::dd[1]`).innerText();
      orig[title] = { profit: numberIn(await dd('Fortjeneste før skatt')), hourly: numberIn(await dd('Per egeninnsatstime')) };
    }
    const recommended = (await page.getByText(/Anbefalt scenario: /).first().innerText()).replace(/^.*Anbefalt scenario: /, '').split('.')[0].trim();

    // Property: hver versjon vist i forhåndsvisning
    await page.goto(`/#${PROP}/oversikt`);
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    await expect(page.getByTestId('prop-opportunity')).toBeVisible();
    let propRecommended = '';
    for (let i = 0; i < 3; i++) {
      await versionTab(page, i).click();
      const title = (await page.getByTestId('prop-version-title').innerText()).trim();
      if (/Anbefalt/.test(await versionTab(page, i).innerText())) propRecommended = title;
      await openEconomy(page);
      expect(Math.round(await value(page, 'prop-profit')), `${title}: fortjeneste`).toBe(orig[title].profit);
      expect(Math.round(await value(page, 'prop-hourly')), `${title}: kr/time`).toBe(orig[title].hourly);
    }
    expect(propRecommended).toBe(recommended);
    expect(recommended).toBe('Standardheving');
  });
});

const DEBT_TITLE = { gjeld_over_totalverdi: 'Fellesgjeld er høyere enn beregnet total salgsverdi', gjeld_ukjent: 'Fellesgjeld ved salg er ikke avklart' } as const;
const DEBT_MESSAGE = {
  gjeld_over_totalverdi: 'Kontant salgsverdi kan derfor ikke beregnes. Kontroller fellesgjeld eller salgsverdi.',
  gjeld_ukjent: 'Kontant salgsverdi kan ikke fastsettes sikkert før fellesgjelden ved salg er kjent. Ukjent er ikke 0 kr.',
} as const;

async function propDebtStatus(page: Page, debt: string) {
  await page.goto(`/#${PROP}/oversikt`);
  await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
  await page.getByRole('tab', { name: 'Kalkyle', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Fellesgjeld ved salg', exact: true });
  await field.fill(debt);
  await field.blur();
  await page.waitForTimeout(150);
  return page.getByTestId('prop-debt-status');
}

test.describe('Fellesgjeld ved salg i Property: samme status og forklaring som i de andre variantene', () => {
  test('umulig gjeld og ukjent gjeld gir samme tittel, forklaring og alvorlighet – og ingen varsel når gjelden er kjent', async ({ page }, info) => {
    test.skip(info.project.name === 'mobil', 'Samme logikk på mobil; layout testes egen test');
    await signIn(page, '');
    for (const [debt, kind, label] of [
      ['99 000 000', 'gjeld_over_totalverdi', 'Feil'],
      ['', 'gjeld_ukjent', 'Ikke avklart'],
    ] as const) {
      const root = await propDebtStatus(page, debt);
      await expect(root, kind).toBeVisible();
      await expect(root).toContainText(DEBT_TITLE[kind]);
      await expect(root).toContainText(DEBT_MESSAGE[kind]);
      await expect(root).toContainText(label); // alvor som ord, ikke bare farge
      await expect(root.locator('[role="alert"], [role="status"]').first()).toBeVisible();
      // maksbud og fortjeneste varsles som usikre også i sidestolpen
      await expect(page.getByTestId('prop-econ-debt-note')).toContainText(DEBT_TITLE[kind]);
    }
    await propDebtStatus(page, '0');
    await expect(page.getByTestId('prop-debt-status')).toHaveCount(0);
    await expect(page.getByTestId('sale-debt-status-gjeld_ukjent')).toHaveCount(0);
    await expect(page.getByTestId('sale-debt-status-gjeld_over_totalverdi')).toHaveCount(0);
  });

  test('statusen bryter ikke layouten på 320, 360 og 412 px', async ({ page }) => {
    await signIn(page, '');
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 });
      const root = await propDebtStatus(page, '99 000 000');
      await expect(root).toBeVisible();
      await noHorizontalScroll(page);
      const box = await root.boundingBox();
      expect(box!.height, `${width}px: varselet skal ikke bli ekstremt høyt`).toBeLessThan(width === 320 ? 340 : 270);
    }
  });
});

test.describe('Property: tilgjengelighet og overflow', () => {
  test('ingen sideveis rulling på 320, 360, 390 og 412 px: forside, liste og objektside med faner og utfoldet stripe', async ({ page }) => {
    await signIn(page, PROP);
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/#${PROP}`);
      await noHorizontalScroll(page);
      await page.goto(`/#${PROP}/oversikt`);
      await expect(page.getByTestId('prop-cards')).toBeVisible();
      await noHorizontalScroll(page);
      await openObject(page);
      await noHorizontalScroll(page);
      await openEconomy(page);
      await noHorizontalScroll(page);
      await page.getByTestId('prop-econ-toggle').click();
      for (const t of ['Kalkyle', 'Oppussing', 'Marked', 'Risiko og sjekkliste', 'Rapport og kilder']) {
        await page.getByRole('tab', { name: t, exact: true }).click();
        await noHorizontalScroll(page);
      }
      for (const i of [1, 2]) {
        await versionTab(page, i).click();
        await noHorizontalScroll(page);
      }
    }
  });

  test('berøringsflater er minst 44 px på mobil (knapper, faner, versjoner, avkrysning)', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobil', 'Berøringsmål på mobil');
    await openElvekanten(page);
    const small: string[] = [];
    const sel = '#versjoner button, #oppussing button, #visning label, #visning button, [data-testid=prop-sectionnav] button, [data-testid=prop-opportunity] button, [data-testid=prop-econ-toggle]';
    for (const el of await page.locator(sel).all()) {
      if (!(await el.isVisible())) continue;
      const b = await el.boundingBox();
      if (b && b.height < 43.5) small.push(`${(await el.innerText()).slice(0, 30)} ${Math.round(b.height)}px`);
    }
    expect(small, small.join('\n')).toEqual([]);
  });

  test('«reduser bevegelse»: ingen animasjon ved versjonsbytte, og tallene hopper rett til sluttverdien', async ({ browser }) => {
    for (const reduce of [false, true]) {
      const ctx = await browser.newContext({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      await openElvekanten(page);
      await openEconomy(page);
      const before = await value(page, 'prop-profit');
      await versionTab(page, 2).click();
      await openEconomy(page);
      await expect.poll(() => value(page, 'prop-profit')).not.toBe(before);
      const info = await page.evaluate(() => {
        const swap = document.querySelector('.prop-swap');
        const cs = swap ? getComputedStyle(swap) : null;
        const parse = (v: string) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1)));
        const root = document.querySelector('.prop') as HTMLElement;
        const longest = Math.max(0, ...Array.from(root.querySelectorAll('a, button, input, svg, span, div')).map((e) => parse(getComputedStyle(e).transitionDuration)));
        return { animation: cs ? parse(cs.animationDuration) : null, longest, flashing: document.querySelectorAll('[data-testid="prop-profit"] .prop-flash').length };
      });
      if (reduce) {
        expect(info.animation ?? 0).toBeLessThan(0.05);
        expect(info.longest).toBeLessThan(0.05);
        expect(info.flashing, 'Ingen lysglimt med redusert bevegelse').toBe(0);
      } else {
        expect(info.animation ?? 1).toBeGreaterThan(0.1);
      }
      await ctx.close();
    }
  });

  test('ingen scrolljacking: siden ruller naturlig og in-page-navigasjon bruker vanlig rulling til seksjonen', async ({ page }) => {
    await openElvekanten(page);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600).catch(() => undefined);
    await page.evaluate(() => window.scrollBy(0, 500));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    await page.getByTestId('prop-sectionnav').getByRole('button', { name: /Risiko/ }).click();
    await expect(page.locator('#risiko')).toBeInViewport();
    // adressen (hash-ruten) er uendret av in-page-navigasjonen
    await expect(page).toHaveURL(new RegExp(`#${PROP}/objekter/`));
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hva kan de bli/);
  });
});

/** Måler kontrast (WCAG AA) for all synlig tekst under en rot. */
async function contrastFailures(page: Page, rootSelector: string): Promise<string[]> {
  await expect(page.locator(rootSelector).first()).toBeVisible();
  await page.waitForTimeout(450);
  return page.evaluate((root) => {
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
      let bg = { r: 246, g: 242, b: 234 };
      const stack: Element[] = [];
      for (let a: Element | null = el; a; a = a.parentElement) stack.push(a);
      for (const a of stack.reverse()) {
        const c = parse(getComputedStyle(a).backgroundColor);
        if (c && c.a > 0) bg = mix(c, bg);
      }
      return bg;
    };
    const out: string[] = [];
    const walker = document.createTreeWalker(document.querySelector(root)!, NodeFilter.SHOW_TEXT);
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
  }, rootSelector);
}

test.describe('Property: kontrast', () => {
  test('tekst mot bakgrunn oppfyller WCAG AA på forside, liste, objektside og faner', async ({ page }, info) => {
    test.skip(info.project.name === 'mobil', 'Farger er like på mobil');
    const failures: string[] = [];
    const scan = async (label: string) => failures.push(...(await contrastFailures(page, '.prop')).map((x) => `${label}: ${x}`));
    await page.goto(`/#${PROP}`);
    await scan('forside');
    await signIn(page, PROP);
    await scan('liste');
    await openObject(page);
    await page.getByRole('button', { name: /Vis alle tiltak/ }).click();
    await scan('objekt');
    await versionTab(page, 2).click();
    await scan('objekt, Alt B');
    for (const tab of ['Kalkyle', 'Marked', 'Risiko og sjekkliste']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await scan(`fane ${tab}`);
    }
    expect(failures, failures.slice(0, 12).join('\n')).toEqual([]);
  });
});
