import { useMemo, type ReactNode } from 'react';
import { CRITERIA, RANK_FLAG_LABEL, type RankRow } from '../../calc/ranking';
import { buildScenarioComparison } from '../../calc/scenarioComparison';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { aggregateRisk, RISK_BAND_LABEL } from '../../domain/assessment';
import { resolveAnalysisScenarios } from '../../domain/analysisScenarios';
import { FEASIBILITY_LABEL, SCENARIO_RISK_DIMENSIONS, SCENARIO_RISK_LABEL, UNCERTAINTY_LABEL } from '../../domain/enums';
import { effectiveRisks } from '../../domain/risks';
import { formatHours, formatMonths, formatNOK, formatPct, NO_BASIS } from '../../lib/format';
import { Badge } from '../ui/primitives';
import { describeSaleDebtIssue } from './saleDebtStatus';
import { Panel, type PropertyContext } from './shared';
import { useMarketComparables } from './useMarket';

/**
 * Rangering av scenarioene i en analyse (samme beregning for alle designvarianter). Basis og alternativene sammenlignes under
 * brukerens felles økonomiske ramme (`buildScenarioComparison`). Returnerer scenariodefinisjonene og rangeringen med hvert
 * scenarios fulle evaluering.
 */
export function useScenarioRanking(ctx: PropertyContext) {
  const comps = useMarketComparables(ctx);
  const defs = useMemo(() => resolveAnalysisScenarios(ctx.analysis), [ctx.analysis]);
  const riskBand = useMemo(() => aggregateRisk(effectiveRisks(ctx.analysis.risks, ctx.item.riskEdits).active).band, [ctx.analysis.risks, ctx.item.riskEdits]);

  const data = useMemo(() => {
    const c = buildScenarioComparison({
      analysis: ctx.analysis,
      property: ctx.item.property,
      snapshot: ctx.baseSnapshot ?? ctx.item.snapshot,
      defaults: ctx.profile?.defaults ?? NEW_ACCOUNT_DEFAULTS,
      draft: ctx.draft,
      activeName: ctx.scenario.name,
      riskBand,
      ownComparables: comps.own,
    });
    return { rows: c.rows, result: c.result };
  }, [ctx, comps.own, riskBand]);

  return { defs, data };
}

/** Rangering av scenarioer på flere kriterier. Betingede scenarioer styrer aldri anbefalt scenario eller maksbud. */
export function ScenarioRankingPanel({ ctx }: { ctx: PropertyContext }) {
  const { defs, data } = useScenarioRanking(ctx);

  if (defs.length < 2) return null;
  const { result, rows } = { result: data.result, rows: data.rows };
  const info = (id: string) => rows.find((r) => r.input.id === id)!;
  const recommended = result.rows.find((r) => r.recommended) ?? null;
  const cell = (r: RankRow, key: (typeof CRITERIA)[number]['key']) => (r.scores[key] === undefined ? '' : `${Math.round((r.scores[key] as number) * 100)}`);

  return (
    <Panel
      title="Sammenligning av scenarioer"
      sub="Rangert på fortjeneste, avkastning, fortjeneste per egeninnsatstime, risiko (objekt og scenario), salgsverdiens sikkerhet, stresstest og finansiering – ikke bare nominell fortjeneste. Alle scenarioer regnes med dine forutsetninger. Timekravet påvirker rangering og maksbud, men utelukker ikke et scenario."
    >
      {recommended ? (
        <p className="mb-3 rounded-lg bg-pine-50 p-3 text-sm text-pine-950">
          Anbefalt scenario: <strong>{recommended.title}</strong>. Anbefalt modellert maksbud: <strong className="num">{recommended.metrics.maxBid === null ? NO_BASIS : formatNOK(Math.floor(recommended.metrics.maxBid / 1000) * 1000)}</strong>
          {recommended.metrics.maxBidLimitedByLabel ? ` (begrenset av ${recommended.metrics.maxBidLimitedByLabel.toLowerCase()})` : ''}. Betingede og uavklarte scenarioer er ikke med i anbefalingen.
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
                  {inf.saleIssues.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-amber-900" data-testid="rank-sale-issue">
                      <strong>{describeSaleDebtIssue(inf.saleIssues[0]).title}.</strong> {describeSaleDebtIssue(inf.saleIssues[0]).message}
                    </p>
                  )}
                </div>
                <p className="num text-right text-sm font-semibold">{r.composite === null ? 'Rangeres ikke' : `Samlet ${Math.round(r.composite)} · plass ${r.position}`}</p>
              </div>
              <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {metric('Fortjeneste før skatt', <span className={m.profit !== null && m.profit < 0 ? 'text-red-800' : undefined}>{formatNOK(m.profit, NO_BASIS)}</span>)}
                {metric('Prosjektavkastning', formatPct(m.projectReturn, NO_BASIS))}
                {metric('Per egeninnsatstime', m.profitPerOwnHour === null ? (m.ownHours === 0 ? 'Ingen timer' : '–') : `${formatNOK(m.profitPerOwnHour)}/t`, m.meetsHourlyRequirement === null ? undefined : m.meetsHourlyRequirement ? 'Oppfyller timekravet' : 'Under timekravet')}
                {metric('Egne timer', formatHours(m.ownHours))}
                {metric('Prosjekttid', formatMonths(m.months))}
                {metric(
                  'Risiko (objekt + scenario)',
                  `${m.riskBand ? RISK_BAND_LABEL[m.riskBand] : 'Uavklart'} + scenario ${m.scenarioRiskAssessed ? `${m.scenarioRiskPoints.toLocaleString('nb-NO')}/4` : 'ikke vurdert'}`,
                  SCENARIO_RISK_DIMENSIONS.map((d) => `${SCENARIO_RISK_LABEL[d].split(/[ -]/)[0].toLowerCase()} ${UNCERTAINTY_LABEL[m.scenarioRiskLevels[d]].toLowerCase()}`).join(' · '),
                )}
                {metric('Salgsverdiens sikkerhet', m.saleCertaintyLabel, [inf.marketTier ? `Marked: ${inf.marketTier}` : null, `Agent: ${UNCERTAINTY_LABEL[inf.input.saleCertainty.uncertainty ?? 'uavklart'].toLowerCase()}`].filter(Boolean).join(' · '))}
                {metric('Stresstest (kombinert)', formatNOK(m.stressProfit, NO_BASIS))}
                {metric('Finansieringsgap', m.equityGap === null ? '–' : m.equityGap > 0 ? formatNOK(m.equityGap) : 'Ingen', m.equityNeed === null ? undefined : `Behov ${formatNOK(m.equityNeed)}`)}
                {metric(
                  'Modellert maksbud',
                  m.maxBid === null ? '–' : formatNOK(Math.floor(m.maxBid / 1000) * 1000),
                  m.maxBidLimitedByLabel
                    ? `Begrenset av ${m.maxBidLimitedByLabel.toLowerCase()}${m.maxBidProfit !== null && m.maxBidHourly !== null ? ` · mål ${formatNOK(Math.floor(m.maxBidProfit / 1000) * 1000)} · timekrav ${formatNOK(Math.floor(m.maxBidHourly / 1000) * 1000)}` : ''}`
                    : undefined,
                )}
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
