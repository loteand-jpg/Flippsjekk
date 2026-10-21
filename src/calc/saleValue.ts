import type { MarketIndex } from '../domain/areaProfile';
import type { ResolvedAnalysisScenario } from '../domain/analysisScenarios';
import type { PriceBasis, StandardClass } from '../domain/enums';
import type { Property, PropertySnapshot, SaleEstimate, SharedAnalysis } from '../domain/schemas';
import { localDateKey } from '../lib/time';
import { comparablesForScenario, marketTargetFor, toMarketComparable, weighMarket, type MarketComparable, type MarketEstimate } from './market';

/**
 * Én autoritativ salgsverdiflyt per scenario.
 *
 *   1. strukturerte markedsreferanser (sammenlignbare objekter med egenskaper)
 *   2. koden beregner markedsanker og usikkerhetsintervall (`weighMarket`)
 *   3. agenten kan levere sluttprodukt, referanseklassifisering og en begrenset, begrunnet ankerjustering (maks ±5 %)
 *   4. koden fastsetter endelig low/base/high
 *
 * Tre verdier holdes adskilt og vises som sådan:
 *   - agentens/fellesanalysens HISTORISKE estimat (`scenario.sale`, eller analysens globale `estimates.sale` for eldre analyser)
 *   - markedsmotorens beregnede verdi (denne funksjonens `sale` når `source === 'markedsmotor'`)
 *   - brukerens private overstyring (`saleLow/Base/High` i ScenarioValues – skrives aldri til felles analyse)
 *
 * Agentens historiske estimat er aldri fasit når markedsmotoren kan regne. Det brukes bare som tydelig merket fallback
 * når motoren ikke kan gi en verdi, eller for eldre analyser som aldri hadde scenariospesifikke referanser.
 */
export type SaleSource = 'markedsmotor' | 'agent_fallback' | 'global_fallback' | 'ingen';

export const SALE_SOURCE_LABEL: Record<SaleSource, string> = {
  markedsmotor: 'Beregnet av markedsmotoren',
  agent_fallback: 'Agentens estimat (ikke verifisert av markedsmotoren)',
  global_fallback: 'Analysens ene salgsverdi (eldre analyse)',
  ingen: 'Ingen salgsverdi',
};

export interface ResolvedSale {
  basis: PriceBasis;
  low: number | null;
  base: number | null;
  high: number | null;
  rationaleLow: string;
  rationaleBase: string;
  rationaleHigh: string;
  /**
   * Fellesgjelden kontantverdiene er avledet med (markedsmotoren: totalverdi − gjeld). Satt bare når `basis` er kontantpris og
   * verdien er regnet ut fra en totalverdi; null når verdiene er oppgitt direkte som kontantpris (agent/eldre analyse) eller er
   * totalpris. Se `resolveSalePricesForDebt`.
   */
  debtBasis: number | null;
}

export interface SaleResolution {
  source: SaleSource;
  /** Endelig salgsverdi som kalkylen bygger på (før eventuell privat overstyring). */
  sale: ResolvedSale;
  /** Agentens/fellesanalysens historiske estimat. Alltid med i visningen, aldri fasit når motoren kan regne. */
  agentEstimate: SaleEstimate | null;
  /** Markedsmotorens fulle resultat, også når det er «for usikkert». */
  market: MarketEstimate | null;
  /** Differanse mellom endelig normalverdi og agentens estimat (prosent). null når en av dem mangler. */
  deviationFromAgentPct: number | null;
  standardClass: StandardClass;
  standardDocumented: boolean;
  /** Forklaringer som vises til brukeren (hva som er brukt, og hva som ikke kunne regnes). */
  notes: string[];
}

export interface SaleResolutionArgs {
  analysis: SharedAnalysis;
  scenario: ResolvedAnalysisScenario;
  property: Property;
  snapshot: PropertySnapshot | null;
  /** Fellesgjeld ved salg – trengs for å regne om mellom total- og kontantpris. */
  debtAtSale: number | null;
  /** Datoen markedsvurderingen gjelder (ÅÅÅÅ-MM-DD). Standard: analysens dato, slik at grunnverdiene er stabile. */
  asOf?: string;
  /** Referanser i tillegg til analysens (brukerens egne). Gir en privat vurdering – ikke grunnverdi. */
  extraComparables?: readonly MarketComparable[];
  /** Brukerens private overstyring av sluttstandard. */
  standardOverride?: StandardClass;
  index?: MarketIndex | null;
}

