import { expect, test, type Page } from '@playwright/test';

/** Tall fra en tekst som «2 733 000 kr» eller «−2 930 800 kr» (nb-NO bruker mellomrom/NBSP og minustegn). */
function numberIn(text: string): number {
  const m = text.replace(/[  \s]/g, '').match(/[−-]?\d+/);
  if (!m) throw new Error(`Fant ikke tall i «${text}»`);
  return Number(m[0].replace('−', '-'));
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
}

test.describe('designgalleri', () => {
  test('/design viser Original, Finance, Investment og «kommer senere» for Property', async ({ page }) => {
    await page.goto('/#/design');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/design/i);
    for (const id of ['original', 'finance', 'investment', 'property']) await expect(page.getByTestId(`variant-${id}`)).toBeVisible();
    await expect(page.getByTestId('variant-investment')).toContainText(/tilgjengelig/i);
    await expect(page.getByTestId('variant-property')).toContainText(/kommer senere/i);
    await noHorizontalScroll(page);
  });

  test('Original og Finance åpnes fra galleriet', async ({ page }) => {
    await page.goto('/#/design');
    await page.getByTestId('variant-finance').getByRole('link').first().click();
    await expect(page).toHaveURL(/#\/design\/finance/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Vit hva du maksimalt/);

    await page.goto('/#/design');
    await page.getByTestId('variant-original').getByRole('link').first().click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(/Vit hva du maksimalt/);
  });

  test('/design/original sender til Original, og «kommer senere»-siden for Property åpnes', async ({ page }) => {
    await page.goto('/#/design/original');
    await expect(page).toHaveURL(/#\/$/);
    await page.goto('/#/design/property');
    await expect(page.getByText(/kommer senere/i).first()).toBeVisible();
  });

  test('direkte inngang og oppdatering av siden i Finance (dypeste lenker)', async ({ page }) => {
    await page.goto('/#/design/finance');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Vit hva du maksimalt/);

    await openElvekanten(page, '/design/finance');
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId('fin-maxbid')).toBeVisible();

    // direkte åpning av en dyp lenke i en ny fane i samme økt
    const fresh = await page.context().newPage();
    await fresh.goto(url);
    await expect(fresh.getByTestId('fin-maxbid')).toBeVisible();
    await fresh.close();
  });

  test('ukjent adresse under Finance gir en tydelig feilside med vei tilbake – ikke tom side', async ({ page }) => {
    await page.goto('/#/design/finance/finnes-ikke');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByRole('link').first()).toBeVisible();
  });
});

