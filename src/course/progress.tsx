import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readPref, usePref } from '../app/preferences';
import { useSession } from '../app/session';
import { ScenarioValuesSchema, type ScenarioValues } from '../domain/schemas';
import { CASE_A, DEFAULT_HURDLE, type HurdleState } from './caseData';
import { MODULES, PAGE_COUNT, TOTAL_UNITS, pageKey } from './content';
import { FINAL_QUIZ } from './content/finalQuiz';
import { COURSE_ID, PASS_MARK, type CourseModule } from './types';

export type LineTag = 'dokumentert' | 'anslag' | 'mine' | 'uavklart';

export interface BudgetLine {
  amount: number | null;
  tag: LineTag;
  include: boolean;
}

export interface RiskLine {
  id: string;
  label: string;
  likely: number | null;
  hidden: number | null;
}

export type Decision = 'interessant' | 'folg_med' | 'avklar_forst' | 'avsta';

export interface FinalCaseItem {
  id: string;
  label: string;
  amount: number | null;
}

/** Sluttcase «Ville du kjøpt?». Alle tall er brukerens egne forutsetninger. */
export interface FinalCaseState {
  /** Trinn 1: valgte alternativer og om svaret er sjekket. */
  selected: string[];
  checked: boolean;
  low: number | null;
  base: number | null;
  high: number | null;
  items: FinalCaseItem[];
  reservePct: number | null;
  hours: number | null;
  /** Identifisert risiko i kroner. null = uavklart (aldri 0). */
  pipeRisk: number | null;
  interestPct: number | null;
  financingPct: number | null;
  saleFixed: number | null;
  commissionPct: number | null;
  buyFees: number | null;
  hourValue: number | null;
  target: number | null;
  decision: Decision | null;
}

export interface CourseState {
  /** Sider markert som lest: «modul:sideindeks». */
  read: string[];
  /** Siste sted brukeren var: «modul:side», «modul:q» eller sluttcase/sluttquiz/ferdig. */
  lastLocation: string | null;
  quiz: Record<string, number>;
  final: Record<string, number>;
  checks: Record<string, string[]>;
  calc: ScenarioValues;
  hurdle: HurdleState;
  budget: { lines: Record<string, BudgetLine>; reservePct: number | null };
  risk: RiskLine[];
  stressId: string | null;
  finalCase: FinalCaseState;
}

export const DEFAULT_RISK: RiskLine[] = [
  { id: 'r-bad', label: 'Bad', likely: 280_000, hidden: 80_000 },
  { id: 'r-el', label: 'Sikringsskap/elanlegg', likely: null, hidden: null },
  { id: 'r-fukt', label: 'Skjult fukt', likely: null, hidden: null },
];

export function defaultFinalCase(): FinalCaseState {
  return {
    selected: [],
    checked: false,
    low: null,
    base: null,
    high: null,
    items: [{ id: 'fc-1', label: 'Første oppussingsanslag (samlet)', amount: 300_000 }],
    reservePct: 20,
    hours: 300,
    pipeRisk: null,
    interestPct: 7,
    financingPct: 100,
    saleFixed: 55_000,
    commissionPct: 1.5,
    buyFees: 6_000,
    hourValue: 350,
    target: 300_000,
    decision: null,
  };
}

