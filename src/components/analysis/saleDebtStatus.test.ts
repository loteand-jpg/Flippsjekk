import { describe, expect, it } from 'vitest';
import { resolveSalePricesForDebt } from '../../calc/saleValue';
import { analysisScenarioValues, buildBaseValues, saleValuesAfterDebtChange } from '../../calc/scenario';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { buildProperty } from '../../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../../data/seedProperties';
import { resolveAnalysisScenarios } from '../../domain/analysisScenarios';
import type { ScenarioValues, SharedAnalysis } from '../../domain/schemas';
import { collectSaleDebtStatus, describeSaleDebtIssue, SALE_DEBT_HELP_TEXT, saleDebtHelp, saleDebtIssuesForDraft, saleDebtStatuses } from './saleDebtStatus';

const NOW = new Date('2026-10-16T08:00:00.000Z');
const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);

/** Analyse der markedsmotoren regner totalverdi og leverer kontantverdier med analysens fellesgjeld (300 000) trukket fra. */
function analysisWith(debt: number, basis: 'kontant' | 'total'): SharedAnalysis {
  const a = structuredClone(built.analysis);
  a.estimates.debtAtSale = debt;
  for (const s of a.estimates.scenarios ?? []) if (s.sale) s.sale.basis = basis;
  return a;
}
const baseOf = (analysis: SharedAnalysis, scenarioIndex = 0) => buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: resolveAnalysisScenarios(analysis)[scenarioIndex].id });

