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

  it('eksempel med scenarioer er gyldig og kan publiseres, med egen salgsverdi per scenario', () => {
    const r = parseAgentOutput(withScenarios);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = adaptAgentOutput(r.value, ctxArgs);
    expect(validateForPublish(out.analysis)).toEqual({ ok: true });
    const sc = out.analysis.estimates.scenarios!;
    expect(sc.map((x) => x.kind)).toEqual(['basis', 'alternativ', 'alternativ']);
    expect(new Set(sc.map((x) => x.sale.base)).size).toBe(3);
    expect(sc.every((x) => x.sale.includesMarketGrowth === false)).toBe(true);
    expect(sc[0].items.every((i) => i.laborCategory)).toBe(true);
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
});
