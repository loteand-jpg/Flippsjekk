import { describe, expect, it } from 'vitest';
import { recommendedBidOf, type Breakdown } from '../../../calc/engine';
import { buildBaseValues, evaluateScenario, renovationTotals } from '../../../calc/scenario';
import { buildScenarioComparison } from '../../../calc/scenarioComparison';
import { NEW_ACCOUNT_DEFAULTS } from '../../../config/defaults';
import { buildProperty } from '../../../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../../../data/seedProperties';
import { dataQuality } from '../../../domain/assessment';
import { resolveAnalysisScenarios } from '../../../domain/analysisScenarios';
import type { RenovationItem } from '../../../domain/schemas';
import { atPurchasePrice } from '../../shared/caseModel';
import { EMPTY_MEDIA, floorPlansFor, hasAnyImage, heroImage, type ListingMedia } from '../media/types';
import { atMaxBid, costParts } from './economy';
import { bedroomChange, bedroomsText, endProductView, todayView } from './endProduct';
import { buildHomeRisks } from './homeRisk';
import { buildKnowledge } from './knowledge';
import { groupByRoom, groupByWork, sequence, topMeasures, totalOf, WHOLE_HOME, WORK_ORDER } from './rooms';
import { buildVersions, deltaLine, versionDelta } from './versions';
import { buildViewingPack } from './viewing';

const NOW = new Date('2026-10-16T08:00:00.000Z');

function built(finnId: string) {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === finnId)!;
  return buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
}

function compare(finnId: string, price?: number) {
  const b = built(finnId);
  const defs = resolveAnalysisScenarios(b.analysis);
  const base = buildBaseValues({ property: b.property, snapshot: b.snapshot, analysis: b.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: defs[0].id }).values;
  const draft = price === undefined ? base : { ...base, purchasePrice: price };
  const c = buildScenarioComparison({ analysis: b.analysis, property: b.property, snapshot: b.snapshot, defaults: NEW_ACCOUNT_DEFAULTS, draft, activeName: 'Min kalkyle', riskBand: 'middels' });
  return { b, defs, draft, c, versions: buildVersions({ defs: c.defs, rows: c.rows, result: c.result, activeId: c.activeId }) };
}

const item = (over: Partial<RenovationItem>): RenovationItem => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  room: 'Bad',
  title: 'Tiltak',
  materials: 10_000,
  electrician: 0,
  plumber: 0,
  other: 0,
  hours: 10,
  priority: 'anbefalt',
  included: true,
  ...over,
});

describe('Property: medielag (ingen bilder i datamodellen)', () => {
  it('uten media finnes ingen hovedbilde, ingen bilder og ingen plantegninger', () => {
    expect(heroImage(EMPTY_MEDIA)).toBeNull();
    expect(hasAnyImage(EMPTY_MEDIA)).toBe(false);
    expect(floorPlansFor(EMPTY_MEDIA, 'x')).toEqual({ current: [], proposed: [] });
    expect(EMPTY_MEDIA.rooms).toEqual([]);
  });

  it('når datakilden leverer media: hovedbilde er eksplisitt bilde, ellers første bilde', () => {
    const img = (id: string) => ({ id, url: `/${id}.jpg`, alt: id });
    const m: ListingMedia = { ...EMPTY_MEDIA, images: [img('a'), img('b')] };
    expect(heroImage(m)?.id).toBe('a');
    expect(heroImage({ ...m, mainImage: img('hoved') })?.id).toBe('hoved');
    expect(hasAnyImage(m)).toBe(true);
  });

  it('plantegninger velges per scenario: dagens plan gjelder alltid, foreslått plan bare for sitt scenario (eller uten tilknytning)', () => {
    const fp = (id: string, kind: 'current' | 'proposed', scenarioId?: string | null) => ({ id, url: `/${id}.png`, alt: id, kind, scenarioId });
    const m: ListingMedia = { ...EMPTY_MEDIA, floorPlans: [fp('i-dag', 'current'), fp('a', 'proposed', 's1'), fp('b', 'proposed', 's2'), fp('felles', 'proposed', null)] };
    const r = floorPlansFor(m, 's1');
    expect(r.current.map((f) => f.id)).toEqual(['i-dag']);
    expect(r.proposed.map((f) => f.id)).toEqual(['a', 'felles']);
    expect(floorPlansFor(m, null).proposed.map((f) => f.id)).toEqual(['felles']);
  });
});

