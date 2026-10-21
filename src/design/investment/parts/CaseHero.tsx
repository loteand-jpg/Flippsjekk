import { TriangleAlert } from 'lucide-react';
import type { SaleDebtStatus } from '../../../components/analysis/saleDebtStatus';
import { recommendedBidOf } from '../../../calc/engine';
import type { PropertyContext } from '../../../components/analysis/shared';
import { formatMonths, formatNOK, formatPct } from '../../../lib/format';
import { bidMargin, floorToThousand, maxBidLine, profitTone } from '../../shared/present';
import { LimitChart } from '../charts/LimitChart';
import { OutcomeRange } from '../charts/OutcomeRange';
import { CountUp } from '../CountUp';
import { limitRows } from '../model/charts';
import { KpiDark, Tag } from '../ui';
import { DebtStatus } from './DebtStatus';

/**
 * «Investeringscase»: toppseksjonen som svarer på det en investor spør om først – hvor høyt kan jeg by, hva kan jeg tjene,
 * hva er oppsiden og nedsiden, hvor mye kapital binder det og hvor lenge. Alle tall er motorens; tallene animeres bare når de endres.
 */
export function CaseHero({ ctx, activeTitle, recommendedTitle, debtStatus = [] }: { ctx: PropertyContext; activeTitle: string | null; recommendedTitle: string | null; debtStatus?: SaleDebtStatus[] }) {
  const ev = ctx.result.evaluation;
  const b = ev.base;
  const bid = recommendedBidOf(ev);
  const floorBid = bid.price === null ? null : floorToThousand(bid.price);
  const margin = floorBid !== null && b ? bidMargin(floorBid, b.P) : null;
  const low = ev.cases.low;
  const high = ev.cases.high;
  const rows = limitRows(ev);

  return (
    <section aria-labelledby="case" className="inv-dark overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_50px_-28px_rgba(11,18,32,0.9)]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 px-4 py-3 sm:px-6">
        <h2 id="case" className="text-sm font-semibold tracking-wide text-cyan-200 uppercase">
          Investeringscase
        </h2>
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          {activeTitle && <Tag dark>Scenario i bruk: {activeTitle}</Tag>}
          {recommendedTitle && activeTitle === recommendedTitle ? <Tag dark tone="pos">Anbefalt scenario</Tag> : recommendedTitle ? <Tag dark tone="warn">Anbefalt: {recommendedTitle}</Tag> : <Tag dark tone="neutral">Ingen scenario kan anbefales ennå</Tag>}
        </p>
      </div>

      {/* Fellesgjeld ved salg: vises før maksbud og fortjeneste, så tallene ikke leses som sikre når kontantprisen ikke kan fastsettes */}
      <DebtStatus statuses={debtStatus} dark testId="inv-debt-status" />

      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Maksbud */}
        <div className="min-w-0 border-b border-white/10 p-4 sm:p-6 lg:border-r lg:border-b-0">
          <p className="inv-label">Anbefalt maksbud</p>
          {bid.status === 'none' ? (
            <p className="mt-1.5 text-3xl leading-tight font-bold text-[var(--inv-neg-d)]" data-testid="inv-maxbid">
              Ingen gjennomførbar pris
            </p>
          ) : floorBid !== null ? (
            <p className="mt-1.5 leading-none font-bold tracking-tight" style={{ fontSize: 'clamp(2.25rem, 9vw, 3.6rem)' }}>
              <CountUp value={floorBid} format={formatNOK} className="inv-fig" testId="inv-maxbid" />
            </p>
          ) : (
            <p className="mt-1.5 text-2xl font-semibold text-slate-300" data-testid="inv-maxbid">
              Ikke beregnet
            </p>
          )}
          {floorBid !== null && <p className="inv-muted-d mt-1.5 text-xs">Avrundet ned til hele tusen. Modellert – ikke en budfullmakt.</p>}
          <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm" data-testid="inv-maxbid-reason">
            {bid.status === 'none'
              ? `Ingen kjøpspris innen søkeområdet oppfyller ${bid.limitedBy === 'hourly' ? 'timekravet ditt' : 'fortjenestemålet ditt'}. Senk målet eller øk salgsverdien i kalkylen.`
              : floorBid !== null
                ? maxBidLine({ limitedBy: bid.limitedBy, profitTarget: ctx.draft.profitTarget, minPerHour: ctx.draft.minProfitPerOwnHour })
                : 'Maksbud beregnes når kalkylen er komplett. Ukjente inngangsverdier er ikke satt til 0 kr.'}
          </p>
          {margin && (
            <p className="mt-2 text-sm">
              <Tag dark tone={margin.kind === 'over' ? 'warn' : 'pos'}>{margin.kind === 'over' ? 'Over maksbud' : margin.kind === 'under' ? 'Under maksbud' : 'På maksbud'}</Tag> <span className="inv-muted-d">{margin.text}</span>
            </p>
          )}
          {floorBid !== null && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Hva begrenser budet?</p>
              <LimitChart rows={rows} purchase={b?.P ?? null} floorK={floorToThousand} dark />
              {ev.recommendedMaxBid?.notApplicable.map((n) => (
                <p key={n.id} className="inv-muted-d mt-2 text-xs">
                  {n.reason}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Nøkkeltall og utfallsspenn */}
        <div className="min-w-0 p-4 sm:p-6">
          {b ? (
            <>
              <dl className="grid grid-cols-1 gap-x-5 gap-y-4 min-[400px]:grid-cols-2 sm:grid-cols-3">
                <KpiDark
                  label="Forventet fortjeneste"
                  tone={profitTone(b.profit)}
                  value={<CountUp value={b.profit} format={formatNOK} testId="inv-profit" />}
                  sub="Før skatt. Egen tid er ikke en kostnad."
                />
                <KpiDark label="Prosjektavkastning" value={b.projectReturn === null ? 'Ikke beregnet' : <CountUp value={b.projectReturn} format={formatPct} testId="inv-return" />} unknown={b.projectReturn === null} sub="Fortjeneste ÷ samlet kapitalgrunnlag" />
                <KpiDark
                  label="Per egeninnsatstime"
                  tone={b.meetsHourlyRequirement === false ? 'warn' : 'neutral'}
                  value={b.profitPerOwnHour === null ? <span data-testid="inv-hourly">Ikke beregnet</span> : <CountUp value={b.profitPerOwnHour} format={(n) => `${formatNOK(n)}/t`} testId="inv-hourly" />}
                  unknown={b.profitPerOwnHour === null}
                  sub={
                    b.profitPerOwnHour === null
                      ? b.ownHours === 0
                        ? 'Ingen egne timer i kalkylen'
                        : 'Egne timer er ikke avklart'
                      : b.minProfitPerOwnHour === null || b.meetsHourlyRequirement === null
                        ? 'Krav til timesats er ikke satt'
                        : b.meetsHourlyRequirement
                          ? `Krav ${formatNOK(b.minProfitPerOwnHour)}/t – oppfylt`
                          : `Krav ${formatNOK(b.minProfitPerOwnHour)}/t – ikke oppfylt`
                  }
                />
                <KpiDark
                  label="Kapitalbehov"
                  tone={b.equityGap !== null && b.equityGap > 0 ? 'neg' : 'neutral'}
                  value={<CountUp value={b.equityNeed} format={formatNOK} testId="inv-equity" />}
                  sub={b.equityGap === null || b.availableEquity === null ? 'Egenkapital: tilgjengelig beløp er ikke oppgitt' : b.equityGap > 0 ? `Egenkapital: gap ${formatNOK(b.equityGap)} mot ${formatNOK(b.availableEquity)} tilgjengelig` : `Egenkapital: dekket av ${formatNOK(b.availableEquity)} tilgjengelig`}
                />
                <KpiDark label="Prosjektvarighet" value={formatMonths(b.months)} sub="Oppussing og tid til oppgjør" />
                <KpiDark
                  label="Forventet salgsverdi"
                  value={<CountUp value={b.V} format={formatNOK} testId="inv-sale" />}
                  sub={low && high ? `Intervall ${formatNOK(low.V)} – ${formatNOK(high.V)} · ${b.basis === 'total' ? 'totalpris' : 'kontantpris'}` : b.basis === 'total' ? 'Totalpris' : 'Kontantpris'}
                />
              </dl>
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="mb-2 text-sm font-semibold">Oppside og nedside</p>
                <OutcomeRange sale={{ low: low?.V ?? null, base: b.V, high: high?.V ?? null }} profit={{ low: low?.profit ?? null, base: b.profit, high: high?.profit ?? null }} dark />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-4 text-sm text-[var(--inv-warn-d)]" role="status">
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
      {ctx.result.warnings.length > 0 && b && (
        <ul className="border-t border-white/10 bg-black/20 px-4 py-3 text-xs text-[var(--inv-warn-d)] sm:px-6">
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
