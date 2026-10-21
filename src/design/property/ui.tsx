import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Tone } from '../shared/present';

/** Tonefarger på lys flate (alle ≥ 4,5:1 mot papir) og på mørk flate. Status skal alltid også stå som tekst. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  pos: 'text-[var(--prop-pos)]',
  neg: 'text-[var(--prop-neg)]',
  warn: 'text-[var(--prop-warn)]',
  info: 'text-[var(--prop-blue)]',
};
export const TONE_TEXT_DARK: Record<Tone, string> = {
  neutral: 'text-[var(--prop-on-dark)]',
  pos: 'text-[var(--prop-pos-d)]',
  neg: 'text-[var(--prop-neg-d)]',
  warn: 'text-[var(--prop-warn-d)]',
  info: 'text-[var(--prop-blue-d)]',
};

const TAG: Record<Tone, string> = {
  neutral: 'bg-[var(--prop-sand-2)] text-slate-700 ring-[var(--prop-line-strong)]',
  pos: 'bg-[var(--prop-pos-bg)] text-[var(--prop-pos)] ring-[color:var(--prop-pos)]/30',
  neg: 'bg-[var(--prop-neg-bg)] text-[var(--prop-neg)] ring-[color:var(--prop-neg)]/30',
  warn: 'bg-[var(--prop-warn-bg)] text-[var(--prop-warn)] ring-[color:var(--prop-warn)]/30',
  info: 'bg-[var(--prop-blue-bg)] text-[var(--prop-blue)] ring-[color:var(--prop-blue)]/25',
};
const TAG_DARK: Record<Tone, string> = {
  neutral: 'bg-white/10 text-[var(--prop-on-dark)] ring-white/25',
  pos: 'bg-[#9fc794]/15 text-[var(--prop-pos-d)] ring-[#9fc794]/40',
  neg: 'bg-[#f0a090]/15 text-[var(--prop-neg-d)] ring-[#f0a090]/40',
  warn: 'bg-[#e5bd6a]/15 text-[var(--prop-warn-d)] ring-[#e5bd6a]/40',
  info: 'bg-[#a9c8e6]/15 text-[var(--prop-blue-d)] ring-[#a9c8e6]/40',
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
  return <span className={clsx('prop-fig', className)}>{children}</span>;
}

/**
 * Redaksjonell seksjon: liten nummerert overskrift, serif tittel og en ingress. `id` brukes av innholdsfortegnelsen
 * (`data-prop-section` gir riktig rulle-avstand under den klebrige toppen).
 */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  action,
  children,
  className,
}: {
  id: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} data-prop-section aria-labelledby={`${id}-t`} className={clsx('min-w-0', className)}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 sm:mb-5">
        <div className="min-w-0">
          {eyebrow && <p className="prop-label">{eyebrow}</p>}
          <h2 id={`${id}-t`} tabIndex={-1} className="prop-serif mt-0.5 text-[1.5rem] leading-tight text-balance outline-none sm:text-[1.875rem]">
            {title}
          </h2>
          {intro && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-700 sm:text-[0.9375rem]">{intro}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Flate på papir. */
export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <As className={clsx('min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)]', className)}>{children}</As>;
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
  big,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  unknown?: boolean;
  testId?: string;
  className?: string;
  big?: boolean;
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <dt className="prop-label">{label}</dt>
      <dd className="mt-1">
        <span data-testid={testId} className={clsx('prop-fig block leading-tight font-semibold', big ? 'text-[1.75rem]' : 'text-[1.25rem]', unknown ? '!text-base !font-medium text-slate-600' : TONE_TEXT[tone])}>
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
      <dt className="prop-label">{label}</dt>
      <dd className="mt-1">
        <span data-testid={testId} className={clsx('prop-fig block text-[1.375rem] leading-tight font-semibold', unknown ? '!text-base !font-medium text-[var(--prop-on-dark-muted)]' : TONE_TEXT_DARK[tone])}>
          {value}
        </span>
        {sub && <span className="prop-muted-d mt-0.5 block text-xs leading-snug">{sub}</span>}
      </dd>
    </div>
  );
}
