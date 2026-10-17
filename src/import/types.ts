import type { PropertyType, Tenure, WorkStatus } from '../domain/enums';
import type { ScenarioValues, SharedAnalysis } from '../domain/schemas';

export interface ImportMessage {
  /** Presis sti, f.eks. «objects[2].risks[0].category». */
  path: string;
  message: string;
}

/** Resultat av v1-adapteren for ett objekt (uten databaseoppslag). */
export interface MappedV1Object {
  finnId: string;
  canonicalUrl: string;
  name: string;
  propertyType: PropertyType | null;
  tenure: Tenure;
  workStatus: WorkStatus;
  notes: string;
  values: ScenarioValues;
  /** Privat utkast. Felt som settes ved lagring (id, propertyId, …) mangler her. */
  draft: Omit<SharedAnalysis, 'id' | 'propertyId' | 'snapshotId' | 'ownerId' | 'createdAt'>;
  viewing: { start: string; confirmed: boolean } | null;
  bidDay: string | null;
  history: Record<string, number | null>;
}

export interface ImportObjectPreview {
  index: number;
  sourceId: string;
  name: string;
  finnId: string | null;
  errors: ImportMessage[];
  warnings: ImportMessage[];
  unmapped: Record<string, unknown>;
  mapped: MappedV1Object | null;
  original: unknown;
  existingPropertyId: string | null;
  alreadyInList: boolean;
  existingScenarios: { id: string; name: string }[];
}

export interface ImportPreview {
  format: 'flipprom-analysis';
  version: number | null;
  byteLength: number;
  rootErrors: ImportMessage[];
  rootWarnings: ImportMessage[];
  objects: ImportObjectPreview[];
}

export type ImportChoice = { action: 'new_scenario' } | { action: 'replace'; scenarioId: string } | { action: 'skip' };

export interface ImportResult {
  imported: { index: number; propertyId: string; scenarioId: string; action: 'new_scenario' | 'replace'; createdProperty: boolean }[];
  skipped: number[];
}
