import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, XCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 select-none whitespace-nowrap';
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-pine-800 text-white hover:bg-pine-900 active:bg-pine-950 shadow-sm',
  secondary: 'bg-white text-ink border border-slate-300 hover:bg-slate-50 hover:border-slate-400',
  ghost: 'text-pine-800 hover:bg-pine-50',
  danger: 'bg-white text-red-800 border border-red-300 hover:bg-red-50',
  subtle: 'bg-pine-50 text-pine-900 hover:bg-pine-100',
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) {
  return clsx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], extra);
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'pine' | 'outline';
const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  red: 'bg-red-50 text-red-900 ring-red-200',
  blue: 'bg-sky-50 text-sky-900 ring-sky-200',
  violet: 'bg-violet-50 text-violet-900 ring-violet-200',
  pine: 'bg-pine-50 text-pine-900 ring-pine-200',
  outline: 'bg-white text-slate-700 ring-slate-300',
};

export function Badge({ tone = 'neutral', icon, children, className, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, id, sub }: { children: ReactNode; action?: ReactNode; id?: string; sub?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id={id} className="text-lg font-semibold text-ink">
          {children}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-slate-600">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

const ALERT_STYLE = {
  info: { box: 'border-sky-200 bg-sky-50 text-sky-950', icon: Info, iconCls: 'text-sky-700' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-950', icon: AlertTriangle, iconCls: 'text-amber-700' },
  danger: { box: 'border-red-200 bg-red-50 text-red-950', icon: XCircle, iconCls: 'text-red-700' },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-950', icon: CheckCircle2, iconCls: 'text-emerald-700' },
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof ALERT_STYLE;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const s = ALERT_STYLE[tone];
  const Icon = s.icon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-lg border p-3 text-sm', s.box, className)}>
      <Icon className={clsx('mt-0.5 size-4 shrink-0', s.iconCls)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'space-y-1')}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Laster …', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={clsx('flex items-center gap-2 text-sm text-slate-600', className)}>
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function PageLoading({ label = 'Laster …' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Nøkkeltall-flis. Ukjent vises som tekst, aldri som 0. */
export function Stat({
  label,
  value,
  sub,
  info,
  emphasis,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  info?: ReactNode;
  emphasis?: 'positive' | 'negative' | 'unknown' | null;
  className?: string;
}) {
  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white p-4', className)}>
      <div className="flex items-center gap-1 text-xs font-medium tracking-wide text-slate-600 uppercase">
        {label}
        {info}
      </div>
      <div
        className={clsx(
          'num mt-1 text-xl font-semibold sm:text-2xl',
          emphasis === 'negative' && 'text-red-800',
          emphasis === 'positive' && 'text-pine-800',
          emphasis === 'unknown' && 'text-slate-500 text-lg sm:text-xl',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-600">{sub}</div>}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function KeyValue({ rows, className }: { rows: { label: ReactNode; value: ReactNode; hint?: ReactNode }[]; className?: string }) {
  return (
    <dl className={clsx('divide-y divide-slate-100', className)}>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
          <dt className="text-slate-600">
            {r.label}
            {r.hint && <span className="block text-xs text-slate-500">{r.hint}</span>}
          </dt>
          <dd className="num text-right font-medium text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