/** Dato markedsvurderingen er regnet per. Analysens dato holder grunnverdiene stabile frem til neste markedsoppfriskning. */
export function analysisDateKey(analysis: Pick<SharedAnalysis, 'publishedAt' | 'createdAt'>): string {
  return localDateKey(new Date(analysis.publishedAt ?? analysis.createdAt));
}

const kr = (n: number) => `${Math.round(n).toLocaleString('nb-NO')} kr`;

export function resolveScenarioSale(args: SaleResolutionArgs): SaleResolution {
  const { analysis, scenario, property, snapshot } = args;
  const asOf = args.asOf ?? analysisDateKey(analysis);
  const isLegacy = scenario.saleSource === 'global';
  const agentEstimate = scenario.sale ?? null;
  const basis: PriceBasis = agentEstimate?.basis ?? analysis.estimates.sale.basis;

  const target = marketTargetFor({
    property,
    snapshot,
    values: { saleBasis: basis, debtAtSale: args.debtAtSale },
    scenario,
    standardClass: args.standardOverride,
  });
  const comps = comparablesForScenario([...analysis.comparables.map(toMarketComparable), ...(args.extraComparables ?? [])], scenario);
  const market = weighMarket(target, comps, { today: asOf, index: args.index ?? null, anchorAdjustmentPct: scenario.anchorAdjustment?.pct ?? null });
  const notes: string[] = [];

  const deviation = (base: number | null) => (base !== null && agentEstimate?.base ? Math.round(((base - agentEstimate.base) / agentEstimate.base) * 1000) / 10 : null);
  const common = { agentEstimate, market, standardClass: target.standardClass, standardDocumented: target.standardDocumented };

  // Eldre analyse: analysens ene salgsverdi er historisk fasit (den var aldri vurdert for et bestemt sluttprodukt).
  if (isLegacy) {
    const s = analysis.estimates.sale;
    notes.push('Eldre analyse: salgsverdien er analysens ene estimat og er ikke vurdert for et bestemt sluttprodukt. Markedsmotoren er ikke brukt som grunnverdi.');
    return {
      source: 'global_fallback',
      sale: { basis: s.basis, low: s.low, base: s.base, high: s.high, rationaleLow: s.rationaleLow, rationaleBase: s.rationaleBase, rationaleHigh: s.rationaleHigh, debtBasis: null },
      deviationFromAgentPct: null,
      notes,
      ...common,
      agentEstimate: s,
    };
  }

  if (market.status === 'ok' && market.estimate) {
    const e = market.estimate;
    const unit = e.basis === 'total' ? 'totalpris inkl. fellesgjeld' : 'kontantpris';
    const adj = market.positioning;
    const anchorTxt = market.anchor.weightedMedianPerM2 === null ? '' : `Anker ${kr(market.anchor.weightedMedianPerM2)}/m² (vektet median av ${market.anchor.used} referanser)`;
    const parts = [anchorTxt, adj.anchorAdjustmentPct !== 0 ? `agentens begrunnede ankerjustering ${adj.anchorAdjustmentPct > 0 ? '+' : ''}${adj.anchorAdjustmentPct} %` : '', adj.activeSignalPct !== 0 ? `markedssignal fra aktive annonser ${adj.activeSignalPct > 0 ? '+' : ''}${adj.activeSignalPct} %` : ''].filter(Boolean);
    notes.push(`Salgsverdien er beregnet av markedsmotoren (${unit}), ikke levert av agenten. ${parts.join(' · ')}.`);
    notes.push(...adj.notes);
    const dev = deviation(e.base);
    if (dev !== null && Math.abs(dev) >= 5) notes.push(`Markedsmotoren avviker ${dev > 0 ? '+' : ''}${dev.toLocaleString('nb-NO')} % fra agentens historiske estimat. Motorens verdi brukes.`);
    return {
      source: 'markedsmotor',
      sale: {
        basis: e.basis,
        low: e.low,
        base: e.base,
        high: e.high,
        rationaleLow: `Nedre del av intervallet (−${market.halfWidthPct} %) fra markedsmotoren.`,
        rationaleBase: `${anchorTxt || 'Markedsanker'} × BRA-i ${target.areaBRAi ?? '?'} m².${adj.activeSignalPct !== 0 ? ` Flyttet ${adj.activeSignalPct} % av aktive annonser.` : ''}`,
        rationaleHigh: `Øvre del av intervallet (+${market.halfWidthPct} %) fra markedsmotoren.`,
        debtBasis: e.basis === 'kontant' ? e.debtSubtracted : null,
      },
      deviationFromAgentPct: dev,
      notes,
      ...common,
    };
  }

  if (agentEstimate) {
    notes.push(`Markedsmotoren kunne ikke regne en verdi: ${market.reason ?? 'for svakt grunnlag'} Agentens estimat er brukt som fallback og er IKKE verifisert mot markedsreferanser.`);
    return {
      source: 'agent_fallback',
      sale: {
        basis: agentEstimate.basis,
        low: agentEstimate.low,
        base: agentEstimate.base,
        high: agentEstimate.high,
        rationaleLow: agentEstimate.rationaleLow,
        rationaleBase: agentEstimate.rationaleBase,
        rationaleHigh: agentEstimate.rationaleHigh,
        debtBasis: null,
      },
      deviationFromAgentPct: null,
      notes,
      ...common,
    };
  }

  notes.push(`Markedsmotoren kunne ikke regne en verdi: ${market.reason ?? 'for svakt grunnlag'} Ingen salgsverdi er satt – legg inn egen verdi eller flere referanser.`);
  return {
    source: 'ingen',
    sale: { basis, low: null, base: null, high: null, rationaleLow: '', rationaleBase: '', rationaleHigh: '', debtBasis: null },
    deviationFromAgentPct: null,
    notes,
    ...common,
  };
}

