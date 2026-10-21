import { useMemo } from 'react';
import type { SaleResolution } from '../../../calc/saleValue';
import type { PropertyContext } from '../../../components/analysis/shared';
import { resolveForScenario, useMarketComparables } from '../../../components/analysis/useMarket';
import type { VersionView } from './versions';

/**
 * Salgsverdiflyten (markedsmotoren) for hver versjon, med versjonens egne verdier (fellesgjeld ved salg). Samme `resolveScenarioSale` som
 * rangeringen bruker – her trengs resultatet bare til visning av sluttstandard og markedsgrunnlag per versjon.
 */
export function useVersionSales(ctx: PropertyContext, versions: readonly VersionView[]): Map<string, SaleResolution> {
  const comps = useMarketComparables(ctx);
  return useMemo(() => {
    const m = new Map<string, SaleResolution>();
    for (const v of versions) m.set(v.id, resolveForScenario({ ctx, scenario: v.def, values: v.row.values, own: comps.own }));
    return m;
  }, [ctx, versions, comps.own]);
}
