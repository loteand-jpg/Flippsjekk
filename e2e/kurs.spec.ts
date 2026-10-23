import { expect, test, type Page } from '@playwright/test';
import { MODULES } from '../src/course/content';
import { FINAL_QUIZ } from '../src/course/content/finalQuiz';
import { CASE_A } from '../src/course/caseData';
import { evaluateScenario } from '../src/calc/scenario';
import { formatNOK } from '../src/lib/format';

async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(ok, `Horisontal rulling på ${page.url()}`).toBe(true);
}

const next = (page: Page) => page.getByRole('button', { name: /^Neste:/ });
const prev = (page: Page) => page.getByRole('button', { name: /^Forrige:/ });

async function login(page: Page) {
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Ada Aksnes/ }).click();
  await expect(page).toHaveURL(/#\/oversikt/);
}

test('kurs: oversikt, info, sidenavigasjon, lest-markering, kontrollspørsmål og lagring', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);

  await page.getByRole('navigation', { name: isMobile ? 'Hovedmeny (mobil)' : 'Hovedmeny' }).getByRole('link', { name: 'Kurs' }).click();
  await expect(page.getByRole('heading', { name: 'Kurs', exact: true })).toBeVisible();
  for (const t of ['Flipping nivå 2 - AS', 'Utleie nivå 1 - Privat', 'Utleie nivå 2 - AS']) await expect(page.getByText(t)).toBeVisible();
  await expect(page.getByText('Kjøpt – du har tilgang')).toBeVisible();
  await expect(page.getByText('Kommer senere')).toHaveCount(3);
  await page.getByRole('link', { name: 'Åpne kurset' }).click();

  // Infosiden
  await expect(page.getByRole('heading', { level: 1, name: 'Flipping nivå 1 - Privat' })).toBeVisible();
  await expect(page.getByText('Regler og markedsdata faglig kontrollert: 17. oktober 2026').first()).toBeVisible();
  await expect(page.getByText('Dagsaktuelle tall i kurset er derfor datostemplet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'De 11 modulene' })).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Start kurset' }).click();

  // Modul 1, side 1
  await expect(page.getByRole('article').getByText('Modul 1 av 11 · Side 1 av')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /^1\.1 / })).toBeVisible();
  await expect(prev(page)).toHaveCount(0);
  await noHorizontalScroll(page);

  // Neste markerer siden som lest
  await next(page).click();
  await expect(page.getByRole('article').getByText(/Side 2 av/)).toBeVisible();
  await prev(page).click();
  await expect(page.getByText('Lest', { exact: true })).toBeVisible();

  // Manuell lest-markering på side 2
  await next(page).click();
  await page.getByRole('button', { name: 'Marker siden som lest' }).click();
  await expect(page.getByRole('button', { name: /Markert som lest/ })).toBeVisible();

  // Gå til kontrollspørsmål for modul 1
  const m1 = MODULES[0];
  await page.goto(`/#/kurs/flipping-privat?modul=1&side=q`);
  await expect(page.getByRole('heading', { level: 1, name: /Kontrollspørsmål/ })).toBeVisible();
  const q = m1.quiz[0];
  await page.getByRole('radio', { name: q.options[(q.correct + 1) % q.options.length], exact: true }).first().click();
  await expect(page.getByText(/Ikke helt – riktig svar/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Prøv igjen' }).first().click();
  await page.getByRole('radio', { name: q.options[q.correct], exact: true }).first().click();
  await expect(page.getByRole('status').getByText('Riktig', { exact: true }).first()).toBeVisible();
  await noHorizontalScroll(page);

  // Lagring etter omlasting: fortsett der man var
  await page.goto('/#/kurs/flipping-privat');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Fortsett kurset' })).toBeVisible();
  await page.getByRole('button', { name: 'Fortsett kurset' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Kontrollspørsmål/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('kurs: alle sider og moduler kan åpnes uten horisontal rulling', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  for (const m of MODULES) {
    for (let i = 1; i <= m.pages.length; i++) {
      await page.goto(`/#/kurs/flipping-privat?modul=${m.id}&side=${i}`);
      await expect(page.getByRole('heading', { level: 1, name: new RegExp(`^${m.num}\\.${i} `) })).toBeVisible();
      await noHorizontalScroll(page);
    }
  }
  expect(errors).toEqual([]);
});

test('kurs: kalkulator, stresstest, maksbud, scenarioer og sjekkliste', async ({ page }) => {
  await login(page);
  await page.goto('/#/kurs/flipping-privat?modul=8&side=1');
  await expect(page.getByRole('heading', { level: 1, name: /^8\.1 / })).toBeVisible();
  await page.getByRole('button', { name: /eksempel/i }).first().click();
  await expect(page.getByText(/[−-]85\s?\d{3}\s?kr/).first()).toBeVisible();
  await noHorizontalScroll(page);

  await page.goto('/#/kurs/flipping-privat?modul=8&side=5');
  await page.getByRole('button', { name: /300\s?000\s?kr/ }).click();
  await expect(page.getByText(/2[,.]91|2\s?91\d\s?\d{3}/).first()).toBeVisible();
  await noHorizontalScroll(page);

  // Før-bud-sjekklisten kan åpnes fra siden
  await page.goto('/#/kurs/flipping-privat?modul=9&side=1');
  await page.getByRole('button', { name: 'Åpne sjekklisten' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Før-bud-sjekkliste' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('checkbox').first().check();
  await expect(dlg.getByRole('checkbox').first()).toBeChecked();
  await noHorizontalScroll(page);
});

test('kurs: låneandel for kjøp og oppussing kan endres uavhengig', async ({ page }) => {
  await login(page);
  await page.goto('/#/kurs/flipping-privat?modul=8&side=1');
  const buy = page.getByRole('textbox', { name: 'Låneandel av kjøpesum (fP)' });
  const renovation = page.getByRole('textbox', { name: 'Låneandel av oppussing (fR)' });
  await expect(buy).toHaveValue('90');
  await expect(renovation).toHaveValue('90');
  await buy.fill('75');
  await expect(renovation).toHaveValue('90');
  await renovation.fill('20');
  await expect(buy).toHaveValue('75');
  await page.reload();
  await expect(buy).toHaveValue('75');
  await expect(renovation).toHaveValue('20');
});

test('kurs: sluttcase, sluttquiz (bestått ≥ 12 av 15) og fullføringsside', async ({ page }) => {
  await login(page);
  await page.goto('/#/kurs/flipping-privat?modul=sluttcase');
  await expect(page.getByRole('heading', { level: 1, name: 'Sluttcase' })).toBeVisible();
  await expect(page.getByText('Trinn 1 – Hva mangler?')).toBeVisible();
  await page.getByRole('button', { name: /Trinn 6/ }).click();
  await expect(page.getByText('Trinn 6 – Beslutning')).toBeVisible();
  await noHorizontalScroll(page);

  // Fullføringssiden er låst før sluttquizen er bestått
  await page.goto('/#/kurs/flipping-privat?modul=ferdig');
  await expect(page.getByText('Fullføringssiden åpnes når sluttquizen er bestått')).toBeVisible();

  await page.goto('/#/kurs/flipping-privat?modul=sluttquiz');
  await expect(page.getByText(/Bestått er minst 12 av 15/)).toBeVisible();
  // 11 riktige => ikke bestått
  for (let i = 0; i < FINAL_QUIZ.length; i++) {
    const q = FINAL_QUIZ[i];
    const idx = i < 11 ? q.correct : (q.correct + 1) % q.options.length;
    await page.getByRole('radiogroup', { name: q.question }).getByRole('radio').nth(idx).click();
  }
  await expect(page.getByText(/Ikke bestått ennå – 11 av 15/)).toBeVisible();
  // Rett opp ett svar: prøv igjen på q12
  const q12 = FINAL_QUIZ[11];
  await page.getByRole('radiogroup', { name: q12.question }).locator('xpath=ancestor::fieldset').getByRole('button', { name: 'Prøv igjen' }).click();
  await page.getByRole('radiogroup', { name: q12.question }).getByRole('radio').nth(q12.correct).click();
  await expect(page.getByText(/Bestått – 12 av 15/)).toBeVisible();
  await noHorizontalScroll(page);

  await page.goto('/#/kurs/flipping-privat?modul=ferdig');
  await expect(page.getByRole('heading', { name: 'Du har fullført Flipping nivå 1 - Privat' })).toBeVisible();
  await expect(page.getByText('Regn baklengs til maksbud.')).toBeVisible();
  await expect(page.getByText('Kommer senere')).toBeVisible();
  await noHorizontalScroll(page);
});

test('kurs: betalingsmur – kjøp med Vipps gir varig tilgang', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: /Bjørn Berg/ }).click(); // har abonnement, men har ikke kjøpt kurset
  await expect(page).toHaveURL(/#\/oversikt/);

  await page.goto('/#/kurs');
  await expect(page.getByText(/2\s999\skr · engangsbeløp/)).toBeVisible();
  await expect(page.getByText('Kjøpt – du har tilgang')).toHaveCount(0);
  for (const t of ['Flipping nivå 2 - AS', 'Utleie nivå 1 - Privat', 'Utleie nivå 2 - AS']) await expect(page.getByText(t)).toBeVisible();

  // Innholdet er låst, også med direkte lenke til en side
  await page.goto('/#/kurs/flipping-privat?modul=4&side=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Flipping nivå 1 - Privat' })).toBeVisible();
  await expect(page.getByText('Engangsbeløp. Du betaler med Vipps og beholder tilgangen.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /^4\.1 / })).toHaveCount(0);
  await expect(page.getByText('Salgsverdien er én av de viktigste variablene')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Neste/ })).toHaveCount(0);
  await expect(page.getByText('Finn realistisk salgsverdi')).toBeVisible(); // innholdsfortegnelsen er synlig
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  // Kjøp: avvis først, så godkjenn
  await page.getByRole('button', { name: /^Kjøp kurset – / }).click();
  const dlg = page.getByRole('dialog', { name: 'Kjøp Flipping nivå 1 - Privat' });
  await expect(dlg.getByText('Varig tilgang når du har kjøpt kurset')).toBeVisible();
  await dlg.getByLabel('Mobilnummer i Vipps').fill('99');
  await dlg.getByRole('button', { name: /Betal .* med Vipps/ }).click();
  await expect(dlg.getByText(/norsk mobilnummer med 8 siffer/)).toBeVisible();
  await dlg.getByLabel('Mobilnummer i Vipps').fill('412 34 567');
  await dlg.getByRole('button', { name: /Betal .* med Vipps/ }).click();
  const vipps = page.getByRole('dialog', { name: 'Godkjenn i Vipps' });
  await expect(vipps.getByText('Flipping nivå 1 - Privat')).toBeVisible();
  await vipps.getByRole('button', { name: 'Avvis' }).click();
  await expect(page.getByText(/Betalingen ble avvist i Vipps/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /^4\.1 / })).toHaveCount(0);

  await dlg.getByLabel('Mobilnummer i Vipps').fill('412 34 567');
  await dlg.getByRole('button', { name: /Betal .* med Vipps/ }).click();
  await page.getByRole('dialog', { name: 'Godkjenn i Vipps' }).getByRole('button', { name: 'Godkjenn' }).click();
  await expect(page.getByText('Kurset er ditt')).toBeVisible();

  // Innholdet åpnes, og tilgangen består etter omlasting
  await expect(page.getByRole('heading', { level: 1, name: /^4\.1 / })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /^4\.1 / })).toBeVisible();
  await page.goto('/#/konto');
  await expect(page.getByRole('heading', { name: 'Mine kurs' })).toBeVisible();
  await expect(page.getByText(/Kjøpt .* · 2\s999\skr · Vipps · varig tilgang/)).toBeVisible();
  expect(errors).toEqual([]);
});


