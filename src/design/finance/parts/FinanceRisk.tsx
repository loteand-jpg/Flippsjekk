import { CircleHelp, ShieldAlert, ShieldCheck, ShieldHalf } from 'lucide-react';
import { useMemo } from 'react';
import { useScenarioRanking } from '../../../components/analysis/ScenarioRankingPanel';
import { RiskTab } from '../../../components/analysis/InfoTabs';
import { activeScenarioId } from '../../../components/analysis/ScenarioPanel';
import type { PropertyContext } from '../../../components/analysis/shared';
import { dataQuality, type RiskBand } from '../../../domain/assessment';
import { effectiveRisks } from '../../../domain/risks';
import { buildRiskDimensions, type RiskDimension } from '../riskView';
import { Pill, SectionHeading, type FinTone } from './primitives';

const BAND_TONE: Record<RiskBand, FinTone> = { lav: 'pos', middels: 'warn', hoy: 'neg', uavklart: 'neutral' };
const BAND_ICON: Record<RiskBand, typeof ShieldCheck> = { lav: ShieldCheck, middels: ShieldHalf, hoy: ShieldAlert, uavklart: CircleHelp };

function DimensionCard({ d }: { d: RiskDimension }) {
  const Icon = BAND_ICON[d.band];
  return (
    <li className="rounded-xl border border-[var(--fin-line)] bg-white p-5" data-testid="fin-risk-dim">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-[18px] text-slate-500" aria-hidden /> {d.label}
        </h3>
        <Pill tone={BAND_TONE[d.band]}>{d.levelText}</Pill>
      </div>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="fin-label">Hva</dt>
          <dd className="mt-1">
            {d.what.length === 0 ? (
              <span className="text-slate-600">Ingen registrerte risikoer i denne dimensjonen.</span>
            ) : (
              <ul className="space-y-1">
                {d.what.slice(0, 4).map((w) => (
                  <li key={w.title} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0 break-words">{w.title}</span>
                    <span className="fin-fig text-xs text-slate-600">
                      {w.level === null ? 'ukjent alvorlighet' : `${w.level}/10`}
                      {w.cost ? ` · ${w.cost}` : ''}
                    </span>
                  </li>
                ))}
                {d.what.length > 4 && <li className="text-xs text-slate-500">+ {d.what.length - 4} til i risikoregisteret under</li>}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="fin-label">Hvorfor</dt>
          <dd className="mt-1">
            {d.why.length === 0 ? (
              <span className="text-slate-600">Ikke vurdert i grunnlaget. Uavklart er ikke det samme som lav risiko.</span>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-slate-700">
                {d.why.map((t) => (
                  <li key={t} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="fin-label">Bør avklares</dt>
          <dd className="mt-1">
            {d.clarify.length === 0 ? (
              <span className="text-slate-600">Ingen konkrete avklaringer registrert.</span>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-slate-700">
                {d.clarify.map((t) => (
                  <li key={t} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** Risiko i Finance: seks dimensjoner med forklaring først, deretter det fulle risikoregisteret og sjekklisten (redigerbart, privat). */
export function FinanceRisk({ ctx }: { ctx: PropertyContext }) {
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

  return (
    <div className="space-y-10">
      <section aria-labelledby="fin-risiko">
        <SectionHeading
          id="fin-risiko"
          title="Risikobilde"
          sub={`Seks dimensjoner for scenarioet «${active.title}». Hver forklarer hva risikoen er, hvorfor den finnes og hva som bør avklares før du byr. Nivåene er ikke en prognose.`}
        />
        <ul className="grid gap-4 lg:grid-cols-2">
          {dims.map((d) => (
            <DimensionCard key={d.id} d={d} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="fin-register">
        <SectionHeading id="fin-register" title="Risikoregister og sjekkliste" sub="Her kan du endre, skjule og legge til egne risikoer, og bekrefte sjekkpunkter. Endringene er private." />
        <RiskTab ctx={ctx} />
      </section>
    </div>
  );
}
