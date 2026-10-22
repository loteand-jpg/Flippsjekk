import { describe, expect, it } from 'vitest';
import { solveMaxBid } from '../calc/engine';
import { evaluateCourseScenario as evaluateScenario } from './evaluate';
import { evaluateScenario as evaluateStandardScenario } from '../calc/scenario';
import { termKeysIn } from './components';
import { MODULES, MODULE_COUNT, PAGE_COUNT, TOTAL_UNITS, allPages, pageKey } from './content';
import { FINAL_QUIZ } from './content/finalQuiz';
import { CASE_A, CASE_B, CASE_C, EMPTY_CALC } from './caseData';
import { GLOSSARY } from './glossary';
import { defaultFinalCase, defaultState, finalQuizScore, moduleStatus, percentOf, sanitizeState, unitsDone } from './progress';
import { BUDGET, budgetCsv, budgetHtml, caseAExample, sumCategory } from './widgets/Budget';
import { BEFORE_BID, checklistText } from './widgets/Checklists';
import { finalCaseValues } from './widgets/Finish';
import { WIDGETS } from './widgets';
import { COURSE_CHECKED, PASS_MARK, type Block } from './types';

function allText(b: Block): string[] {
  switch (b.t) {
    case 'p':
    case 'lead':
    case 'h':
      return [b.x];
    case 'quote':
    case 'ul':
    case 'ol':
      return b.x;
    case 'box':
      return [b.title ?? '', ...(b.x ?? []), ...(b.list ?? [])];
    case 'cards':
    case 'steps':
      return b.items.flatMap((i) => [i.title, i.x]);
    case 'compare':
      return [b.a.x ?? '', ...(b.a.list ?? []), b.b.x ?? '', ...(b.b.list ?? [])];
    case 'formula':
      return [...b.lines, b.result, b.note ?? ''];
    case 'flow':
      return b.steps;
    case 'table':
      return [...b.head, ...b.rows.flat()];
    case 'more':
      return [b.title, ...b.blocks.flatMap(allText)];
    default:
      return [];
  }
}

function flatten(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => (b.t === 'more' ? [b, ...flatten(b.blocks)] : [b]));
}

const allBlocks = () => allPages().flatMap((p) => flatten(p.page.blocks));

describe('kursinnhold', () => {
  it('har nøyaktig 11 moduler i låst rekkefølge', () => {
    expect(MODULE_COUNT).toBe(11);
    expect(MODULES.map((m) => m.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(MODULES.map((m) => m.title)).toEqual([
      'Slik fungerer en flipp',
      'Finn og grovsorter objekter',
      'Undersøk boligen før du regner',
      'Finn realistisk salgsverdi',
      'Planlegg verdiskapingen',
      'Bygg hele prosjektbudsjettet',
      'Skatt når du flipper privat',
      'Lønnsomhet, risiko og maksbud',
      'Visning, bud og kjøp',
      'Gjennomfør oppussingen',
      'Selg og avslutt prosjektet',
    ]);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(11);
  });

  it('hver modul har flere sider, unike side-ID-er og kontrollspørsmål', () => {
    expect(PAGE_COUNT).toBe(allPages().length);
    for (const m of MODULES) {
      expect(m.pages.length, m.title).toBeGreaterThan(1);
      expect(m.quiz.length, m.title).toBeGreaterThan(0);
      m.pages.forEach((p, i) => expect(p.id, m.title).toBe(`${m.num}.${i + 1}`));
    }
    expect(TOTAL_UNITS).toBe(PAGE_COUNT + 11 + 2);
  });

  it('alle ordlistebegrep som brukes i teksten finnes i ordlisten', () => {
    const missing = new Set<string>();
    for (const b of allBlocks()) for (const t of allText(b)) for (const k of termKeysIn(t)) if (!GLOSSARY[k]) missing.add(k);
    expect([...missing]).toEqual([]);
  });

  it('alle widgets i innholdet er registrert', () => {
    for (const b of allBlocks()) if (b.t === 'widget') expect(WIDGETS[b.id], b.id).toBeTypeOf('function');
    const used = new Set(allBlocks().flatMap((b) => (b.t === 'widget' ? [b.id] : [])));
    for (const id of ['calculator', 'scenarios', 'stress', 'returns', 'maxbud', 'caseA', 'caseB', 'caseC', 'beforeBid']) expect(used.has(id as never), id).toBe(true);
  });

  it('kontrollspørsmålene har gyldig fasit og unike ID-er', () => {
    const all = [...MODULES.flatMap((m) => m.quiz), ...FINAL_QUIZ];
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    for (const q of all) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.correct, q.id).toBeGreaterThanOrEqual(0);
      expect(q.correct, q.id).toBeLessThan(q.options.length);
      expect(q.explain.length, q.id).toBeGreaterThan(10);
    }
  });

  it('bruker alle faste komponenttyper og har kontrolldatoen', () => {
    const kinds = new Set(allBlocks().flatMap((b) => (b.t === 'box' ? [b.kind] : [])));
    for (const k of ['regel', 'radar', 'tips', 'flagg', 'eksempel', 'avklares', 'forklart', 'husk']) expect(kinds.has(k as never), k).toBe(true);
    expect(COURSE_CHECKED).toBe('17. oktober 2026');
  });
});

