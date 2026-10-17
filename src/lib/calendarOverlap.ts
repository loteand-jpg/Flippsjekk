/** Minimal hendelsesform for overlappsjekk. */
export interface OverlapEvent {
  uid: string;
  kind: string;
  propertyId: string;
  start: string;
  end: string | null;
  status: string;
}

export function eventEnd(e: Pick<OverlapEvent, 'start' | 'end'>): number {
  return e.end ? Date.parse(e.end) : Date.parse(e.start) + 60 * 60_000;
}

/** Visninger (offisielle og private) for ulike objekter som overlapper i tid. Buddager og avlyste visninger telles ikke. */
export function findOverlaps<T extends OverlapEvent>(events: T[]): Map<string, T[]> {
  const vs = events.filter((e) => e.kind !== 'buddag' && e.status !== 'avlyst');
  const out = new Map<string, T[]>();
  for (const a of vs) {
    const others = vs.filter((b) => b.uid !== a.uid && b.propertyId !== a.propertyId && Date.parse(a.start) < eventEnd(b) && Date.parse(b.start) < eventEnd(a));
    if (others.length) out.set(a.uid, others);
  }
  return out;
}
