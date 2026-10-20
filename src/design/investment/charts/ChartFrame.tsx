import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Ramme for alle diagrammer: tittel, forklaring og alltid et tallalternativ (tabell) som kan åpnes med tastatur.
 * Diagrammer er aldri eneste måte tallene vises på – verdiene står også som tekst i selve diagrammet eller i tabellen.
 */
export function ChartFrame({
  title,
  caption,
  table,
  children,
  dark,
  className,
  tableLabel = 'Vis som tall',
}: {
  title?: ReactNode;
  caption?: ReactNode;
  table?: { head: string[]; rows: ReactNode[][]; caption: string };
  children: ReactNode;
  dark?: boolean;
  className?: string;
  tableLabel?: string;
}) {
  return (
    <figure className={clsx('min-w-0', className)}>
      {title && <figcaption className={clsx('mb-2 text-sm font-semibold', dark ? 'text-slate-100' : 'text-ink')}>{title}</figcaption>}
      {children}
      {caption && <p className={clsx('mt-2 text-xs leading-snug', dark ? 'inv-muted-d' : 'text-slate-600')}>{caption}</p>}
      {table && (
        <details className="group mt-1">
          <summary className={clsx('inline-flex min-h-11 cursor-pointer items-center gap-1 text-xs font-medium underline decoration-dotted underline-offset-2 md:min-h-8', dark ? 'text-cyan-200' : 'text-pine-700')}>
            <span className="group-open:hidden">{tableLabel}</span>
            <span className="hidden group-open:inline">Skjul tall</span>
          </summary>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${table.caption} (kan rulles sideveis)`}>
            <table className={clsx('mt-1 w-full text-xs', dark ? 'text-slate-100' : 'text-slate-800')}>
              <caption className="sr-only">{table.caption}</caption>
              <thead>
                <tr className={clsx('border-b text-left', dark ? 'border-white/20' : 'border-[var(--inv-line)]')}>
                  {table.head.map((h, i) => (
                    <th key={h} scope="col" className={clsx('py-1.5 pr-3 font-semibold', i > 0 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri} className={clsx('border-b last:border-0', dark ? 'border-white/10' : 'border-[var(--inv-line)]')}>
                    {r.map((c, ci) => (
                      <td key={ci} className={clsx('inv-fig py-1.5 pr-3', ci > 0 && 'text-right')}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