describe('hjelpetekst ved «Fellesgjeld ved salg» velges ut fra faktisk kilde', () => {
  it('A. totalpris: trekkes fra totalprisen én gang, og kontantdelen følger gjelden', () => {
    const base = baseOf(analysisWith(300_000, 'total'));
    expect(base.values.saleBasis).toBe('total');
    const h = saleDebtHelp({ draft: base.values, base });
    expect(h.kind).toBe('total');
    expect(h.text).toMatch(/Trekkes fra totalprisen én gang/);
    expect(h.text).toMatch(/endres kontantdelen av salgsverdien tilsvarende/);
  });

  it('B. kontantpris avledet av en beregnet totalverdi: kontantprisen justeres så totalverdien beholdes', () => {
    const base = baseOf(analysisWith(300_000, 'kontant'));
    expect(base.saleResolution.source).toBe('markedsmotor');
    const h = saleDebtHelp({ draft: base.values, base });
    expect(h.kind).toBe('markedsavledet');
    expect(h.text).toMatch(/beregnet totalverdi/);
    expect(h.text).toMatch(/justeres kontantprisen slik at totalverdien beholdes/);
  });

  it('C. direkte oppgitt kontantpris (eldre analyse, agentestimat): endrer ikke salgsverdien automatisk', () => {
    const legacy = buildProperty({ ...SEED_PROPERTIES.find((s) => s.finnId === '900000106')!, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
    const base = buildBaseValues({ property: legacy.property, snapshot: legacy.snapshot, analysis: legacy.analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    expect(base.values.saleBasis).toBe('kontant');
    expect(base.saleResolution.sale.debtBasis).toBeNull();
    const h = saleDebtHelp({ draft: base.values, base });
    expect(h.kind).toBe('direkte');
    expect(h.text).toMatch(/oppgitt som kontantpris/);
    expect(h.text).toMatch(/endrer ikke denne salgsverdien automatisk/);
  });

  it('en verdi brukeren selv har skrevet inn regnes som direkte oppgitt, og blandet kilde forklares som det', () => {
    const base = baseOf(analysisWith(300_000, 'kontant'));
    const own: ScenarioValues = { ...base.values, saleLow: 1_234_000, saleBase: 2_345_000, saleHigh: 3_456_000 };
    expect(saleDebtHelp({ draft: own, base }).kind).toBe('direkte');
    const mixed: ScenarioValues = { ...base.values, saleBase: 2_345_000 };
    const h = saleDebtHelp({ draft: mixed, base });
    expect(h.kind).toBe('delvis_markedsavledet');
    expect(h.text).toBe(SALE_DEBT_HELP_TEXT.delvis_markedsavledet);
    // uten kjent grunnlag: ikke anta at verdien er avledet
    expect(saleDebtHelp({ draft: base.values, base: null }).kind).toBe('direkte');
  });

  it('teksten skifter ikke i utakt med faktisk atferd: følger gjelden etter en endring, og er «direkte» etter at brukeren overstyrer', () => {
    const base = baseOf(analysisWith(300_000, 'kontant'));
    const baseSale = { basis: base.values.saleBasis, low: base.values.saleLow, base: base.values.saleBase, high: base.values.saleHigh, debtBasis: base.saleResolution.sale.debtBasis };
    const after: ScenarioValues = { ...base.values, ...saleValuesAfterDebtChange({ draft: base.values, nextDebt: 200_000, baseSale }) };
    expect(saleDebtHelp({ draft: after, base }).kind).toBe('markedsavledet');
  });

  it('ingen intern teknisk tekst i hjelpeteksten', () => {
    for (const t of Object.values(SALE_DEBT_HELP_TEXT)) expect(t).not.toMatch(/debtBasis|derivedWithDebt|saleBasis|intern|modell/i);
  });
});

describe('felles status for fellesgjeld ved salg', () => {
  it('A. gjeld_ukjent: advarsel med tittel og forklaring – ukjent er ikke 0', () => {
    const s = describeSaleDebtIssue({ kind: 'gjeld_ukjent' });
    expect(s.severity).toBe('warning');
    expect(s.title).toBe('Fellesgjeld ved salg er ikke avklart');
    expect(s.message).toMatch(/Kontant salgsverdi kan ikke fastsettes sikkert før fellesgjelden ved salg er kjent/);
    expect(s.message).toMatch(/Ukjent er ikke 0 kr/);
  });

  it('B. gjeld_over_totalverdi: feil med tittel og forklaring', () => {
    const s = describeSaleDebtIssue({ kind: 'gjeld_over_totalverdi' });
    expect(s.severity).toBe('error');
    expect(s.title).toBe('Fellesgjeld er høyere enn beregnet total salgsverdi');
    expect(s.message).toMatch(/Kontant salgsverdi kan derfor ikke beregnes/);
    expect(s.message).toMatch(/Kontroller fellesgjeld eller salgsverdi/);
  });

  it('C. ingen problem gir ingen varsel', () => {
    expect(collectSaleDebtStatus([])).toEqual([]);
    expect(collectSaleDebtStatus([{ title: 'Basis', issues: [] }])).toEqual([]);
    const base = baseOf(analysisWith(300_000, 'kontant'));
    expect(saleDebtIssuesForDraft(base.values, base)).toEqual([]);
    expect(saleDebtStatuses({ draft: base.values, base, activeTitle: 'Basis' })).toEqual([]);
    // direkte kontantpris trenger ikke gjelden, også når den er ukjent
    const legacy = buildProperty({ ...SEED_PROPERTIES.find((s) => s.finnId === '900000106')!, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
    const lb = buildBaseValues({ property: legacy.property, snapshot: legacy.snapshot, analysis: legacy.analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    expect(saleDebtStatuses({ draft: { ...lb.values, debtAtSale: null }, base: lb, activeTitle: 'Basis' })).toEqual([]);
  });

  it('samler per type, alvorligste først, med hvilke scenarioer det gjelder', () => {
    const st = collectSaleDebtStatus([
      { title: 'Basis', issues: [{ kind: 'gjeld_ukjent' }] },
      { title: 'Alternativ A', issues: [{ kind: 'gjeld_over_totalverdi' }, { kind: 'gjeld_ukjent' }] },
      { title: 'Alternativ B', issues: [{ kind: 'gjeld_ukjent' }] },
    ]);
    expect(st.map((s) => s.kind)).toEqual(['gjeld_over_totalverdi', 'gjeld_ukjent']);
    expect(st[0].affects).toEqual(['Alternativ A']);
    expect(st[1].affects).toEqual(['Basis', 'Alternativ A', 'Alternativ B']);
  });

  it('kalkylens egen status kommer fra den delte beregningen (kontant avledet av totalverdi og totalpris)', () => {
    const k = baseOf(analysisWith(300_000, 'kontant'));
    // brukeren skriver en gjeld som er større enn totalverdien: verdiene beholdes og statusen sier fra
    const baseSale = { basis: k.values.saleBasis, low: k.values.saleLow, base: k.values.saleBase, high: k.values.saleHigh, debtBasis: k.saleResolution.sale.debtBasis };
    const tooMuch: ScenarioValues = { ...k.values, ...saleValuesAfterDebtChange({ draft: k.values, nextDebt: 99_000_000, baseSale }) };
    expect(tooMuch.saleBase).toBe(k.values.saleBase); // ikke endret, ikke 0 og ikke negativ
    expect(saleDebtStatuses({ draft: tooMuch, base: k, activeTitle: 'Basis' }).map((s) => s.kind)).toEqual(['gjeld_over_totalverdi']);
    const unknown: ScenarioValues = { ...k.values, ...saleValuesAfterDebtChange({ draft: k.values, nextDebt: null, baseSale }) };
    expect(saleDebtStatuses({ draft: unknown, base: k, activeTitle: 'Basis' }).map((s) => s.kind)).toEqual(['gjeld_ukjent']);
    // totalpris: gjelden er påkrevd og kan ikke overstige verdien
    const t = baseOf(analysisWith(300_000, 'total'));
    expect(saleDebtStatuses({ draft: { ...t.values, debtAtSale: null }, base: t, activeTitle: 'Basis' }).map((s) => s.kind)).toEqual(['gjeld_ukjent']);
    expect(saleDebtStatuses({ draft: { ...t.values, debtAtSale: 99_000_000 }, base: t, activeTitle: 'Basis' }).map((s) => s.kind)).toEqual(['gjeld_over_totalverdi']);
    expect(saleDebtStatuses({ draft: { ...t.values, debtAtSale: 120_000 }, base: t, activeTitle: 'Basis' })).toEqual([]);
  });

  it('en verdi brukeren selv har overstyrt gir ikke varsel om gjeld (den er ikke avledet av totalverdi)', () => {
    const k = baseOf(analysisWith(300_000, 'kontant'));
    const own: ScenarioValues = { ...k.values, debtAtSale: 99_000_000, saleLow: 1_000_000, saleBase: 2_000_000, saleHigh: 3_000_000 };
    expect(saleDebtStatuses({ draft: own, base: k, activeTitle: 'Basis' })).toEqual([]);
  });

  it('sammenligningen (andre scenarioer) og kalkylen gir samme status – samme kilde i alle designvarianter', () => {
    const analysis = analysisWith(300_000, 'kontant');
    const defs = resolveAnalysisScenarios(analysis);
    const k = baseOf(analysis);
    const user: ScenarioValues = { ...k.values, debtAtSale: 99_000_000 };
    const rows = defs.map((d) => ({ input: { id: d.id, title: d.title }, saleIssues: d.id === defs[0].id ? [] : analysisScenarioValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, user, analysisScenarioId: d.id }).saleIssues }));
    const st = saleDebtStatuses({ draft: user, base: k, activeTitle: defs[0].title, rows, activeId: defs[0].id });
    expect(st).toHaveLength(1);
    expect(st[0].kind).toBe('gjeld_over_totalverdi');
    expect(st[0].affects).toEqual(defs.map((d) => d.title)); // Basis (kalkylen) + begge alternativene
    // samme tekst som funksjonen for et enkelt problem
    expect(st[0].title).toBe(describeSaleDebtIssue({ kind: 'gjeld_over_totalverdi' }).title);
    // beregningen er uendret: samme issues som den delte funksjonen gir direkte
    expect(resolveSalePricesForDebt({ basis: 'kontant', prices: { low: 1, base: 2, high: 3 }, derivedWithDebt: 0, debtAtSale: 99 }).issues[0].kind).toBe('gjeld_over_totalverdi');
  });
});