export function defaultState(): CourseState {
  return {
    read: [],
    lastLocation: null,
    quiz: {},
    final: {},
    checks: {},
    calc: structuredClone(CASE_A),
    hurdle: { ...DEFAULT_HURDLE },
    budget: { lines: {}, reservePct: 20 },
    risk: structuredClone(DEFAULT_RISK),
    stressId: null,
    finalCase: defaultFinalCase(),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const DECISIONS: Decision[] = ['interessant', 'folg_med', 'avklar_forst', 'avsta'];

const VALID_READ_KEYS = new Set(MODULES.flatMap((m) => m.pages.map((_, i) => pageKey(m.id, i))));
const VALID_QUIZ_IDS = new Set(MODULES.flatMap((m) => m.quiz.map((q) => q.id)));
const VALID_FINAL_IDS = new Set(FINAL_QUIZ.map((q) => q.id));

function sanitizeFinalCase(raw: unknown): FinalCaseState {
  const d = defaultFinalCase();
  if (!isObj(raw)) return d;
  const items = Array.isArray(raw.items)
    ? raw.items.filter(isObj).map((i, n) => ({ id: typeof i.id === 'string' ? i.id : `fc-${n}`, label: typeof i.label === 'string' ? i.label : '', amount: numOrNull(i.amount) }))
    : d.items;
  const pick = (k: keyof FinalCaseState) => (k in raw ? numOrNull(raw[k]) : (d[k] as number | null));
  return {
    selected: Array.isArray(raw.selected) ? raw.selected.filter((x): x is string => typeof x === 'string') : [],
    checked: raw.checked === true,
    low: numOrNull(raw.low),
    base: numOrNull(raw.base),
    high: numOrNull(raw.high),
    items: items.length ? items : d.items,
    reservePct: pick('reservePct'),
    hours: pick('hours'),
    pipeRisk: numOrNull(raw.pipeRisk),
    interestPct: pick('interestPct'),
    financingPct: pick('financingPct'),
    saleFixed: pick('saleFixed'),
    commissionPct: pick('commissionPct'),
    buyFees: pick('buyFees'),
    hourValue: pick('hourValue'),
    target: pick('target'),
    decision: DECISIONS.includes(raw.decision as Decision) ? (raw.decision as Decision) : null,
  };
}

/** Tåler gamle eller ugyldige lagrede data: ugyldige deler byttes ut med standardverdier. */
export function sanitizeState(raw: unknown): CourseState {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const record = <T,>(v: unknown, ok: (x: unknown) => x is T, validKey?: (k: string) => boolean): Record<string, T> => {
    const out: Record<string, T> = {};
    if (isObj(v)) for (const [k, x] of Object.entries(v)) if (ok(x) && (!validKey || validKey(k))) out[k] = x;
    return out;
  };
  const calc = ScenarioValuesSchema.safeParse(raw.calc);
  const hurdle = isObj(raw.hurdle) ? { minReturnPct: numOrNull(raw.hurdle.minReturnPct), minHourValue: numOrNull(raw.hurdle.minHourValue) } : d.hurdle;
  const lines: Record<string, BudgetLine> = {};
  if (isObj(raw.budget) && isObj(raw.budget.lines)) {
    for (const [k, v] of Object.entries(raw.budget.lines)) {
      if (!isObj(v)) continue;
      const tag = ['dokumentert', 'anslag', 'mine', 'uavklart'].includes(v.tag as string) ? (v.tag as LineTag) : 'uavklart';
      lines[k] = { amount: numOrNull(v.amount), tag, include: v.include !== false };
    }
  }
  const risk = Array.isArray(raw.risk)
    ? raw.risk
        .filter(isObj)
        .map((r, i) => ({ id: typeof r.id === 'string' ? r.id : `r-${i}`, label: typeof r.label === 'string' ? r.label : '', likely: numOrNull(r.likely), hidden: numOrNull(r.hidden) }))
    : d.risk;
  return {
    read: Array.isArray(raw.read) ? [...new Set(raw.read.filter((x): x is string => typeof x === 'string' && VALID_READ_KEYS.has(x)))] : [],
    lastLocation: typeof raw.lastLocation === 'string' ? raw.lastLocation : null,
    quiz: record(raw.quiz, (x): x is number => typeof x === 'number' && Number.isInteger(x), (k) => VALID_QUIZ_IDS.has(k)),
    final: record(raw.final, (x): x is number => typeof x === 'number' && Number.isInteger(x), (k) => VALID_FINAL_IDS.has(k)),
    checks: record(raw.checks, (x): x is string[] => Array.isArray(x) && x.every((i) => typeof i === 'string')),
    calc: calc.success ? calc.data : d.calc,
    hurdle,
    budget: { lines, reservePct: isObj(raw.budget) && 'reservePct' in raw.budget ? numOrNull(raw.budget.reservePct) : 20 },
    risk,
    stressId: typeof raw.stressId === 'string' ? raw.stressId : null,
    finalCase: sanitizeFinalCase(raw.finalCase),
  };
}

/** Fra forrige kursversjon (19 moduler) tas bare kalkyle, budsjett og avkrysninger med. Fremdriften starter på nytt. */
function legacyCarry(uid: string): unknown {
  const old = readPref<unknown>(`${uid}.course.${COURSE_ID}.v1`, null);
  if (!isObj(old)) return null;
  const { calc, hurdle, budget, risk, checks, stressId } = old;
  return { calc, hurdle, budget, risk, checks, stressId };
}

export const storageKeyFor = (uid: string) => `${uid}.course.${COURSE_ID}.v2`;

// ---------------------------------------------------------------------------
// Avledet fremdrift
// ---------------------------------------------------------------------------

export function finalQuizScore(state: Pick<CourseState, 'final'>): { answered: number; correct: number; passed: boolean } {
  const answered = FINAL_QUIZ.filter((q) => state.final[q.id] !== undefined).length;
  const correct = FINAL_QUIZ.filter((q) => state.final[q.id] === q.correct).length;
  return { answered, correct, passed: answered === FINAL_QUIZ.length && correct >= PASS_MARK };
}

export function moduleStatus(state: CourseState, m: CourseModule) {
  const read = m.pages.filter((_, i) => state.read.includes(pageKey(m.id, i))).length;
  const quizDone = m.quiz.every((q) => state.quiz[q.id] !== undefined);
  return { read, total: m.pages.length, quizDone, done: read === m.pages.length && quizDone };
}

export function unitsDone(state: CourseState): number {
  const pages = MODULES.reduce((s, m) => s + moduleStatus(state, m).read, 0);
  const quizzes = MODULES.filter((m) => moduleStatus(state, m).quizDone).length;
  return pages + quizzes + (state.finalCase.decision ? 1 : 0) + (finalQuizScore(state).passed ? 1 : 0);
}

export const percentOf = (done: number) => Math.round((done / TOTAL_UNITS) * 100);

interface Ctx {
  state: CourseState;
  update: (fn: (s: CourseState) => CourseState) => void;
  isRead: (moduleId: string, index: number) => boolean;
  setRead: (moduleId: string, index: number, read: boolean) => void;
  doneUnits: number;
  totalUnits: number;
  percent: number;
  modulesDone: number;
  finalPassed: boolean;
  reset: () => void;
  checklistOpen: boolean;
  setChecklistOpen: (v: boolean) => void;
}

const CourseCtx = createContext<Ctx | null>(null);

export function CourseProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user.id ?? 'anon';
  const [stored, setStored] = usePref<unknown>(storageKeyFor(uid), null);
  const carry = useMemo(() => (stored === null ? legacyCarry(uid) : null), [stored, uid]);
  const state = useMemo(() => sanitizeState(stored ?? carry), [stored, carry]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const update = useCallback((fn: (s: CourseState) => CourseState) => setStored((prev: unknown) => fn(sanitizeState(prev ?? legacyCarry(uid)))), [setStored, uid]);
  const setRead = useCallback(
    (moduleId: string, index: number, read: boolean) =>
      update((s) => {
        const key = pageKey(moduleId, index);
        const has = s.read.includes(key);
        if (has === read) return s;
        return { ...s, read: read ? [...s.read, key] : s.read.filter((x) => x !== key) };
      }),
    [update],
  );
  const done = unitsDone(state);
  const value: Ctx = {
    state,
    update,
    isRead: (m, i) => state.read.includes(pageKey(m, i)),
    setRead,
    doneUnits: done,
    totalUnits: TOTAL_UNITS,
    percent: percentOf(done),
    modulesDone: MODULES.filter((m) => moduleStatus(state, m).done).length,
    finalPassed: finalQuizScore(state).passed,
    reset: () => setStored(null),
    checklistOpen,
    setChecklistOpen,
  };
  return <CourseCtx.Provider value={value}>{children}</CourseCtx.Provider>;
}

export function useCourse(): Ctx {
  const c = useContext(CourseCtx);
  if (!c) throw new Error('CourseProvider mangler');
  return c;
}

/** Fremdrift uten provider (til kursoversikten). */
export function readProgress(uid: string): { doneUnits: number; percent: number; lastLocation: string | null; modulesDone: number } {
  const raw = readPref<unknown>(storageKeyFor(uid), null);
  const st = sanitizeState(raw);
  const done = unitsDone(st);
  return { doneUnits: done, percent: percentOf(done), lastLocation: st.lastLocation, modulesDone: MODULES.filter((m) => moduleStatus(st, m).done).length };
}

export { PAGE_COUNT };
