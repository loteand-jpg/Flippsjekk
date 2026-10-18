import { useMemo, type ReactNode } from 'react';
import { CRITERIA, rankScenarios, RANK_FLAG_LABEL, type RankInput, type RankRow } from '../../calc/ranking';
import { evaluateScenario, normalizeScenarioValues } from '../../calc/scenario';
import { QUALITY_TIER_LABEL } from '../../calc/market';
import { aggregateRisk, RISK_BAND_LABEL } from '../../domain/assessment';
import { resolveAnalysisScenarios } from '../../domain/analysisScenarios';
import { FEASIBILITY_LABEL, UNCERTAINTY_LABEL } from '../../domain/enums';
import { effectiveRisks } from '../../domain/risks';
import type { ScenarioValues } from '../../domain/schemas';
import { formatHours, formatMonths, formatNOK, formatPct, NO_BASIS } from '../../lib/format';
import { Badge } from '../ui/primitives';
import { scenarioFields } from './ScenarioPanel';
import { Panel, type PropertyContext } from './shared';
import { useMarketComparables, weighForScenario } from './useMarket';

/** Rangering av scenarioer på flere kriterier. Betingede scenarioer styrer aldri anbefalt scenario eller maksbud. */
export function ScenarioRankingPanel({ ctx }: { ctx: PropertyContext }) {
  const comps = useMarketComparables(ctx);
  const defs = useMemo(() => resolveAnalysisScenarios(ctx.analysis), [ctx.analysis]);
  const riskBand = useMemo(() => aggregateRisk(effectiveRisks(ctx.analysis.risks, ctx.item.riskEdits).active).band, [ctx.analysis.risks, ctx.item.riskEdits]);

  const data = useMemo(() => {
    const rows: { input: RankInput; source: string; marketTier: string | null }[] = [];
    for (const d of defs) {
      // Kalkylen din for scenarioet hvis du har en (valgt scenario bruker ulagrede endringer), ellers grunnverdiene.
      const draftId = ctx.draft.analysisScenarioId ?? defs.find((x) => x.kind === 'basis')?.id;
      let values: ScenarioValues | null = null;
      let source = 'Grunnverdier';
      if (draftId === d.id) {
        values = ctx.draft;
        source = `Din kalkyle: ${ctx.scenario.name}`;
      } else {
        const mine = ctx.scenarios.find((s) => !s.locked && s.id !== ctx.scenario.id && (normalizeScenarioValues(s.values).analysisScenarioId ?? defs.find((x) => x.kind === 'basis')?.id) === d.id);
        if (mine) {
          values = normalizeScenarioValues(mine.values);
          source = `Din kalkyle: ${mine.name}`;
        }
      }
      values ??= scenarioFields(ctx, d.id)?.values ?? null;
      if (!values) continue;
      const evaluation = evaluateScenario(values).evaluation;
      const market = weighForScenario({ ctx, comparables: comps.all, scenario: d, values });
      const tier = market.status === 'ok' ? market.quality.tier : null;
      rows.push({
        input: { id: d.id, title: d.title, kind: d.kind, feasibility: d.feasibility, evaluation, riskBand, saleCertainty: { tier, uncertainty: d.uncertainty.level } },
        source,
        marketTier: tier ? QUALITY_TIER_LABEL[tier] : null,
      });
    }
    return { rows, result: rankScenarios(rows.map((r) => r.input)) };
  }, [defs, ctx, comps.all, riskBand]);

  if (defs.length < 2) return null;
  const { result, rows } = { result: data.result, rows: data.rows };
  const info = (id: string) => rows.find((r) => r.input.id === id)!;
  const recommended = result.rows.find((r) => r.recommended) ?? null;
  const cell = (r: RankRow, key: (typeof CRITERIA)[number]['key']) => (r.scores[key] === undefined ? '' : `${Math.round((r.scores[key] as number) * 100)}`);

  return (
    <Panel
      title="Sammenligning av scenarioer"
      sub="Rangert på fortjeneste, avkastning, fortjeneste per egeninnsatstime, risiko, salgsverdiens sikkerhet, stresstest og finansiering – ikke bare nominell fortjeneste."
    >
      {recommended ? (
        <p className="mb-3 rounded-lg bg-pine-50 p-3 text-sm text-pine-950">
          Anbefalt scenario: <strong>{recommended.title}</strong>. Anbefalt modellert maksbud: <strong className="num">{recommended.metrics.maxBid === null ? NO_BASIS : formatNOK(Math.floor(recommended.metrics.maxBid / 1000) * 1000)}</strong>. Betingede og uavklarte scenarioer er ikke med i anbefalingen.
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Ingen scenario kan anbefales ennå: det trengs et gjennomførbart scenario med komplett kalkyle. Betingede og uavklarte scenarioer styrer ikke anbefalingen.</p>
      )}
      <ol className="space-y-3">
        {result.rows.map((r) => {
          const m = r.metrics;
          const inf = info(r.id);
          const metric = (label: string, value: ReactNode, sub?: ReactNode) => (
            <div>
              <dt className="text-[11px] text-slate-500">{label}</dt>
              <dd className="font-medium">
                {value}
                {sub && <span className="block text-[11px] font-normal text-slate-500">{sub}</span>}
              </dd>
            </div>
          );
          return (
            <li key={r.id} className={`rounded-lg border p-3 ${r.recommended ? 'border-pine-600 bg-pine-50/50' : 'border-slate-200'}`} data-testid="rank-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{r.title}</span>
                    {r.recommended && <Badge tone="green">Anbefalt</Badge>}
                    <Badge tone={m.feasibility === 'klar' ? 'green' : m.feasibility === 'ikke_gjennomforbar' ? 'red' : 'amber'}>{FEASIBILITY_LABEL[m.feasibility]}</Badge>
                  </p>
                  <p className="text-[11px] text-slate-500">{inf.source}</p>
                </div>
                <p className="num text-right text-sm font-semibold">{r.composite === null ? 'Rangeres ikke' : `Samlet ${Math.round(r.composite)} · plass ${r.position}`}</p>
              </div>
              <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {metric('Fortjeneste før skatt', <span className={m.profit !== null && m.profit < 0 ? 'text-red-800' : undefined}>{formatNOK(m.profit, NO_BASIS)}</span>)}
                {metric('Prosjektavkastning', formatPct(m.projectReturn, NO_BASIS))}
                {metric('Per egeninnsatstime', m.profitPerOwnHour === null ? (m.ownHours === 0 ? 'Ingen timer' : '–') : `${formatNOK(m.profitPerOwnHour)}/t`, m.meetsHourlyRequirement === null ? undefined : m.meetsHourlyRequirement ? 'Oppfyller timekravet' : 'Under timekravet')}
                {metric('Egne timer', formatHours(m.ownHours))}
                {metric('Prosjekttid', formatMonths(m.months))}
                {metric('Risiko', m.riskBand ? RISK_BAND_LABEL[m.riskBand] : 'Uavklart')}
                {metric('Salgsverdiens sikkerhet', m.saleCertaintyLabel, [inf.marketTier ? `Marked: ${inf.marketTier}` : null, `Agent: ${UNCERTAINTY_LABEL[inf.input.saleCertainty.uncertainty ?? 'uavklart'].toLowerCase()}`].filter(Boolean).join(' · '))}
                {metric('Stresstest (kombinert)', formatNOK(m.stressProfit, NO_BASIS))}
                {metric('Finansieringsgap', m.equityGap === null ? '–' : m.equityGap > 0 ? formatNOK(m.equityGap) : 'Ingen', m.equityNeed === null ? undefined : `Behov ${formatNOK(m.equityNeed)}`)}
                {metric('Modellert maksbud', m.maxBid === null ? '–' : formatNOK(Math.floor(m.maxBid / 1000) * 1000))}
              </dl>
              {r.flags.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-amber-900">
                  {r.flags.map((f) => (
                    <li key={f}>{RANK_FLAG_LABEL[f]}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium">Slik regnes den samlede rangen</summary>
        <p className="mt-1">Hvert kriterium normaliseres mellom scenarioene (små forskjeller teller forholdsmessig mindre), og den samlede scoren er et vektet snitt. Ingen enkeltstående AI-score.</p>
        <table className="mt-2 w-full max-w-md">
          <tbody>
            {CRITERIA.map((c) => (
              <tr key={c.key}>
                <td className="py-0.5">{c.label}</td>
                <td className="py-0.5 text-right">{Math.round(c.weight * 100)} %</td>
                <td className="py-0.5 pl-3 text-slate-500">{c.better === 'high' ? 'høyere er bedre' : 'lavere er bedre'}</td>
                <td className="py-0.5 pl-3 text-right text-slate-500">{result.rows.filter((r) => r.ranked).map((r) => cell(r, c.key)).join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}
