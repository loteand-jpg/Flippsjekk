import { useMemo } from 'react';
import { useLiveQuery } from '../../app/hooks';
import { useServices } from '../../app/services';
import { toMarketComparable, type MarketComparable } from '../../calc/market';
import { resolveScenarioSale, type SaleResolution } from '../../calc/saleValue';
import { findAnalysisScenario, type ResolvedAnalysisScenario } from '../../domain/analysisScenarios';
import type { StandardClass } from '../../domain/enums';
import type { ScenarioValues } from '../../domain/schemas';
import type { PropertyContext } from './shared';

/** Sammenlignbare objekter fra analysen og brukerens egne, på markedsvektingens format. */
export function useMarketComparables(ctx: PropertyContext): { shared: MarketComparable[]; own: MarketComparable[]; all: MarketComparable[]; ownIds: Set<string>; loading: boolean } {
  const services = useServices();
  const mine = useLiveQuery(() => services.comparables.list(ctx.item.property.id), [ctx.item.property.id]);
  return useMemo(() => {
    const own = (mine.data ?? []).map(toMarketComparable);
    const shared = ctx.analysis.comparables.map(toMarketComparable);
    return {
      shared,
      own,
      all: [...shared, ...own],
      ownIds: new Set(own.map((c) => c.id)),
      loading: mine.loading && !mine.data,
    };
  }, [ctx.analysis.comparables, mine.data, mine.loading]);
}

/**
 * Salgsverdi for et scenario via den ene autoritative flyten (`resolveScenarioSale`). Brukerens egne referanser og en eventuell
 * privat overstyring av sluttstandard gir en PRIVAT vurdering – de endrer aldri analysens grunnverdier.
 */
export function resolveForScenario(args: {
  ctx: PropertyContext;
  scenario: ResolvedAnalysisScenario;
  values: Pick<ScenarioValues, 'debtAtSale'>;
  own?: readonly MarketComparable[];
  standardOverride?: StandardClass | null;
}): SaleResolution {
  const { ctx, scenario, values } = args;
  return resolveScenarioSale({
    analysis: ctx.analysis,
    scenario,
    property: ctx.item.property,
    snapshot: ctx.baseSnapshot ?? ctx.item.snapshot,
    debtAtSale: values.debtAtSale,
    extraComparables: args.own,
    standardOverride: args.standardOverride ?? undefined,
  });
}

export function scenarioFor(ctx: PropertyContext, id: string | null | undefined): ResolvedAnalysisScenario {
  return findAnalysisScenario(ctx.analysis, id);
}
