import { z } from 'zod';
import { LOCATION_LEVELS, type LocationLevel } from './enums';

/**
 * Områdeprofil – datamodell og fallback (klargjøring).
 *
 * Ingen ekstern datainnhenting er koblet til. Modellen beskriver hva en fremtidig områdeprofil skal kunne
 * inneholde, og hvordan man faller tilbake fra samme bygg til mikroområde, bydel, kommune/by og region.
 * Prisutviklingen kan gjøres om til en markedsindeks som brukes av markedsvektingen (`marketIndexFromAreaProfile`).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dato må være på formatet ÅÅÅÅ-MM-DD');
const nullableNum = z.number().finite().nullable();

export const AreaProfileSchema = z.object({
  /** Stabil ID for området, f.eks. «bygg:12345», «bydel:moellenberg». */
  areaId: z.string().min(1),
  level: z.enum(LOCATION_LEVELS),
  name: z.string().min(1),
  parentAreaId: z.string().nullable(),
  /** Tidspunkt dataene gjelder for. */
  asOf: isoDate,
  /** Hvor mange måneder tilbake statistikken dekker. */
  periodMonths: z.number().positive(),
  /** Prisutvikling i prosent siste 1/3/6/12 måneder. null = ukjent (aldri 0). */
  priceChangePct: z.object({ m1: nullableNum, m3: nullableNum, m6: nullableNum, m12: nullableNum }),
  /** Antall salg i perioden. */
  volume: z.number().int().nonnegative().nullable(),
  /** Robust kr/m² (f.eks. median). */
  robustPricePerM2: nullableNum,
  /** Gjennomsnittlig salgstid i dager. */
  daysOnMarket: nullableNum,
  /** Salgspris mot prisantydning i prosent (positivt = over). */
  soldVsAskingPct: nullableNum,
  activeListings: z.number().int().nonnegative().nullable(),
  /** Andel aktive annonser med prisreduksjon (0–100). */
  priceReductionSharePct: z.number().min(0).max(100).nullable(),
  liquidity: z.enum(['hoy', 'middels', 'lav', 'ukjent']),
  /** Datamengde og sikkerhet. */
  sampleSize: z.number().int().nonnegative(),
  confidence: z.enum(['hoy', 'middels', 'lav']),
  source: z.object({ name: z.string(), version: z.string().nullable() }),
  /** Senere: premie for ekstra soverom og for oppussede boliger (prosent). */
  premiums: z.object({ bedroomPremiumPct: nullableNum, renovationPremiumPct: nullableNum }).optional(),
});
export type AreaProfile = z.infer<typeof AreaProfileSchema>;

/** Hvilket område-ID som gjelder på hvert nivå for et gitt objekt. Mangler et nivå, hoppes det over. */
export type AreaChain = Partial<Record<LocationLevel, string>>;

export interface AreaProfileSelection {
  profile: AreaProfile | null;
  /** Nivået profilen ble funnet på. */
  usedLevel: LocationLevel | null;
  /** true hvis den første (mest lokale) kjeden ikke ga treff. */
  fellBack: boolean;
  /** Nivåer som ble forsøkt og hoppet over, med årsak. */
  skipped: { level: LocationLevel; reason: string }[];
}

export const MIN_AREA_SAMPLE = 8;

/**
 * Velger mest lokale områdeprofil med nok data: samme bygg → mikroområde → bydel → kommune/by → region.
 * En profil under minimum datamengde hoppes over, slik at tynne lokale data ikke styrer vurderingen.
 */
export function selectAreaProfile(profiles: readonly AreaProfile[], chain: AreaChain, minSample = MIN_AREA_SAMPLE): AreaProfileSelection {
  const skipped: AreaProfileSelection['skipped'] = [];
  let first = true;
  for (const level of LOCATION_LEVELS) {
    const areaId = chain[level];
    if (!areaId) continue;
    const p = profiles.find((x) => x.areaId === areaId && x.level === level);
    if (!p) {
      skipped.push({ level, reason: 'Ingen områdeprofil' });
      first = false;
      continue;
    }
    if (p.sampleSize < minSample) {
      skipped.push({ level, reason: `For lite data (${p.sampleSize} salg, minst ${minSample})` });
      first = false;
      continue;
    }
    return { profile: p, usedLevel: level, fellBack: !first, skipped };
  }
  return { profile: null, usedLevel: null, fellBack: skipped.length > 0, skipped };
}

/** Markedsindeks (relativ prisnivå over tid). Henter ingenting – bygges fra punkter eller en områdeprofil. */
export interface MarketIndex {
  asOf: string;
  /** Indeksverdi på en dato (lineær interpolasjon, flat utenfor området). null hvis ukjent. */
  indexAt(date: string): number | null;
}

const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const addMonths = (d: string, months: number): string => {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
};

export function createMarketIndex(points: readonly { date: string; value: number }[], asOf: string): MarketIndex | null {
  const pts = points.filter((p) => Number.isFinite(p.value) && p.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return null;
  return {
    asOf,
    indexAt(date) {
      const t = dayNumber(date);
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (t <= dayNumber(first.date)) return first.value;
      if (t >= dayNumber(last.date)) return last.value;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const ta = dayNumber(a.date);
        const tb = dayNumber(b.date);
        if (t <= tb) return a.value + ((b.value - a.value) * (t - ta)) / (tb - ta);
      }
      return last.value;
    },
  };
}

/**
 * Bygger en enkel markedsindeks av prisutviklingen i en områdeprofil. Ukjente perioder hoppes over.
 * Indeksen er 100 på `asOf`. Gir null hvis profilen har færre enn ett kjent punkt.
 */
export function marketIndexFromAreaProfile(profile: AreaProfile): MarketIndex | null {
  const pts: { date: string; value: number }[] = [{ date: profile.asOf, value: 100 }];
  const add = (months: number, pct: number | null) => {
    if (pct === null || pct <= -100) return;
    pts.push({ date: addMonths(profile.asOf, -months), value: 100 / (1 + pct / 100) });
  };
  add(1, profile.priceChangePct.m1);
  add(3, profile.priceChangePct.m3);
  add(6, profile.priceChangePct.m6);
  add(12, profile.priceChangePct.m12);
  return createMarketIndex(pts, profile.asOf);
}
