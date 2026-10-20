import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { recommendedBidOf } from '../../../calc/engine';
import type { PropertyContext } from '../../../components/analysis/shared';
import { formatNOK, formatPct } from '../../../lib/format';
import { floorToThousand } from '../../shared/present';
import { ChartFrame } from '../charts/ChartFrame';
import { SensitivityChart } from '../charts/SensitivityChart';
import { atPurchasePrice, priceSteps, sensitivitySeries, type PricePoint } from '../model/charts';
import { signedNOK } from '../model/format';
import { Fig, Panel, Tag, TONE_TEXT } from '../ui';

const noKr = (n: number) => formatNOK(n).replace(/\s?kr$/, '');
const hourly = (p: PricePoint) => (p.profitPerOwnHour === null ? '–' : noKr(p.profitPerOwnHour));

function Readout({ label, now, preview }: { label: string; now: string; preview: string }) {
  return (
    <div className="min-w-0">
      <dt className="inv-label">{label}</dt>
      <dd className="mt-0.5">
        <Fig className="block text-lg leading-tight font-bold">{preview}</Fig>
        <span className="block text-[11px] text-slate-600">nå {now}</span>
      </dd>
    </div>
  );
}

/**
 * Sensitivitet mot kjøpspris. Glideren er en forhåndsvisning: hvert punkt regnes av den eksisterende kalkylemotoren
 * (`computeCore` med en annen kjøpspris, alle andre forutsetninger uendret). Ingenting lagres før du velger «Bruk i kalkylen»,
 * som legger prisen inn i det private scenarioet (ulagret til du lagrer) – samme mønster som å endre feltet i kalkylen.
 */
