import clsx from 'clsx';
import type { LimitRow } from '../model/charts';
import { compactMill, formatNOK } from '../model/format';
import { ChartFrame } from './ChartFrame';

/**
 * «Hva begrenser budet?» Hver maksbudgrense fra motoren som et punkt på samme prisakse. Anbefalt maksbud er den laveste av
 * grensene som teller (fortjenestemål og timekrav). Avkastningsrader (15 % / 20 %) er til informasjon og inngår ikke.
 * Aksen er forkortet (starter ikke på 0) for å vise forskjellene – derfor står alle beløp også som tall.
 */
export function LimitChart({ rows, purchase, floorK, dark }: { rows: LimitRow[]; purchase: number | null; floorK: (n: number) => number; dark?: boolean }) {
  const prices = [...rows.map((r) => r.price).filter((p): p is number => p !== null), ...(purchase !== null ? [purchase] : [])];
  if (prices.length === 0) return <p className={clsx('text-sm', dark ? 'text-slate-200' : 'text-slate-700')}>Ingen maksbudgrenser kan beregnes ennå.</p>;
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  if (hi - lo < 1) {
    lo *= 0.9;
    hi *= 1.1;
  }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const pos = (p: number) => `${((p - lo) / (hi - lo)) * 100}%`;
  const ink = dark ? '#f1f5f9' : '#0c1424';
  const accent = dark ? '#22d3ee' : '#0e7490';
  const muted = dark ? 'rgb(180 193 211)' : '#66768b';
  return (
    <ChartFrame
      dark={dark}
      className="min-w-0"
      table={{
        caption: 'Maksbudgrenser',
        head: ['Krav', 'Maks kjøpspris', 'Status'],
        rows: rows.map((r) => [r.label, r.price === null ? 'Ingen pris' : formatNOK(floorK(r.price)), r.limiting ? 'Begrenser budet' : r.counts ? 'Teller med' : 'Til informasjon']),
      }}
    >
      <div className="relative">
        <ul className="space-y-3.5">
          {rows
            .filter((r) => !r.id.startsWith('na-'))
            .map((r) => (
              <li key={r.id} className="grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-1 sm:grid-cols-[minmax(10rem,13rem)_1fr_auto] sm:items-center">
                <p className={clsx('min-w-0 text-[13px] leading-tight', r.limiting ? 'font-semibold' : r.counts ? 'font-medium' : dark ? 'text-slate-300' : 'text-slate-600')}>
                  {r.label}
                  {r.limiting && <span className={clsx('ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase', dark ? 'bg-cyan-300 text-slate-950' : 'bg-pine-700 text-white')}>Begrenser</span>}
                  {!r.counts && <span className="block text-[11px] font-normal">Til informasjon</span>}
                </p>
                <p className={clsx('inv-fig order-2 text-right text-sm sm:order-3', r.limiting ? 'font-bold' : 'font-medium')}>{r.price === null ? <span className="text-xs font-normal">Ingen pris</span> : formatNOK(floorK(r.price))}</p>
                <div className="relative order-3 col-span-2 h-6 sm:order-2 sm:col-span-1" aria-hidden>
                  <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2" style={{ background: dark ? 'rgb(148 163 184 / 0.35)' : '#cbd5e1' }} />
                  {purchase !== null && <div className="absolute inset-y-0 border-l-[1.5px] border-dashed" style={{ left: pos(purchase), borderColor: muted }} />}
                  {r.price !== null && (
                    <>
                      <div className="inv-bar absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded" style={{ width: pos(r.price), background: r.counts ? (r.limiting ? accent : muted) : 'transparent', opacity: r.counts ? 1 : 0 }} />
                      <span
                        className="inv-bar absolute top-1/2 block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                        style={{ left: pos(r.price), background: r.counts ? (r.limiting ? accent : ink) : 'transparent', borderColor: r.counts ? (r.limiting ? accent : ink) : muted }}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </div>
      <p className={clsx('mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px]', dark ? 'text-slate-300' : 'text-slate-600')}>
        <span className="inv-fig">Akse: {compactMill(lo)} – {compactMill(hi)} (forkortet)</span>
        {purchase !== null && (
          <span className="inv-fig">
            <span aria-hidden className="mr-1 inline-block w-3 border-t border-dashed align-middle" style={{ borderColor: muted }} /> Din kjøpspris {formatNOK(purchase)}
          </span>
        )}
      </p>
    </ChartFrame>
  );
}
