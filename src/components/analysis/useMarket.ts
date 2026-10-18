import { useMemo } from 'react';
import { useLiveQuery } from '../../app/hooks';
import { useServices } from '../../app/services';
import { marketTargetFor, toMarketComparable, weighMarket, type MarketComparable, type MarketEstimate } from '../../calc/market';
import { findAnalysisScenario, type ResolvedAnalysisScenario } from '../../domain/analysisScenarios';
import type { StandardClass } from '../../domain/enums';
import type { ScenarioValues } from '../../domain/schemas';
import { localDateKey } from '../../lib/time';
import type { PropertyContext } from './shared';

/** Sammenlignbare objekter fra analysen og brukerens egne, på markedsvektingens format. */
export function useMarketComparables(ctx: PropertyContext): { all: MarketComparable[]; ownIds: Set<string>; loading: boolean } {
  const services = useServices();
  const mine = useLiveQuery(() => services.comparables.list(ctx.item.property.id), [ctx.item.property.id]);
  return useMemo(() => {
    const own = mine.data ?? [];
    return {
      all: [...ctx.analysis.comparables.map(toMarketComparable), ...own.map(toMarketComparable)],
      ownIds: new Set(own.map((c) => c.id)),
      loading: mine.loading && !mine.data,
    };
  }, [ctx.analysis.comparables, mine.data, mine.loading]);
}

/** Markedsvekting for et scenario. Standard etter oppussing er «nyoppusset» med mindre noe annet velges. */
export function weighForScenario(args: {
  ctx: PropertyContext;
  comparables: MarketComparable[];
  scenario: ResolvedAnalysisScenario | null;
  values: Pick<ScenarioValues, 'saleBasis' | 'debtAtSale'>;
  standardClass?: StandardClass;
}): MarketEstimate {
  const { ctx, comparables, scenario, values, standardClass } = args;
  const target = marketTargetFor({ property: ctx.item.property, snapshot: ctx.baseSnapshot ?? ctx.item.snapshot, values, scenario, standardClass });
  return weighMarket(target, comparables, { today: localDateKey(ctx.now) });
}

export function scenarioFor(ctx: PropertyContext, id: string | null | undefined): ResolvedAnalysisScenario {
  return findAnalysisScenario(ctx.analysis, id);
}