test('kursøkonomi: samme lagrede mål, standardmaksbud og informativ avkastning på tvers av sidene', async ({ page }) => {
  await login(page);
  await page.goto('/#/kurs/flipping-privat?modul=8&side=1');
  await page.getByRole('textbox', { name: 'Ønsket minimumsfortjeneste', exact: true }).fill('100000');
  await page.getByRole('textbox', { name: 'Minimum fortjeneste per egeninnsatstime', exact: true }).fill('2000');
  const values = { ...CASE_A, profitTarget: 100_000, minProfitPerOwnHour: 2_000 };
  const expected = evaluateScenario(values).evaluation;
  const checkBid = async () => {
    await expect(page.getByTestId('course-profit-bid')).toHaveText(formatNOK(expected.maxBid!.price));
    await expect(page.getByTestId('course-hourly-bid')).toHaveText(formatNOK(expected.maxBidHourly!.price));
    await expect(page.getByTestId('course-recommended-bid')).toHaveText(formatNOK(expected.recommendedMaxBid!.price));
    await expect(page.getByTestId('course-bid-limit')).toContainText('Minimum fortjeneste per egeninnsatstime');
    await noHorizontalScroll(page);
  };
  await checkBid();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Minimum fortjeneste per egeninnsatstime', exact: true })).toHaveValue(/2\s?000/);
  await checkBid();
  await page.goto('/#/kurs/flipping-privat?modul=8&side=4');
  await expect(page.getByRole('textbox', { name: '3. Minimum fortjeneste per egen time', exact: true })).toHaveValue(/2\s?000/);
  await page.getByRole('textbox', { name: '2. Minimum prosjektavkastning', exact: true }).fill('99');
  await checkBid();
  await page.goto('/#/kurs/flipping-privat?modul=8&side=5');
  await expect(page.getByRole('textbox', { name: 'Eget fortjenestemål', exact: true })).toHaveValue(/100\s?000/);
  await checkBid();
  // Lavere bud oppfyller timekravet med samme kostnader og finansiering.
  await page.goto('/#/kurs/flipping-privat?modul=8&side=1');
  await page.getByRole('textbox', { name: 'Kjøpspris (kontant)', exact: true }).fill(String(expected.recommendedMaxBid!.price));
  await expect(page.getByText('2 000 kr/t', { exact: true })).toBeVisible();
});

