import clsx from 'clsx';
import { CircleHelp, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Modal dialog basert på native <dialog>: fokusfelle, Esc og inert bakgrunn er innebygd. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissable) onClose();
      }}
      onClick={(e) => {
        if (dismissable && e.target === ref.current) onClose();
      }}
      className={clsx(
        'm-auto max-h-[92vh] w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-ink shadow-xl',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
        size === 'xl' && 'max-w-4xl',
      )}
    >
      {open && (
        <div className="flex max-h-[92vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
            </div>
            {dismissable && (
              <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label="Lukk">
                <X className="size-5" aria-hidden />
              </button>
            )}
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Kort forklaring bak et spørsmålstegn. Åpnes med klikk/Enter, lukkes med Esc eller klikk utenfor. */
export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span ref={wrap} className={clsx('relative inline-flex normal-case tracking-normal', className)}>
      <button
        type="button"
        aria-label={`Forklaring: ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-0.5 text-slate-400 hover:text-pine-700"
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute top-6 left-1/2 z-40 w-72 max-w-[80vw] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-relaxed font-normal text-slate-700 shadow-lg"
        >
          <span className="mb-1 block font-semibold text-ink">{label}</span>
          {children}
        </span>
      )}
    </span>
  );
}

/** Faner med tastaturnavigasjon (WAI-ARIA tabs). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: ReactNode; badge?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
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
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
            t.id === value ? 'border-pine-700 text-pine-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-ink',
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="pt-5 focus-visible:outline-none">
      {children}
    </div>
  );
}