describe('Property: oppussing gruppert etter rom, arbeidstype og rekkefølge', () => {
  const items = [
    item({ id: '1', room: 'Bad', title: 'Nytt gulv bad', laborCategory: 'bad_vatrom', materials: 20_000, laborHours: 20, laborCostHired: 30_000 }),
    item({ id: '2', room: 'bad', title: 'Rive flis', laborCategory: 'riving', materials: 2_000, laborHours: 8, laborCostHired: 0 }),
    item({ id: '3', room: 'Stue', title: 'Male', laborCategory: 'maling_sparkling', materials: 5_000, laborHours: 12, laborCostHired: 0, priority: 'valgfri' }),
    item({ id: '4', room: '  ', title: 'Nye dører', materials: 8_000, electrician: 0, plumber: 0, other: 0, hours: 4 }),
    item({ id: '5', room: 'Stue', title: 'Ikke med', materials: 99_000, included: false, laborCategory: 'gulv', laborHours: 1, laborCostHired: 0 }),
  ];

  it('slår sammen rom uavhengig av store/små bokstaver og samler tiltak uten rom under «Hele boligen»', () => {
    const g = groupByRoom(items, {});
    expect(g.map((x) => x.label)).toEqual(['Bad', 'Stue', WHOLE_HOME]);
    expect(g[0].items).toHaveLength(2);
  });

  it('summerer bare tiltak som er med, og teller de som ikke er med separat', () => {
    const stue = groupByRoom(items, {}).find((x) => x.label === 'Stue')!;
    expect(stue.includedCount).toBe(1);
    expect(stue.excludedCount).toBe(1);
    expect(stue.cost).toBe(5_000);
    expect(stue.byPriority.valgfri).toBe(1);
  });

  it('ukjent kostnad er ukjent – ikke 0 – i gruppen og i totalen', () => {
    const withUnknown = [...items, item({ id: '6', room: 'Stue', materials: null })];
    const g = groupByRoom(withUnknown, {});
    expect(g.find((x) => x.label === 'Stue')!.cost).toBeNull();
    expect(g.find((x) => x.label === 'Stue')!.unknownCostCount).toBe(1);
    expect(totalOf(g).cost).toBeNull();
    expect(totalOf(g.filter((x) => x.label !== 'Stue')).cost).not.toBeNull();
  });

  it('arbeidstyper kommer i veiledende rekkefølge, og tiltak uten arbeidskategori ligger utenfor rekkefølgen', () => {
    const { steps, unplaced } = sequence(items, {});
    const ids = steps.map((s) => s.id.replace('arbeid-', ''));
    const order = ids.map((id) => WORK_ORDER.indexOf(id as (typeof WORK_ORDER)[number]));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(ids[0]).toBe('riving');
    expect(steps.map((s) => s.step)).toEqual(steps.map((_, i) => i + 1));
    expect(unplaced?.items.map((i) => i.item.id)).toEqual(['4']);
    expect(groupByWork(items, {}).at(-1)?.id).toBe('arbeid-ingen');
  });

  it('topMeasures velger største kostnad først og hopper over tiltak som ikke er med', () => {
    const groups = groupByRoom(items, {});
    const all = groups.flatMap((g) => g.items);
    const top = topMeasures(all, 2);
    expect(top).toHaveLength(2);
    expect(top.every((t) => t.item.included)).toBe(true);
    expect((top[0].econ.cost ?? 0) >= (top[1].econ.cost ?? 0)).toBe(true);
  });

  it('for hvert seed-scenario stemmer summen av rom-gruppene og arbeidstype-gruppene med motorens oppussingssum (før reserve)', () => {
    for (const spec of SEED_PROPERTIES) {
      const b = built(spec.finnId);
      for (const d of resolveAnalysisScenarios(b.analysis)) {
        const values = buildBaseValues({ property: b.property, snapshot: b.snapshot, analysis: b.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: d.id }).values;
        if (values.renovationMode !== 'tiltak') continue;
        const t = renovationTotals(values);
        const labor = { laborModes: values.laborModes, maxOwnWork: values.maxOwnWork, regulatedCompetence: values.regulatedCompetence };
        const rooms = totalOf(groupByRoom(values.renovationItems, labor));
        const work = totalOf(groupByWork(values.renovationItems, labor));
        expect(rooms.cost, `${spec.finnId} ${d.id} rom`).toBe(t.total);
        expect(work.cost, `${spec.finnId} ${d.id} arbeid`).toBe(t.total);
        expect(rooms.ownHours, `${spec.finnId} ${d.id} timer`).toBe(t.hours);
        expect(rooms.includedCount).toBe(t.includedCount);
      }
    }
  });
});

