import clsx from 'clsx';
import { BookOpen, Calculator, CircleHelp, Flag, Lightbulb, Radar, Scale, Star } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { glossaryEntry } from './glossary';
import { COURSE_CHECKED, type BoxKind } from './types';

/** Fire typer opplysninger – brukes konsekvent i hele kurset. */
export type EvidenceKind = 'dokumentert' | 'analyse' | 'mine' | 'uavklart';
export const EVIDENCE: Record<EvidenceKind, { label: string; cls: string; help: string }> = {
  dokumentert: { label: 'Dokumentert fakta', cls: 'border-slate-300 bg-slate-100 text-slate-800', help: 'Opplysninger vi faktisk vet.' },
  analyse: { label: 'Analyse/estimat', cls: 'border-dashed border-sky-400 bg-white text-sky-900', help: 'Kvalifiserte antakelser.' },
  mine: { label: 'Din forutsetning', cls: 'border-violet-300 bg-violet-50 text-violet-900', help: 'Det du selv legger til grunn.' },
  uavklart: { label: 'Uavklart', cls: 'border-amber-300 bg-amber-50 text-amber-900', help: 'Noe som ennå ikke er undersøkt – aldri 0 kroner.' },
};

export function EvidenceTag({ kind, className }: { kind: EvidenceKind; className?: string }) {
  return <span className={clsx('inline-flex items-center rounded border px-1.5 text-[11px] font-medium whitespace-nowrap', EVIDENCE[kind].cls, className)}>{EVIDENCE[kind].label}</span>;
}

/** Ordlistebegrep: klikk for forklaring. */
export function Term({ k, children }: { k: string; children: ReactNode }) {
  const entry = glossaryEntry(k);
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!entry) return <>{children}</>;
  return (
    <span ref={ref} className="relative inline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="cursor-help underline decoration-pine-500 decoration-dotted underline-offset-4 hover:decoration-solid"
      >
        {children}
      </button>
      {open && (
        <span id={id} role="note" className="absolute top-7 left-0 z-40 block w-72 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-relaxed font-normal text-slate-700 shadow-lg">
          <span className="mb-1 block font-semibold text-ink">{entry.term}</span>
          {entry.def}
        </span>
      )}
    </span>
  );
}

const TOKEN = /(\*\*[^*]+\*\*|\{\{[^}]+\}\})/g;

/** **fet** og {{ordlistenøkkel|visningstekst}} */
export function RichText({ x }: { x: string }) {
  const parts = x.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{renderInline(p.slice(2, -2))}</strong>;
        if (p.startsWith('{{') && p.endsWith('}}')) {
          const [key, label] = p.slice(2, -2).split('|');
          return (
            <Term key={i} k={key}>
              {label ?? glossaryEntry(key)?.term ?? key}
            </Term>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function renderInline(s: string) {
  const m = s.match(/^\{\{([^}|]+)(?:\|([^}]+))?\}\}$/);
  if (m) return <Term k={m[1]}>{m[2] ?? glossaryEntry(m[1])?.term ?? m[1]}</Term>;
  return s;
}

/** Alle ordlistenøkler som brukes i en tekst (til tester). */
export function termKeysIn(x: string): string[] {
  return [...x.matchAll(/\{\{([^}|]+)(?:\|[^}]+)?\}\}/g)].map((m) => m[1]);
}

export const BOX: Record<BoxKind, { label: string; icon: typeof Scale; cls: string; iconCls: string; sub?: string }> = {
  regel: { label: 'Gjeldende regel', icon: Scale, cls: 'border-pine-300 bg-pine-50', iconCls: 'text-pine-800', sub: `Faglig kontrollert: ${COURSE_CHECKED}` },
  radar: { label: 'Regelradar', icon: Radar, cls: 'border-amber-300 bg-amber-50', iconCls: 'text-amber-800', sub: 'Forslag eller mulig endring – ikke gjeldende rett' },
  tips: { label: 'Flippsjekk-tips', icon: Lightbulb, cls: 'border-sky-200 bg-sky-50', iconCls: 'text-sky-800' },
  flagg: { label: 'Rødt flagg', icon: Flag, cls: 'border-red-200 bg-red-50', iconCls: 'text-red-800' },
  forklart: { label: 'Kort forklart', icon: BookOpen, cls: 'border-violet-200 bg-violet-50', iconCls: 'text-violet-800' },
  husk: { label: 'Husk', icon: Star, cls: 'border-pine-700 bg-pine-100', iconCls: 'text-pine-900' },
  eksempel: { label: 'Eksempel', icon: Calculator, cls: 'border-slate-300 bg-white', iconCls: 'text-slate-700', sub: 'Fiktivt regnestykke' },
  avklares: { label: 'Dette må avklares', icon: CircleHelp, cls: 'border-orange-300 bg-orange-50', iconCls: 'text-orange-800', sub: 'Svaret avhenger av boligen, kommunen, vedtektene, banken eller skattemessig klassifisering' },
};

export function FactBox({ kind, title, x, list, ordered, children }: { kind: BoxKind; title?: string; x?: string[]; list?: string[]; ordered?: boolean; children?: ReactNode }) {
  const b = BOX[kind];
  const Icon = b.icon;
  const List = ordered ? 'ol' : 'ul';
  return (
    <aside className={clsx('rounded-xl border p-4', b.cls)} aria-label={b.label}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Icon className={clsx('size-4 shrink-0', b.iconCls)} aria-hidden />
        <p className="text-xs font-semibold tracking-wide text-ink uppercase">{b.label}</p>
        {b.sub && <p className="text-xs text-slate-700">· {b.sub}</p>}
      </div>
      {title && <p className="mt-2 font-semibold text-ink">{title}</p>}
      <div className="mt-1.5 space-y-2 text-sm text-slate-800">
        {x?.map((p, i) => (
          <p key={i}>
            <RichText x={p} />
          </p>
        ))}
        {list && (
          <List className={clsx('space-y-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}>
            {list.map((l, i) => (
              <li key={i}>
                <RichText x={l} />
              </li>
            ))}
          </List>
        )}
        {children}
      </div>
    </aside>
  );
}
