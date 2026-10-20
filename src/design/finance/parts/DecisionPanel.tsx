import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { MAX_BID_LIMIT_LABEL, recommendedBidOf } from '../../../calc/engine';
import type { RankingResult } from '../../../calc/ranking';
import { aggregateRisk, dataQuality, QUALITY_LABEL, RISK_BAND_LABEL } from '../../../domain/assessment';
import { effectiveRisks } from '../../../domain/risks';
import { formatNOK, formatPct } from '../../../lib/format';
import type { PropertyContext } from '../../../components/analysis/shared';
import { Fig, Metric, TONE_TEXT, type FinTone } from './primitives';
import { bidMargin, equityLine, floorToThousand, hourlyLine, maxBidLine, profitTone } from '../present';

/** «Beslutningstoppen»: svar på de åtte spørsmålene en kjøper stiller i løpet av 10–15 sekunder. Alle tall kommer fra motoren. */
export function DecisionPanel({ ctx, ranking, activeScenarioTitle }: { ctx: PropertyContext; ranking: RankingResult | null; activeScenarioTitle: string | null }) {
  const ev = ctx.result.evaluation;
  const b = ev.base;
  const bid = recommendedBidOf(ev);
  const rec = ev.recommendedMaxBid;
  const risk = useMemo(() => aggregateRisk(effectiveRisks(ctx.analysis.risks, ctx.item.riskEdits).active), [ctx.analysis.risks, ctx.item.riskEdits]);
  const quality = useMemo(() => dataQuality(ctx.analysis, ctx.baseSnapshot), [ctx.analysis, ctx.baseSnapshot]);
  const recommended = ranking?.rows.find((r) => r.recommended) ?? null;
  const activeRow = ranking?.rows.find((r) => r.title === activeScenarioTitle) ?? null;
  const floorBid = bid.price === null ? null : floorToThousand(bid.price);
  const margin = floorBid !== null && b ? bidMargin(floorBid, b.P) : null;
  const hourly = b ? hourlyLine(b) : null;
  const equity = b ? equityLine(b) : null;
  const low = ev.cases.low?.V ?? null;
  const high = ev.cases.high?.V ?? null;
  const riskTone: FinTone = risk.band === 'hoy' ? 'neg' : risk.band === 'middels' ? 'warn' : risk.band === 'lav' ? 'pos' : 'neutral';

  return (
    <section aria-labelledby="beslutning" className="overflow-hidden rounded-xl border border-[var(--fin-line)] bg-white shadow-[0_1px_2px_rgba(20,32,43,0.04)]">
      <h2 id="beslutning" className="sr-only">
        Beslutningsgrunnlag
      </h2>
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Maksbud */}
        <div className="min-w-0 border-b border-[var(--fin-line)] p-5 sm:p-7 lg:border-r lg:border-b-0">
          <p className="fin-label">Anbefalt maksbud</p>
          {bid.status === 'none' ? (
            <p className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-[var(--fin-neg)]" data-testid="fin-maxbid">
              Ingen gjennomførbar pris
            </p>
          ) : floorBid !== null ? (
            <p className="mt-2 leading-none font-semibold tracking-tight" style={{ fontSize: 'clamp(2.1rem, 8.5vw, 3.35rem)' }} data-testid="fin-maxbid">
              <Fig>{formatNOK(floorBid)}</Fig>
            </p>
          ) : (
            <p className="mt-2 text-2xl leading-tight font-semibold text-slate-500" data-testid="fin-maxbid">
              Ikke beregnet
            </p>
          )}
          {floorBid !== null && <p className="mt-1.5 text-xs text-slate-600">Avrundet ned til hele tusen. Modellert – ikke en budfullmakt.</p>}

          <div className="fin-callout mt-4 rounded-r-lg px-3.5 py-3 text-sm text-ink" data-testid="fin-maxbid-reason">
            {bid.status === 'none' ? (
              <p>Ingen kjøpspris innen søkeområdet oppfyller {bid.limitedBy === 'hourly' ? 'timekravet ditt' : 'fortjenestemålet ditt'}. Senk målet eller øk salgsverdien i kalkylen.</p>
            ) : floorBid !== null ? (
              <>
                <p>{maxBidLine({ limitedBy: bid.limitedBy, profitTarget: ctx.draft.profitTarget, minPerHour: ctx.draft.minProfitPerOwnHour })}</p>
                {rec && rec.limits.length > 1 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-slate-700">
                    {rec.limits.map((l) => (
                      <li key={l.id} className="flex flex-wrap justify-between gap-x-3">
                        <span>
                          {MAX_BID_LIMIT_LABEL[l.id]} ({l.id === 'profit' ? formatNOK(l.target) : `${formatNOK(l.target)}/t`})
                        </span>
                        <Fig className={l.id === bid.limitedBy ? 'font-semibold' : undefined}>{l.result.price === null ? 'ingen pris' : formatNOK(floorToThousand(l.result.price))}</Fig>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>Maksbud beregnes når kalkylen er komplett. Ukjente inngangsverdier er ikke satt til 0 kr.</p>
            )}
          </div>
          {margin && <p className="mt-3 text-sm text-slate-700">{margin.text}</p>}
        </div>

        {/* Nøkkeltall */}
        <div className="min-w-0 p-5 sm:p-7">
          {b ? (
            <dl className="fin-metrics grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <Metric
                label="Forventet salgsverdi"
                value={formatNOK(b.V)}
                sub={low !== null && high !== null ? `Intervall ${formatNOK(low)} – ${formatNOK(high)} · ${b.basis === 'total' ? 'totalpris' : 'kontantpris'}` : b.basis === 'total' ? 'Totalpris' : 'Kontantpris'}
                testId="fin-sale"
              />
              <Metric label="Prosjektkostnad" value={formatNOK(b.C)} sub={`Oppussing ${formatNOK(b.RB)} inkl. reserve`} testId="fin-cost" />
              <Metric label="Forventet fortjeneste" value={formatNOK(b.profit)} tone={profitTone(b.profit)} sub="Før skatt. Egen tid er ikke en kostnad." testId="fin-profit" />
              <Metric label="Prosjektavkastning" value={formatPct(b.projectReturn)} sub="Fortjeneste ÷ samlet kapitalgrunnlag" unknown={b.projectReturn === null} testId="fin-return" />
              {hourly && <Metric label="Per egeninnsatstime" value={hourly.value} tone={hourly.tone} sub={hourly.sub} unknown={hourly.unknown} testId="fin-hourly" />}
              {equity && <Metric label="Egenkapitalbehov" value={equity.value} tone={equity.tone === 'pos' ? 'neutral' : equity.tone} sub={equity.sub} testId="fin-equity" />}
            </dl>
          ) : (
            <div className="rounded-lg border border-[var(--fin-warn)]/30 bg-[var(--fin-warn-bg)] p-4 text-sm text-[var(--fin-warn)]" role="status">
              <p className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4" aria-hidden /> {ev.status === 'invalid' ? 'Kalkylen har ugyldige verdier' : 'Kalkylen er ufullstendig – ingen fortjeneste vises'}
              </p>
              <ul className="mt-1.5 list-disc pl-5">
                {(ev.status === 'invalid' ? ev.errors.map((e) => e.message) : ctx.result.missing.map((m) => m.label)).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs">Ukjent er ikke det samme som 0 kr. Fyll inn de manglende verdiene under «Kalkyle».</p>
            </div>
          )}
        </div>
      </div>

      {/* Vurdering */}
      <dl className="grid border-t border-[var(--fin-line)] bg-[var(--fin-surface-muted)] sm:grid-cols-2 lg:grid-cols-4 [&>div]:border-b [&>div]:border-[var(--fin-line)] lg:[&>div]:border-b-0 lg:[&>div+div]:border-l [&>div]:border-[var(--fin-line)]">
        <div className="min-w-0 px-5 py-3.5 sm:px-7">
          <dt className="fin-label">Risiko</dt>
          <dd className="mt-1">
            <span className={`text-sm font-semibold ${TONE_TEXT[riskTone]}`}>{risk.score === null ? 'Uavklart' : `${RISK_BAND_LABEL[risk.band]} · ${risk.score}/10`}</span>
            <span className="block text-xs leading-snug text-slate-600">{risk.top ? risk.top.title : 'Ingen registrerte risikoer'}{risk.unknownCount ? ` · ${risk.unknownCount} med ukjent alvorlighet` : ''}</span>
          </dd>
        </div>
        <div className="min-w-0 px-5 py-3.5 sm:px-7">
          <dt className="fin-label">Datagrunnlag</dt>
          <dd className="mt-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck className="size-4 text-slate-500" aria-hidden /> {QUALITY_LABEL[quality.grade]} dekning · {Math.round(quality.coverage * 100)} %
            </span>
            <span className="block text-xs leading-snug text-slate-600">{quality.missingChecks.length === 0 ? 'Alle relevante punkter er dokumentert eller vurdert' : `${quality.missingChecks.length} sjekkpunkt${quality.missingChecks.length === 1 ? '' : 'er'} mangler`}</span>
          </dd>
        </div>
        <div className="min-w-0 px-5 py-3.5 sm:px-7">
          <dt className="fin-label">Salgsverdiens sikkerhet</dt>
          <dd className="mt-1">
            <span className="text-sm font-semibold">{activeRow ? activeRow.metrics.saleCertaintyLabel : 'Ikke vurdert'}</span>
            <span className="block text-xs leading-snug text-slate-600">{activeRow ? 'For scenarioet i bruk' : 'Krever komplett kalkyle'}</span>
          </dd>
        </div>
        <div className="min-w-0 px-5 py-3.5 sm:px-7">
          <dt className="fin-label">Beste scenario</dt>
          <dd className="mt-1">
            {recommended ? (
              <>
                <span className="text-sm font-semibold">{recommended.title}</span>
                <span className="block text-xs leading-snug text-slate-600">
                  {activeScenarioTitle === recommended.title ? 'Dette brukes i kalkylen din' : 'Anbefalt etter flere kriterier – ikke i bruk i kalkylen din'}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold text-slate-700">Ingen kan anbefales ennå</span>
                <span className="block text-xs leading-snug text-slate-600">Krever et gjennomførbart scenario med komplett kalkyle</span>
              </>
            )}
          </dd>
        </div>
      </dl>
      {ctx.result.warnings.length > 0 && b && (
        <ul className="border-t border-[var(--fin-line)] px-5 py-3 text-xs text-[var(--fin-warn)] sm:px-7">
          {ctx.result.warnings.slice(0, 3).map((w) => (
            <li key={w.message} className="flex gap-1.5 py-0.5">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden /> {w.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
