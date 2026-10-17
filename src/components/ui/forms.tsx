import clsx from 'clsx';
import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { formatNumber, parseNorwegianNumber } from '../../lib/format';

export const INPUT_CLS =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink placeholder:text-slate-400 shadow-xs focus:border-pine-600 focus:outline-none focus:ring-2 focus:ring-pine-600/30 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-500';

export function Field({
  label,
  hint,
  error,
  children,
  id,
  className,
  labelAside,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  id?: string;
  className?: string;
  labelAside?: ReactNode;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errId = error ? `${fieldId}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        {labelAside}
      </div>
      {children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(INPUT_CLS, 'h-10', props.className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(INPUT_CLS, 'h-10 pr-8', className)}>
      {children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(INPUT_CLS, 'py-2', props.className)} />;
}

export function Checkbox({ label, checked, onChange, disabled, description }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 rounded border-slate-400 accent-pine-700"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="text-sm text-slate-800">
        {label}
        {description && <span className="block text-xs text-slate-600">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-slate-800 disabled:opacity-50"
    >
      <span className={clsx('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-pine-700' : 'bg-slate-300')}>
        <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      {label}
    </button>
  );
}

/** Segmentert valg (radiogruppe) med piltastnavigasjon. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-slate-50 p-0.5">
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === (idx < 0 ? 0 : idx) ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
              onChange(options[n].value);
              refs.current[n]?.focus();
            }
          }}
          className={clsx(
            'rounded-md font-medium transition-colors disabled:opacity-50',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            o.value === value ? 'bg-white text-pine-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tallfelt med norsk format. Tomt felt = ukjent (null), aldri 0.
 * Verdien oppdateres for hvert gyldige tastetrykk slik at nøkkeltall oppdateres umiddelbart.
 */
export function NumberInput({
  value,
  onChange,
  unit,
  decimals = 0,
  min,
  max,
  disabled,
  placeholder = 'Ikke avklart',
  className,
  ...aria
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
}) {
  const fmt = (v: number | null) => (v === null ? '' : formatNumber(v, '', decimals));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const outOfRange = value !== null && ((min !== undefined && value < min) || (max !== undefined && value > max));
  return (
    <div className={clsx('relative', className)}>
      <input
        {...aria}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        aria-invalid={aria['aria-invalid'] || invalid || outOfRange || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setInvalid(false);
          setText(fmt(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const p = parseNorwegianNumber(e.target.value);
          if (p === 'invalid') {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onChange(p);
        }}
        className={clsx(INPUT_CLS, 'num h-10 text-right', unit ? 'pr-12' : '')}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{unit}</span>}
    </div>
  );
}

/** Tallfelt + valgfri glider, med visning av grunnverdi og tilbakestilling per felt. */
export function ScenarioNumberField({
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
}) {
  const changed = baseValue !== undefined && baseValue !== value;
  return (
    <Field
      label={label}
      error={error}
      hint={
        <>
          {changed ? (
            <span className="font-medium text-violet-800">
              Endret av deg · grunnlag {formatBase ? formatBase(baseValue ?? null) : formatNumber(baseValue ?? null)}
            </span>
          ) : origin ? (
            <span>{origin}</span>
          ) : null}
          {hint && <span className="block">{hint}</span>}
        </>
      }
      labelAside={
        changed && !disabled ? (
          <button type="button" onClick={() => onChange(baseValue ?? null)} className="inline-flex items-center gap-1 text-xs text-pine-800 hover:underline">
            <RotateCcw className="size-3" aria-hidden />
            Tilbakestill
          </button>
        ) : null
      }
    >
      {(p) => (
        <div className={clsx(changed && 'rounded-lg ring-2 ring-violet-200')}>
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
