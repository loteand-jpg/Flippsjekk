import { useMemo } from 'react';
import { useScenarioRanking } from '../../components/analysis/ScenarioRankingPanel';
import { activeScenarioId } from '../../components/analysis/ScenarioPanel';
import type { PropertyContext } from '../../components/analysis/shared';
import { dataQuality } from '../../domain/assessment';
import { effectiveRisks } from '../../domain/risks';
import { buildRiskDimensions } from './riskView';

/** De seks risikodimensjonene for scenarioet i bruk (felles for designvariantene). Samme data som Original viser i risikofanen. */
export function useRiskDimensions(ctx: PropertyContext) {
  const { defs, data } = useScenarioRanking(ctx);
  const active = defs.find((d) => d.id === activeScenarioId(ctx)) ?? defs[0];
  const row = data.result.rows.find((r) => r.id === active.id) ?? null;
  const dims = useMemo(() => {
    const quality = dataQuality(ctx.analysis, ctx.baseSnapshot);
    const certainty = row?.metrics.saleCertainty ?? null;
    return buildRiskDimensions({
      risks: effectiveRisks(ctx.analysis.risks, ctx.item.riskEdits).active,
      scenarioRisk: active.risk,
      scenarioRequirements: active.requirements,
      scenarioFeasibilityRationale: active.feasibilityRationale,
      quality,
      saleCertaintyLabel: row?.metrics.saleCertaintyLabel ?? null,
      saleCertaintyBand: certainty === null ? null : certainty >= 0.7 ? 'lav' : certainty >= 0.35 ? 'middels' : 'hoy',
    });
  }, [ctx.analysis, ctx.baseSnapshot, ctx.item.riskEdits, active, row]);
  return { active, row, dims, defs, data };
}
