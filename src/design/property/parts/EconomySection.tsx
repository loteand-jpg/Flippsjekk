import { Target } from 'lucide-react';
import { MAX_BID_LIMIT_LABEL } from '../../../calc/engine';
import { formatNOK, formatPct } from '../../../lib/format';
import { hourlyLine, bidMargin, maxBidLine, profitTone, floorToThousand } from '../../shared/present';
import { limitRows } from '../../shared/caseModel';
import { atMaxBid, costParts } from '../model/economy';
import type { VersionView } from '../model/versions';
import type { PropertyContext } from '../../../components/analysis/shared';
import { Fig, Section, Tag, TONE_TEXT } from '../ui';

const COST_COLORS: Record<string, string> = { purchase: '#2b2622', buyCosts: '#7a6f5a', renovation: '#547c4c', carry: '#2a5a85', saleCosts: '#b8862f' };

/** Kostnadsfordeling: stolpe med 2 px mellomrom, og hver post også som tekst med beløp og andel (identitet er aldri bare farge). */
function CostBreakdown({ view }: { view: VersionView }) {
  const b = view.b;
  if (!b) return null;
  const parts = costParts(b);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  return (
    <div data-testid="prop-cost-breakdown">
      <div className="flex h-4 gap-[2px] overflow-hidden rounded" role="img" aria-label={`Kostnader: ${parts.map((p) => `${p.label} ${formatNOK(p.amount)}`).join(', ')}`}>
        {parts.map((p) => (
          <span key={p.id} className="prop-bar block min-w-[2px]" style={{ width: `${total > 0 ? (p.amount / total) * 100 : 0}%`, background: COST_COLORS[p.id] }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: COST_COLORS[p.id] }} />
              <span className="min-w-0 break-words">{p.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <Fig className="font-medium">{formatNOK(p.amount)}</Fig>
              <span className="prop-fig ml-1.5 text-xs text-slate-600">{total > 0 ? `${Math.round((p.amount / total) * 100)} %` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[var(--prop-line)] pt-3 text-sm">
        <span>
          Samlet kostnad <Fig className="font-semibold">{formatNOK(b.C)}</Fig> mot salgsverdi <Fig className="font-semibold">{formatNOK(b.V)}</Fig>
        </span>
        <span className={TONE_TEXT[profitTone(b.profit)]}>
          Fortjeneste før skatt <Fig className="font-semibold">{formatNOK(b.profit)}</Fig>
        </span>
      </p>
    </div>
  );
}

/** «Hvor høyt kan du gå?»: maksbud, hva som setter taket, og hva du sitter igjen med ved akkurat det budet (motorens `computeCore`). */
function HowHigh({ view, ctx }: { view: VersionView; ctx: PropertyContext }) {
  const b = view.b;
  const at = atMaxBid(view.ev);
  const rows = limitRows(view.ev).filter((r) => r.counts);
  const floorBid = view.bidFloor;
  const margin = floorBid !== null && b ? bidMargin(floorBid, b.P) : null;
  const prices = [...rows.map((r) => r.price).filter((x): x is number => x !== null), b?.P ?? null].filter((x): x is number => x !== null);
  const lo = prices.length ? Math.min(...prices) * 0.92 : 0;
  const hi = prices.length ? Math.max(...prices) * 1.04 : 1;
  const pct = (n: number) => `${Math.max(0, Math.min(100, ((n - lo) / (hi - lo || 1)) * 100))}%`;
  const hourly = at && b ? hourlyLine({ profitPerOwnHour: at.profitPerOwnHour, minProfitPerOwnHour: b.minProfitPerOwnHour, meetsHourlyRequirement: at.meetsHourly, ownHours: b.ownHours }) : null;
  return (
    <div className="prop-dark rounded-2xl p-5 sm:p-6" data-testid="prop-howhigh">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-[var(--prop-on-dark-muted)]" aria-hidden />
        <h3 className="prop-label">Hvor høyt kan du gå?</h3>
      </div>
      {view.bidStatus === 'none' ? (
        <p className="mt-2 text-2xl font-semibold text-[var(--prop-neg-d)]">Ingen gjennomførbar pris</p>
      ) : floorBid === null ? (
        <p className="mt-2 text-xl font-semibold text-[var(--prop-on-dark-muted)]">Maksbud ikke beregnet</p>
      ) : (
        <p className="prop-serif prop-fig mt-1 text-[2.25rem] leading-none sm:text-[2.75rem]" data-testid="prop-howhigh-bid">
          {formatNOK(floorBid)}
        </p>
      )}
      <p className="prop-muted-d mt-2 text-sm">
        {view.bidStatus === 'none'
          ? `Ingen kjøpspris oppfyller ${view.bidLimitedBy === 'hourly' ? 'timekravet ditt' : 'fortjenestemålet ditt'}. Senk målet eller øk salgsverdien i kalkylen.`
          : floorBid !== null
            ? maxBidLine({ limitedBy: view.bidLimitedBy, profitTarget: ctx.draft.profitTarget, minPerHour: ctx.draft.minProfitPerOwnHour })
            : 'Ukjente inngangsverdier er ikke satt til 0 kr.'}
      </p>
      {margin && (
        <p className="mt-2 text-sm">
          <Tag dark tone={margin.kind === 'over' ? 'warn' : 'pos'}>{margin.kind === 'over' ? 'Over maksbud' : margin.kind === 'under' ? 'Under maksbud' : 'På maksbud'}</Tag> <span className="prop-muted-d">{margin.text}</span>
        </p>
      )}

      {at && (
        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-white/10 pt-5" data-testid="prop-at-bid">
          <div className="col-span-2 -mb-2"><p className="prop-label">Ved et bud på {formatNOK(at.price)}</p></div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--prop-on-dark-muted)]">Fortjeneste</dt>
            <dd className="prop-fig mt-0.5 text-lg font-semibold" data-testid="prop-at-bid-profit">{formatNOK(at.profit)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--prop-on-dark-muted)]">Per egeninnsatstime</dt>
            <dd className="prop-fig mt-0.5 text-lg font-semibold" data-testid="prop-at-bid-hourly">{hourly?.unknown ? <span className="text-sm font-medium text-[var(--prop-on-dark-muted)]">{hourly.value}</span> : hourly?.value}</dd>
            {hourly && !hourly.unknown && <dd className="text-[11px] text-[var(--prop-on-dark-muted)]">{hourly.sub}</dd>}
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--prop-on-dark-muted)]">Prosjektavkastning</dt>
            <dd className="prop-fig mt-0.5 text-lg font-semibold">{at.projectReturn === null ? 'Ikke beregnet' : formatPct(at.projectReturn)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--prop-on-dark-muted)]">Begrensende faktor</dt>
            <dd className="mt-0.5 text-sm font-semibold">{at.limitedBy ? MAX_BID_LIMIT_LABEL[at.limitedBy] : 'Ikke avklart'}</dd>
          </div>
        </dl>
      )}

      {rows.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-5" data-testid="prop-limits">
          <p className="prop-label">Grensene som setter taket – laveste vinner</p>
          <ul className="mt-3 space-y-3.5">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="min-w-0">
                    {r.label}
                    {r.limiting && <Tag dark tone="info" className="ml-2">Setter taket</Tag>}
                  </span>
                  <Fig className="font-semibold">{r.price === null ? 'Ingen pris oppfyller kravet' : formatNOK(floorToThousand(r.price))}</Fig>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-white/15" aria-hidden>
                  {r.price !== null && <span className="prop-bar absolute inset-y-0 left-0 rounded-full" style={{ width: pct(r.price), background: r.limiting ? '#a9c8e6' : '#9d927c' }} />}
                  {b && <span className="absolute -top-1 bottom-[-4px] w-0.5 rounded bg-[var(--prop-on-dark)]" style={{ left: pct(b.P) }} />}
                </div>
              </li>
            ))}
          </ul>
          {b && (
            <p className="prop-muted-d mt-2.5 text-xs">
              <span aria-hidden className="mr-1 inline-block h-3 w-0.5 translate-y-0.5 rounded bg-[var(--prop-on-dark)]" /> Din kjøpspris i kalkylen: <Fig>{formatNOK(b.P)}</Fig>
            </p>
          )}
        </div>
      )}
      <p className="prop-muted-d mt-4 text-xs">Modellert maksbud – ikke en budfullmakt og ikke en garanti for resultatet.</p>
    </div>
  );
}

/** «Er det verdt det?»: hvor pengene går, og hvor høyt du kan gå. Sidestolpen (eller stripen på mobil) har de samme tallene til enhver tid. */
export function EconomySection({ view, ctx }: { view: VersionView; ctx: PropertyContext }) {
  return (
    <Section id="okonomi" eyebrow="4 · Er det verdt det?" title="Økonomien i prosjektet" intro={`Regnet for ${view.short === 'Basis' ? 'Basis' : view.short} med dine forutsetninger. Egen tid er ikke en kostnad, og fortjenesten er før skatt.`}>
      {view.b ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 sm:p-6">
            <h3 className="prop-label mb-3">Hvor pengene går</h3>
            <CostBreakdown view={view} />
          </div>
          <HowHigh view={view} ctx={ctx} />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--prop-line-strong)] p-5 text-sm text-slate-800" role="status">
          Kalkylen for {view.short} er ufullstendig, så kostnader og maksbud kan ikke vises. Ukjent er ikke 0 kr. Fyll inn de manglende verdiene under «Kalkyle».
        </p>
      )}
    </Section>
  );
}
