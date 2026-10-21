import type { SaleResolution } from '../../../calc/saleValue';
import type { ResolvedAnalysisScenario } from '../../../domain/analysisScenarios';
import { CHANGE_LEVEL_LABEL, PROPERTY_TYPE_LABEL, STANDARD_CLASS_LABEL, TENURE_LABEL, type ChangeLevel } from '../../../domain/enums';
import type { Property, PropertySnapshot } from '../../../domain/schemas';
import { formatArea } from '../../../lib/format';

/**
 * Sluttprodukt («til dette») og dagens bolig («fra dette») slik analysen faktisk beskriver dem. Ingenting finnes på: rom, standard,
 * kjøkken- og badendringer kommer fra `AnalysisScenario.endProduct` og markedsmotorens sluttstandard. Mangler data, står det «ikke avklart».
 */
export const bedroomsText = (n: number | null | undefined): string => (n === null || n === undefined ? 'Soverom ikke avklart' : n === 1 ? '1 soverom' : `${n} soverom`);

export interface ChangeView {
  level: ChangeLevel;
  label: string;
  /** Endrer kjøkken/bad faktisk noe (oppgradering eller nytt)? Uavklart regnes ikke som «ingen». */
  changes: boolean | null;
}

const change = (level: ChangeLevel): ChangeView => ({ level, label: CHANGE_LEVEL_LABEL[level], changes: level === 'uavklart' ? null : level !== 'ingen' });

export interface EndProductView {
  bedrooms: string;
  bedroomCount: number | null;
  /** Sluttstandard fra markedsmotoren (ellers scenarioets egen). `documented` = oppgitt i analysen, ellers antatt ut fra oppussingsnivået. */
  standard: { label: string; documented: boolean } | null;
  layoutNote: string;
  kitchen: ChangeView;
  bath: ChangeView;
  /** true når analysen ikke har vurdert dette sluttproduktet (eldre analyse). */
  notAssessed: boolean;
}

export function endProductView(def: ResolvedAnalysisScenario, resolution: Pick<SaleResolution, 'standardClass' | 'standardDocumented'> | null): EndProductView {
  const e = def.endProduct;
  const cls = resolution?.standardClass ?? e.standardClass ?? null;
  return {
    bedrooms: bedroomsText(e.bedrooms),
    bedroomCount: e.bedrooms,
    standard: cls ? { label: STANDARD_CLASS_LABEL[cls], documented: resolution ? resolution.standardDocumented : e.standardClass !== null } : null,
    layoutNote: e.layoutNote.trim(),
    kitchen: change(e.kitchenChange),
    bath: change(e.bathChange),
    notAssessed: def.saleSource === 'global',
  };
}

export interface TodayView {
  facts: { label: string; value: string }[];
  rooms: number | null;
  bedrooms: number | null;
}

/** Boligen i dag, bare fra annonsens fakta. Ukjent er «ikke oppgitt», aldri 0. */
export function todayView(property: Pick<Property, 'propertyType' | 'tenure'>, snap: PropertySnapshot | null): TodayView {
  const n = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? 'Ikke oppgitt' : `${v} ${unit}`);
  return {
    rooms: snap?.rooms ?? null,
    bedrooms: snap?.bedrooms ?? null,
    facts: [
      { label: 'Boligtype', value: `${PROPERTY_TYPE_LABEL[property.propertyType]} · ${TENURE_LABEL[property.tenure]}` },
      { label: 'Bruksareal (BRA-i)', value: formatArea(snap?.areaBRAi ?? null, 'Ikke oppgitt') },
      { label: 'Rom', value: snap?.rooms == null ? 'Ikke oppgitt' : n(snap.rooms, snap.rooms === 1 ? 'rom' : 'rom') },
      { label: 'Soverom', value: snap?.bedrooms == null ? 'Ikke oppgitt' : n(snap.bedrooms, snap.bedrooms === 1 ? 'soverom' : 'soverom') },
      { label: 'Byggeår', value: snap?.buildYear == null ? 'Ikke oppgitt' : String(snap.buildYear) },
      { label: 'Etasje', value: snap?.floor == null ? 'Ikke oppgitt' : `${snap.floor}. etasje` },
    ],
  };
}

/** Endrer sluttproduktet antall soverom mot i dag? null når ett av tallene er ukjent. */
export function bedroomChange(today: number | null, after: number | null): number | null {
  return today === null || after === null ? null : after - today;
}
