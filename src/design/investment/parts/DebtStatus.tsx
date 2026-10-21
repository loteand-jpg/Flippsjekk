import { CircleAlert, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { SALE_DEBT_SEVERITY_LABEL, type SaleDebtStatus } from '../../../components/analysis/saleDebtStatus';

/**
 * Status for fellesgjeld ved salg i Investment. Samme tittel, forklaring og alvorlighet som i Original og Finance (delt
 * `saleDebtStatuses`); bare uttrykket er Investments. Alvor står som ord og ikon, ikke bare farge, og teksten er alltid synlig.
 */
export function DebtStatus({ statuses, dark, testId, messageTestId = true }: { statuses: SaleDebtStatus[]; dark?: boolean; testId: string; messageTestId?: boolean }) {
  if (statuses.length === 0) return null;
  return (
    <div data-testid={testId} className={clsx(dark ? 'border-b border-white/10' : 'space-y-2')}>
      {statuses.map((st) => {
        const error = st.severity === 'error';
        const Icon = error ? CircleAlert : TriangleAlert;
        return (
          <div
            key={st.kind}
            role={error ? 'alert' : 'status'}
            className={clsx(
              'flex gap-3 text-sm',
              dark ? 'px-4 py-3 sm:px-6' : 'rounded-lg border p-3',
              dark
                ? error
                  ? 'bg-rose-400/10 text-[var(--inv-neg-d)]'
                  : 'bg-amber-300/10 text-[var(--inv-warn-d)]'
                : error
                  ? 'border-[var(--inv-neg)]/30 bg-[var(--inv-neg-bg)] text-[var(--inv-neg)]'
                  : 'border-[var(--inv-warn)]/30 bg-[var(--inv-warn-bg)] text-[var(--inv-warn)]',
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">
                <span className="mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ring-1 ring-current/40 ring-inset">{SALE_DEBT_SEVERITY_LABEL[st.severity]}</span>
                {st.title}
              </p>
              <p className="mt-0.5" data-testid={messageTestId ? `sale-debt-status-${st.kind}` : undefined}>
                {st.message}
              </p>
              {st.affects.length > 0 && <p className="mt-0.5 text-xs">Gjelder: {st.affects.join(', ')}. Maksbud og fortjeneste er ikke sikre før dette er rettet.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
