import clsx from 'clsx';
import type { ReactNode } from 'react';
import { ChartFrame } from './ChartFrame';

export interface ZeroBarRow {
  id: string;
  label: ReactNode;
  sub?: ReactNode;
  value: number;
  /** Verdien som tekst, med fortegn. Tallet står alltid skrevet ut. */
  text: string;
  emphasis?: boolean;
}

/**
 * Nullsentrerte stolper: positive mot høyre, negative mot venstre. Brukes til scenariodelta (hva gir ekstra investering?)
 * og stresstester (fortjeneste ved base, downside og stress). Fortegn står i teksten, så retningen aldri bare er farge.
 */
export function ZeroBars({
  rows,
  caption,
  title,
  tableCaption,
  valueHead,
  dark,
}: {
  rows: ZeroBarRow[];
  caption?: ReactNode;
  title?: ReactNode;
  tableCaption: string;
  valueHead: string;
  dark?: boolean;
}) {
  const vals = rows.map((r) => r.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100;
  return (
    <ChartFrame
      dark={dark}
      title={title}
      caption={caption}
      table={{ caption: tableCaption, head: ['Post', valueHead], rows: rows.map((r) => [r.label, r.text]) }}
    >
      <ul className="space-y-2">
        {rows.map((r) => {
          const w = (Math.abs(r.value) / span) * 100;
          const left = r.value >= 0 ? zero : zero - w;
          return (
            <li key={r.id} className={clsx('grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)_auto]', r.emphasis && 'border-t pt-2', r.emphasis && (dark ? 'border-white/20' : 'border-[var(--inv-line)]'))}>
              <p className={clsx('min-w-0 text-[13px] leading-tight', r.emphasis ? 'font-semibold' : 'font-medium')}>
                {r.label}
                {r.sub && <span className={clsx('block text-[11px] font-normal', dark ? 'text-slate-300' : 'text-slate-600')}>{r.sub}</span>}
              </p>
              <p className={clsx('inv-fig order-2 text-right text-sm sm:order-3', r.emphasis ? 'font-bold' : 'font-semibold')}>{r.text}</p>
              <div className="relative order-3 col-span-2 h-5 sm:order-2 sm:col-span-1" aria-hidden>
                <div className="absolute inset-y-0 w-px" style={{ left: `${zero}%`, background: dark ? 'rgb(148 163 184 / 0.6)' : '#94a3b8' }} />
                <div
                  className="inv-bar absolute top-0.5 bottom-0.5 rounded-sm"
                  style={{ left: `${left}%`, width: `${Math.max(w, r.value === 0 ? 0 : 0.8)}%`, background: r.value >= 0 ? (dark ? '#22d3ee' : 'var(--viz-up)') : dark ? '#fb7185' : 'var(--viz-down)' }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