test('kursøkonomi: ukjente timer, null timer, usatte mål og uoppnåelige krav', async ({ page }) => {
  await login(page);
  await page.goto('/#/kurs/flipping-privat?modul=8&side=5');
  const hours = page.getByRole('textbox', { name: 'Egne timer (H)', exact: true });
  const hourly = page.getByRole('textbox', { name: 'Minimum fortjeneste per egeninnsatstime', exact: true });
  const target = page.getByRole('textbox', { name: 'Eget fortjenestemål', exact: true });
  const profitBid = await page.getByTestId('course-profit-bid').innerText();
  await hours.fill('');
  await expect(page.getByText('Egne timer er uavklart.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('course-recommended-bid')).toHaveText(profitBid);
  await hours.fill('0');
  await expect(page.getByText('Ingen egne timer. Timekravet gjelder ikke', { exact: false })).toBeVisible();
  await expect(page.getByTestId('course-recommended-bid')).toHaveText(profitBid);
  await hours.fill('250');
  await hourly.fill('1000000');
  await expect(page.getByTestId('course-recommended-bid')).toHaveText('Ingen gjennomførbar pris');
  await expect(page.getByText('Minimum fortjeneste per egeninnsatstime kan ikke oppfylles selv ved kjøpspris 0 kr.', { exact: true })).toBeVisible();
  await hourly.fill('');
  await expect(page.getByTestId('course-recommended-bid')).toHaveText(profitBid);
  await target.fill('');
  await expect(page.getByTestId('course-recommended-bid')).toHaveText('Ikke beregnet');
  await page.reload();
  await expect(hourly).toHaveValue('');
  await expect(target).toHaveValue('');
  await noHorizontalScroll(page);
  await page.goto('/#/kurs/flipping-privat?modul=8&side=1');
  await page.getByRole('textbox', { name: 'Base salgspris', exact: true }).fill('');
  await expect(page.getByText('Ufullstendig kalkyle – ingen fortjeneste vises', { exact: true })).toBeVisible();
  await expect(page.getByTestId('course-recommended-bid')).toHaveCount(0);
});

test('kursøkonomi: eldre timekrav og utfylte oppgaver beholdes etter oppgradering', async ({ page }) => {
  await login(page);
  await page.goto('/#/kurs/flipping-privat?modul=8&side=1');
  await page.getByRole('button', { name: 'Marker siden som lest' }).click();
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('.course.flipping-privat.v2'))!;
    const state = JSON.parse(localStorage.getItem(key)!);
    delete state.hourlyRequirementVersion;
    state.calc.minProfitPerOwnHour = null;
    state.hurdle.minHourValue = 875;
    state.calc.purchaseFinancingPct = 75;
    state.calc.renovationFinancingPct = 20;
    state.checks.beforeBid = ['mitt-lagrede-svar'];
    state.budget.lines['o-bad'] = { amount: 123456, tag: 'mine', include: true };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const hourly = page.getByRole('textbox', { name: 'Minimum fortjeneste per egeninnsatstime', exact: true });
  await expect(hourly).toHaveValue('875');
  await expect(page.getByRole('textbox', { name: 'Låneandel av kjøpesum (fP)', exact: true })).toHaveValue('75');
  await expect(page.getByRole('textbox', { name: 'Låneandel av oppussing (fR)', exact: true })).toHaveValue('20');
  await expect(page.getByRole('button', { name: /Markert som lest/ })).toBeVisible();
  await hourly.fill('');
  await page.reload();
  await expect(hourly).toHaveValue('');
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('.course.flipping-privat.v2'))!;
    return JSON.parse(localStorage.getItem(key)!);
  });
  expect(saved.checks.beforeBid).toEqual(['mitt-lagrede-svar']);
  expect(saved.budget.lines['o-bad'].amount).toBe(123456);
  expect(saved.hurdle.minHourValue).toBe(875);
});


