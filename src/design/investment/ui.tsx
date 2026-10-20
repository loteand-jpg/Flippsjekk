import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Tone } from '../shared/present';

/** Tonefarger på lys flate (alle ≥ 4,5:1 mot hvit) og på mørk flate. Status skal alltid også stå som tekst. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  pos: 'text-[var(--inv-pos)]',
  neg: 'text-[var(--inv-neg)]',
  warn: 'text-[var(--inv-warn)]',
  info: 'text-[var(--inv-info)]',
};
export const TONE_TEXT_DARK: Record<Tone, string> = {
  neutral: 'text-[var(--inv-on-dark)]',
  pos: 'text-[var(--inv-pos-d)]',
  neg: 'text-[var(--inv-neg-d)]',
  warn: 'text-[var(--inv-warn-d)]',
  info: 'text-[var(--inv-accent)]',
};

const TAG: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-300',
  pos: 'bg-[var(--inv-pos-bg)] text-[var(--inv-pos)] ring-[color:var(--inv-pos)]/30',
  neg: 'bg-[var(--inv-neg-bg)] text-[var(--inv-neg)] ring-[color:var(--inv-neg)]/30',
  warn: 'bg-[var(--inv-warn-bg)] text-[var(--inv-warn)] ring-[color:var(--inv-warn)]/30',
  info: 'bg-[var(--inv-info-bg)] text-[var(--inv-info)] ring-[color:var(--inv-info)]/25',
};
const TAG_DARK: Record<Tone, string> = {
  neutral: 'bg-white/10 text-slate-100 ring-white/25',
  pos: 'bg-emerald-400/15 text-[var(--inv-pos-d)] ring-emerald-300/40',
  neg: 'bg-rose-400/15 text-[var(--inv-neg-d)] ring-rose-300/40',
  warn: 'bg-amber-300/15 text-[var(--inv-warn-d)] ring-amber-200/40',
  info: 'bg-cyan-300/15 text-[var(--inv-accent)] ring-cyan-200/40',
};

/** Statusmerke. Tekst bærer budskapet; fargen støtter. */
export function Tag({ tone = 'neutral', dark, children, className, title }: { tone?: Tone; dark?: boolean; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', dark ? TAG_DARK[tone] : TAG[tone], className)}>
      {children}
    </span>
  );
}

/** Beløp og andre tall: tabulære siffer, aldri linjebrudd midt i tallet. */
export function Fig({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inv-fig', className)}>{children}</span>;
}

/** Analysepanel: hvit flate med skarp ramme. */
export function Panel({
  title,
  sub,
  action,
  children,
  className,
  id,
  bodyClassName,
  as: Tag2 = 'section',
}: {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag2 aria-labelledby={title && id ? `${id}-t` : undefined} id={id} className={clsx('min-w-0 rounded-xl border border-[var(--inv-line)] bg-white shadow-[0_1px_0_rgba(12,20,36,0.03)]', className)}>
      {title && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-[var(--inv-line)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={id ? `${id}-t` : undefined} className="text-base font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {sub && <p className="mt-0.5 max-w-3xl text-xs leading-snug text-slate-600 sm:text-[13px]">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </Tag2>
  );
}

/** Nøkkeltall på lys flate. */
export function Kpi({
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
  tone?: Tone;
  unknown?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <dt className="inv-label">{label}</dt>
      <dd className="mt-1">
        <span data-testid={testId} className={clsx('inv-fig block text-[1.375rem] leading-tight font-semibold', unknown ? 'text-base font-medium text-slate-500' : TONE_TEXT[tone])}>
          {value}
        </span>
        {sub && <span className="mt-0.5 block text-xs leading-snug text-slate-600">{sub}</span>}
      </dd>
    </div>
  );
}

/** Nøkkeltall på mørk flate. */
export function KpiDark({
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
  tone?: Tone;
  unknown?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <dt className="inv-label">{label}</dt>
      <dd className="mt-1">
        <span data-testid={testId} className={clsx('inv-fig block text-[1.5rem] leading-tight font-semibold', unknown ? 'text-base font-medium text-slate-300' : TONE_TEXT_DARK[tone])}>
          {value}
        </span>
        {sub && <span className="inv-muted-d mt-0.5 block text-xs leading-snug">{sub}</span>}
      </dd>
    </div>
  );
}
