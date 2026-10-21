import clsx from 'clsx';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { SALE_DEBT_SEVERITY_LABEL, type SaleDebtStatus } from '../../../components/analysis/saleDebtStatus';

/**
 * Status for fellesgjeld ved salg i Property. Samme tittel, forklaring og alvorlighet som i Original, Finance og Investment (delt
 * `saleDebtStatuses`); bare uttrykket er Propertys. Alvor står som ord og ikon, ikke bare farge, og teksten er alltid synlig.
 */
export function PropDebtStatus({ statuses, dark, testId = 'prop-debt-status' }: { statuses: SaleDebtStatus[]; dark?: boolean; testId?: string }) {
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
              dark ? 'px-4 py-3 sm:px-6' : 'rounded-xl border p-3',
              dark
                ? error
                  ? 'bg-[#f0a090]/10 text-[var(--prop-neg-d)]'
                  : 'bg-[#e5bd6a]/10 text-[var(--prop-warn-d)]'
                : error
                  ? 'border-[var(--prop-neg)]/30 bg-[var(--prop-neg-bg)] text-[var(--prop-neg)]'
                  : 'border-[var(--prop-warn)]/30 bg-[var(--prop-warn-bg)] text-[var(--prop-warn)]',
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">
                <span className="mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ring-1 ring-current/40 ring-inset">{SALE_DEBT_SEVERITY_LABEL[st.severity]}</span>
                {st.title}
              </p>
              <p className="mt-0.5" data-testid={`sale-debt-status-${st.kind}`}>
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