test('kursøkonomi: sluttcaset bruker separate lån og bevarer egne tall og prisgrunnlag', async ({ page }) => {
  await login(page);
  await page.goto('/#/kurs/flipping-privat?modul=sluttcase');
  await page.getByRole('button', { name: /Trinn 2/ }).click();
  await page.getByRole('textbox', { name: 'Lavt', exact: true }).fill('3100000');
  await page.getByRole('textbox', { name: 'Normalt', exact: true }).fill('3300000');
  await page.getByRole('textbox', { name: 'Høyt', exact: true }).fill('3500000');
  await page.getByRole('button', { name: /Trinn 5/ }).click();
  await page.getByRole('textbox', { name: 'Låneandel av kjøpesum', exact: true }).fill('75');
  await page.getByRole('textbox', { name: 'Låneandel av oppussing', exact: true }).fill('20');
  await expect(page.getByText('Betinget regneeksempel', { exact: true })).toBeVisible();
  await expect(page.getByTestId('course-recommended-bid')).not.toHaveText('Ikke beregnet');
  await noHorizontalScroll(page);
  await page.reload();
  await page.getByRole('button', { name: /Trinn 5/ }).click();
  await expect(page.getByRole('textbox', { name: 'Låneandel av kjøpesum', exact: true })).toHaveValue('75');
  await expect(page.getByRole('textbox', { name: 'Låneandel av oppussing', exact: true })).toHaveValue('20');
  await page.getByRole('button', { name: /Trinn 2/ }).click();
  await expect(page.getByRole('textbox', { name: 'Normalt', exact: true })).toHaveValue(/3\s?300\s?000/);
  await page.getByRole('radio', { name: 'Kontantpris', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /Trinn 2/ }).click();
  await expect(page.getByRole('radio', { name: 'Kontantpris', exact: true })).toHaveAttribute('aria-checked', 'true');
});
