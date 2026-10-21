import { describe, expect, it } from 'vitest';
import type { Breakdown } from '../../../calc/engine';
import { buildBaseValues, evaluateScenario } from '../../../calc/scenario';
import { buildScenarioComparison } from '../../../calc/scenarioComparison';
import { NEW_ACCOUNT_DEFAULTS } from '../../../config/defaults';
import { buildProperty } from '../../../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../../../data/seedProperties';
import { resolveAnalysisScenarios } from '../../../domain/analysisScenarios';
import { niceTicks } from '../charts/scale';
import { atPurchasePrice, costSegments, limitRows, niceStep, priceSteps, sensitivitySeries } from './charts';
import { scenarioDelta } from './delta';
import { buildDrivers, MAX_DRIVERS, type DriverInput } from './drivers';
import { signedNOK, signedNumber, signedPct } from './format';
import { buildScorecard, SCORE_RULES, type ScorecardInput } from './scorecard';

const NOW = new Date('2026-10-16T08:00:00.000Z');

function scenariosOf(finnId: string) {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === finnId)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  return resolveAnalysisScenarios(built.analysis).map((d) => {
    const values = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: d.id }).values;
    return { def: d, ev: evaluateScenario(values).evaluation, values };
  });
}

describe('Investment: scenariodelta (ren regnskapsidentitet over motorresultater)', () => {
  const sets = [DEMO_FINN.sharedAB, ...SEED_PROPERTIES.slice(0, 6).map((s) => s.finnId)].map(scenariosOf);

  it('linjene summerer alltid til endringen i fortjeneste, for alle par av scenarioer i demodataene', () => {
    let pairs = 0;
    for (const set of sets) {
      const complete = set.filter((s) => s.ev.base);
      for (const a of complete) {
        for (const b of complete) {
          if (a === b) continue;
          const d = scenarioDelta(a.ev.base as Breakdown, b.ev.base as Breakdown);
          expect(d.lines.reduce((s, l) => s + l.amount, 0)).toBe(d.netProfit);
          expect(d.netProfit).toBe(Math.round((a.ev.base as Breakdown).profit) - Math.round((b.ev.base as Breakdown).profit));
          pairs++;
        }
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it('delta mot seg selv er null, og fortegn følger motorens tall', () => {
    const [basis, alt] = sets[0].filter((s) => s.ev.base);
    const b = basis.ev.base as Breakdown;
    const self = scenarioDelta(b, b);
    expect(self.netProfit).toBe(0);
    expect(self.lines.every((l) => l.amount === 0)).toBe(true);
    const a = alt.ev.base as Breakdown;
    const d = scenarioDelta(a, b);
    expect(d.sale).toBe(Math.round(a.S - b.S));
    expect(d.renovation).toBe(Math.round(a.RB - b.RB));
    expect(d.months).toBe(a.months - b.months);
    // renovering koster mer => linjen er negativ når oppussingen øker (avrundingsrest kan flytte noen kroner)
    expect(Math.abs(d.lines.find((l) => l.id === 'renovation')!.amount + d.renovation)).toBeLessThanOrEqual(2);
    expect(d.purchase === null || d.purchase.alt !== d.purchase.base).toBe(true);
  });

  it('ukjent egenkapital/timer gir null (ikke 0)', () => {
    const [basis] = sets[0].filter((s) => s.ev.base);
    const b = basis.ev.base as Breakdown;
    const d = scenarioDelta({ ...b, ownHours: null, equityNeed: b.equityNeed, profitPerOwnHour: null }, b);
    expect(d.ownHours).toBeNull();
    expect(d.profitPerOwnHour).toBeNull();
  });
});

describe('Investment: delta i den automatiske sammenligningen er ren scenarioeffekt (samme kjøpspris)', () => {
  const spec = SEED_PROPERTIES.find((x) => x.finnId === DEMO_FINN.sharedAB)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  const defs = resolveAnalysisScenarios(built.analysis);
  const base = (id: string) => buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: id }).values;
  const compare = (price: number) =>
    buildScenarioComparison({ analysis: built.analysis, property: built.property, snapshot: built.snapshot, defaults: NEW_ACCOUNT_DEFAULTS, draft: { ...base(defs[0].id), purchasePrice: price }, activeName: 'Hovedscenario', riskBand: 'middels' });

  it('Basis, A og B har samme kjøpspris, så deltaet har ingen prislinje og ingen prisvarsel', () => {
    for (const price of [2_890_000, 2_950_000, 3_200_000]) {
      const c = compare(price);
      const b0 = c.rows[0].input.evaluation.base as Breakdown;
      for (const r of c.rows) expect((r.input.evaluation.base as Breakdown).P).toBe(price);
      for (const r of c.rows.slice(1)) {
        const d = scenarioDelta(r.input.evaluation.base as Breakdown, b0);
        expect(d.purchase, `P ${price}`).toBeNull();
        expect(d.lines.map((l) => l.id)).not.toContain('purchase');
        expect(d.lines.reduce((s, l) => s + l.amount, 0)).toBe(d.netProfit);
      }
    }
  });

  it('forsvaret mot feil: ulik kjøpspris oppdages fortsatt og gir en egen linje', () => {
    const c = compare(2_950_000);
    const b0 = c.rows[0].input.evaluation.base as Breakdown;
    const other = evaluateScenario({ ...c.rows[1].values, purchasePrice: 2_890_000 }).evaluation.base as Breakdown;
    const d = scenarioDelta(other, b0);
    expect(d.purchase).toEqual({ alt: 2_890_000, base: 2_950_000 });
    expect(d.lines.find((l) => l.id === 'purchase')?.amount).toBeGreaterThan(0);
  });

  it('deltaet endres med scenarioet, ikke med kjøpsprisen i kalkylen (salgsverdi og oppussing er prisuavhengige)', () => {
    const at = (p: number) => {
      const c = compare(p);
      return scenarioDelta(c.rows[1].input.evaluation.base as Breakdown, c.rows[0].input.evaluation.base as Breakdown);
    };
    const lo = at(2_700_000);
    const hi = at(3_400_000);
    expect(lo.sale).toBe(hi.sale);
    expect(lo.renovation).toBe(hi.renovation);
    expect(lo.months).toBe(hi.months);
  });
});

describe('Investment: sensitivitet og maksbudgrenser bruker motoren', () => {
  const ev = scenariosOf(DEMO_FINN.sharedAB).find((s) => s.ev.base)!.ev;

  it('ved dagens kjøpspris gir sensitiviteten nøyaktig kalkylens tall', () => {
    const b = ev.base as Breakdown;
    const at = atPurchasePrice(ev, b.P)!;
    expect(at.profit).toBe(b.profit);
    expect(at.projectReturn).toBe(b.projectReturn);
    expect(at.equityNeed).toBe(b.equityNeed);
    expect(at.profitPerOwnHour).toBe(b.profitPerOwnHour);
  });

  it('høyere kjøpspris gir lavere fortjeneste og høyere egenkapitalbehov', () => {
    const b = ev.base as Breakdown;
    const lo = atPurchasePrice(ev, b.P - 200_000)!;
    const hi = atPurchasePrice(ev, b.P + 200_000)!;
    expect(lo.profit).toBeGreaterThan(b.profit);
    expect(hi.profit).toBeLessThan(b.profit);
    expect(hi.equityNeed).toBeGreaterThan(lo.equityNeed);
  });

  it('fortjenesten ved maksbudet oppfyller målene, og ett steg over gjør ikke det', () => {
    const rec = ev.recommendedMaxBid!;
    const price = rec.price!;
    const at = atPurchasePrice(ev, price)!;
    const profitLimit = rec.limits.find((l) => l.id === 'profit');
    if (profitLimit) expect(at.profit).toBeGreaterThanOrEqual(profitLimit.target - 1);
    const over = atPurchasePrice(ev, price + 5000)!;
    const hourly = rec.limits.find((l) => l.id === 'hourly');
    const violates = (profitLimit && over.profit < profitLimit.target) || (hourly && over.profitPerOwnHour !== null && over.profitPerOwnHour < hourly.target);
    expect(Boolean(violates)).toBe(true);
  });

  it('uten komplett kalkyle finnes ingen sensitivitet', () => {
    expect(atPurchasePrice({ resolved: null, base: null }, 3_000_000)).toBeNull();
    expect(sensitivitySeries({ resolved: null, base: null }, 1, 2)).toEqual([]);
  });

  it('maksbudgrensene: anbefalt er laveste av de som teller, og avkastningsrader er bare informasjon', () => {
    const rows = limitRows(ev);
    const counting = rows.filter((r) => r.counts && r.price !== null);
    expect(counting.length).toBeGreaterThan(0);
    expect(Math.min(...counting.map((r) => r.price as number))).toBe(ev.recommendedMaxBid!.price);
    expect(rows.filter((r) => r.limiting)).toHaveLength(1);
    const info = rows.filter((r) => r.id.startsWith('return-'));
    expect(info.length).toBeGreaterThan(0);
    expect(info.every((r) => !r.counts && !r.limiting)).toBe(true);
  });

  it('kostnadsfordelingen summerer til samlet kostnad', () => {
    const b = ev.base as Breakdown;
    const sum = costSegments(b).reduce((s, x) => s + x.amount, 0);
    expect(Math.abs(sum - b.C)).toBeLessThan(0.05);
  });

  it('rene prissteg rundt kjøpsprisen', () => {
    expect(niceStep(3_000_000)).toBe(200_000);
    expect(niceStep(900_000)).toBe(100_000);
    expect(niceStep(300_000)).toBe(25_000);
    const steps = priceSteps(3_400_000);
    expect(steps).toHaveLength(7);
    expect(steps[3]).toBe(3_400_000);
    expect(steps.every((p, i) => i === 0 || p > steps[i - 1])).toBe(true);
  });
});

const baseCard = (over: Partial<ScorecardInput> = {}): ScorecardInput => {
  const b = scenariosOf(DEMO_FINN.sharedAB).find((s) => s.ev.base)!.ev.base as Breakdown;
  return { base: b, maxBid: b.P + 100_000, maxBidStatus: 'ok', risk: { band: 'middels', score: 5, top: 'Bjelkelag under bad' }, feasibility: 'klar', saleCertainty: 1, saleCertaintyLabel: 'Svært godt grunnlag', ...over };
};
const lv = (i: ScorecardInput, id: string) => buildScorecard(i).find((d) => d.id === id)!;

describe('Investment: case-scorecard (eksplisitte regler, ingen ny økonomi)', () => {
  it('har seks dimensjoner med nivå som tekst og en forklaring', () => {
    const card = buildScorecard(baseCard());
    expect(card.map((d) => d.id)).toEqual(['okonomi', 'marked', 'gjennomforbarhet', 'kapital', 'risiko', 'arbeid']);
    for (const d of card) {
      expect(d.text.length).toBeGreaterThan(0);
      expect(d.why.length).toBeGreaterThan(5);
      expect(d.rule.length).toBeGreaterThan(5);
    }
  });

  it('økonomi: sterk under maksbud, middels over, svak uten positiv fortjeneste, uavklart uten kalkyle', () => {
    expect(lv(baseCard({ maxBid: 9_000_000 }), 'okonomi').level).toBe('sterk');
    const b = baseCard().base as Breakdown;
    expect(lv(baseCard({ maxBid: b.P - 150_000 }), 'okonomi').level).toBe('middels');
    expect(lv(baseCard({ base: { ...b, profit: -10 } }), 'okonomi').level).toBe('svak');
    expect(lv(baseCard({ maxBidStatus: 'none', maxBid: null }), 'okonomi').level).toBe('svak');
    expect(lv(baseCard({ base: null }), 'okonomi').level).toBe('uavklart');
  });

  it('marked: følger sikkerheten og regner uavklart som uavklart – ikke middels', () => {
    expect(lv(baseCard({ saleCertainty: 1 }), 'marked').level).toBe('sterk');
    expect(lv(baseCard({ saleCertainty: 0.75 }), 'marked').level).toBe('god');
    expect(lv(baseCard({ saleCertainty: 0.4 }), 'marked').level).toBe('middels');
    expect(lv(baseCard({ saleCertainty: 0.1 }), 'marked').level).toBe('svak');
    expect(lv(baseCard({ saleCertainty: 0.3, saleCertaintyLabel: 'Uavklart' }), 'marked').level).toBe('uavklart');
    expect(lv(baseCard({ saleCertainty: null, saleCertaintyLabel: null }), 'marked').level).toBe('uavklart');
    expect(SCORE_RULES.marketStrong).toBeGreaterThan(SCORE_RULES.marketGood);
  });

  it('gjennomførbarhet: betinget og uavklart kan ikke se bedre ut enn middels', () => {
    expect(lv(baseCard({ feasibility: 'klar' }), 'gjennomforbarhet').level).toBe('sterk');
    expect(lv(baseCard({ feasibility: 'betinget' }), 'gjennomforbarhet').level).toBe('middels');
    expect(lv(baseCard({ feasibility: 'uavklart' }), 'gjennomforbarhet').level).toBe('uavklart');
    expect(lv(baseCard({ feasibility: 'ikke_gjennomforbar' }), 'gjennomforbarhet').level).toBe('svak');
  });

  it('kapital: gap gir høyt, tett gir middels, ukjent egenkapital er uavklart – ikke dekket', () => {
    const b = baseCard().base as Breakdown;
    expect(lv(baseCard({ base: { ...b, availableEquity: 1_000_000, equityNeed: 400_000, equityGap: 0 } }), 'kapital').level).toBe('god');
    expect(lv(baseCard({ base: { ...b, availableEquity: 1_000_000, equityNeed: 950_000, equityGap: 0 } }), 'kapital').level).toBe('middels');
    expect(lv(baseCard({ base: { ...b, availableEquity: 300_000, equityNeed: 1_100_000, equityGap: 800_000 } }), 'kapital').text).toBe('Høyt');
    expect(lv(baseCard({ base: { ...b, availableEquity: null, equityGap: null } }), 'kapital').level).toBe('uavklart');
  });

  it('risiko: uten vurderte risikoer er nivået uavklart, ikke lavt', () => {
    expect(lv(baseCard({ risk: { band: 'uavklart', score: null, top: null } }), 'risiko').level).toBe('uavklart');
    expect(lv(baseCard({ risk: { band: 'lav', score: 2, top: null } }), 'risiko').level).toBe('sterk');
    expect(lv(baseCard({ risk: { band: 'hoy', score: 8, top: 'Fukt' } }), 'risiko').level).toBe('svak');
  });

  it('arbeid: 0 timer er ingen egeninnsats, ukjent er uavklart, og intensiteten følger timer per måned', () => {
    const b = baseCard().base as Breakdown;
    expect(lv(baseCard({ base: { ...b, ownHours: 0 } }), 'arbeid').text).toBe('Ingen egeninnsats');
    expect(lv(baseCard({ base: { ...b, ownHours: null } }), 'arbeid').level).toBe('uavklart');
    expect(lv(baseCard({ base: { ...b, ownHours: 10 * b.months } }), 'arbeid').level).toBe('sterk');
    expect(lv(baseCard({ base: { ...b, ownHours: 40 * b.months } }), 'arbeid').level).toBe('middels');
    expect(lv(baseCard({ base: { ...b, ownHours: 90 * b.months } }), 'arbeid').level).toBe('svak');
  });
});

describe('Investment: hva driver caset', () => {
  const none: DriverInput = { base: null, scenario: null, snapshotBedrooms: null, marketTier: null, primaryReferences: 0, sameBuildingReference: false, risks: [], unknownRisks: 0, missingChecks: 0, maxBid: null, maxBidStatus: null, hourlyTarget: null };
  const scenario = (over: object = {}) => ({
    title: 'Tre rom',
    feasibility: 'klar' as const,
    requiresApproval: false,
    requirements: [] as string[],
    screening: undefined,
    endProduct: { bedrooms: 3, standardClass: 'nyoppusset' as const, layoutNote: '', kitchenChange: 'nytt' as const, bathChange: 'ingen' as const },
    ...over,
  });

  it('tom input gir ingen drivere (ingenting oppfinnes)', () => {
    expect(buildDrivers(none)).toEqual({ up: [], down: [] });
  });

  it('oppside fra scenarioet og markedet, nedside fra krav, risiko og dokumentasjon', () => {
    const d = buildDrivers({
      ...none,
      scenario: scenario({ requiresApproval: true, requirements: ['Avklar bæresystem'] }),
      snapshotBedrooms: 2,
      marketTier: 'svaert_godt',
      sameBuildingReference: true,
      risks: [{ title: 'Bjelkelag under bad', level: 5 }],
      unknownRisks: 1,
      missingChecks: 2,
    });
    expect(d.up.map((x) => x.text)).toEqual(expect.arrayContaining(['+1 soverom (2 → 3)', 'Kjøkken: nytt', 'Sluttstandard: nyoppusset', 'Dokumentert salg i samme bygg som referanse']));
    expect(d.down.map((x) => x.text).join(' | ')).toMatch(/Avklar bæresystem/);
    expect(d.down.map((x) => x.text).join(' | ')).toMatch(/Bjelkelag under bad \(alvorlighet 5\/10\)/);
    expect(d.down.map((x) => x.text).join(' | ')).toMatch(/1 risiko med ukjent alvorlighet/);
    expect(d.down.map((x) => x.text).join(' | ')).toMatch(/2 sjekkpunkter mangler/);
    expect(d.up.length).toBeLessThanOrEqual(MAX_DRIVERS);
    expect(d.down.length).toBeLessThanOrEqual(MAX_DRIVERS);
  });

  it('kalkylen: maksbudmargin, timekrav og negativ fortjeneste', () => {
    const b = baseCard().base as Breakdown;
    const up = buildDrivers({ ...none, base: b, maxBid: b.P + 120_500, maxBidStatus: 'ok' });
    expect(up.up[0].text).toMatch(/under anbefalt maksbud/);
    const down = buildDrivers({ ...none, base: { ...b, profit: -5, meetsHourlyRequirement: false }, hourlyTarget: 500, maxBid: b.P - 60_000, maxBidStatus: 'ok' });
    const txt = down.down.map((x) => x.text).join(' | ');
    expect(txt).toMatch(/over anbefalt maksbud/);
    expect(txt).toMatch(/Timekravet/);
    expect(txt).toMatch(/Forventet fortjeneste er/);
  });
});

describe('Investment: akseverdier', () => {
  it('gir pene, jevne verdier som dekker intervallet og tar med 0', () => {
    const t = niceTicks(-900_000, 1_200_000, 4);
    expect(t).toContain(0);
    expect(t[0]).toBeGreaterThanOrEqual(-900_000);
    expect(t[t.length - 1]).toBeLessThanOrEqual(1_200_000);
    const steps = t.slice(1).map((v, i) => v - t[i]);
    expect(new Set(steps).size).toBe(1);
    expect(niceTicks(2_000_000, 3_800_000, 3).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Investment: formatering av endringer', () => {
  it('fortegn og ukjent', () => {
    expect(signedNOK(140_000)).toMatch(/^\+/);
    expect(signedNOK(-32_000)).toMatch(/^[−-]/);
    expect(signedNOK(null)).toBe('Ikke beregnet');
    expect(signedNumber(55, 't')).toBe('+55 t');
    expect(signedNumber(-1.5, 'mnd')).toBe('−1,5 mnd');
    expect(signedNumber(0, 't')).toBe('0 t');
    expect(signedNumber(null, 't')).toBe('Ikke avklart');
    expect(signedPct(0.021)).toBe('+2,1 prosentpoeng');
    expect(signedPct(-0.0049)).toBe('−0,5 prosentpoeng');
    expect(signedPct(null)).toBe('Ikke beregnet');
  });
});
