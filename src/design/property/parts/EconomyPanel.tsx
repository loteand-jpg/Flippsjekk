import clsx from 'clsx';
import { ArrowRightLeft, ChevronUp } from 'lucide-react';
import { useId, useState } from 'react';
import type { SaleDebtStatus } from '../../../components/analysis/saleDebtStatus';
import { formatNOK, formatPct } from '../../../lib/format';
import { CountUp } from '../../shared/CountUp';
import { equityLine, hourlyLine, profitTone, type Tone } from '../../shared/present';
import type { VersionView } from '../model/versions';
import { Tag, TONE_TEXT } from '../ui';

function Line({ label, children, sub, strong, tone }: { label: string; children: React.ReactNode; sub?: string; strong?: boolean; tone?: Tone }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-3 py-2', strong && 'rounded-lg bg-[var(--prop-sand-2)] px-2.5')}>
      <dt className="min-w-0 text-sm text-slate-700">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className={clsx('prop-fig block text-[0.9375rem] font-semibold', strong && 'text-[1.125rem]', tone && TONE_TEXT[tone])}>{children}</span>
        {sub && <span className="block text-[11px] leading-snug text-slate-600">{sub}</span>}
      </dd>
    </div>
  );
}

const money = (n: number) => formatNOK(n);

/**
 * Prosjektøkonomi: kjøpspris, oppussing, samlet kostnad, salgsverdi, fortjeneste, avkastning, kr per time, maksbud og egenkapitalbehov
 * for versjonen som vises. Alle tall er motorens. Standardvisningen er versjonen i din kalkyle, så tallene er de samme som i Original,
 * Finance og Investment.
 */
export function EconomyLines({ view, debtStatus }: { view: VersionView; debtStatus: SaleDebtStatus[] }) {
  const b = view.b;
  if (!b) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--prop-line-strong)] p-3 text-sm text-slate-800" role="status" data-testid="prop-econ-incomplete">
        Kalkylen for {view.short} er ufullstendig, så økonomien kan ikke vises. Ukjent er ikke 0 kr.
      </p>
    );
  }
  const hourly = hourlyLine(b);
  const equity = equityLine(b);
  return (
    <>
      <dl className="divide-y divide-[var(--prop-line)]" data-testid="prop-econ">
        <Line label="Kjøpspris">
          <CountUp value={b.P} format={money} testId="prop-purchase" flashClass="prop-flash" />
        </Line>
        <Line label="Oppussing inkl. reserve">
          <CountUp value={b.RB} format={money} testId="prop-renovation" flashClass="prop-flash" />
        </Line>
        <Line label="Samlet kostnad" sub="Kjøp, kostnader, oppussing, renter og salg">
          <CountUp value={b.C} format={money} testId="prop-cost" flashClass="prop-flash" />
        </Line>
        <Line label="Salgsverdi" sub={b.basis === 'total' ? 'Totalpris · modellert' : 'Kontantpris · modellert'}>
          <CountUp value={b.V} format={money} testId="prop-sale" flashClass="prop-flash" />
        </Line>
        <Line label="Fortjeneste" sub="Før skatt" strong tone={profitTone(b.profit)}>
          <CountUp value={b.profit} format={money} testId="prop-profit" flashClass="prop-flash" />
        </Line>
        <Line label="Prosjektavkastning" sub="Fortjeneste ÷ kapital">
          {b.projectReturn === null ? <span data-testid="prop-return" className="text-xs font-medium text-slate-600">Ikke beregnet</span> : <CountUp value={b.projectReturn} format={formatPct} testId="prop-return" flashClass="prop-flash" />}
        </Line>
        <Line label="Per egeninnsatstime" sub={hourly.sub} tone={hourly.tone === 'pos' ? 'pos' : hourly.tone === 'warn' ? 'warn' : 'neutral'}>
          {b.profitPerOwnHour === null ? <span data-testid="prop-hourly" className="text-xs font-medium text-slate-600">{hourly.value}</span> : <CountUp value={b.profitPerOwnHour} format={(n) => `${formatNOK(n)}/t`} testId="prop-hourly" flashClass="prop-flash" />}
        </Line>
        <Line label="Anbefalt maksbud" sub={view.bidStatus === 'none' ? 'Ingen kjøpspris oppfyller målene dine' : 'Avrundet ned til hele tusen'} strong>
          {view.bidStatus === 'none' ? (
            <span data-testid="prop-maxbid" className="text-sm text-[var(--prop-neg)]">Ingen gjennomførbar pris</span>
          ) : view.bidFloor === null ? (
            <span data-testid="prop-maxbid" className="text-xs font-medium text-slate-600">Ikke beregnet</span>
          ) : (
            <CountUp value={view.bidFloor} format={money} testId="prop-maxbid" flashClass="prop-flash" />
          )}
        </Line>
        <Line label="Egenkapitalbehov" sub={equity.sub} tone={equity.tone === 'neg' ? 'neg' : 'neutral'}>
          <CountUp value={b.equityNeed} format={money} testId="prop-equity" flashClass="prop-flash" />
        </Line>
      </dl>
      {debtStatus.length > 0 && (
        <p className="mt-2 rounded-lg bg-[var(--prop-warn-bg)] px-2.5 py-2 text-xs text-[var(--prop-warn)]" data-testid="prop-econ-debt-note">
          <strong>{debtStatus[0].title}.</strong> Tallene er ikke sikre før dette er rettet.
        </p>
      )}
    </>
  );
}

