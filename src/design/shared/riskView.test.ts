import { describe, expect, it } from 'vitest';
import type { Risk, ScenarioRisk } from '../../domain/schemas';
import { RISK_DIM_ORDER, buildRiskDimensions, dimOfCategory, type RiskViewInput } from './riskView';

const risk = (over: Partial<Risk>): Risk => ({
  id: 'r1',
  title: 'Bjelkelag under bad',
  category: 'vatrom',
  level: 5,
  costLow: 30_000,
  costHigh: 120_000,
  rationale: 'TG2 på bad med fuktmerker ved sluk.',
  sourceId: null,
  action: 'Fuktmåling og hulltaking før bud.',
  ...over,
});

const scenarioRisk: ScenarioRisk = { technical: 'lav', cost: 'middels', time: 'lav', approval: 'lav', note: '' };

const base = (over: Partial<RiskViewInput> = {}): RiskViewInput => ({
  risks: [risk({})],
  scenarioRisk,
  scenarioRequirements: [],
  scenarioFeasibilityRationale: '',
  quality: { grade: 'hoy', coverage: 0.83, missingChecks: [], undocumentedFacts: [] },
  saleCertaintyLabel: 'Svært godt grunnlag',
  saleCertaintyBand: 'lav',
  ...over,
});

const dim = (dims: ReturnType<typeof buildRiskDimensions>, id: string) => dims.find((d) => d.id === id)!;

describe('Finance: risikovisning i seks dimensjoner', () => {
  it('gir alltid alle seks dimensjoner i fast rekkefølge', () => {
    const dims = buildRiskDimensions(base());
    expect(dims.map((d) => d.id)).toEqual(RISK_DIM_ORDER);
    expect(dims).toHaveLength(6);
  });

  it('plasserer objektets risikoer i riktig dimensjon og viser nivå som tekst', () => {
    const dims = buildRiskDimensions(base());
    expect(dimOfCategory('vatrom')).toBe('teknisk');
    const teknisk = dim(dims, 'teknisk');
    expect(teknisk.what.map((w) => w.title)).toContain('Bjelkelag under bad');
    // nivået står som tekst – ikke bare farge
    expect(teknisk.levelText).toMatch(/risiko|Uavklart/);
    expect(teknisk.why.join(' ')).toMatch(/Bjelkelag under bad/);
    expect(teknisk.clarify).toContain('Fuktmåling og hulltaking før bud.');
  });

  it('tar det verste av objektrisiko og scenariorisiko', () => {
    const dims = buildRiskDimensions(base({ scenarioRisk: { ...scenarioRisk, technical: 'hoy' } }));
    expect(dim(dims, 'teknisk').band).toBe('hoy');
    expect(dim(dims, 'teknisk').basis).toEqual(expect.arrayContaining(['objekt', 'scenario']));
  });

  it('en dimensjon uten registrerte risikoer og uten scenariogrunnlag er uavklart – ikke lav', () => {
    const dims = buildRiskDimensions(base({ risks: [], scenarioRisk: null }));
    for (const id of ['teknisk', 'kostnad', 'tid', 'myndighet'] as const) {
      expect(dim(dims, id).band).toBe('uavklart');
      expect(dim(dims, id).levelText).toMatch(/Uavklart/);
    }
  });

  it('ukjent alvorlighet (level = null) gir uavklart, ikke lavt', () => {
    const dims = buildRiskDimensions(base({ risks: [risk({ level: null })], scenarioRisk: null }));
    expect(dim(dims, 'teknisk').band).toBe('uavklart');
  });

  it('summerer mulige merkostnader som «ikke en prognose»', () => {
    const dims = buildRiskDimensions(base({ risks: [risk({}), risk({ id: 'r2', title: 'Fukt i kjeller', category: 'fukt_grunn', costLow: 10_000, costHigh: 60_000 })] }));
    const text = dim(dims, 'kostnad').why.join(' ');
    expect(text).toMatch(/ikke en prognose/);
    expect(text).toMatch(/40/); // 30 000 + 10 000
    expect(text).toMatch(/180/); // 120 000 + 60 000
  });

  it('myndighet tar med scenarioets krav å avklare', () => {
    const dims = buildRiskDimensions(base({ scenarioRequirements: ['Avklar bæresystem med rådgivende ingeniør'], scenarioFeasibilityRationale: 'Krever søknad.' }));
    expect(dim(dims, 'myndighet').clarify).toContain('Avklar bæresystem med rådgivende ingeniør');
    expect(dim(dims, 'myndighet').why).toContain('Krever søknad.');
  });

  it('dokumentasjon bygger på datadekning, og lav dekning gir høy risiko', () => {
    const dims = buildRiskDimensions(
      base({
        risks: [],
        quality: { grade: 'lav', coverage: 0.31, missingChecks: [], undocumentedFacts: ['Byggeår'] },
      }),
    );
    const d = dim(dims, 'dokumentasjon');
    expect(d.band).toBe('hoy');
    expect(d.basis).toContain('datadekning');
    expect(d.why.join(' ')).toMatch(/31 %/);
    expect(d.why.join(' ')).toMatch(/byggeår/);
  });

  it('marked trekker inn salgsverdiens sikkerhet, og tåler at den mangler', () => {
    expect(dim(buildRiskDimensions(base({ risks: [], saleCertaintyLabel: 'Svak grunnlag', saleCertaintyBand: 'hoy' })), 'marked').band).toBe('hoy');
    const none = dim(buildRiskDimensions(base({ risks: [], saleCertaintyLabel: null, saleCertaintyBand: null })), 'marked');
    expect(none.band).toBe('uavklart');
  });
});