describe('sluttquiz', () => {
  it('har nøyaktig 15 spørsmål og bestått er 12', () => {
    expect(FINAL_QUIZ).toHaveLength(15);
    expect(PASS_MARK).toBe(12);
  });
  it('bestått ved 12 riktige, ikke ved 11 eller ubesvarte', () => {
    const answers = (nCorrect: number) => Object.fromEntries(FINAL_QUIZ.map((q, i) => [q.id, i < nCorrect ? q.correct : (q.correct + 1) % q.options.length]));
    expect(finalQuizScore({ final: answers(12) }).passed).toBe(true);
    expect(finalQuizScore({ final: answers(11) }).passed).toBe(false);
    expect(finalQuizScore({ final: {} })).toMatchObject({ answered: 0, passed: false });
  });
});

describe('Case A (modul 8) – tall fra kursteksten stemmer med motoren', () => {
  it('kurs bruker standardmotorens kjøpslån og scenarioresultater', () => {
    const kurs = evaluateScenario(CASE_A).evaluation;
    const standard = evaluateStandardScenario(CASE_A).evaluation;
    expect(kurs.resolved?.loanBasis).toBe('kjopesum');
    expect(kurs.cases.base?.purchaseLoan).toBe(2_700_000);
    for (const scenario of ['low', 'base', 'high'] as const) {
      expect(kurs.cases[scenario]).toEqual(standard.cases[scenario]);
    }
  });
  const ev = evaluateScenario(CASE_A).evaluation;
  it('delsummer', () => {
    expect(ev.base!.duty).toBe(75_000);
    expect(ev.base!.RB).toBe(264_000);
  });
  it('resultat lav/base/høy ≈ –282 000 / –85 000 / +210 000', () => {
    expect(Math.round(ev.cases.low!.profit / 1000) * 1000).toBe(-282_000);
    expect(Math.round(ev.cases.base!.profit / 1000) * 1000).toBe(-85_000);
    expect(Math.round(ev.cases.high!.profit / 1000) * 1000).toBe(210_000);
  });
  it('høyt scenario etter illustrativ verdsetting av 250 t à 350 kr ≈ 123 000', () => {
    expect(Math.round(ev.cases.high!.profitAfterOwnWork! / 1000) * 1000).toBe(123_000);
  });
  it('maksbud ved 300 000 kr resultatkrav: høy ≈ 2,91 mill., base ≈ 2,63 mill.', () => {
    const x = ev.resolved!;
    const high = solveMaxBid(x, 3_800_000, { kind: 'profit', value: 300_000 });
    const base = solveMaxBid(x, 3_500_000, { kind: 'profit', value: 300_000 });
    expect(high.price! / 1_000_000).toBeCloseTo(2.91, 1);
    expect(base.price! / 1_000_000).toBeCloseTo(2.63, 1);
    expect(high.price!).toBeLessThan(3_000_000);
  });
  it('stresstestene fra modul 8 finnes', () => {
    expect(ev.stress.map((s) => s.id)).toEqual(['sale-5', 'sale-10', 'sale-15', 'renovation+100k', 'months+3', 'combined', 'debt+100k']);
  });
});

describe('Case B og tomme felt (ukjent er ikke 0)', () => {
  it('Case B er ufullstendig – med navngitte mangler', () => {
    const r = evaluateScenario(CASE_B);
    expect(r.evaluation.status).toBe('incomplete');
    expect(r.evaluation.base).toBeNull();
    expect(r.missing.length).toBeGreaterThan(3);
  });
  it('tom kalkulator gir ufullstendig kalkyle, ikke fortjeneste', () => {
    expect(evaluateScenario(EMPTY_CALC).evaluation.base).toBeNull();
  });
  it('borettslag-standard gir 0 i dokumentavgift', () => {
    const r = evaluateScenario({ ...CASE_A, dutyBasis: 'ingen', dutyPct: 0 });
    expect(r.evaluation.base!.duty).toBe(0);
  });
  it('totalpris trekker fellesgjeld ved salg én gang', () => {
    const r = evaluateScenario({ ...CASE_A, saleBasis: 'total', saleBase: 3_800_000, debtAtSale: 300_000, saleLow: null, saleHigh: null }).evaluation.base!;
    expect(r.S).toBe(3_500_000);
  });
});

