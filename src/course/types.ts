/**
 * Kursinnhold som data. Siden rendrer ett kursside-innhold om gangen; innholdet ligger i content/.
 * Tekstformat i alle tekstfelt: **fet** og {{ordliste-nøkkel}} / {{nøkkel|visningstekst}}.
 */
export const COURSE_ID = 'flipping-privat';
export const COURSE_TITLE = 'Nivå 1 – Flipping som privatperson';
export const COURSE_SUBTITLE = 'Fra boligannonse til gjennomtenkt kjøpsbeslutning';
/** Dato for faglig kontroll av regler, satser og markedstall. Oppdateres når innholdet kontrolleres på nytt. */
export const COURSE_CHECKED = '17. oktober 2026';
export const PASS_MARK = 12;

export type BoxKind = 'regel' | 'radar' | 'tips' | 'flagg' | 'eksempel' | 'avklares' | 'forklart' | 'husk';

export type WidgetId =
  | 'evidenceLegend'
  | 'paakostning'
  | 'docChecklist'
  | 'beforeBid'
  | 'market'
  | 'planningNumbers'
  | 'budget'
  | 'riskBudget'
  | 'calculator'
  | 'scenarios'
  | 'stress'
  | 'returns'
  | 'maxbud'
  | 'caseA'
  | 'caseB'
  | 'caseC'
  | 'kitchenPlan'
  | 'selfSave'
  | 'finalCase'
  | 'finalQuiz'
  | 'completion';

export interface QuizDef {
  id: string;
  question: string;
  options: string[];
  correct: number;
  explain: string;
}

export interface CompareSide {
  title: string;
  x?: string;
  list?: string[];
}

export type Block =
  | { t: 'p'; x: string }
  | { t: 'lead'; x: string }
  | { t: 'h'; x: string }
  | { t: 'quote'; x: string[] }
  | { t: 'ul'; x: string[] }
  | { t: 'ol'; x: string[] }
  | { t: 'box'; kind: BoxKind; title?: string; x?: string[]; list?: string[]; ordered?: boolean }
  | { t: 'formula'; title?: string; lines: string[]; result: string; note?: string }
  | { t: 'flow'; steps: string[]; title?: string }
  | { t: 'compare'; a: CompareSide; b: CompareSide }
  | { t: 'cards'; items: { title: string; x: string }[] }
  | { t: 'table'; head: string[]; rows: string[][]; caption?: string }
  | { t: 'steps'; items: { title: string; x: string }[] }
  /** Utdyping som kan åpnes. Ikke til hovedpensum. */
  | { t: 'more'; title: string; blocks: Block[] }
  | { t: 'widget'; id: WidgetId };

export interface CoursePage {
  /** '4.2' */
  id: string;
  title: string;
  blocks: Block[];
}

export interface CourseModule {
  /** '1' … '11' */
  id: string;
  num: number;
  title: string;
  /** Formål med modulen. */
  goal: string;
  pages: CoursePage[];
  /** Kontrollspørsmål. Vises som siste steg i modulen. */
  quiz: QuizDef[];
}

/** Avslutningen etter modul 11: sluttcase og sluttquiz er ikke moduler. */
export const FINISH_STEPS = [
  { id: 'sluttcase', title: 'Sluttcase – Ville du kjøpt?' },
  { id: 'sluttquiz', title: 'Sluttquiz' },
  { id: 'ferdig', title: 'Fullført' },
] as const;
export type FinishId = (typeof FINISH_STEPS)[number]['id'];
