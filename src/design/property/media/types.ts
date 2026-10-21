/**
 * Medielag for Property: grensesnittet bolig-, plantegnings- og dokumentbilder skal komme inn i når datakilden leverer dem.
 *
 * Dagens datamodell (Property, PropertySnapshot, SharedAnalysis) har INGEN bilder eller plantegninger, og demoen leser ikke fra FINN.
 * Property viser derfor tydelig merkede plassholdere. Alle mediekomponenter tar et `ListingMedia` som prop og velger selv mellom
 * ekte media og plassholder – så en senere datakilde kan kobles på ved å la `useListingMedia` returnere data, uten redesign og uten
 * å endre domenemodellen.
 *
 * Ingenting her henter, genererer eller finner på bilder. Rommetadata (`RoomInfo`) er valgfri og beskriver kun rom datakilden faktisk kjenner.
 */
export interface MediaImage {
  id: string;
  url: string;
  /** Alternativ tekst. Påkrevd: bildet skal kunne forstås uten å se det. */
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
}

export interface FloorPlanMedia {
  id: string;
  url: string;
  alt: string;
  label?: string;
  /** current = dagens plan. proposed = plan for et bestemt sluttprodukt (scenario). */
  kind: 'current' | 'proposed';
  /** Analysescenariet (`AnalysisScenario.id`) en foreslått plan hører til. null/utelatt = gjelder alle. */
  scenarioId?: string | null;
  level?: string | null;
}

export interface DocumentImage {
  id: string;
  url: string;
  alt: string;
  title: string;
  /** Kilde i analysen (`Source.id`), hvis kjent. */
  sourceId?: string | null;
  page?: number | null;
}

export interface RoomInfo {
  id: string;
  name: string;
  areaM2?: number | null;
  level?: string | null;
  note?: string | null;
  /** Bilder (`MediaImage.id`) som viser rommet. */
  imageIds?: string[];
}

export interface ListingMedia {
  mainImage: MediaImage | null;
  images: MediaImage[];
  floorPlans: FloorPlanMedia[];
  documentImages: DocumentImage[];
  rooms: RoomInfo[];
}

/** Ingen media – tilstanden i demoen. */
export const EMPTY_MEDIA: ListingMedia = Object.freeze({ mainImage: null, images: [], floorPlans: [], documentImages: [], rooms: [] }) as ListingMedia;

/** Hovedbildet: eksplisitt hovedbilde, ellers første bilde. */
export function heroImage(m: ListingMedia): MediaImage | null {
  return m.mainImage ?? m.images[0] ?? null;
}

export const hasAnyImage = (m: ListingMedia): boolean => heroImage(m) !== null || m.images.length > 0;

/** Plantegningene som gjelder et scenario: dagens plan(er) og foreslåtte planer for dette scenarioet (eller uten scenariotilknytning). */
export function floorPlansFor(m: ListingMedia, scenarioId: string | null): { current: FloorPlanMedia[]; proposed: FloorPlanMedia[] } {
  return {
    current: m.floorPlans.filter((f) => f.kind === 'current'),
    proposed: m.floorPlans.filter((f) => f.kind === 'proposed' && (f.scenarioId == null || f.scenarioId === scenarioId)),
  };
}
