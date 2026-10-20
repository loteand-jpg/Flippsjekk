import clsx from 'clsx';
import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Field, NumberInput } from '../../../components/ui/forms';
import { formatNumber } from '../../../lib/format';
import { Pill } from './primitives';

/**
 * Tallfelt for kalkylen med tydelig opprinnelse («Fra annonsen», «Analyseanslag», «Din profilforutsetning») og «Din verdi» med
 * tilbakestilling mot grunnlaget. Samme data og atferd som ScenarioNumberField i Original – bare annen presentasjon.
 */
export function FinNumberField({
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
            <Pill tone="info">Din verdi</Pill>
            {!disabled && (
              <button type="button" onClick={() => onChange(baseValue ?? null)} aria-label={`Tilbakestill ${label} til grunnlag`} className="inline-flex min-h-8 items-center gap-1 text-xs text-pine-800 hover:underline">
                <RotateCcw className="size-3" aria-hidden /> Tilbakestill
              </button>
            )}
          </span>
        ) : origin ? (
          <span className="shrink-0 text-[11px] text-slate-500">{origin}</span>
        ) : null
      }
    >
      {(p) => (
        <div className={clsx(changed && 'rounded-lg ring-2 ring-pine-200')}>
          <NumberInput {...p} value={value} onChange={onChange} unit={unit} decimals={decimals} min={min} max={max} disabled={disabled} />
          {slider && (
            <input
              type="range"
              aria-label={`${label} (glider)`}
              className="mt-2 w-full accent-pine-800"
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

/** Nummerert gruppe av forutsetninger. */
export function FinGroup({ n, title, sub, children, id }: { n: number; title: string; sub?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="border-t border-[var(--fin-line-strong)] pt-5">
      <header className="mb-4">
        <div className="flex items-baseline gap-3">
          <span className="fin-label">{String(n).padStart(2, '0')}</span>
          <h3 id={id} className="text-lg font-semibold tracking-tight">
            {title}
          </h3>
        </div>
        {sub && <p className="mt-1 max-w-2xl text-sm text-slate-600">{sub}</p>}
      </header>
      {children}
    </section>
  );
}
