import { CalendarClock, Camera, ClipboardList, FileQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateTime } from '../../../lib/format';
import { DocumentImages } from '../media/Media';
import type { ListingMedia } from '../media/types';
import type { PackItem, ViewingPack } from '../model/viewing';
import { Section } from '../ui';

const storageKey = (propertyId: string) => `prop.viewing.${propertyId}`;

/** Avkryssing som lagres i nettleseren (kun for deg) – nyttig når siden åpnes igjen på visning. Fungerer uten lagring også. */
function useTicks(propertyId: string) {
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(propertyId));
      setTicks(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setTicks(new Set());
    }
  }, [propertyId]);
  const toggle = (key: string) =>
    setTicks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(storageKey(propertyId), JSON.stringify([...next]));
      } catch {
        /* privat modus eller blokkert lagring: avkryssingen gjelder bare nå */
      }
      return next;
    });
  return { ticks, toggle };
}

function Checklist({ title, icon: Icon, items, empty, ticks, toggle, prefix, testId }: { title: string; icon: typeof ClipboardList; items: PackItem[]; empty: string; ticks: Set<string>; toggle: (k: string) => void; prefix: string; testId: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4" data-testid={testId}>
      <h3 className="prop-serif flex items-center gap-2 text-[1.125rem]">
        <Icon className="size-[18px] text-[var(--prop-blue)]" aria-hidden /> {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((i) => {
            const key = `${prefix}:${i.text}`;
            const id = `${testId}-${items.indexOf(i)}`;
            return (
              <li key={key}>
                <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-1.5 hover:bg-[var(--prop-sand-2)]">
                  <input id={id} type="checkbox" checked={ticks.has(key)} onChange={() => toggle(key)} className="mt-0.5 shrink-0 accent-[var(--prop-green)]" />
                  <span className="min-w-0 text-sm">
                    <span className={ticks.has(key) ? 'text-slate-600 line-through' : ''}>{i.text}</span>
                    {i.context && <span className="block text-xs text-slate-600">{i.context}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * «Ta med på visning»: huskeliste fra risikoenes tiltak, sjekklistepunkter som mangler dokumentasjon og kravene til versjonen. Samme
 * innhold som analysen allerede har – bare samlet der du trenger det på visning. Avkryssing lagres kun i din nettleser.
 */
export function ViewingSection({ propertyId, pack, nextViewing, media, onOpenViewings }: { propertyId: string; pack: ViewingPack; nextViewing: { start: string; end: string | null } | null; media: ListingMedia; onOpenViewings: () => void }) {
  const { ticks, toggle } = useTicks(propertyId);
  const total = pack.lookFor.length + pack.ask.length + pack.clarify.length;
  const done = [...pack.lookFor.map((i) => `se:${i.text}`), ...pack.ask.map((i) => `be:${i.text}`), ...pack.clarify.map((i) => `avklar:${i.text}`)].filter((k) => ticks.has(k)).length;
  return (
    <Section
      id="visning"
      eyebrow="8 · Ta med på visning"
      title="Huskeliste til visning"
      intro="Det du bør se etter, be om og avklare før du byr – samlet fra analysen."
      action={
        <p className="text-sm text-slate-700" data-testid="prop-next-viewing">
          <CalendarClock className="mr-1.5 inline size-4 align-text-bottom" aria-hidden />
          {nextViewing ? <>Neste visning <strong>{formatDateTime(nextViewing.start)}</strong></> : 'Ingen kjent visning'}
          <button type="button" onClick={onOpenViewings} className="ml-3 inline-flex min-h-11 items-center font-medium text-pine-700 underline">
            Visninger og bud
          </button>
        </p>
      }
    >
      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--prop-line-strong)] p-4 text-sm text-slate-800" data-testid="prop-viewing-empty">
          Analysen har ingen punkter å ta med. Det betyr ikke at alt er avklart – sjekk salgsoppgaven og tilstandsrapporten selv.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-700" aria-live="polite" data-testid="prop-viewing-progress">
            {done} av {total} avkrysset
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
            <Checklist testId="prop-look-for" title="Se etter" icon={Camera} items={pack.lookFor} empty="Ingen risikoer med tiltak." ticks={ticks} toggle={toggle} prefix="se" />
            <Checklist testId="prop-ask-for" title="Be om dokumenter" icon={FileQuestion} items={pack.ask} empty="Sjekklisten har ingen punkter som mangler." ticks={ticks} toggle={toggle} prefix="be" />
            <Checklist testId="prop-clarify" title="Avklar før bud" icon={ClipboardList} items={pack.clarify} empty="Ingen krav eller forutsetninger registrert." ticks={ticks} toggle={toggle} prefix="avklar" />
          </div>
        </>
      )}
      {media.documentImages.length > 0 && (
        <div className="mt-5">
          <h3 className="prop-serif mb-2 text-[1.125rem]">Dokumentbilder</h3>
          <DocumentImages items={media.documentImages} />
        </div>
      )}
    </Section>
  );
}
