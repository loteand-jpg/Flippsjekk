import clsx from 'clsx';
import { useRef, type ReactNode } from 'react';

/**
 * Faner i Finance: understreket rad på desktop, og tydelige knapper som brytes over flere linjer på mobil
 * (ingen horisontal rulling). Samme tilgjengelighet som Original: roller, piltaster, Home/End.
 */
export function FinanceTabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-1 gap-y-1 border-b border-[var(--fin-line)] max-sm:border-b-0 max-sm:pb-1">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={t.id === value}
          aria-controls={`panel-${t.id}`}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            let n = -1;
            if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
            if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
            if (e.key === 'Home') n = 0;
            if (e.key === 'End') n = tabs.length - 1;
            if (n >= 0) {
              e.preventDefault();
              onChange(tabs[n].id);
              refs.current[tabs[n].id]?.focus();
            }
          }}
          className={clsx(
            'min-h-11 px-3.5 text-sm font-medium whitespace-nowrap transition-colors sm:-mb-px sm:border-b-2 max-sm:rounded-lg max-sm:border max-sm:px-3',
            t.id === value
              ? 'border-pine-800 text-ink max-sm:border-pine-800 max-sm:bg-pine-800 max-sm:text-white'
              : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-ink max-sm:border-[var(--fin-line-strong)] max-sm:bg-white',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
