import clsx from 'clsx';
import type { ReactNode } from 'react';

export type FinTone = 'neutral' | 'pos' | 'neg' | 'warn' | 'info';

export const TONE_TEXT: Record<FinTone, string> = {
  neutral: 'text-ink',
  pos: 'text-[var(--fin-pos)]',
  neg: 'text-[var(--fin-neg)]',
  warn: 'text-[var(--fin-warn)]',
  info: 'text-[var(--fin-info)]',
};

const PILL: Record<FinTone, string> = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-200',
  pos: 'bg-[var(--fin-pos-bg)] text-[var(--fin-pos)] ring-[color:var(--fin-pos)]/25',
  neg: 'bg-[var(--fin-neg-bg)] text-[var(--fin-neg)] ring-[color:var(--fin-neg)]/25',
  warn: 'bg-[var(--fin-warn-bg)] text-[var(--fin-warn)] ring-[color:var(--fin-warn)]/25',
  info: 'bg-[var(--fin-info-bg)] text-[var(--fin-info)] ring-[color:var(--fin-info)]/20',
};

/** Statuslapp. Status kommuniseres alltid med tekst (og gjerne et symbol) – aldri bare med farge. */
export function Pill({ tone = 'neutral', children, className, title }: { tone?: FinTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', PILL[tone], className)}>
      {children}
    </span>
  );
}

/** Beløp og andre tall: tabulære siffer, aldri linjebrudd midt i tallet. */
export function Fig({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('fin-fig', className)}>{children}</span>;
}

/** Nøkkeltall med etikett, hovedverdi og forklaring. Ukjent verdi vises som tekst, aldri som 0. */
export function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
  unknown,
  testId,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: FinTone;
  unknown?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={clsx('min-w-0 py-3.5', className)}>
      <dt className="fin-label">{label}</dt>
      <dd className="mt-1">
        <span data-testid={testId} className={clsx('fin-fig block text-xl font-semibold sm:text-[1.375rem]', unknown ? 'text-base font-medium text-slate-500' : TONE_TEXT[tone])}>
          {value}
        </span>
        {sub && <span className="mt-0.5 block text-xs leading-snug text-slate-600">{sub}</span>}
      </dd>
    </div>
  );
}

export function SectionHeading({ title, sub, action, id, level = 2 }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; id?: string; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <H id={id} className={clsx('font-semibold tracking-tight text-ink', level === 2 ? 'text-xl' : 'text-base')}>
          {title}
        </H>
        {sub && <p className="mt-0.5 max-w-3xl text-sm text-slate-600">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Flate med hårfin ramme. Brukes sparsomt – hvitrom og typografi bærer hierarkiet. */
export function Surface({ children, className, as: Tag = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={clsx('rounded-xl border border-[var(--fin-line)] bg-white', className)} {...rest}>
      {children}
    </Tag>
  );
}