export function Sensitivity({ ctx }: { ctx: PropertyContext }) {
  const ev = ctx.result.evaluation;
  const b = ev.base;
  const bid = recommendedBidOf(ev);
  const [override, setOverride] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);
  const P = b?.P ?? null;
  const min = P === null ? 0 : Math.round((P * 0.7) / 10_000) * 10_000;
  const max = P === null ? 0 : Math.round((P * 1.3) / 10_000) * 10_000;
  const series = useMemo(() => (P === null ? [] : sensitivitySeries(ev, min, max, 40)), [ev, P, min, max]);
  const rows = useMemo(() => (P === null ? [] : priceSteps(P).map((p) => atPurchasePrice(ev, p)).filter((x): x is PricePoint => x !== null)), [ev, P]);
  if (!b || P === null) {
    return (
      <Panel id="sensitivitet" title="Sensitivitet mot kjøpspris" sub="Krever en komplett kalkyle.">
        <p className="text-sm text-slate-700">Fyll inn de manglende verdiene under «Kalkyle» for å se hvordan fortjeneste, avkastning, kr per time og kapitalbehov endrer seg med kjøpsprisen.</p>
      </Panel>
    );
  }
  const preview = override ?? P;
  const cur = atPurchasePrice(ev, P) as PricePoint;
  const pv = (atPurchasePrice(ev, preview) ?? cur) as PricePoint;
  const floorBid = bid.price === null ? null : floorToThousand(bid.price);
  const meets = floorBid === null ? null : preview <= floorBid;
  const apply = () => {
    ctx.setDraft((d) => ({ ...d, purchasePrice: preview }));
    setApplied(true);
    setOverride(null);
  };
  const diff = pv.profit - cur.profit;
  return (
    <Panel id="sensitivitet" title="Sensitivitet mot kjøpspris" sub="Dra i prisen og se hva som skjer. Forhåndsvisningen regnes av samme kalkylemotor og endrer ingenting før du bruker den.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <label htmlFor="inv-price-slider" className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold">
            <span>Kjøpspris i forhåndsvisningen</span>
            <span className="inv-fig text-lg font-bold" data-testid="inv-preview-price">{formatNOK(preview)}</span>
          </label>
          <input
            id="inv-price-slider"
            type="range"
            min={min}
            max={max}
            step={10_000}
            value={Math.min(max, Math.max(min, preview))}
            onChange={(e) => {
              setOverride(Number(e.target.value));
              setApplied(false);
            }}
            aria-valuetext={`${formatNOK(preview)}, fortjeneste ${formatNOK(pv.profit)}`}
            className="mt-2 h-8 w-full accent-pine-700"
            data-testid="inv-price-slider"
          />
          <div className="flex justify-between text-[11px] text-slate-600">
            <span className="inv-fig">{formatNOK(min)}</span>
            <span className="inv-fig">{formatNOK(max)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
            {meets !== null && <Tag tone={meets ? 'pos' : 'warn'}>{meets ? 'På eller under anbefalt maksbud' : 'Over anbefalt maksbud'}</Tag>}
            {preview !== P && <span className="text-xs text-slate-700">Endring i fortjeneste mot kalkylen: <Fig className={clsx('font-semibold', TONE_TEXT[diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'neutral'])}>{signedNOK(diff)}</Fig></span>}
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-3 min-[400px]:grid-cols-2 sm:grid-cols-4" data-testid="inv-preview-readout">
            <Readout label="Fortjeneste" preview={formatNOK(pv.profit)} now={formatNOK(cur.profit)} />
            <Readout label="Avkastning" preview={formatPct(pv.projectReturn)} now={formatPct(cur.projectReturn)} />
            <Readout label="Kr per time" preview={pv.profitPerOwnHour === null ? 'Ikke beregnet' : `${noKr(pv.profitPerOwnHour)}/t`} now={cur.profitPerOwnHour === null ? 'ikke beregnet' : `${noKr(cur.profitPerOwnHour)}/t`} />
            <Readout label="EK-behov" preview={formatNOK(pv.equityNeed)} now={formatNOK(cur.equityNeed)} />
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!ctx.editable || preview === P}
              onClick={apply}
              className="inline-flex min-h-11 items-center rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-900 disabled:opacity-50 md:min-h-10"
            >
              Bruk {noKr(preview)} som kjøpspris i kalkylen
            </button>
            {preview !== P && (
              <button type="button" onClick={() => setOverride(null)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-pine-700 hover:underline md:min-h-10">
                Tilbake til {noKr(P)}
              </button>
            )}
            {applied && (
              <span className="text-xs text-pine-800" role="status">
                Kjøpsprisen er lagt inn i kalkylen (ulagret til du lagrer).
              </span>
            )}
          </div>
        </div>
        <ChartFrame title="Fortjeneste mot kjøpspris" className="min-w-0">
          <SensitivityChart series={series} current={P} maxBid={floorBid} preview={pv} />
        </ChartFrame>
      </div>

      <ChartFrame
        className="mt-5"
        title="Utvalgte kjøpspriser"
        caption="Samme motor, alle andre forutsetninger uendret. Raden for din kjøpspris er lik tallene i kalkylen."
        tableLabel="Vis som tekstliste"
      >
        <div className="overflow-hidden rounded-lg border border-[var(--inv-line)]">
          <table className="w-full table-fixed text-[11.5px] sm:text-[13px]" data-testid="inv-sens-table">
            <caption className="sr-only">Fortjeneste, avkastning, kr per time og egenkapitalbehov ved ulike kjøpspriser. Beløp i kroner.</caption>
            <thead className="bg-slate-50 text-left">
              <tr className="border-b border-[var(--inv-line)] text-[10px] font-semibold tracking-wide text-slate-600 uppercase sm:text-[11px]">
                <th scope="col" className="w-[24%] px-2 py-2">Kjøpspris</th>
                <th scope="col" className="px-2 py-2 text-right">Fortjeneste</th>
                <th scope="col" className="w-[15%] px-2 py-2 text-right">Avk.</th>
                <th scope="col" className="w-[14%] px-2 py-2 text-right">Kr/t</th>
                <th scope="col" className="px-2 py-2 text-right">EK-behov</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--inv-line)]">
              {rows.map((r) => {
                const isCur = Math.abs(r.price - P) < 1;
                const over = floorBid !== null && r.price > floorBid;
                return (
                  <tr key={r.price} className={clsx(isCur && 'bg-pine-50 font-semibold')} aria-current={isCur ? 'true' : undefined}>
                    <th scope="row" className="px-2 py-1.5 text-left font-medium">
                      <Fig>{noKr(r.price)}</Fig>
                      {isCur && <span className="ml-1 text-[10px] font-bold text-pine-700 uppercase">nå</span>}
                      {over && <span className="block text-[10px] font-normal text-[var(--inv-warn)]">over maksbud</span>}
                    </th>
                    <td className={clsx('px-2 py-1.5 text-right', TONE_TEXT[r.profit < 0 ? 'neg' : 'neutral'])}><Fig>{noKr(r.profit)}</Fig></td>
                    <td className="px-2 py-1.5 text-right"><Fig>{r.projectReturn === null ? '–' : formatPct(r.projectReturn)}</Fig></td>
                    <td className={clsx('px-2 py-1.5 text-right', r.meetsHourly === false && 'text-[var(--inv-warn)]')}><Fig>{hourly(r)}</Fig></td>
                    <td className="px-2 py-1.5 text-right"><Fig>{noKr(r.equityNeed)}</Fig>{r.equityGap !== null && r.equityGap > 0 && <span className="block text-[10px] font-normal text-[var(--inv-neg)]">gap</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartFrame>
    </Panel>
  );
}