describe('Property: versjoner av boligen (delt scenariosammenligning)', () => {
  it('Elvekanten: Basis, Alternativ A og Alternativ B med riktige etiketter og én anbefalt versjon', () => {
    const { versions } = compare(DEMO_FINN.sharedAB);
    expect(versions.map((v) => v.label)).toEqual(['Basis', 'Alternativ A', 'Alternativ B']);
    expect(versions.map((v) => v.short)).toEqual(['Basis', 'Alt A', 'Alt B']);
    expect(versions.filter((v) => v.recommended)).toHaveLength(1);
    expect(versions.filter((v) => v.active)).toHaveLength(1);
  });

  it('alle versjoner har samme kjøpspris (felles ramme), også ved en annen pris i kalkylen', () => {
    for (const price of [2_890_000, 2_950_000, 3_250_000]) {
      const { versions } = compare(DEMO_FINN.sharedAB, price);
      expect(versions.map((v) => v.b?.P)).toEqual([price, price, price]);
    }
  });

  it('maksbud per versjon er motorens anbefalte maksbud, avrundet ned til hele tusen', () => {
    for (const v of compare(DEMO_FINN.sharedAB).versions) {
      const bid = recommendedBidOf(v.ev);
      expect(v.bidPrice).toBe(bid.price);
      expect(v.bidFloor).toBe(bid.price === null ? null : Math.floor(bid.price / 1000) * 1000);
      expect(v.bidFloor === null || v.bidFloor % 1000 === 0).toBe(true);
    }
  });

  it('delta mot Basis er differansen mellom to motorresultater og summerer til endringen i fortjeneste', () => {
    const { versions } = compare(DEMO_FINN.sharedAB);
    const [base, ...alts] = versions;
    expect(versionDelta(base, base)).toBeNull();
    for (const a of alts) {
      const d = versionDelta(a, base)!;
      expect(d.raw.netProfit).toBe(Math.round((a.b as Breakdown).profit) - Math.round((base.b as Breakdown).profit));
      expect(d.raw.lines.reduce((s, l) => s + l.amount, 0)).toBe(d.raw.netProfit);
      expect(d.raw.purchase).toBeNull();
      expect(d.facts.map((f) => f.id)).toEqual(expect.arrayContaining(['invest', 'hours', 'months', 'sale', 'profit']));
      expect(deltaLine(a, base)).toMatch(/oppussing/);
    }
  });

  it('delta formuleres som tekst med fortegn, og ukjent egeninnsats er «ikke avklart» – ikke 0', () => {
    const { versions } = compare(DEMO_FINN.sharedAB);
    const [base, alt] = versions;
    const d = versionDelta(alt, base)!;
    const hours = d.facts.find((f) => f.id === 'hours')!;
    expect(hours.text).toMatch(/egne timer|Like mange/);
    const unknown = { ...alt, b: { ...(alt.b as Breakdown), ownHours: null } };
    expect(versionDelta(unknown, base)!.facts.find((f) => f.id === 'hours')!.text).toBe('Egne timer ikke avklart');
  });

  it('en ufullstendig kalkyle kan ikke sammenlignes (ukjent er ikke 0 kr)', () => {
    const { versions } = compare(DEMO_FINN.sharedAB);
    const [base, alt] = versions;
    expect(versionDelta({ ...alt, b: null }, base)).toBeNull();
    expect(deltaLine({ ...alt, b: null }, base)).toMatch(/ufullstendig/);
  });

  it('en analyse med ett scenario gir én versjon og ingen delta', () => {
    const { versions } = compare(DEMO_FINN.unprofitable);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].label).toBe('Basis');
    if (versions.length === 1) expect(versionDelta(versions[0], versions[0])).toBeNull();
  });
});

