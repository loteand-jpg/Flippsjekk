import { useMemo } from 'react';
import type { MarketComparable, MarketEstimate } from '../../../calc/market';
import type { PropertyContext } from '../../../components/analysis/shared';
import { resolveForScenario, scenarioFor, useMarketComparables } from '../../../components/analysis/useMarket';
import type { SaleResolution } from '../../../calc/saleValue';
import type { StandardClass } from '../../../domain/enums';

export interface MarketFacts {
  res: SaleResolution;
  est: MarketEstimate | null;
  comps: ReturnType<typeof useMarketComparables>;
  byId: Map<string, MarketComparable>;
  primaryCount: number;
  sameBuilding: boolean;
}

/** Markedsfakta for et scenario (samme beregning som Original og Finance bruker). Gir tier, referanser og om en primærreferanse ligger i samme bygg. */
export function useMarketFacts(ctx: PropertyContext, scenarioId: string | null, standardOverride: StandardClass | null = null): MarketFacts {
  const comps = useMarketComparables(ctx);
  const def = scenarioFor(ctx, scenarioId ?? ctx.draft.analysisScenarioId);
  const res = useMemo(() => resolveForScenario({ ctx, scenario: def, values: ctx.draft, own: comps.own, standardOverride }), [ctx, comps.own, def, standardOverride]);
  const est = res.market ?? null;
  const byId = useMemo(() => new Map(comps.all.map((c) => [c.id, c])), [comps.all]);
  const primary = est ? est.references.filter((r) => r.role === 'primaer') : [];
  const sameBuilding = primary.some((r) => byId.get(r.id)?.locationLevel === 'samme_bygg');
  return { res, est, comps, byId, primaryCount: primary.length, sameBuilding };
}
