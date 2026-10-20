import { describe, expect, it } from 'vitest';
import { decideRefresh, type RefreshInput } from './refreshPolicy';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

/** Utgangspunkt: eksisterende objekt, hovedanalyse 5 dager gammel, kontrollert for 6 timer siden, ingen hendelser. */
function input(over: Partial<RefreshInput> = {}): RefreshInput {
  return {
    now: NOW,
    hasMainAnalysis: true,
    compatible: true,
    lastMainAnalysisAt: daysAgo(5),
    lastMarketRefreshAt: null,
    lastCheckAt: hoursAgo(6),
    viewingEvents: [],
    technical: null,
    saleStatus: 'aktiv',
    ...over,
  };
}

describe('oppfriskingsbeslutning (decideRefresh)', () => {
  it('A: hovedanalyse 31 dager gammel → grundig markedsoppfriskning', () => {
    const d = decideRefresh(input({ lastMainAnalysisAt: daysAgo(31), lastCheckAt: daysAgo(31) }));
    expect(d.kind).toBe('market_refresh');
    expect(d.reasons).toContain('eldre_enn_30_dager');
    expect(d.thoroughAgeDays).toBeCloseTo(31, 5);
  });

  it('30 dager er grensen: nøyaktig 30 dager gir ikke markedsoppfriskning, men litt over gjør', () => {
    expect(decideRefresh(input({ lastMainAnalysisAt: daysAgo(30), lastCheckAt: hoursAgo(1) })).kind).toBe('reuse');
    expect(decideRefresh(input({ lastMainAnalysisAt: hoursAgo(30 * 24 + 1), lastCheckAt: hoursAgo(1) })).kind).toBe('market_refresh');
  });

  it('A: siste GRUNDIGE markedsoppfriskning teller som grundig analyse (ikke bare hovedanalysen)', () => {
    // Hovedanalysen er 60 dager gammel, men en markedsoppfriskning er 10 dager gammel → ikke aktuelt med ny
    expect(decideRefresh(input({ lastMainAnalysisAt: daysAgo(60), lastMarketRefreshAt: daysAgo(10), lastCheckAt: hoursAgo(2) })).kind).toBe('reuse');
    // Begge er gamle → markedsoppfriskning
    expect(decideRefresh(input({ lastMainAnalysisAt: daysAgo(60), lastMarketRefreshAt: daysAgo(35) })).kind).toBe('market_refresh');
  });

  it('B: kontrollert for 6 timer siden, men en offisiell visning har funnet sted etter kontrollen → enkel oppfriskning', () => {
    const d = decideRefresh(input({ viewingEvents: ['held'] }));
    expect(d.kind).toBe('lightweight_refresh');
    expect(d.reasons).toEqual(['visning_holdt']);
    expect(d.checkAgeHours).toBeCloseTo(6, 5);
  });

  it('B: endret, avlyst og ny visning utløser også enkel oppfriskning under 24 timer', () => {
    for (const [event, reason] of [['changed', 'visning_endret'], ['cancelled', 'visning_avlyst'], ['added', 'visning_lagt_til']] as const) {
      const d = decideRefresh(input({ lastCheckAt: hoursAgo(1), viewingEvents: [event] }));
      expect(d.kind, event).toBe('lightweight_refresh');
      expect(d.reasons, event).toEqual([reason]);
    }
  });

  it('C: kontrollert for 6 timer siden og ingen relevante endringer → gjenbruk', () => {
    const d = decideRefresh(input());
    expect(d.kind).toBe('reuse');
    expect(d.reasons).toEqual(['fersk']);
    expect(d.lightDue).toBe(false);
  });

  it('D: grundig analyse 20 dager gammel, siste kontroll over 24 timer, ingen særhendelse → enkel oppfriskning', () => {
    const d = decideRefresh(input({ lastMainAnalysisAt: daysAgo(20), lastCheckAt: hoursAgo(25) }));
    expect(d.kind).toBe('lightweight_refresh');
    expect(d.reasons).toEqual(['kontroll_eldre_enn_24t']);
    // 24 timer er grensen
    expect(decideRefresh(input({ lastCheckAt: hoursAgo(24) })).kind).toBe('reuse');
    // Aldri kontrollert
    expect(decideRefresh(input({ lastCheckAt: null })).reasons).toEqual(['ingen_kontroll']);
  });

  it('E: ingen tidligere hovedanalyse → full analyse', () => {
    const d = decideRefresh(input({ hasMainAnalysis: false, lastMainAnalysisAt: null, lastCheckAt: null }));
    expect(d.kind).toBe('full_analysis');
    expect(d.reasons).toEqual(['ingen_analyse']);
  });

  it('inkompatibel analyse → full analyse (ikke bare alder)', () => {
    expect(decideRefresh(input({ compatible: false }))).toMatchObject({ kind: 'full_analysis', reasons: ['inkompatibel'] });
    expect(decideRefresh(input({ lastMainAnalysisAt: daysAgo(100) })).kind).toBe('market_refresh'); // alder alene gir aldri full analyse
  });

  it('F: nytt kritisk dokument eller endrede kritiske fakta → aldri vanlig gjenbruk; eksplisitt full analyse (delvis reanalyse støttes ikke ennå)', () => {
    const doc = decideRefresh(input({ technical: { newOrChangedDocuments: true } }));
    expect(doc).toMatchObject({ kind: 'full_analysis', reasons: ['nye_dokumenter'] });
    expect(doc.kind).not.toBe('reuse');
    expect(decideRefresh(input({ technical: { criticalFactsChanged: true } }))).toMatchObject({ kind: 'full_analysis', reasons: ['kritiske_fakta_endret'] });
    expect(decideRefresh(input({ technical: { newOrChangedDocuments: true, criticalFactsChanged: true } })).reasons).toEqual(['nye_dokumenter', 'kritiske_fakta_endret']);
    // Også når kontrollen er helt fersk
    expect(decideRefresh(input({ lastCheckAt: hoursAgo(0.1), technical: { newOrChangedDocuments: true } })).kind).toBe('full_analysis');
  });

  it('G: solgt eller trukket annonse starter aldri ny analyse eller oppfriskning – heller ikke ved gammel analyse eller signaler', () => {
    for (const saleStatus of ['solgt', 'trukket'] as const) {
      const old = decideRefresh(input({ saleStatus, lastMainAnalysisAt: daysAgo(90), lastCheckAt: daysAgo(40) }));
      expect(old.kind, saleStatus).toBe('reuse');
      expect(old.reasons).toEqual(['objekt_solgt']);
      expect(old.lightDue).toBe(false);
      expect(decideRefresh(input({ saleStatus, viewingEvents: ['held'], technical: { newOrChangedDocuments: true } })).kind).toBe('reuse');
    }
    // Men mangler analysen helt, trengs den fortsatt
    expect(decideRefresh(input({ saleStatus: 'solgt', hasMainAnalysis: false })).kind).toBe('full_analysis');
    // Ukjent status behandles som aktiv
    expect(decideRefresh(input({ saleStatus: 'ukjent', lastCheckAt: hoursAgo(30) })).kind).toBe('lightweight_refresh');
  });

  it('24-timersregelen blokkerer ikke 30-dagersregelen: fersk kontroll og gammel analyse gir likevel markedsoppfriskning', () => {
    const d = decideRefresh(input({ lastMainAnalysisAt: daysAgo(31), lastCheckAt: hoursAgo(2) }));
    expect(d.kind).toBe('market_refresh');
    expect(d.lightDue).toBe(false); // enkel oppfriskning er ikke nødvendig i seg selv …
    // … men markedsoppfriskningen (som inkluderer den enkle) kjøres likevel
  });

  it('visningshendelse og over 30 dager: markedsoppfriskningen (som inkluderer den enkle) behandler hendelsen', () => {
    const d = decideRefresh(input({ lastMainAnalysisAt: daysAgo(45), lastCheckAt: hoursAgo(3), viewingEvents: ['held', 'cancelled'] }));
    expect(d.kind).toBe('market_refresh');
    expect(d.reasons).toEqual(['eldre_enn_30_dager', 'visning_holdt', 'visning_avlyst']);
    expect(d.lightDue).toBe(true);
  });

  it('prioritet: ellers gjelder visningshendelse foran 24 timer, og 24 timer foran gjenbruk', () => {
    const order = [
      decideRefresh(input({ hasMainAnalysis: false })).kind,
      decideRefresh(input({ technical: { criticalFactsChanged: true }, viewingEvents: ['held'], lastMainAnalysisAt: daysAgo(40) })).kind,
      decideRefresh(input({ viewingEvents: ['held'], lastMainAnalysisAt: daysAgo(40) })).kind,
      decideRefresh(input({ viewingEvents: ['held'] })).kind,
      decideRefresh(input({ lastCheckAt: hoursAgo(48) })).kind,
      decideRefresh(input()).kind,
    ];
    expect(order).toEqual(['full_analysis', 'full_analysis', 'market_refresh', 'lightweight_refresh', 'lightweight_refresh', 'reuse']);
  });

  it('ukjent analysedato regnes som gammel (markedsoppfriskning), og tid/grenser kan overstyres', () => {
    expect(decideRefresh(input({ lastMainAnalysisAt: null, lastMarketRefreshAt: null })).kind).toBe('market_refresh');
    expect(decideRefresh(input({ lastCheckAt: hoursAgo(5), limits: { lightMaxAgeHours: 4, marketAfterDays: 30 } })).kind).toBe('lightweight_refresh');
    expect(decideRefresh(input({ lastMainAnalysisAt: daysAgo(10), limits: { lightMaxAgeHours: 24, marketAfterDays: 7 } })).kind).toBe('market_refresh');
  });

  it('er ren og deterministisk (tar ikke tid fra systemklokken)', () => {
    const i = input({ viewingEvents: ['held'] });
    expect(JSON.stringify(decideRefresh(i))).toBe(JSON.stringify(decideRefresh(i)));
  });
});