describe('Property: økonomi ved maksbud (motorens computeCore)', () => {
  it('overskudd ved maksbud ligger ved fortjenestemålet, og kr/time er motorens', () => {
    const v = compare(DEMO_FINN.sharedAB).versions[0];
    const at = atMaxBid(v.ev)!;
    expect(at.price).toBe(v.bidFloor);
    expect(at.limitedBy).toBe(v.bidLimitedBy);
    const direct = atPurchasePrice(v.ev, at.price)!;
    expect(at.profit).toBe(direct.profit);
    expect(at.profitPerOwnHour).toBe(direct.profitPerOwnHour);
    // maksbudet er et tak: ved prisen er målet (fortjeneste eller timekrav) oppfylt, og 1 000 kr over er det ikke strengt bedre
    expect(at.profit).toBeGreaterThanOrEqual(0);
  });

  it('uten beregnet maksbud finnes ingen økonomi ved bud (ikke 0)', () => {
    const v = compare(DEMO_FINN.sharedAB).versions[0];
    expect(atMaxBid({ ...v.ev, recommendedMaxBid: null })).toBeNull();
    expect(atMaxBid({ ...v.ev, recommendedMaxBid: { ...v.ev.recommendedMaxBid!, price: null } })).toBeNull();
    expect(atMaxBid({ ...v.ev, resolved: null })).toBeNull();
  });

  it('kostnadsdelene summerer til samlet kostnad', () => {
    for (const v of compare(DEMO_FINN.sharedAB).versions) {
      const b = v.b as Breakdown;
      expect(Math.round(costParts(b).reduce((s, p) => s + p.amount, 0))).toBe(Math.round(b.C));
    }
  });
});

