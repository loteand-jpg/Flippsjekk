import { COURSE_ID, type CourseModule, type CoursePage } from '../types';
import { M1_3 } from './m01-03';
import { M4_6 } from './m04-06';
import { M7_11 } from './m07-11';

/** Nøyaktig 11 moduler i låst rekkefølge. */
export const MODULES: CourseModule[] = [...M1_3, ...M4_6, ...M7_11];
export const MODULE_COUNT = MODULES.length;

export function moduleById(id: string): CourseModule | undefined {
  return MODULES.find((m) => m.id === id);
}

export const PAGE_COUNT = MODULES.reduce((s, m) => s + m.pages.length, 0);
/** Fremdriftsenheter: alle sider + ett kontrollspørsmålssteg per modul + sluttcase + sluttquiz. */
export const TOTAL_UNITS = PAGE_COUNT + MODULES.length + 2;

export const pageKey = (moduleId: string, index: number) => `${moduleId}:${index}`;

/** Planlagt lesetid per side, i minutter (anslag: 2–5 min per side). */
export const MINUTES_PER_PAGE = 3;
export const TOTAL_MINUTES = PAGE_COUNT * MINUTES_PER_PAGE + MODULES.length * 3 + 25;

export function allPages(): { module: CourseModule; page: CoursePage; index: number }[] {
  return MODULES.flatMap((m) => m.pages.map((page, index) => ({ module: m, page, index })));
}

export const COURSE_PATH = `/kurs/${COURSE_ID}`;
