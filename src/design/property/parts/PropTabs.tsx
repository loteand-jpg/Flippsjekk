import clsx from 'clsx';
import { useRef, type ReactNode } from 'react';

/**
 * Faner for detaljene: rolig segmentert kontroll i sand. Samme tilgjengelighet som i de andre variantene: roller, piltaster og Home/End,
 * og brytende knapper på mobil (ingen sideveis rulling).
 */
export function PropTabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div role="tablist" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--prop-sand)] p-1 sm:flex sm:flex-wrap">
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
          className={clsx('min-h-11 rounded-xl px-3 text-sm font-medium whitespace-nowrap transition-colors last:odd:col-span-2 sm:flex-none sm:px-4 sm:last:odd:col-span-1', t.id === value ? 'bg-[var(--prop-paper)] font-semibold text-ink shadow-sm' : 'text-slate-700 hover:bg-[var(--prop-sand-2)]')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
