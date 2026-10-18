import { ANALYSIS_SCHEMA_VERSION } from '../domain/schemas';
import type {
  BidStep,
  ChecklistItem,
  ComparableSale,
  DutyRule,
  Property,
  PropertySnapshot,
  RenovationItem,
  RenovationOption,
  ReportSection,
  Risk,
  SharedAnalysis,
  Source,
  Viewing,
} from '../domain/schemas';
import {
  CHECKLIST_KEYS,
  PRICE_BASIS_SHORT,
  RECOMMENDATION_LABEL,
  RENOVATION_LEVEL_LABEL,
  type ChecklistKey,
  type CheckStatus,
  type ComparableKind,
  type DataQualityLevel,
  type FeasibilityStatus,
  type LaborCategory,
  type LayoutMatch,
  type LocationLevel,
  type PriceBasis,
  type Priority,
  type PropertyType,
  type Recommendation,
  type RenovationLevel,
  type RiskCategory,
  type SaleStatus,
  type ScenarioKind,
  type SourceKind,
  type StandardClass,
  type Tenure,
  type UncertaintyLevel,
} from '../domain/enums';
import { CALC_MODEL_VERSION } from '../calc/engine';
import type { AnalysisScenario, ScenarioEndProduct } from '../domain/schemas';
import { defaultDutyRule } from '../calc/scenario';
import { pricesFromLegacy } from '../domain/comparables';
import { canonicalFinnUrl } from '../lib/finn';
import { hash32 } from '../lib/ids';
import { addDaysToKey, localDateKey, osloAt, weekdayOfKey } from '../lib/time';