function Heading({ view }: { view: VersionView }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="prop-label">Prosjektøkonomi</h2>
      <span className="flex flex-wrap items-center gap-1.5">
        <Tag tone="neutral">{view.short}</Tag>
        {view.active ? <Tag tone="info">I din kalkyle</Tag> : <Tag tone="warn">Forhåndsvisning</Tag>}
      </span>
    </div>
  );
}

/** Fast sidestolpe (desktop): henger med under rulling uten å dekke innhold. */
export function EconomyAside({ view, debtStatus, onUse, canApply }: { view: VersionView; debtStatus: SaleDebtStatus[]; onUse: () => void; canApply: boolean }) {
  return (
    <aside aria-label="Prosjektøkonomi" className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 shadow-[0_14px_34px_-26px_rgba(43,38,34,0.6)]" data-testid="prop-econ-aside">
      <Heading view={view} />
      <p className="prop-serif mt-1 text-lg leading-snug">{view.def.title}</p>
      <div className="mt-2">
        <EconomyLines view={view} debtStatus={debtStatus} />
      </div>
      {!view.active && (
        <button type="button" disabled={!canApply} onClick={onUse} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--prop-blue)] bg-white px-3 text-sm font-medium text-[var(--prop-blue)] hover:bg-[var(--prop-blue-bg)] disabled:opacity-50">
          <ArrowRightLeft className="size-4" aria-hidden /> Bruk i kalkylen
        </button>
      )}
    </aside>
  );
}

/**
 * Kompakt stripe nederst på mobil med maksbud og fortjeneste; kan folde ut til hele prosjektøkonomien. Ligger over bunnmenyen, og siden har
 * ekstra bunnmarg så stripen aldri dekker innhold.
 */
export function EconomyBar({ view, debtStatus, onUse, canApply }: { view: VersionView; debtStatus: SaleDebtStatus[]; onUse: () => void; canApply: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const b = view.b;
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-[var(--prop-line-strong)] bg-[var(--prop-paper)] shadow-[0_-10px_24px_-16px_rgba(43,38,34,0.55)] lg:hidden" data-testid="prop-econ-bar">
      {open && (
        <div id={id} className="max-h-[58dvh] overflow-y-auto border-b border-[var(--prop-line)] p-4">
          <Heading view={view} />
          <p className="prop-serif mt-1 text-lg leading-snug">{view.def.title}</p>
          <div className="mt-2">
            <EconomyLines view={view} debtStatus={debtStatus} />
          </div>
          {!view.active && (
            <button type="button" disabled={!canApply} onClick={onUse} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--prop-blue)] bg-white px-3 text-sm font-medium text-[var(--prop-blue)] disabled:opacity-50">
              <ArrowRightLeft className="size-4" aria-hidden /> Bruk i kalkylen
            </button>
          )}
        </div>
      )}
      <button type="button" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left" data-testid="prop-econ-toggle">
        <span className="min-w-0 flex-1">
          <span className="prop-label block">Maksbud · {view.short}</span>
          <span className="prop-fig block truncate text-[1.0625rem] font-semibold" data-testid="prop-bar-maxbid">
            {view.bidStatus === 'none' ? 'Ingen pris' : view.bidFloor === null ? 'Ikke beregnet' : formatNOK(view.bidFloor)}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="prop-label block">Fortjeneste</span>
          <span className={clsx('prop-fig block truncate text-[1.0625rem] font-semibold', b && TONE_TEXT[profitTone(b.profit)])} data-testid="prop-bar-profit">
            {b ? formatNOK(b.profit) : 'Ikke beregnet'}
          </span>
        </span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--prop-sand)]">
          <ChevronUp className={clsx('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          <span className="sr-only">{open ? 'Skjul prosjektøkonomi' : 'Vis hele prosjektøkonomien'}</span>
        </span>
      </button>
    </div>
  );
}
