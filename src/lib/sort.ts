export type SortDirection = 'asc' | 'desc';

/**
 * Sammenligner to verdier der null/undefined/NaN alltid havner sist,
 * uavhengig av sorteringsretning. Tall sammenlignes numerisk.
 */
export function compareNullableLast<T extends number | string>(
  a: T | null | undefined,
  b: T | null | undefined,
  dir: SortDirection,
): number {
  const aMissing = a === null || a === undefined || (typeof a === 'number' && Number.isNaN(a));
  const bMissing = b === null || b === undefined || (typeof b === 'number' && Number.isNaN(b));
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  let cmp: number;
  if (typeof a === 'number' && typeof b === 'number') cmp = a - b;
  else cmp = String(a).localeCompare(String(b), 'nb');
  return dir === 'asc' ? cmp : -cmp;
}

export function sortByNullableLast<T, V extends number | string>(
  rows: readonly T[],
  get: (row: T) => V | null | undefined,
  dir: SortDirection,
): T[] {
  return rows
    .map((row, index) => ({ row, index, v: get(row) }))
    .sort((x, y) => compareNullableLast(x.v, y.v, dir) || x.index - y.index)
    .map((x) => x.row);
}
