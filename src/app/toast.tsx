import clsx from 'clsx';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'info' | 'warning' | 'danger';
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === 'danger' ? 9000 : 6000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end">
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'info' ? Info : TriangleAlert;
          return (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3 text-sm shadow-lg',
                t.tone === 'success' && 'border-emerald-200',
                t.tone === 'info' && 'border-sky-200',
                t.tone === 'warning' && 'border-amber-200',
                t.tone === 'danger' && 'border-red-200',
              )}
            >
              <Icon
                className={clsx(
                  'mt-0.5 size-4 shrink-0',
                  t.tone === 'success' && 'text-emerald-700',
                  t.tone === 'info' && 'text-sky-700',
                  t.tone === 'warning' && 'text-amber-700',
                  t.tone === 'danger' && 'text-red-700',
                )}
                aria-hidden
              />
              <div className="flex-1">
                <p className="font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-slate-600">{t.body}</p>}
              </div>
              <button type="button" aria-label="Lukk melding" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
