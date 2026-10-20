import clsx from 'clsx';
import { CircleAlert, CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import type { Level, ScoreDim } from '../model/scorecard';
import { TONE_TEXT } from '../ui';

const METER: Record<Level, number> = { sterk: 4, god: 3, middels: 2, svak: 1, uavklart: 0 };
const ICON: Record<Level, typeof CircleCheck> = { sterk: CircleCheck, god: CircleCheck, middels: CircleAlert, svak: CircleX, uavklart: CircleHelp };
const METER_COLOR: Record<Level, string> = { sterk: 'bg-[var(--inv-pos)]', god: 'bg-[var(--inv-pos)]', middels: 'bg-amber-600', svak: 'bg-[var(--inv-neg)]', uavklart: 'bg-slate-400' };

/**
 * Case-scorecard: seks adskilte vurderinger i stedet for ett score-tall. Nivået står som tekst og ikon (ikke bare farge),
 * med stolpemåler og en kort «hvorfor». Regelen bak hver vurdering kan åpnes. Reglene ligger i model/scorecard.ts.
 */
export function Scorecard({ dims }: { dims: ScoreDim[] }) {
  return (
    <section aria-labelledby="scorecard">
      <h2 id="scorecard" className="mb-2 text-base font-semibold tracking-tight">
        Case-scorecard
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" data-testid="inv-scorecard">
        {dims.map((d) => {
          const Icon = ICON[d.level];
          return (
            <li key={d.id} className="flex min-w-0 flex-col rounded-xl border border-[var(--inv-line)] bg-white p-3" data-testid={`inv-score-${d.id}`}>
              <p className="inv-label">{d.label}</p>
              <p className={clsx('mt-1 flex items-center gap-1.5 text-lg leading-tight font-bold', TONE_TEXT[d.tone])}>
                <Icon className="size-[18px] shrink-0" aria-hidden /> <span data-testid={`inv-score-${d.id}-text`}>{d.text}</span>
              </p>
              <div className="mt-2 flex gap-1" role="img" aria-label={`Nivå ${METER[d.level]} av 4`}>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={clsx('h-1.5 flex-1 rounded-full', n <= METER[d.level] ? METER_COLOR[d.level] : 'bg-slate-200')} />
                ))}
              </div>
              <p className="mt-2 text-xs leading-snug text-slate-700">{d.why}</p>
              <details className="mt-auto pt-1">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-[11px] font-medium text-pine-700 underline decoration-dotted underline-offset-2 md:min-h-7">Regel</summary>
                <p className="pb-1 text-[11px] leading-snug text-slate-600">{d.rule}</p>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