describe('Property: sluttprodukt og boligen i dag', () => {
  it('beskriver sluttproduktet fra scenarioets egne data', () => {
    const { defs } = compare(DEMO_FINN.sharedAB);
    const three = defs.find((d) => d.endProduct.bedrooms === 3)!;
    const v = endProductView(three, { standardClass: 'oppgradert', standardDocumented: false });
    expect(v.bedrooms).toBe('3 soverom');
    expect(v.standard).toEqual({ label: 'Oppgradert', documented: false });
    expect(v.notAssessed).toBe(false);
  });

  it('eldre analyse uten sluttprodukt: soverom ikke avklart og «ikke vurdert» – ingenting finnes på', () => {
    const legacy = resolveAnalysisScenarios({ ...built(DEMO_FINN.sharedAB).analysis, estimates: { ...built(DEMO_FINN.sharedAB).analysis.estimates, scenarios: undefined } })[0];
    const v = endProductView(legacy, null);
    expect(v.bedrooms).toBe('Soverom ikke avklart');
    expect(v.notAssessed).toBe(true);
    expect(v.kitchen.changes).toBeNull();
  });

  it('soveromstekst og endring: ukjent er ukjent', () => {
    expect(bedroomsText(null)).toBe('Soverom ikke avklart');
    expect(bedroomsText(1)).toBe('1 soverom');
    expect(bedroomsText(0)).toBe('0 soverom');
    expect(bedroomChange(2, 3)).toBe(1);
    expect(bedroomChange(null, 3)).toBeNull();
  });

  it('boligen i dag viser bare annonsens fakta, med «ikke oppgitt» for ukjent', () => {
    const b = built(DEMO_FINN.sharedAB);
    const t = todayView(b.property, b.snapshot);
    expect(t.facts.map((f) => f.label)).toEqual(['Boligtype', 'Bruksareal (BRA-i)', 'Rom', 'Soverom', 'Byggeår', 'Etasje']);
    const none = todayView(b.property, null);
    expect(none.facts.filter((f) => f.label !== 'Boligtype').every((f) => f.value === 'Ikke oppgitt')).toBe(true);
    expect(none.bedrooms).toBeNull();
  });
});

