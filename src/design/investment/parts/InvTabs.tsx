import clsx from 'clsx';
import { useRef, type ReactNode } from 'react';

/**
 * Faner i Investment: segmentert kontroll i mørk kapsel på desktop og brytende knapper på mobil (ingen horisontal rulling).
 * Samme tilgjengelighet som Original og Finance: roller, piltaster, Home/End.
 */
export function InvTabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div role="tablist" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--inv-dark)] p-1 sm:flex sm:flex-wrap">
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
            'min-h-11 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors last:odd:col-span-2 sm:flex-none sm:px-4 sm:last:odd:col-span-1',
            t.id === value ? 'bg-cyan-300 font-semibold text-slate-950' : 'text-slate-200 hover:bg-white/10 hover:text-white',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