describe('Case B og C og tomme felt (ukjent er ikke 0)', () => {
  it('Case B er ufullstendig – med navngitte mangler', () => {
    const r = evaluateScenario(CASE_B);
    expect(r.evaluation.status).toBe('incomplete');
    expect(r.evaluation.base).toBeNull();
    expect(r.missing.length).toBeGreaterThan(3);
  });
  it('Case C er ufullstendig inntil mangler er avklart', () => {
    expect(evaluateScenario(CASE_C).evaluation.base).toBeNull();
  });
  it('tom kalkulator gir ufullstendig kalkyle, ikke fortjeneste', () => {
    expect(evaluateScenario(EMPTY_CALC).evaluation.base).toBeNull();
  });
  it('borettslag-standard gir 0 i dokumentavgift', () => {
    const r = evaluateScenario({ ...CASE_A, dutyBasis: 'ingen', dutyPct: 0 });
    expect(r.evaluation.base!.duty).toBe(0);
  });
  it('totalpris trekker fellesgjeld ved salg én gang', () => {
    const r = evaluateScenario({ ...CASE_A, saleBasis: 'total', saleBase: 3_800_000, debtAtSale: 300_000, saleLow: null, saleHigh: null }).evaluation.base!;
    expect(r.S).toBe(3_500_000);
  });
});

describe('sluttcase', () => {
  it('uavklart oppussing (tomt beløp) gir ingen kalkyle', () => {
    const fc = { ...defaultFinalCase(), low: 2_900_000, base: 3_100_000, high: 3_300_000, items: [{ id: 'a', label: 'Bad', amount: null }] };
    expect(evaluateScenario(finalCaseValues(fc, 'total', 2_650_000)).evaluation.base).toBeNull();
  });
  it('komplett sluttcase gir kalkyle, og identifisert risiko øker kostnaden', () => {
    const fc = { ...defaultFinalCase(), low: 2_900_000, base: 3_100_000, high: 3_300_000 };
    const a = evaluateScenario(finalCaseValues(fc, 'total', 2_650_000)).evaluation.base!;
    const b = evaluateScenario(finalCaseValues({ ...fc, pipeRisk: 100_000 }, 'total', 2_650_000)).evaluation.base!;
    expect(a).not.toBeNull();
    expect(b.profit).toBeLessThan(a.profit);
  });
});

describe('fremdrift og lagring', () => {
  it('tåler ugyldige lagrede data', () => {
    for (const raw of [null, 'tull', 42, [], { read: 'x', calc: { purchasePrice: 'ikke tall' }, budget: 5, risk: 'x', finalCase: 'y' }]) {
      const s = sanitizeState(raw);
      expect(Array.isArray(s.read)).toBe(true);
      expect(s.calc.purchasePrice).toBe(CASE_A.purchasePrice);
      expect(s.risk.length).toBeGreaterThan(0);
      expect(s.finalCase.decision).toBeNull();
    }
  });
  it('beholder gyldige deler og fjerner ukjente sider og spørsmål', () => {
    const s = sanitizeState({ read: [pageKey('1', 0), 'finnes-ikke:9', pageKey('3', 1)], quiz: { 'k1-1': 1, b: 1, 'k1-2': 'x' }, checks: { beforeBid: ['x', 1] } });
    expect(s.read).toEqual([pageKey('1', 0), pageKey('3', 1)]);
    expect(s.quiz).toEqual({ 'k1-1': 1 });
    expect(s.checks).toEqual({});
  });
  it('en side regnes som lest bare når den er markert; modul ferdig krever sider og kontrollspørsmål', () => {
    const st = defaultState();
    expect(unitsDone(st)).toBe(0);
    const m = MODULES[0];
    const read = { ...st, read: m.pages.map((_, i) => pageKey(m.id, i)) };
    expect(moduleStatus(read, m).done).toBe(false);
    const done = { ...read, quiz: Object.fromEntries(m.quiz.map((q) => [q.id, q.correct])) };
    expect(moduleStatus(done, m).done).toBe(true);
    expect(unitsDone(done)).toBe(m.pages.length + 1);
    expect(percentOf(TOTAL_UNITS)).toBe(100);
  });
});

describe('budsjett og sjekklister', () => {
  it('ukjente poster regnes aldri som 0 – de telles som uavklart', () => {
    const lines = { 'o-bad': { amount: 280_000, tag: 'anslag' as const, include: true } };
    const reno = BUDGET.find((c) => c.id === 'oppussing')!;
    const s = sumCategory(reno, lines);
    expect(s.known).toBe(280_000);
    expect(s.unknown).toBe(reno.lines.length - 1);
  });
  it('«Ikke aktuell» er ikke uavklart', () => {
    const ex = caseAExample();
    for (const c of BUDGET) expect(sumCategory(c, ex.lines).unknown).toBe(0);
    expect(sumCategory(BUDGET[0], ex.lines).known).toBe(3_077_000);
  });
  it('utskrift og nedlasting inneholder status og forbehold', () => {
    const html = budgetHtml({}, 20, 'Test');
    expect(html).toContain('Uavklart');
    expect(html).toContain('ikke 0 kroner');
    expect(budgetCsv({}, 20)).toContain('Uavklart');
    const txt = checklistText('Før-bud', BEFORE_BID, [BEFORE_BID[0].items[0].id]);
    expect(txt).toContain('[x] Eierform avklart');
    expect(txt).toContain('[ ] Egenerklæring lest');
    expect(txt).toContain('Faglig kontrollert: 17. oktober 2026');
  });
});
