/**
 * Kurskatalog – én kilde for kurstitler, pris og status.
 * ALLE PRISER ER EKSEMPELVERDIER I DEMO. Beløpet som belastes må alltid fastsettes av serveren fra denne katalogen.
 */
export interface CourseOffer {
  id: string;
  title: string;
  subtitle: string;
  status: 'available' | 'soon';
  /** Engangspris i NOK inkl. mva. Kjøpes én gang og gir varig tilgang. null = ikke til salgs ennå. */
  price: number | null;
}

export const COURSES: CourseOffer[] = [
  { id: 'flipping-privat', title: 'Flipping nivå 1 - Privat', subtitle: 'Fra boligannonse til gjennomtenkt kjøpsbeslutning', status: 'available', price: 2999 },
  { id: 'flipping-as', title: 'Flipping nivå 2 - AS', subtitle: 'Flipping gjennom aksjeselskap', status: 'soon', price: null },
  { id: 'utleie-privat', title: 'Utleie nivå 1 - Privat', subtitle: 'Utleie som privatperson', status: 'soon', price: null },
  { id: 'utleie-as', title: 'Utleie nivå 2 - AS', subtitle: 'Utleie gjennom aksjeselskap', status: 'soon', price: null },
];

export function getCourse(id: string): CourseOffer | null {
  return COURSES.find((c) => c.id === id) ?? null;
}
