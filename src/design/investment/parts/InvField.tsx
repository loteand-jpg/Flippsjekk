import clsx from 'clsx';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Field, NumberInput } from '../../../components/ui/forms';
import { formatNumber } from '../../../lib/format';
import { Tag } from '../ui';

/**
 * Tallfelt for kalkylen med tydelig opprinnelse («Fra annonsen», «Analyseanslag», «Din profilforutsetning») og «Din verdi» med
 * tilbakestilling mot grunnlaget. Samme data og atferd som ScenarioNumberField i Original – bare annen presentasjon.
 */
export function InvNumberField({
  label,
  value,
  onChange,
  unit,
  decimals,
  min,
  max,
  slider,
  baseValue,
  formatBase,
  hint,
  error,
  disabled,
  origin,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  slider?: { min: number; max: number; step: number };
  baseValue?: number | null;
  formatBase?: (v: number | null) => string;
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
  origin?: string;
  className?: string;
}) {
  const changed = baseValue !== undefined && baseValue !== value;
  const baseText = formatBase ? formatBase(baseValue ?? null) : formatNumber(baseValue ?? null);
  return (
    <Field
      className={className}
      label={label}
      error={error}
      hint={
        <>
          {changed && <span className="block">Grunnlag: {baseText}</span>}
          {hint && <span className="block">{hint}</span>}
        </>
      }
      labelAside={
        changed ? (
          <span className="flex shrink-0 items-center gap-2">
            <Tag tone="info">Din verdi</Tag>
            {!disabled && (
              <button type="button" onClick={() => onChange(baseValue ?? null)} aria-label={`Tilbakestill ${label} til grunnlag`} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-pine-700 hover:underline md:min-h-8">
                <RotateCcw className="size-3" aria-hidden /> Tilbakestill
              </button>
            )}
          </span>
        ) : origin ? (
          <span className="shrink-0 text-[11px] text-slate-600">{origin}</span>
        ) : null
      }
    >
      {(p) => (
        <div className={clsx(changed && 'rounded-lg ring-2 ring-cyan-300')}>
          <NumberInput {...p} value={value} onChange={onChange} unit={unit} decimals={decimals} min={min} max={max} disabled={disabled} />
          {slider && (
            <input
              type="range"
              aria-label={`${label} (glider)`}
              className="mt-2 w-full accent-pine-700"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              disabled={disabled || value === null}
              value={value ?? slider.min}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          )}
        </div>
      )}
    </Field>
  );
}

/** Gruppe av forutsetninger som sammenleggbart kort med en kort oppsummering i tittelen. */
export function InvGroup({ n, title, sub, summary, children, id, defaultOpen = true }: { n: number; title: string; sub?: ReactNode; summary?: ReactNode; children: ReactNode; id: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="group rounded-xl border border-[var(--inv-line)] bg-white" data-testid={`inv-group-${id}`}>
      <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 sm:px-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--inv-dark)] text-xs font-bold text-cyan-200">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight">{title}</span>
          {summary && <span className="inv-fig block truncate text-xs text-slate-600">{summary}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-600 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-[var(--inv-line)] px-4 py-4 sm:px-5">
        {sub && <p className="mb-4 max-w-2xl text-sm text-slate-600">{sub}</p>}
        {children}
      </div>
    </details>
  );
}
