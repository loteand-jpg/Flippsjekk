import { itemEconomics, type ItemEconomics } from '../../../calc/scenario';
import { LABOR_CATEGORY_LABEL, PRIORITIES, type LaborCategory, type Priority } from '../../../domain/enums';
import type { RenovationItem, ScenarioValues } from '../../../domain/schemas';

/**
 * Oppussing gruppert for visning: etter rom, etter arbeidstype og i en veiledende rekkefølge.
 * Bygger bare på tiltakene i datamodellen (`RenovationItem.room`, `laborCategory`, `priority`) og på motorens egen tiltaksøkonomi
 * (`itemEconomics`) – ingen nye priser, timer eller tidsplaner. Summene stemmer med `renovationTotals` (før reserve).
 */
export type LaborContext = Pick<ScenarioValues, 'laborModes' | 'maxOwnWork' | 'regulatedCompetence'>;

export interface ItemView {
  item: RenovationItem;
  econ: ItemEconomics;
}

export interface Group {
  id: string;
  label: string;
  items: ItemView[];
  /** Antall tiltak som er med i kalkylen. */
  includedCount: number;
  excludedCount: number;
  /** Sum av kostnaden for tiltak som er med. null når et tiltak som er med mangler kostnad (ukjent er ikke 0). */
  cost: number | null;
  unknownCostCount: number;
  /** Egne timer for tiltak som er med. null når timer mangler for arbeid som utføres selv. */
  ownHours: number | null;
  /** Antall tiltak per prioritet (kun de som er med). */
  byPriority: Record<Priority, number>;
}

export const WHOLE_HOME = 'Hele boligen';

const emptyPriority = (): Record<Priority, number> => Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;

const roomKey = (r: string) => r.trim().toLocaleLowerCase('nb-NO');

function summarize(id: string, label: string, items: ItemView[]): Group {
  const included = items.filter((i) => i.item.included);
  const costs = included.map((i) => i.econ.cost);
  const hours = included.map((i) => i.econ.ownHours);
  const byPriority = emptyPriority();
  for (const i of included) byPriority[i.item.priority]++;
  return {
    id,
    label,
    items,
    includedCount: included.length,
    excludedCount: items.length - included.length,
    cost: costs.some((c) => c === null) ? null : Math.round(costs.reduce<number>((s, c) => s + (c as number) * 100, 0)) / 100,
    unknownCostCount: costs.filter((c) => c === null).length,
    ownHours: hours.some((h) => h === null) ? null : Math.round(hours.reduce<number>((s, h) => s + (h as number) * 100, 0)) / 100,
    byPriority,
  };
}

export function viewItems(items: readonly RenovationItem[], labor: Partial<LaborContext>): ItemView[] {
  return items.map((item) => ({ item, econ: itemEconomics(item, labor as LaborContext) }));
}

/** Rom i første forekomst. Tiltak uten rom samles under «Hele boligen». Skrivemåte og store/små bokstaver slås sammen. */
export function groupByRoom(items: readonly RenovationItem[], labor: Partial<LaborContext>): Group[] {
  const order: string[] = [];
  const labels = new Map<string, string>();
  const buckets = new Map<string, ItemView[]>();
  for (const v of viewItems(items, labor)) {
    const raw = v.item.room.trim();
    const label = raw === '' ? WHOLE_HOME : raw;
    const key = roomKey(label);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      labels.set(key, label);
      order.push(key);
    }
    buckets.get(key)!.push(v);
  }
  return order.map((k) => summarize(`rom-${k}`, labels.get(k) as string, buckets.get(k) as ItemView[]));
}

/** Arbeidstypene i en veiledende rekkefølge (riving først, overflater sist). Er ikke en tidsplan og sier ingenting om varighet. */
export const WORK_ORDER: readonly LaborCategory[] = ['riving', 'ror', 'elektro', 'bad_vatrom', 'tomrer', 'kjokkenmontering', 'maling_sparkling', 'gulv', 'annet'];
export const NO_WORK_TYPE = 'Uten arbeidstype';

export function groupByWork(items: readonly RenovationItem[], labor: Partial<LaborContext>): Group[] {
  const buckets = new Map<string, ItemView[]>();
  for (const v of viewItems(items, labor)) {
    const key = v.item.laborCategory ?? 'ingen';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(v);
  }
  const out: Group[] = [];
  for (const cat of WORK_ORDER) if (buckets.has(cat)) out.push(summarize(`arbeid-${cat}`, LABOR_CATEGORY_LABEL[cat], buckets.get(cat) as ItemView[]));
  // Tiltak uten arbeidskategori (eldre analyser) har ingen kjent arbeidstype og legges sist.
  if (buckets.has('ingen')) out.push(summarize('arbeid-ingen', NO_WORK_TYPE, buckets.get('ingen') as ItemView[]));
  return out;
}

export interface Step extends Group {
  /** 1-basert plass i den veiledende rekkefølgen. */
  step: number;
}

/**
 * Mulig rekkefølge: arbeidstypene som faktisk finnes i scenarioet, i veiledende rekkefølge. Gir hverken datoer eller varighet per
 * steg – bare «hva typisk kommer før hva». Tiltak uten arbeidskategori er ikke med (rekkefølgen kan ikke utledes av dataene).
 */
export function sequence(items: readonly RenovationItem[], labor: Partial<LaborContext>): { steps: Step[]; unplaced: Group | null } {
  const groups = groupByWork(items, labor);
  const placed = groups.filter((g) => g.id !== 'arbeid-ingen');
  const unplaced = groups.find((g) => g.id === 'arbeid-ingen') ?? null;
  return { steps: placed.map((g, i) => ({ ...g, step: i + 1 })), unplaced };
}

/** Summen av alle grupper (kun tiltak som er med). Skal alltid stemme med `renovationTotals(...).total`. */
export function totalOf(groups: readonly Group[]): { cost: number | null; ownHours: number | null; includedCount: number } {
  const unknownCost = groups.some((g) => g.cost === null);
  const unknownHours = groups.some((g) => g.ownHours === null);
  return {
    cost: unknownCost ? null : Math.round(groups.reduce((s, g) => s + (g.cost as number) * 100, 0)) / 100,
    ownHours: unknownHours ? null : Math.round(groups.reduce((s, g) => s + (g.ownHours as number) * 100, 0)) / 100,
    includedCount: groups.reduce((s, g) => s + g.includedCount, 0),
  };
}

/** Største kostnad først, ukjent sist. Til å løfte frem «de viktigste tiltakene». */
export function topMeasures(items: readonly ItemView[], n: number): ItemView[] {
  return items
    .filter((i) => i.item.included)
    .slice()
    .sort((a, b) => (b.econ.cost ?? -1) - (a.econ.cost ?? -1))
    .slice(0, n);
}