// ---------------------------------------------------------------------------
// Fellesgjeld ved salg: totalpris, kontantpris og gjeld skal alltid henge sammen
// ---------------------------------------------------------------------------

/**
 * Dagens representasjon (kartlagt i koden):
 *  - `ScenarioValues.saleBasis` er 'kontant' eller 'total', og saleLow/Base/High er oppgitt i det grunnlaget.
 *  - Kalkylemotoren regner kontantsalget S = V − D1 når grunnlaget er 'total' (D1 = brukerens fellesgjeld ved salg, påkrevd, og det
 *    er en feil om V < D1), og S = V når grunnlaget er 'kontant' (D1 spiller ingen rolle).
 *  - Markedsmotoren regner alltid en TOTALverdi (kr/m² × areal). Er prisgrunnlaget 'kontant', trekker den fra fellesgjelden som ble
 *    oppgitt (analysens eller boligens gjeld) og leverer kontantverdier med den gjelden «bakt inn». Er grunnlaget 'total', trekkes ingenting.
 *  - Agentens egne estimater og eldre analyser er oppgitt direkte i sitt grunnlag, uten kjent totalverdi.
 *
 * Uten tiltak kan brukerens egen fellesgjeld ved salg derfor komme i utakt med de kontantverdiene markedsmotoren har regnet ut
 * (gjelden trekkes fra med ett tall i verdiene og brukes med et annet i kalkylen). Denne funksjonen er den ene definisjonen av
 * hvordan verdiene rebalanseres, slik at totalverdien beholdes og bare fordelingen mellom kontantpris og fellesgjeld endres.
 */
export interface SalePrices {
  low: number | null;
  base: number | null;
  high: number | null;
}

export type SaleDebtIssueKind =
  /** Fellesgjeld ved salg er ukjent, og konverteringen krever den. Ukjent er aldri 0. */
  | 'gjeld_ukjent'
  /** Fellesgjelden er større enn totalverdien, så kontantprisen ville blitt negativ. */
  | 'gjeld_over_totalverdi';

export interface SaleDebtIssue {
  kind: SaleDebtIssueKind;
  /** Hvilke av verdiene det gjelder. */
  keys: (keyof SalePrices)[];
  message: string;
}

