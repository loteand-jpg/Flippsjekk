import clsx from 'clsx';
import { formatNOK } from '../model/format';
import { ChartFrame } from './ChartFrame';

export interface Range3 {
  low: number | null;
  base: number | null;
  high: number | null;
}

function Row({ label, r, dark, zeroLine }: { label: string; r: Range3; dark?: boolean; zeroLine?: boolean }) {
  const vals = [r.low, r.base, r.high].filter((v): v is number => v !== null);
  if (vals.length === 0 || r.base === null) {
    return (
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className={clsx('text-xs', dark ? 'text-slate-300' : 'text-slate-500')}>Ikke beregnet</p>
      </div>
    );
  }
  let lo = Math.min(...vals, zeroLine ? 0 : Infinity);
  let hi = Math.max(...vals, zeroLine ? 0 : -Infinity);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
  lo -= pad;
  hi += pad;
  const p = (n: number) => ((n - lo) / (hi - lo)) * 100;
  const a = r.low ?? r.base;
  const c = r.high ?? r.base;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium">{label}</p>
        <p className="inv-fig text-sm font-bold">{formatNOK(r.base)}</p>
      </div>
      <div className="relative my-1.5 h-4" role="img" aria-label={`${label}: lavt ${r.low === null ? 'ukjent' : formatNOK(r.low)}, normalt ${formatNOK(r.base)}, høyt ${r.high === null ? 'ukjent' : formatNOK(r.high)}`}>
        <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2" style={{ background: dark ? 'rgb(148 163 184 / 0.35)' : '#cbd5e1' }} />
        {zeroLine && lo < 0 && hi > 0 && <div className="absolute inset-y-0 w-px" style={{ left: `${p(0)}%`, background: dark ? '#fb7185' : 'var(--viz-down)' }} />}
        <div className="inv-bar absolute top-1 bottom-1 rounded-sm" style={{ left: `${p(a)}%`, width: `${Math.max(p(c) - p(a), 1)}%`, background: dark ? 'rgb(34 211 238 / 0.55)' : 'rgb(14 116 144 / 0.35)' }} />
        <div className="inv-bar absolute top-0 bottom-0 w-[3px] -translate-x-1/2 rounded" style={{ left: `${p(r.base)}%`, background: dark ? '#22d3ee' : 'var(--viz-up)' }} />
      </div>
      <p className={clsx('flex justify-between gap-2 text-[11px]', dark ? 'text-slate-300' : 'text-slate-600')}>
        <span className="inv-fig">Lavt {r.low === null ? '–' : formatNOK(r.low)}</span>
        <span className="inv-fig text-right">Høyt {r.high === null ? '–' : formatNOK(r.high)}</span>
      </p>
    </div>
  );
}

/** Utfallsspenn: salgsverdi og fortjeneste ved lavt, normalt og høyt salg – oppsiden og nedsiden på ett blikk. */
export function OutcomeRange({ sale, profit, dark }: { sale: Range3; profit?: Range3 | null; dark?: boolean }) {
  return (
    <ChartFrame
      dark={dark}
      table={{
        caption: 'Utfallsspenn',
        head: ['', 'Lavt', 'Normalt', 'Høyt'],
        rows: [
          ['Salgsverdi', sale.low === null ? '–' : formatNOK(sale.low), sale.base === null ? '–' : formatNOK(sale.base), sale.high === null ? '–' : formatNOK(sale.high)],
          ...(profit ? [['Fortjeneste', profit.low === null ? '–' : formatNOK(profit.low), profit.base === null ? '–' : formatNOK(profit.base), profit.high === null ? '–' : formatNOK(profit.high)]] : []),
        ],
      }}
    >
      <div className="space-y-3.5">
        <Row label="Salgsverdi" r={sale} dark={dark} />
        {profit && <Row label="Fortjeneste før skatt" r={profit} dark={dark} zeroLine />}
      </div>
    </ChartFrame>
  );
}