/** Deterministisk UUID-formet ID fra en nøkkel. */
export function deterministicUuid(key: string): string {
  const h = [hash32(key), hash32(key + ':1'), hash32(key + ':2'), hash32(key + ':3')].map((n) => n.toString(16).padStart(8, '0'));
  const hex = h.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** [rom, tiltak, materialer, elektriker, rørlegger, andre fag, egne timer, prioritet, inkludert?] */
export type ItemSpec = [string, string, number | null, number | null, number | null, number | null, number | null, Priority, boolean?];

export interface RenovationOptionSpec {
  level: RenovationLevel;
  title?: string;
  description: string;
  items: ItemSpec[];
  suggestedMonths?: number | null;
  saleEffectNote: string;
  requiresApproval?: boolean;
}

export interface RiskSpec {
  title: string;
  category: RiskCategory;
  level: number | null;
  costLow?: number | null;
  costHigh?: number | null;
  rationale: string;
  source?: SourceKind | null;
  action: string;
}

export interface ComparableSpec {
  name: string;
  price: number | null;
  priceBasis: PriceBasis;
  debt?: number | null;
  area: number | null;
  monthsAgo: number | null;
  kind: ComparableKind;
  notes: string;
  /** Valgfrie egenskaper til markedsvektingen (ukjent hvis utelatt). */
  extra?: {
    bedrooms?: number | null;
    propertyType?: PropertyType | null;
    tenure?: Tenure | null;
    locationLevel?: LocationLevel | null;
    standardClass?: StandardClass | null;
    layoutMatch?: LayoutMatch | null;
    floor?: number | null;
    elevator?: boolean | null;
    balcony?: boolean | null;
    parking?: boolean | null;
    dataQuality?: DataQualityLevel | null;
  };
}

/** [rom, tiltak, materialer, arbeidskategori, arbeidstimer totalt, arbeidskost hvis innleid, prioritet, inkludert?] */
export type LaborItemSpec = [string, string, number | null, LaborCategory, number | null, number | null, Priority, boolean?];

/** Agentdefinert scenario (basis eller alternativ) med egne tiltak og egen salgsverdi. */
export interface ScenarioSpec {
  kind: ScenarioKind;
  level: RenovationLevel;
  title: string;
  description: string;
  feasibility: FeasibilityStatus;
  feasibilityRationale: string;
  requirements?: string[];
  requiresApproval?: boolean;
  endProduct: ScenarioEndProduct;
  items: LaborItemSpec[];
  suggestedMonths: number | null;
  sale: AnalysisSpec['sale'];
  uncertainty: { level: UncertaintyLevel; note: string };
  /** Navn (eller del av navn) på sammenlignbare objekter som støtter salgsverdien. */
  referenceNames: string[];
  referenceNote: string;
}

export interface AnalysisSpec {
  recommendation: Recommendation;
  recommendationRationale: string;
  summary: string;
  strategy: string;
  conditions: string[];
  sale: {
    basis: PriceBasis;
    low: number | null;
    base: number | null;
    high: number | null;
    rationaleLow: string;
    rationaleBase: string;
    rationaleHigh: string;
  };
  renovationOptions: RenovationOptionSpec[];
  defaultOption: RenovationLevel | null;
  /** Basis + inntil to alternativer med egne tiltak og egen salgsverdi (valgfritt). */
  scenarios?: ScenarioSpec[];
  months?: number | null;
  monthlyBreakdown: { label: string; amount: number | null }[];
  buyFees?: number | null;
  debtAtSale?: number | null;
  suggestedPurchasePrice?: number | null;
  dutyRule?: DutyRule;
  risks: RiskSpec[];
  checklist: Partial<Record<ChecklistKey, { status: CheckStatus; note?: string; beforeBidTask?: string | null }>>;
  comparables: ComparableSpec[];
  /** Hvilke (fiktive) dokumenter som finnes i grunnlaget. */
  documents: SourceKind[];
  assumptions?: string[];
  uncertainties?: string[];
  extraReport?: ReportSection[];
  bidSteps?: BidStep[];
  nextSteps?: string[];
}

export interface PropertySpec {
  key: string;
  finnId: string;
  address: string;
  postalCode: string | null;
  district: string;
  city?: string;
  propertyType: PropertyType;
  tenure: Tenure;
  origin: 'demo' | 'synthetic';
  areaBRAi: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  buildYear: number | null;
  plotArea?: number | null;
  askingPrice: number | null;
  sharedDebt: number | null;
  monthlyCommonCosts: number | null;
  listingTotalInclCosts?: number | null;
  saleStatus: SaleStatus;
  saleStatusNote?: string | null;
  energyLabel?: string | null;
  /** Nøkkelfakta som er uavklart / bare anslått i annonsegrunnlaget. */
  unknownFacts?: string[];
  estimatedFacts?: string[];
  /** offsetDays fra i dag; med weekday flyttes datoen frem til første slike ukedag (0 = søndag). */
  viewings: { offsetDays: number; weekday?: number; hour: number; minute?: number; durationMin?: number; status?: 'planlagt' | 'avlyst' }[];
  analysisAgeDays: number;
  snapshotAgeHours: number;
  analysis: AnalysisSpec;
}

const CHECK_DEFAULTS: Record<ChecklistKey, { missing: string; documented: string; task: string }> = {
  salgsoppgave: {
    missing: 'Salgsoppgave og egenerklæring er ikke gjennomgått.',
    documented: 'Salgsoppgave og egenerklæring er gjennomgått.',
    task: 'Les salgsoppgaven og egenerklæringen i sin helhet før visning.',
  },
  tilstandsrapport: {
    missing: 'Tilstandsrapport foreligger ikke i grunnlaget. Bygningsrisiko er derfor uavklart.',
    documented: 'Tilstandsrapport er gjennomgått, inkludert TG2 og TG3.',
    task: 'Be megler om tilstandsrapport og gå gjennom alle TG2/TG3.',
  },
  tegninger: {
    missing: 'Godkjente tegninger og godkjent rombruk er ikke kontrollert.',
    documented: 'Godkjente tegninger samsvarer med dagens rombruk.',
    task: 'Be om godkjente tegninger fra kommunen og sammenlign med planløsningen.',
  },
  vatrom: {
    missing: 'Våtrommenes tilstand og alder er ikke dokumentert.',
    documented: 'Våtrom er vurdert i tilstandsrapporten.',
    task: 'Kontroller membran, sluk og fuktmåling på bad. Ta med fuktmåler eller fagperson.',
  },
  elektrisk: {
    missing: 'Det elektriske anlegget mangler dokumentasjon (samsvarserklæring/el-kontroll).',
    documented: 'El-anlegg har samsvarserklæring og nyere kontroll.',
    task: 'Be om samsvarserklæring og siste el-kontroll.',
  },
  vann_avlop: {
    missing: 'Alder og tilstand på vann- og avløpsrør er ikke dokumentert.',
    documented: 'Vann og avløp er vurdert.',
    task: 'Spør om alder på stikkledninger og eventuell rørinspeksjon.',
  },
  tak_fasade: {
    missing: 'Tak, fasade og vinduer er ikke dokumentert.',
    documented: 'Tak, fasade og vinduer er vurdert.',
    task: 'Se etter råte, sprekker og punkterte glass på visning.',
  },
  fukt_grunn: {
    missing: 'Fukt, grunnmur og drenering er ikke dokumentert.',
    documented: 'Fukt og grunnmur er vurdert.',
    task: 'Spør om drenering og eventuelle fuktskader i kjeller/underetasje.',
  },
  fellesgjeld_vedtekter: {
    missing: 'Vedtekter, regnskap og planlagt vedlikehold i sameie/borettslag er ikke gjennomgått.',
    documented: 'Vedtekter, budsjett og vedlikeholdsplan er gjennomgått.',
    task: 'Be om siste årsregnskap, budsjett og vedlikeholdsplan. Sjekk utleieregler.',
  },
  sammenlignbare_salg: {
    missing: 'Det mangler faktiske, dokumenterte salg av sammenlignbare oppussede boliger.',
    documented: 'Flere faktiske salg av sammenlignbare boliger er dokumentert.',
    task: 'Hent faktiske salgssummer (ikke prisantydning) for sammenlignbare oppussede boliger.',
  },
  finansiering: {
    missing: 'Finansieringsbevis og sikkerhet for prosjektlån er ikke avklart.',
    documented: 'Finansiering er avklart.',
    task: 'Avklar finansieringsbevis, sikkerhet og rentevilkår med bank før bud.',
  },
  skatt: {
    missing: 'Skattebehandling av gevinst er ikke avklart for valgt kjøpertype.',
    documented: 'Skattebehandling er avklart med rådgiver.',
    task: 'Avklar skattebehandling med revisor/regnskapsfører for valgt kjøpertype.',
  },
};

function sourceTitle(kind: SourceKind, address: string): string {
  switch (kind) {
    case 'annonse':
      return `Demodata: fiktiv annonse for ${address} (ingen FINN-data hentet)`;
    case 'salgsoppgave':
      return 'Demodata: fiktiv salgsoppgave';
    case 'tilstandsrapport':
      return 'Demodata: fiktiv tilstandsrapport';
    case 'egenerklaering':
      return 'Demodata: fiktiv egenerklæring fra selger';
    case 'tegninger':
      return 'Demodata: fiktive godkjente tegninger';
    case 'vedtekter':
      return 'Demodata: fiktive vedtekter og årsregnskap';
    case 'sammenligning':
      return 'Demodata: fiktive sammenligningsobjekter';
    default:
      return 'Demodata';
  }
}

export interface BuiltProperty {
  property: Property;
  snapshot: PropertySnapshot;
  viewings: Viewing[];
  analysis: SharedAnalysis;
}

export function buildProperty(
  spec: PropertySpec,
  now: Date,
  opts: { analysisVersion?: number; analysisKeySuffix?: string; analysisAgeDays?: number; analysisOverride?: Partial<AnalysisSpec> } = {},
): BuiltProperty {
  const a: AnalysisSpec = { ...spec.analysis, ...opts.analysisOverride };
  const propertyId = deterministicUuid(`property:${spec.finnId}`);
  const todayKey = localDateKey(now);
  const observedAt = new Date(now.getTime() - spec.snapshotAgeHours * 3_600_000).toISOString();
  const analysisAge = opts.analysisAgeDays ?? spec.analysisAgeDays;
  const analysisAt = new Date(now.getTime() - analysisAge * 86_400_000).toISOString();
  const version = opts.analysisVersion ?? 1;
  const aKey = `${spec.finnId}:v${version}${opts.analysisKeySuffix ?? ''}`;
  const isSynthetic = spec.origin === 'synthetic';
  const demoNote = isSynthetic ? 'Demodata – ingen annonse hentet' : 'Demodata – fiktivt objekt';

  const property: Property = {
    id: propertyId,
    finnId: spec.finnId,
    canonicalUrl: canonicalFinnUrl(spec.finnId),
    address: spec.address,
    postalCode: spec.postalCode,
    city: spec.city ?? 'Trondheim',
    district: spec.district,
    municipality: 'Trondheim',
    countryCode: 'NO',
    propertyType: spec.propertyType,
    tenure: spec.tenure,
    dataOrigin: spec.origin,
    createdAt: new Date(Date.parse(analysisAt) - 3_600_000).toISOString(),
  };

  // Kilder
  const kinds: SourceKind[] = ['annonse', ...a.documents.filter((k) => k !== 'annonse'), 'sammenligning'];
  const sources: Source[] = kinds.map((kind) => ({
    id: `src-${aKey}-${kind}`,
    kind,
    title: sourceTitle(kind, spec.address),
    url: kind === 'annonse' ? canonicalFinnUrl(spec.finnId) : null,
    documentName: kind === 'annonse' || kind === 'sammenligning' ? null : `${sourceTitle(kind, spec.address).replace('Demodata: ', '')}.pdf`,
    page: null,
    fetchedAt: observedAt,
    observedAt: localDateKey(observedAt),
    status: 'dokumentert',
    isDemo: true,
  }));
  const srcId = (kind: SourceKind | null | undefined) => (kind ? sources.find((s) => s.kind === kind)?.id ?? null : null);
  const listingSrc = srcId('annonse');

  const factKeys = ['askingPrice', 'sharedDebt', 'areaBRAi', 'buildYear', 'monthlyCommonCosts', 'tenure', 'rooms', 'saleStatus'];
  const factSources: PropertySnapshot['factSources'] = {};
  for (const k of factKeys) {
    if (spec.unknownFacts?.includes(k)) factSources[k] = { status: 'uavklart', sourceId: null, note: 'Ikke oppgitt i grunnlaget' };
    else if (spec.estimatedFacts?.includes(k)) factSources[k] = { status: 'anslag', sourceId: listingSrc, note: 'Anslag – ikke bekreftet' };
    else factSources[k] = { status: 'dokumentert', sourceId: listingSrc, page: k === 'saleStatus' ? null : 1 };
  }

  const snapshot: PropertySnapshot = {
    id: deterministicUuid(`snapshot:${spec.finnId}:1`),
    propertyId,
    version: 1,
    observedAt,
    fetchedAt: observedAt,
    sourceUrl: canonicalFinnUrl(spec.finnId),
    origin: spec.origin,
    askingPrice: spec.askingPrice,
    sharedDebt: spec.sharedDebt,
    listingTotalInclCosts: spec.listingTotalInclCosts ?? null,
    monthlyCommonCosts: spec.monthlyCommonCosts,
    areaBRAi: spec.areaBRAi,
    rooms: spec.rooms,
    bedrooms: spec.bedrooms,
    floor: spec.floor,
    buildYear: spec.buildYear,
    plotArea: spec.plotArea ?? null,
    saleStatus: spec.saleStatus,
    saleStatusNote: spec.saleStatusNote ?? null,
    energyLabel: spec.energyLabel ?? null,
    factSources,
  };

  const viewings: Viewing[] = spec.viewings.map((v, i) => {
    let dayKey = addDaysToKey(todayKey, v.offsetDays);
    if (v.weekday !== undefined) for (let g = 0; g < 7 && weekdayOfKey(dayKey) !== v.weekday; g++) dayKey = addDaysToKey(dayKey, 1);
    const start = osloAt(dayKey, v.hour, v.minute ?? 0);
    const end = new Date(start.getTime() + (v.durationMin ?? 60) * 60_000);
    return {
      id: deterministicUuid(`viewing:${spec.finnId}:${i}`),
      propertyId,
      kind: 'official',
      start: start.toISOString(),
      end: end.toISOString(),
      status: v.status ?? 'planlagt',
      sourceId: listingSrc,
      sourceLabel: `${demoNote}: annonsert visning`,
      verifiedAt: observedAt,
      replacesViewingId: null,
      note: v.status === 'avlyst' ? 'Avlyst ifølge annonsen' : null,
    };
  });

  const renovationOptions: RenovationOption[] = a.renovationOptions.map((o) => ({
    id: `opt-${aKey}-${o.level}`,
    level: o.level,
    title: o.title ?? RENOVATION_LEVEL_LABEL[o.level],
    description: o.description,
    items: o.items.map((it, idx): RenovationItem => ({
      id: `item-${aKey}-${o.level}-${idx}`,
      room: it[0],
      title: it[1],
      materials: it[2],
      electrician: it[3],
      plumber: it[4],
      other: it[5],
      hours: it[6],
      priority: it[7],
      included: it[8] ?? true,
    })),
    suggestedMonths: o.suggestedMonths ?? null,
    saleEffectNote: o.saleEffectNote,
    requiresApproval: o.requiresApproval ?? false,
    vatIncluded: true,
  }));
  const defaultOptionId = a.defaultOption ? renovationOptions.find((o) => o.level === a.defaultOption)?.id ?? null : null;

  const risks: Risk[] = a.risks.map((r, i) => ({
    id: `risk-${aKey}-${i}`,
    title: r.title,
    category: r.category,
    level: r.level,
    costLow: r.costLow ?? null,
    costHigh: r.costHigh ?? null,
    rationale: r.rationale,
    sourceId: srcId(r.source ?? null),
    action: r.action,
  }));

  const checklist: ChecklistItem[] = CHECKLIST_KEYS.map((key) => {
    const s = a.checklist[key];
    const status: CheckStatus = s?.status ?? 'mangler';
    const d = CHECK_DEFAULTS[key];
    const sourceKind: SourceKind | null =
      key === 'salgsoppgave' ? 'salgsoppgave' : key === 'fellesgjeld_vedtekter' ? 'vedtekter' : key === 'tegninger' ? 'tegninger' : key === 'sammenlignbare_salg' ? 'sammenligning' : ['vatrom', 'elektrisk', 'vann_avlop', 'tak_fasade', 'fukt_grunn', 'tilstandsrapport'].includes(key) ? 'tilstandsrapport' : null;
    return {
      key,
      status,
      note: s?.note ?? (status === 'dokumentert' ? d.documented : status === 'ikke_relevant' ? 'Ikke relevant for dette objektet.' : status === 'delvis' ? `Delvis: ${d.missing.toLowerCase()}` : d.missing),
      sourceId: status === 'dokumentert' || status === 'delvis' ? srcId(sourceKind) : null,
      beforeBidTask: s?.beforeBidTask !== undefined ? s.beforeBidTask : status === 'dokumentert' || status === 'ikke_relevant' ? null : d.task,
    };
  });

  // Demodata: prisantydning på solgte objekter og felleskostnader utledes deterministisk fra navnet.
  const comparables: ComparableSale[] = a.comparables.map((c, i) => {
    const prices = pricesFromLegacy({ kind: c.kind, price: c.price, priceBasis: c.priceBasis, debt: c.debt ?? null });
    const h = hash32(`${spec.finnId}:${c.name}`);
    const askingPrice = c.kind === 'solgt' && prices.soldPrice !== null ? Math.round((prices.soldPrice * (0.96 + (h % 80) / 1000)) / 10_000) * 10_000 : prices.askingPrice;
    const commonCosts = spec.monthlyCommonCosts === null ? null : Math.round((spec.monthlyCommonCosts * (0.9 + ((h >> 8) % 21) / 100)) / 50) * 50;
    return {
      id: `comp-${aKey}-${i}`,
      name: `Demo: ${c.name}`,
      url: null,
      kind: c.kind,
      askingPrice,
      soldPrice: prices.soldPrice,
      commonCosts,
      soldTotalPrice: prices.soldTotalPrice,
      area: c.area,
      date: c.monthsAgo === null ? null : addDaysToKey(todayKey, -Math.round(c.monthsAgo * 30)),
      notes: c.notes,
      sourceId: srcId('sammenligning'),
      isDemo: true,
      ...(c.extra
        ? {
            bedrooms: c.extra.bedrooms ?? null,
            propertyType: c.extra.propertyType ?? null,
            tenure: c.extra.tenure ?? null,
            sharedDebt: prices.soldTotalPrice !== null && prices.soldPrice !== null ? prices.soldTotalPrice - prices.soldPrice : c.debt ?? null,
            locationLevel: c.extra.locationLevel ?? null,
            standardClass: c.extra.standardClass ?? null,
            layoutMatch: c.extra.layoutMatch ?? null,
            floor: c.extra.floor ?? null,
            elevator: c.extra.elevator ?? null,
            balcony: c.extra.balcony ?? null,
            parking: c.extra.parking ?? null,
            dataQuality: c.extra.dataQuality ?? null,
          }
        : {}),
    };
  });

  // Agentscenarioer: basis og inntil to alternativer med egne tiltak og egen salgsverdi.
  const scenarios: AnalysisScenario[] | undefined = a.scenarios?.map((sc, si) => ({
    // Stabil per objekt og posisjon (basis, alternativ 1, alternativ 2), slik at et valgt scenario kan følges mellom analyseversjoner.
    id: `scn-${spec.finnId}-${si}`,
    kind: sc.kind,
    level: sc.level,
    title: sc.title,
    description: sc.description,
    feasibility: sc.feasibility,
    feasibilityRationale: sc.feasibilityRationale,
    requirements: sc.requirements ?? [],
    requiresApproval: sc.requiresApproval ?? false,
    endProduct: sc.endProduct,
    items: sc.items.map((it, idx): RenovationItem => ({
      id: `item-${aKey}-s${si}-${idx}`,
      room: it[0],
      title: it[1],
      materials: it[2],
      electrician: 0,
      plumber: 0,
      other: 0,
      hours: null,
      priority: it[6],
      included: it[7] ?? true,
      laborCategory: it[3],
      laborHours: it[4],
      laborCostHired: it[5],
      priceSource: { kind: 'agent', version: null },
    })),
    suggestedMonths: sc.suggestedMonths,
    vatIncluded: true,
    sale: { ...sc.sale, includesMarketGrowth: false },
    uncertainty: sc.uncertainty,
    referenceIds: comparables.filter((c) => sc.referenceNames.some((n) => c.name.includes(n))).map((c) => c.id),
    referenceNote: sc.referenceNote,
  }));

  const monthlyTotal = a.monthlyBreakdown.some((m) => m.amount === null)
    ? null
    : a.monthlyBreakdown.reduce((s, m) => s + (m.amount ?? 0), 0);

  const dutyRule = a.dutyRule ?? defaultDutyRule(spec.tenure);
  const facts = [
    { label: 'Datakilde', value: demoNote, status: 'dokumentert' as const, sourceId: listingSrc },
    ...(spec.energyLabel ? [{ label: 'Energimerke', value: spec.energyLabel, status: 'dokumentert' as const, sourceId: listingSrc }] : []),
  ];

  const report: ReportSection[] = [
    {
      title: 'Konklusjon',
      body: `${RECOMMENDATION_LABEL[a.recommendation]}. ${a.summary} ${a.recommendationRationale}`,
    },
    {
      title: 'Objekt og grunnlag',
      body: `${spec.address}, ${spec.district}. ${spec.areaBRAi ?? 'Ukjent'} m² BRA-i, byggeår ${spec.buildYear ?? 'ikke oppgitt'}. ${demoNote}. Opplysninger merket «Uavklart» er ikke oppgitt i grunnlaget og er ikke satt til null kroner.`,
    },
    {
      title: 'Oppussing',
      body: renovationOptions.length
        ? renovationOptions.map((o) => `${o.title}: ${o.description}`).join(' ') +
          ' Anslagene er ikke pristilbud og er oppgitt inkl. mva.'
        : 'Oppussing er ikke vurdert i dette grunnlaget.',
    },
    {
      title: 'Salgsverdi etter oppussing',
      body: `Normalt scenario: ${a.sale.rationaleBase} Lavt: ${a.sale.rationaleLow} Høyt: ${a.sale.rationaleHigh} Prisgrunnlag: ${PRICE_BASIS_SHORT[a.sale.basis]}. Ingen udokumentert markedsvekst er lagt inn.`,
    },
    {
      title: 'Økonomi',
      body: 'Alle økonomiske nøkkeltall (fortjeneste, prosjektavkastning, maksbud, nullpunkt og stresstester) beregnes deterministisk av Flippsjekks beregningsmotor ut fra forutsetningene i ditt scenario – ikke av analysen selv.',
    },
    {
      title: 'Risiko',
      body: risks.length ? risks.map((r) => `${r.title}: ${r.rationale}`).join(' ') : 'Ingen særskilte risikoer er registrert, men grunnlaget kan være ufullstendig.',
    },
    ...(a.extraReport ?? []),
  ];

  const analysis: SharedAnalysis = {
    id: deterministicUuid(`analysis:${aKey}`),
    propertyId,
    snapshotId: snapshot.id,
    version,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    modelVersion: CALC_MODEL_VERSION,
    status: 'published',
    visibility: 'shared',
    ownerId: null,
    origin: isSynthetic ? 'synthetic' : 'demo',
    createdAt: analysisAt,
    publishedAt: analysisAt,
    recommendation: a.recommendation,
    recommendationRationale: a.recommendationRationale,
    summary: a.summary,
    strategy: a.strategy,
    conditions: a.conditions,
    estimates: {
      sale: { ...a.sale, includesMarketGrowth: false },
      renovationOptions,
      defaultRenovationOptionId: defaultOptionId,
      months: a.months ?? null,
      monthlyTotal,
      monthlyBreakdown: a.monthlyBreakdown,
      buyFees: a.buyFees ?? null,
      debtAtSale: a.debtAtSale ?? null,
      suggestedPurchasePrice: a.suggestedPurchasePrice ?? null,
      dutyRule,
      ...(scenarios ? { scenarios, defaultScenarioId: scenarios.find((s) => s.kind === 'basis')?.id ?? null } : {}),
    },
    risks,
    checklist,
    comparables,
    sources,
    facts,
    assumptions: a.assumptions ?? [
      'Ingen markedsvekst er lagt inn i basisscenarioet.',
      'Oppussingsanslag er grove anslag inkl. mva. – ikke pristilbud.',
      'Uavklart verdiøkning (nytt soverom, utleiedel, seksjonering) er ikke innregnet.',
      'Månedlige kostnader inkluderer felleskostnader (også eventuelle renter/avdrag på fellesgjeld), strøm, forsikring og kommunale avgifter.',
    ],
    uncertainties: a.uncertainties ?? [
      'Faktisk oppnådd salgspris kan avvike fra anslaget.',
      'Skjulte feil kan gi merkostnader utover reserven.',
    ],
    report,
    bidSteps: a.bidSteps ?? [
      { title: 'Før bud', detail: 'Gå gjennom sjekklisten og avklar punktene merket «Mangler».', condition: 'Kjøp bør ikke vurderes før påkrevde avklaringer er gjort.' },
      { title: 'Åpningsbud', detail: 'Start godt under ditt modellerte maksbud for å ha rom til å øke.', condition: 'Bare hvis kalkylen er komplett.' },
      { title: 'Budøkning', detail: 'Øk i moderate trinn og oppdater kalkylen ved ny informasjon.', condition: null },
      { title: 'Stopp', detail: 'Stopp ved modellert maksbud eller din egen smertegrense, den laveste av dem.', condition: 'Maksbudet er en modell – ikke en budfullmakt.' },
    ],
    nextSteps: a.nextSteps ?? checklist.filter((c) => c.beforeBidTask).slice(0, 4).map((c) => c.beforeBidTask as string),
  };

  return { property, snapshot, viewings, analysis };
}