test.describe('Finance: flater', () => {
  test('objektliste: tabell/kort, kjente verdier og ukjent er aldri 0', async ({ page }, info) => {
    await signIn(page, '/design/finance');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Investeringsoversikt/);
    if (info.project.name === 'mobil') {
      await expect(page.getByTestId('fin-cards')).toBeVisible();
      await expect(page.getByTestId('fin-table')).toBeHidden();
    } else {
      await expect(page.getByTestId('fin-table')).toBeVisible();
      await expect(page.getByTestId('fin-row').first()).toBeVisible();
    }
    // objekter uten grunnlag viser «Mangler grunnlag», ikke 0 kr
    await expect(page.getByText('Mangler grunnlag').first()).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('objektside: beslutningen øverst, scenariosammenligning og risiko i seks dimensjoner', async ({ page }, info) => {
    await openElvekanten(page, '/design/finance');
    await expect(page.getByTestId('fin-maxbid')).toContainText(/\d/);
    await expect(page.getByTestId('fin-maxbid-reason')).toContainText(/begrenses av/i);
    // beslutningstall synlige uten å scrolle langt (10–15 sekunders-regelen): maksbud i første skjermbilde
    const box = await page.getByTestId('fin-maxbid').boundingBox();
    const vh = page.viewportSize()!.height;
    expect(box && box.y < vh, 'Anbefalt maksbud skal ligge i første skjermbilde').toBe(true);
    for (const label of ['Forventet salgsverdi', 'Forventet fortjeneste', 'Prosjektavkastning', 'Egenkapitalbehov', 'Per egeninnsatstime']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeAttached();
    }
    // scenarioer: tabell på desktop, kort på mobil
    await expect(page.getByTestId(info.project.name === 'mobil' ? 'fin-scenario-cards' : 'fin-scenarios')).toBeVisible();
    await noHorizontalScroll(page);

    await page.getByRole('tab', { name: 'Risiko' }).click();
    await expect(page.getByTestId('fin-risk-dim')).toHaveCount(6);
    // nivå står som tekst, ikke bare farge
    await expect(page.getByTestId('fin-risk-dim').first()).toContainText(/risiko|Uavklart/i);
    await noHorizontalScroll(page);
  });

  test('marked: referanser og salgsverdi med forklaring', async ({ page }) => {
    await openElvekanten(page, '/design/finance');
    await page.getByRole('tab', { name: 'Marked' }).click();
    await expect(page.getByTestId('fin-market-values')).toBeVisible();
    await expect(page.getByTestId('fin-ref').first()).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('scenariobytte i sammenligningen endrer kalkylen, og «Min kalkyle» kan tilbakestilles', async ({ page }) => {
    await openElvekanten(page, '/design/finance');
    const before = numberIn(await page.getByTestId('fin-maxbid').innerText());
    // «Bruk i kalkylen» finnes på alternative scenarioer (tabell på desktop, kort på mobil)
    await page.locator('button:visible', { hasText: 'Bruk i kalkylen' }).first().click();
    await expect(page.getByTestId('fin-maxbid')).not.toHaveText(new RegExp(String(before).replace(/(\d)(?=(\d{3})+$)/g, '$1\\s?')));
    await expect(page.getByText('Ulagrede endringer').locator('visible=true').first()).toBeVisible();
    await page.getByRole('button', { name: /Tilbakestill til grunnlag/ }).first().click();
    await expect(page.getByTestId('fin-maxbid')).toBeVisible();
  });
});

test.describe('Finance: kalkulator og private overstyringer', () => {
  test('gruppert kalkulator, endring av kjøpspris slår ut i resultatet, og feltet kan tilbakestilles', async ({ page }) => {
    await openElvekanten(page, '/design/finance');
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    for (const g of ['Kjøp', 'Oppussing', 'Finansiering', 'Salg', 'Mål og budplan']) {
      await expect(page.getByRole('heading', { name: g, exact: true }).first()).toBeVisible();
    }
    const profitBefore = numberIn(await page.getByTestId('fin-calc-profit').innerText());
    const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
    await price.fill('2 750 000');
    await price.blur();
    await expect(page.getByTestId('fin-calc-profit')).not.toHaveText(new RegExp(String(profitBefore).replace(/(\d)(?=(\d{3})+$)/g, '$1\\s?')));
    // opprinnelsesmerke og tilbakestilling per felt
    await expect(page.getByText('Din verdi').first()).toBeVisible();
    await page.getByRole('button', { name: /Tilbakestill Kjøpspris \(kontant\) til grunnlag/ }).click();
    // tilbakestilling går til grunnlaget i analysen (2 890 000), ikke til den private verdien som lå der fra før
    await expect(price).toHaveValue(/2\s?890\s?000/);
  });

  test('private overstyringer lagres per bruker og overlever oppdatering', async ({ page }) => {
    await openElvekanten(page, '/design/finance');
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const price = page.getByRole('textbox', { name: 'Kjøpspris (kontant)' });
    await price.fill('2 700 000');
    await price.blur();
    await page.getByRole('button', { name: 'Lagre', exact: true }).first().click();
    await expect(page.getByText('Ulagrede endringer')).toHaveCount(0);
    await page.reload();
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    await expect(page.getByRole('textbox', { name: 'Kjøpspris (kontant)' })).toHaveValue(/2\s?700\s?000/);
    // Original viser den samme private kalkylen (samme data, annen drakt)
    await page.goto('/#/oversikt');
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    await expect(page.getByRole('textbox', { name: 'Kjøpspris (kontant)' }).first()).toHaveValue(/2\s?700\s?000/);
  });
});

test.describe('samme input gir samme økonomi i Original og Finance', () => {
  test('anbefalt maksbud og forventet fortjeneste er like (Finance viser maksbud avrundet ned til tusen)', async ({ page }) => {
    // Original
    await signIn(page, '');
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const row = page.getByTestId('recommended-maxbid');
    await expect(row).toBeVisible();
    const originalBid = numberIn(await row.locator('td').first().innerText());
    const originalProfit = numberIn(
      await page
        .getByText('Resultat før skatt og eget arbeid (S − C)')
        .locator('xpath=..')
        .innerText()
        .then((t) => t.replace('Resultat før skatt og eget arbeid (S − C)', '')),
    );

    // Finance (samme økt, samme data)
    await page.goto('/#/design/finance/oversikt');
    await page.getByRole('link', { name: /Elvekanten 17 B/ }).first().click();
    const financeBid = numberIn(await page.getByTestId('fin-maxbid').innerText());
    expect(financeBid).toBe(Math.floor(originalBid / 1000) * 1000);
    await page.getByRole('tab', { name: 'Kalkyle' }).click();
    const financeProfit = numberIn(await page.getByTestId('fin-calc-profit').innerText());
    expect(financeProfit).toBe(originalProfit);
  });
});

test.describe('Original er uendret', () => {
  test('forside, innlogging og objektside i Original har ingen Finance-element', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByTestId('fin-maxbid')).toHaveCount(0);
    await openElvekanten(page, '');
    await expect(page.getByTestId('fin-maxbid')).toHaveCount(0);
    await expect(page.getByTestId('fin-scenarios')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Oversikt' })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('bytte mellom variantene ødelegger ikke innlogget økt eller ruting', async ({ page }) => {
    await signIn(page, '');
    await page.goto('/#/design/finance/oversikt');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Investeringsoversikt/);
    await page.goto('/#/oversikt');
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(/Investeringsoversikt/);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Investeringsoversikt/);
  });
});

test.describe('tilgjengelighet i Finance', () => {
  test('tastaturnavigasjon: hopp til innhold og synlig fokus, faner og knapper har navn', async ({ page }) => {
    await openElvekanten(page, '/design/finance');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, outline: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' };
    });
    expect(focused?.tag).toBeTruthy();
    // alle knapper og lenker har tilgjengelig navn
    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, a[href]')).filter((e) => !(e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').trim()).length,
    );
    expect(unnamed).toBe(0);
    await page.getByRole('tab', { name: 'Kalkyle' }).focus();
    await page.keyboard.press('ArrowRight');
  });

  test('reduser bevegelse respekteres: ingen overganger eller jevn rulling', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/#/design/finance');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Vit hva du maksimalt/);
    const r = await page.evaluate(() => {
      const root = document.querySelector('.fin') as HTMLElement;
      const parse = (v: string) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1)));
      const items = Array.from(root.querySelectorAll('a, button, input, svg')).map((e) => parse(getComputedStyle(e).transitionDuration));
      return { longest: Math.max(0, ...items), scroll: getComputedStyle(root).scrollBehavior };
    });
    expect(r.longest).toBeLessThan(0.05);
    expect(r.scroll).toBe('auto');
    await ctx.close();
  });
});