export interface SaleForDebt {
  /** Prisgrunnlaget `prices` er oppgitt i (uendret av funksjonen). */
  basis: PriceBasis;
  /** Verdiene slik kalkylen skal få dem (samme grunnlag som inn). null = ukjent/ugyldig – aldri 0. */
  prices: SalePrices;
  /** Totalverdi inkl. fellesgjeld når den er kjent (totalpris, eller kontantverdi avledet av totalverdi). */
  total: SalePrices | null;
  /** Kontant salgsverdi etter fellesgjeld ved salg slik kalkylen får den. null der den ikke kan regnes. */
  cash: SalePrices;
  issues: SaleDebtIssue[];
}

const KEYS = ['low', 'base', 'high'] as const;
const mapPrices = (p: SalePrices, f: (v: number, k: keyof SalePrices) => number | null): SalePrices => ({
  low: p.low === null ? null : f(p.low, 'low'),
  base: p.base === null ? null : f(p.base, 'base'),
  high: p.high === null ? null : f(p.high, 'high'),
});

/**
 * Gjør salgsverdiene konsistente med brukerens fellesgjeld ved salg.
 *
 *  - Totalpris: verdiene beholdes (totalverdien er utgangspunktet). Kontant salgsverdi = totalpris − fellesgjeld ved salg.
 *    Gjelden telles dermed nøyaktig én gang (ikke lagt til og ikke trukket fra to ganger).
 *  - Kontantpris avledet av en totalverdi (`derivedWithDebt` kjent): totalverdien (kontant + gjelden den ble avledet med) beholdes,
 *    og kontantverdien blir totalverdi − brukerens gjeld.
 *  - Kontantpris oppgitt direkte (`derivedWithDebt` = null): endres ikke av gjelden.
 *  - Ukjent gjeld når konverteringen krever den: verdiene beholdes uendret og det rapporteres `gjeld_ukjent` (aldri 0).
 *  - Gjeld større enn totalverdien: den aktuelle verdien blir null med `gjeld_over_totalverdi` (ingen meningsløs negativ pris).
 *    Kalkylen blir da ufullstendig med tydelig årsak, i stedet for å regne med en negativ salgspris.
 *
 * @param derivedWithDebt fellesgjelden kontantverdiene ble avledet med (`ResolvedSale.debtBasis`), ellers null
 * @param debtAtSale brukerens fellesgjeld ved salg (null = ukjent)
 */
export function resolveSalePricesForDebt(args: { basis: PriceBasis; prices: SalePrices; derivedWithDebt: number | null; debtAtSale: number | null }): SaleForDebt {
  const { basis, prices, derivedWithDebt, debtAtSale } = args;
  const issues: SaleDebtIssue[] = [];
  const unknownDebt = (keys: (keyof SalePrices)[]) => issues.push({ kind: 'gjeld_ukjent', keys, message: 'Fellesgjeld ved salg er ukjent, så salgsverdien kan ikke fordeles mellom kontantpris og fellesgjeld. Ukjent er ikke 0 kr.' });
  const overTotal = (keys: (keyof SalePrices)[]) => issues.push({ kind: 'gjeld_over_totalverdi', keys, message: 'Fellesgjelden ved salg er større enn salgsverdien (totalpris), så kontantprisen ville blitt negativ. Kontroller fellesgjelden eller salgsverdien.' });
  const present = KEYS.filter((k) => prices[k] !== null);

  if (basis === 'total') {
    if (debtAtSale === null) {
      if (present.length > 0) unknownDebt([...present]);
      return { basis, prices, total: prices, cash: { low: null, base: null, high: null }, issues };
    }
    const bad: (keyof SalePrices)[] = [];
    const cash = mapPrices(prices, (v, k) => {
      if (v < debtAtSale) {
        bad.push(k);
        return null;
      }
      return v - debtAtSale;
    });
    if (bad.length > 0) overTotal(bad);
    return { basis, prices, total: prices, cash, issues };
  }

  // Kontantpris
  if (derivedWithDebt === null) return { basis, prices, total: null, cash: prices, issues };
  const total = mapPrices(prices, (v) => v + derivedWithDebt);
  if (debtAtSale === null) {
    if (present.length > 0) unknownDebt([...present]);
    return { basis, prices, total, cash: prices, issues };
  }
  const bad: (keyof SalePrices)[] = [];
  const cash = mapPrices(total, (t, k) => {
    if (t < debtAtSale) {
      bad.push(k);
      return null;
    }
    return t - debtAtSale;
  });
  if (bad.length > 0) overTotal(bad);
  return { basis, prices: cash, total, cash, issues };
}
