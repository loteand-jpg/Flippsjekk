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
      sale: { basis: s.basis, low: s.low, base: s.base, high: s.high, rationaleLow: s.rationaleLow, rationaleBase: s.rationaleBase, rationaleHigh: s.rationaleHigh },
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
      },
      deviationFromAgentPct: null,
      notes,
      ...common,
    };
  }

  notes.push(`Markedsmotoren kunne ikke regne en verdi: ${market.reason ?? 'for svakt grunnlag'} Ingen salgsverdi er satt – legg inn egen verdi eller flere referanser.`);
  return {
    source: 'ingen',
    sale: { basis, low: null, base: null, high: null, rationaleLow: '', rationaleBase: '', rationaleHigh: '' },
    deviationFromAgentPct: null,
    notes,
    ...common,
  };
}
