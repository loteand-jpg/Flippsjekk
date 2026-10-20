import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptAgentOutput, parseAgentOutput, validateForPublish } from './agentContract';
import { evaluateScenario, buildBaseValues } from '../calc/scenario';
import { EXAMPLE_PROFILE_DEFAULTS } from '../config/defaults';
import type { Property } from './schemas';

const example = JSON.parse(readFileSync('docs/eksempel-agent-analyse.json', 'utf8'));

describe('agentkontrakt v1', () => {
  it('dokumentasjonseksempelet er gyldig, kan adapteres og publiseres', () => {
    const r = parseAgentOutput(example);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = adaptAgentOutput(r.value, { propertyId: 'p', analysisId: 'a', snapshotId: 's', snapshotVersion: 1, version: 1, now: new Date('2026-10-16T08:00:00Z'), origin: 'demo' });
    expect(validateForPublish(out.analysis)).toEqual({ ok: true });
    expect(out.snapshot.factSources.askingPrice.status).toBe('dokumentert');
    expect(out.analysis.estimates.monthlyTotal).toBe(4_900);
    // Økonomi beregnes av motoren – ikke av agenten
    const property: Property = { id: 'p', finnId: example.finnId, canonicalUrl: example.listing.sourceUrl, address: 'x', postalCode: null, city: 'Trondheim', district: null, municipality: 'Trondheim', countryCode: 'NO', propertyType: 'leilighet', tenure: 'selveier', dataOrigin: 'demo', createdAt: '2026-10-16T08:00:00Z' };
    const v = buildBaseValues({ property, snapshot: out.snapshot, analysis: out.analysis, defaults: EXAMPLE_PROFILE_DEFAULTS }).values;
    expect(evaluateScenario(v).evaluation.status).toBe('complete');
  });

  it('avviser økonomiske nøkkeltall fra agenten', () => {
    const r = parseAgentOutput({ ...example, profit: 500000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.path === 'profit')).toBe(true);
  });

  it('krever at ukjent verdi er «uavklart» og at dokumentert har kilde', () => {
    const a = structuredClone(example);
    a.listing.askingPrice = { value: null, status: 'dokumentert', sourceId: null };
    expect(parseAgentOutput(a).ok).toBe(false);
    const b = structuredClone(example);
    b.listing.buildYear = { value: 1932, status: 'dokumentert', sourceId: null };
    expect(parseAgentOutput(b).ok).toBe(false);
  });

  it('avviser henvisning til ukjent kilde og ufullstendig sjekkliste', () => {
    const a = structuredClone(example);
    a.risks[0].sourceId = 'finnes-ikke';
    expect(parseAgentOutput(a).ok).toBe(false);
    const b = structuredClone(example);
    b.checklist = b.checklist.slice(0, 5);
    expect(parseAgentOutput(b).ok).toBe(false);
  });

  it('bevarer ukjente toppnivåfelt uten å miste data', () => {
    const r = parseAgentOutput({ ...example, futureField: { a: 1 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = adaptAgentOutput(r.value, { propertyId: 'p', analysisId: 'a', snapshotId: 's', snapshotVersion: 1, version: 1, now: new Date(), origin: 'agent' });
    expect(out.analysis.unmappedFields?.futureField).toEqual({ a: 1 });
  });

  it('avviser markedsvekst i basis', () => {
    const a = structuredClone(example);
    a.estimates.sale.includesMarketGrowth = true;
    expect(parseAgentOutput(a).ok).toBe(false);
  });
});

describe('agentkontrakt: scenarioer (basis + inntil to alternativer)', () => {
  const withScenarios = JSON.parse(readFileSync('docs/eksempel-agent-analyse-scenarier.json', 'utf8'));
  const ctxArgs = { propertyId: 'p', analysisId: 'a', snapshotId: 's', snapshotVersion: 1, version: 1, now: new Date('2026-10-16T08:00:00Z'), origin: 'demo' as const };

  it('eksempel med scenarioer er gyldig og kan publiseres; salgsverdien per scenario fastsettes av koden (markedsmotoren)', () => {
    const r = parseAgentOutput(withScenarios);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = adaptAgentOutput(r.value, ctxArgs);
    expect(validateForPublish(out.analysis)).toEqual({ ok: true });
    const sc = out.analysis.estimates.scenarios!;
    expect(sc.map((x) => x.kind)).toEqual(['basis', 'alternativ', 'alternativ']);
    // Agentens estimat er historisk referanse – den leverer ikke fasit
    expect(new Set(sc.map((x) => x.sale!.base)).size).toBe(3);
    expect(sc.every((x) => x.sale!.includesMarketGrowth === false)).toBe(true);
    expect(sc[0].items.every((i) => i.laborCategory)).toBe(true);
    // Sluttstandard, scenariorisiko, screening og referanseklassifisering kan representeres
    expect(sc.every((x) => x.endProduct.standardClass === 'nyoppusset')).toBe(true);
    expect(sc.every((x) => x.risk)).toBe(true);
    expect(sc[2].screening!.concept).toBe('dele_rom');
    expect(sc[1].anchorAdjustment!.pct).toBe(2);
    expect(out.analysis.estimates.scenarioSearch!.considered.filter((c) => c.outcome === 'avvist')).toHaveLength(2);
    // Koden fastsetter salgsverdien per scenario ut fra referansene
    const property: Property = { id: 'p', finnId: withScenarios.finnId, canonicalUrl: withScenarios.listing.sourceUrl, address: 'x', postalCode: null, city: 'Trondheim', district: null, municipality: 'Trondheim', countryCode: 'NO', propertyType: 'leilighet', tenure: 'selveier', dataOrigin: 'demo', createdAt: '2026-10-16T08:00:00Z' };
    const bases = sc.map((s) => buildBaseValues({ property, snapshot: out.snapshot, analysis: out.analysis, defaults: EXAMPLE_PROFILE_DEFAULTS, analysisScenarioId: s.id }));
    expect(bases.every((b) => b.saleResolution.source === 'markedsmotor')).toBe(true);
    expect(new Set(bases.map((b) => b.values.saleBase)).size).toBe(3);
  });

  it('eldre eksempel uten scenarioer er fortsatt gyldig', () => {
    const r = parseAgentOutput(example);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.estimates.scenarios).toBeUndefined();
  });

  const bad = (mutate: (a: any) => void) => {
    const a = structuredClone(withScenarios);
    mutate(a);
    return parseAgentOutput(a);
  };

  it('krever nøyaktig ett basisscenario og høyst to alternativer', () => {
    expect(bad((a) => (a.estimates.scenarios[1].kind = 'basis')).ok).toBe(false);
    expect(bad((a) => a.estimates.scenarios.push({ ...structuredClone(a.estimates.scenarios[1]), id: 'ekstra' })).ok).toBe(false);
    expect(bad((a) => (a.estimates.scenarios = a.estimates.scenarios.slice(1))).ok).toBe(false); // uten basis
  });

  it('krever unike scenario-ID-er og gyldige referanser', () => {
    expect(bad((a) => (a.estimates.scenarios[2].id = a.estimates.scenarios[1].id)).ok).toBe(false);
    expect(bad((a) => a.estimates.scenarios[0].referenceIds.push('finnes-ikke')).ok).toBe(false);
    expect(bad((a) => (a.estimates.defaultScenarioId = 'finnes-ikke')).ok).toBe(false);
  });

  it('et scenario som krever godkjenning kan ikke være «gjennomførbart»', () => {
    const r = bad((a) => (a.estimates.scenarios[1].feasibility = 'klar'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.path.includes('feasibility'))).toBe(true);
  });

  it('økonomiske nøkkeltall i et scenario avvises (strengt skjema)', () => {
    expect(bad((a) => (a.estimates.scenarios[0].profit = 500_000)).ok).toBe(false);
  });

  it('en agent kan levere scenarioer uten egen salgsverdi (markedsmotoren fastsetter den)', () => {
    const r = bad((a) => a.estimates.scenarios.forEach((x: any) => delete x.sale));
    expect(r.ok).toBe(true);
  });

  it('ankerjustering fra agenten er begrenset til ±5 % og må begrunnes konkret', () => {
    expect(bad((a) => (a.estimates.scenarios[1].anchorAdjustment.pct = 12)).ok).toBe(false);
    expect(bad((a) => (a.estimates.scenarios[1].anchorAdjustment.pct = -5.5)).ok).toBe(false);
    expect(bad((a) => (a.estimates.scenarios[1].anchorAdjustment.reason = 'bra')).ok).toBe(false);
    expect(bad((a) => (a.estimates.scenarios[1].anchorAdjustment.pct = -5)).ok).toBe(true);
  });

  it('et scenario som krever godkjenning kan ikke ha lav myndighetsrisiko', () => {
    const r = bad((a) => (a.estimates.scenarios[1].risk.approval = 'lav'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.path.includes('approval'))).toBe(true);
  });

  it('arbeidskostnad kan ikke dobbelttelles: tiltak med arbeidsmodell kan ikke ha eldre fagbeløp i tillegg', () => {
    const r = bad((a) => {
      a.estimates.scenarios[0].items[0].electrician = 25_000;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.message.includes('telles arbeidet to ganger'))).toBe(true);
    // Eldre tiltak uten arbeidsmodell beholder fagfeltene
    expect(bad((a) => {
      const it = a.estimates.scenarios[0].items[0];
      delete it.laborCategory;
      delete it.laborHours;
      delete it.laborCostHired;
      it.electrician = 25_000;
    }).ok).toBe(true);
  });

  it('screening: hvert aspekt må vurderes, og et grep som ikke består skal ikke være et scenario', () => {
    expect(bad((a) => a.estimates.scenarios[2].screening.checks.pop()).ok).toBe(false);
    expect(bad((a) => (a.estimates.scenarios[2].screening.checks[0].result = 'ikke_ok')).ok).toBe(false);
    // Tvil/uavklart er tillatt for et alternativ som ikke er «gjennomførbart»
    expect(bad((a) => (a.estimates.scenarios[2].screening.checks[0].result = 'tvil')).ok).toBe(true);
    // Men et «gjennomførbart» scenario kan ikke ha tvil i screeningen
    expect(bad((a) => {
      a.estimates.scenarios[1].requiresApproval = false;
      a.estimates.scenarios[1].risk.approval = 'lav';
      a.estimates.scenarios[1].feasibility = 'klar';
    }).ok).toBe(false);
  });

  it('badflytting er bare aktuelt når eksisterende bad uansett må totalrenoveres', () => {
    expect(bad((a) => (a.estimates.scenarios[2].screening.concept = 'flytte_bad')).ok).toBe(false);
    expect(bad((a) => {
      a.estimates.scenarios[2].screening.concept = 'flytte_bad';
      a.estimates.scenarios[2].screening.existingBathNeedsFullRenovation = true;
    }).ok).toBe(true);
  });

  it('scenariojakt: avviste grep og stopp uten treff kan representeres, og må stemme med scenariosettet', () => {
    // Jakten stoppet uten at noe bestod screeningen: bare basis finnes
    const stopped = bad((a) => {
      a.estimates.scenarios = [a.estimates.scenarios[0]];
      a.estimates.scenarioSearch = { status: 'stoppet_ingen_bestod', considered: [{ concept: 'dele_rom', outcome: 'avvist', reason: 'Ingen vinduer i stuen.', scenarioId: null }] };
      a.estimates.defaultScenarioId = a.estimates.scenarios[0].id;
    });
    expect(stopped.ok).toBe(true);
    // Men «stoppet» med alternativer i settet er motstridende
    expect(bad((a) => (a.estimates.scenarioSearch.status = 'stoppet_ingen_bestod')).ok).toBe(false);
    // Et valgt grep må peke på et alternativ som finnes
    expect(bad((a) => (a.estimates.scenarioSearch.considered[0].scenarioId = 'finnes-ikke')).ok).toBe(false);
  });

  it('referanseklassifisering må peke på referanser i analysen', () => {
    expect(bad((a) => (a.estimates.scenarios[2].referenceClassification[0].comparableId = 'finnes-ikke')).ok).toBe(false);
  });
});