describe('Property: risiko knyttet til boligen – bare der analysen støtter det', () => {
  const scenario = (over: Partial<Parameters<typeof buildHomeRisks>[0]['scenario']> = {}): Parameters<typeof buildHomeRisks>[0]['scenario'] => ({
    endProduct: { bedrooms: 2, standardClass: null, layoutNote: '', kitchenChange: 'ingen', bathChange: 'ingen' },
    requirements: [],
    requiresApproval: false,
    risk: undefined,
    feasibilityRationale: '',
    saleSource: 'scenario',
    ...over,
  });
  const risk = (over: Partial<Parameters<typeof buildHomeRisks>[0]['risks'][number]>) => ({ id: 'r', title: 'Risiko', category: 'vatrom' as const, level: 6, costLow: null, costHigh: null, rationale: '', sourceId: null, action: 'Be om våtromsrapport', ...over });

  it('knytter risikoer til bad, elektrisk, tak og marked etter kategori', () => {
    const spots = buildHomeRisks({
      risks: [risk({ category: 'vatrom', level: 7 }), risk({ category: 'elektrisk', level: 3, title: 'Gammelt anlegg' }), risk({ category: 'tak_fasade', level: 4, title: 'Tak' }), risk({ category: 'marked', level: 5, title: 'Svakt marked' })],
      scenario: scenario(),
      saleCertaintyLabel: null,
      saleCertaintyBand: null,
    });
    expect(spots.map((s) => s.id)).toEqual(['bad', 'elektrisk', 'tak_fasade', 'marked']);
    expect(spots[0].band).toBe('hoy');
    expect(spots[0].levelText).toBe('Høy risiko');
    expect(spots[1].band).toBe('lav');
  });

  it('kjøkkenrisiko finnes bare når en risiko eller scenarioets kjøkkenendring gir grunnlag – en nøytral endring alene er ikke en risiko', () => {
    const none = buildHomeRisks({ risks: [], scenario: scenario({ endProduct: { bedrooms: 2, standardClass: null, layoutNote: '', kitchenChange: 'nytt', bathChange: 'nytt' } }), saleCertaintyLabel: null, saleCertaintyBand: null });
    expect(none).toEqual([]);
    const some = buildHomeRisks({ risks: [risk({ category: 'annet', title: 'Flytting av kjøkken krever nye ledninger', level: 5 })], scenario: scenario({ endProduct: { bedrooms: 2, standardClass: null, layoutNote: '', kitchenChange: 'nytt', bathChange: 'ingen' } }), saleCertaintyLabel: null, saleCertaintyBand: null });
    expect(some.map((s) => s.id)).toEqual(['kjokken']);
    expect(some[0].notes.join(' ')).toMatch(/nytt kjøkken/);
  });

  it('planløsning og godkjenning bygger på regulering, scenarioets krav og godkjenningsrisiko', () => {
    const spots = buildHomeRisks({
      risks: [risk({ category: 'regulering', level: 6, title: 'Bruksendring' })],
      scenario: scenario({ endProduct: { bedrooms: 3, standardClass: null, layoutNote: 'Ny vegg i stuen gir tredje soverom.', kitchenChange: 'ingen', bathChange: 'ingen' }, requirements: ['Søknad om tiltak'], requiresApproval: true, risk: { technical: 'lav', cost: 'middels', time: 'middels', approval: 'hoy', note: '' } }),
      saleCertaintyLabel: null,
      saleCertaintyBand: null,
    });
    const p = spots.find((s) => s.id === 'planlosning')!;
    expect(p.band).toBe('hoy');
    expect(p.notes).toEqual(expect.arrayContaining(['Ny vegg i stuen gir tredje soverom.', 'Søknad om tiltak']));
  });

  it('uavklart nivå er «uavklart» – ikke lav – og risikoer uten del av boligen (prosjekt, dokumentasjon) vises ikke her', () => {
    const spots = buildHomeRisks({ risks: [risk({ category: 'vatrom', level: null }), risk({ category: 'dokumentasjon', level: 9 }), risk({ category: 'prosjekt', level: 9 })], scenario: scenario(), saleCertaintyLabel: null, saleCertaintyBand: null });
    expect(spots.map((s) => s.id)).toEqual(['bad']);
    expect(spots[0].band).toBe('uavklart');
    expect(spots[0].levelText).toBe('Uavklart – ikke vurdert');
  });

  it('uten støtte i dataene returneres ingenting (visningen faller tilbake på de seks dimensjonene)', () => {
    expect(buildHomeRisks({ risks: [], scenario: scenario(), saleCertaintyLabel: null, saleCertaintyBand: null })).toEqual([]);
  });

  it('for hvert seed-objekt gir kartleggingen bare kjente deler og aldri tomme etiketter', () => {
    for (const spec of SEED_PROPERTIES) {
      const b = built(spec.finnId);
      for (const d of resolveAnalysisScenarios(b.analysis)) {
        for (const s of buildHomeRisks({ risks: b.analysis.risks, scenario: d, saleCertaintyLabel: null, saleCertaintyBand: null })) {
          expect(s.label.length).toBeGreaterThan(0);
          expect(s.levelText.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('Property: hva vet vi, hva antar vi, hva må sjekkes', () => {
  it('sorterer det analysen har registrert, uten duplikater, og mangler havner under «må sjekkes»', () => {
    const b = built(DEMO_FINN.missingDocs);
    const d = resolveAnalysisScenarios(b.analysis)[0];
    const k = buildKnowledge({ analysis: b.analysis, property: b.property, snapshot: b.snapshot, scenario: d, quality: dataQuality(b.analysis, b.snapshot), standardDocumented: false });
    expect(k.toCheck.length).toBeGreaterThan(0);
    expect(k.assumed.map((a) => a.text)).toContain('Sluttstandard er antatt ut fra oppussingsnivået – ikke dokumentert i analysen.');
    for (const list of [k.known, k.assumed, k.toCheck]) {
      const texts = list.map((i) => i.text.toLocaleLowerCase('nb-NO'));
      expect(new Set(texts).size).toBe(texts.length);
    }
    // sjekklistepunkter som mangler er ikke «kjent»
    const missing = b.analysis.checklist.filter((c) => c.status === 'mangler');
    expect(missing.length).toBeGreaterThan(0);
    for (const m of missing) expect(k.known.map((i) => i.text)).not.toContain(m.beforeBidTask ?? '');
  });

  it('dokumenterte fakta er «kjent» og anslag er «antatt»', () => {
    const b = built(DEMO_FINN.sharedAB);
    const analysis = { ...b.analysis, facts: [{ label: 'Tak', value: 'Skiftet 2018', status: 'dokumentert' as const, sourceId: null }, { label: 'Våtrom', value: 'Fra 1998', status: 'anslag' as const, sourceId: null }, { label: 'Drenering', value: '', status: 'uavklart' as const, sourceId: null }] };
    const k = buildKnowledge({ analysis, property: b.property, snapshot: b.snapshot, scenario: resolveAnalysisScenarios(analysis)[0], quality: dataQuality(analysis, b.snapshot), standardDocumented: null });
    expect(k.known).toContainEqual({ text: 'Tak', detail: 'Skiftet 2018' });
    expect(k.assumed).toContainEqual({ text: 'Våtrom', detail: 'Fra 1998 (anslag)' });
    expect(k.toCheck).toContainEqual({ text: 'Drenering', detail: 'Ikke avklart' });
  });
});

describe('Property: ta med på visning (kun eksisterende data)', () => {
  it('bygger huskelisten fra risikoenes tiltak, sjekklistepunkter og scenariokrav – uten duplikater', () => {
    const b = built(DEMO_FINN.missingDocs);
    const d = resolveAnalysisScenarios(b.analysis)[0];
    const pack = buildViewingPack({ risks: b.analysis.risks, checklist: b.analysis.checklist, conditions: b.analysis.conditions, scenario: { requirements: [...d.requirements, d.requirements[0] ?? 'Krav'] } });
    expect(pack.lookFor.length).toBeLessThanOrEqual(6);
    const all = [...pack.lookFor, ...pack.ask, ...pack.clarify].map((i) => i.text);
    expect(new Set(all).size).toBe(all.length);
    const lacking = b.analysis.checklist.filter((c) => c.status === 'mangler' || c.status === 'delvis');
    expect(lacking.length).toBeGreaterThan(0);
    expect(pack.ask.length).toBeGreaterThan(0);
    expect(pack.ask.length).toBeLessThanOrEqual(lacking.length);
    // sjekklistepunkter som er dokumentert eller ikke relevante skal ikke på huskelisten
    for (const a of pack.ask) expect(a.context).toMatch(/mangler|delvis dokumentert/);
  });

  it('risiko med høyest alvorlighet kommer først, og uten tiltak brukes «Sjekk: tittel»', () => {
    const risks = [
      { id: '1', title: 'Lav', category: 'annet' as const, level: 2, costLow: null, costHigh: null, rationale: '', sourceId: null, action: 'Tiltak lav' },
      { id: '2', title: 'Høy', category: 'annet' as const, level: 9, costLow: null, costHigh: null, rationale: '', sourceId: null, action: '' },
    ];
    const pack = buildViewingPack({ risks, checklist: [], conditions: [], scenario: { requirements: [] } });
    expect(pack.lookFor[0]).toEqual({ text: 'Sjekk: Høy', context: 'Høy (9/10)' });
    expect(pack.lookFor[1].text).toBe('Tiltak lav');
  });

  it('tom analyse gir tomme lister, ikke feil', () => {
    expect(buildViewingPack({ risks: [], checklist: [], conditions: [], scenario: { requirements: [] } })).toEqual({ lookFor: [], ask: [], clarify: [] });
  });
});

describe('Property: sjekk mot motoren', () => {
  it('versjonenes tall er identiske med en direkte kalkyle av samme verdier', () => {
    const { versions } = compare(DEMO_FINN.sharedAB, 2_950_000);
    for (const v of versions) {
      const direct = evaluateScenario(v.row.values).evaluation.base as Breakdown;
      expect((v.b as Breakdown).profit).toBe(direct.profit);
      expect((v.b as Breakdown).V).toBe(direct.V);
      expect((v.b as Breakdown).equityNeed).toBe(direct.equityNeed);
    }
  });
});
