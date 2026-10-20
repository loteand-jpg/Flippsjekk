import clsx from 'clsx';
import type { CostSegment } from '../model/charts';
import { formatNOK } from '../model/format';
import { ChartFrame } from './ChartFrame';

const COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)'];

/**
 * Kostnadsfordeling mot salgsverdi på felles skala: to staplede/enkle stolper, med fortjenesten som differansen.
 * Hvert segment har tekst og beløp i forklaringen; mellomrom (2 px) skiller segmentene, så fargen ikke er eneste bærer.
 */
export function CostChart({ segments, sale, profit, dark }: { segments: CostSegment[]; sale: number; profit: number; dark?: boolean }) {
  const total = segments.reduce((s, x) => s + x.amount, 0);
  const max = Math.max(total, sale, 1);
  const pct = (n: number) => `${Math.max(0, (n / max) * 100)}%`;
  const share = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)} %` : '–');
  return (
    <ChartFrame
      dark={dark}
      title="Hvor går pengene?"
      caption={`Kostnadene til sammen ${formatNOK(total)} mot kontantsalg ${formatNOK(sale)}. Forskjellen er forventet fortjeneste før skatt: ${formatNOK(profit)}.`}
      table={{
        caption: 'Kostnadsfordeling',
        head: ['Post', 'Beløp', 'Andel av kostnad'],
        rows: [...segments.map((s) => [s.label, formatNOK(s.amount), share(s.amount)]), ['Samlet kostnad', formatNOK(total), '100 %'], ['Kontantsalg', formatNOK(sale), ''], ['Fortjeneste', formatNOK(profit), '']],
      }}
    >
      <div role="img" aria-label={`Kostnadsfordeling: ${segments.map((s) => `${s.label} ${formatNOK(s.amount)}`).join(', ')}. Samlet ${formatNOK(total)}. Kontantsalg ${formatNOK(sale)}.`}>
        <div className="space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Kostnader</span><span className="inv-fig">{formatNOK(total)}</span></div>
            <div className="flex h-7 gap-[2px] overflow-hidden rounded-md bg-slate-200/60" style={{ width: pct(total) }}>
              {segments.map((s, i) => (
                <span key={s.id} className="inv-bar block h-full" style={{ width: `${total > 0 ? (s.amount / total) * 100 : 0}%`, background: COLORS[i] }} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Kontantsalg</span><span className="inv-fig">{formatNOK(sale)}</span></div>
            <div className="h-7 rounded-md" style={{ width: pct(sale), background: dark ? '#67e8f9' : 'var(--viz-up)' }} />
          </div>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
        {segments.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i] }} aria-hidden />
              <span className="truncate">{s.label}</span>
            </span>
            <span className={clsx('inv-fig shrink-0 font-semibold')}>
              {formatNOK(s.amount)} <span className={clsx('font-normal', dark ? 'text-slate-300' : 'text-slate-500')}>· {share(s.amount)}</span>
            </span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
