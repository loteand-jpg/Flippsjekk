import { Download, Printer, RotateCcw } from 'lucide-react';
import { Checkbox } from '../../components/ui/forms';
import { Button } from '../../components/ui/primitives';
import { COURSE_CHECKED, COURSE_TITLE } from '../types';
import { downloadText, escapeHtml, printHtml } from '../print';
import { useCourse } from '../progress';

export interface ChecklistGroup {
  title: string;
  items: { id: string; label: string }[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '');
const mk = (prefix: string, title: string, items: string[]): ChecklistGroup => ({
  title,
  items: items.map((label) => ({ id: `${prefix}-${slug(label)}`, label })),
});

export const BEFORE_BID: ChecklistGroup[] = [
  mk('bb-eiendom', 'Eiendommen', ['Eierform avklart', 'Fellesgjeld forstått', 'Felleskostnader forstått', 'Godkjent rombruk kontrollert', 'Plantegninger kontrollert']),
  mk('bb-dok', 'Dokumenter', [
    'Salgsoppgave lest',
    'Egenerklæring lest',
    'Tilstandsrapport lest',
    'Vedtekter lest',
    'Regnskap/budsjett lest',
    'Protokoller lest',
    'Vedlikeholdsplan kontrollert',
  ]),
  mk('bb-tek', 'Teknisk', ['Bad vurdert', 'El vurdert', 'Vann og avløp vurdert', 'Ventilasjon vurdert', 'Relevant konstruksjonsrisiko vurdert', 'Hus: tak/drenering/grunnmur der relevant']),
  mk('bb-marked', 'Marked', ['Sammenlignbare faktiske salg', 'Aktive konkurrenter', 'Liggetid', 'Meglerinnspill', 'Lav/base/høy salgsverdi']),
  mk('bb-prosjekt', 'Prosjekt', ['Tiltaksplan', 'Kostnadsbudsjett', 'Reserve', 'Fagfolk', 'Egne timer', 'Prosjektlengde']),
  mk('bb-okn', 'Økonomi', ['Finansiering', 'Rente', 'Løpende kostnader', 'Salgskostnader', 'Skatt vurdert', 'Stresstest', 'Fortjenestemål', 'Maksbud']),
];

export const DOC_CHECKLIST: ChecklistGroup[] = [
  mk('dc', 'Dokumentér hvert tiltak', [
    'Før-bilder',
    'Etter-bilder',
    'Faktura',
    'Kvittering',
    'Hva som eksisterte tidligere',
    'Hva som ble gjort',
    'Materialer',
    'Håndverker',
    'Dato',
    'Eventuell kontrakt',
    'Samsvarserklæring',
    'Våtromsdokumentasjon',
    'Timer hvis egeninnsats skal dokumenteres',
    'Forklaring på hvilken del som eventuelt er standardheving',
  ]),
];

export function checklistText(title: string, groups: ChecklistGroup[], checked: string[]): string {
  const lines = [title, `Faglig kontrollert: ${COURSE_CHECKED}. Regler, renter, priser og markedsforhold kan endres.`, ''];
  for (const g of groups) {
    if (groups.length > 1) lines.push(g.title.toUpperCase());
    for (const i of g.items) lines.push(`${checked.includes(i.id) ? '[x]' : '[ ]'} ${i.label}`);
    lines.push('');
  }
  lines.push('Din avkrysning er en privat bekreftelse. Den gjør ikke en opplysning dokumentert.');
  return lines.join('\n');
}

export function checklistHtml(title: string, groups: ChecklistGroup[], checked: string[]): string {
  const body = groups
    .map(
      (g) =>
        `${groups.length > 1 ? `<h2>${escapeHtml(g.title)}</h2>` : ''}<ul>${g.items
          .map((i) => `<li><span class="box">${checked.includes(i.id) ? '☑' : '☐'}</span>${escapeHtml(i.label)}</li>`)
          .join('')}</ul>`,
    )
    .join('');
  return `<h1>${escapeHtml(title)}</h1><p class="meta">Flippsjekk – ${COURSE_TITLE} · Faglig kontrollert: ${COURSE_CHECKED}</p>${body}<p class="note">Regler, renter, priser og markedsforhold kan endres. Avkrysningen er din private bekreftelse og gjør ikke en opplysning dokumentert. Kurset gir generell opplæring og ingen garanti for fortjeneste.</p>`;
}

export function ChecklistWidget({ id: key, title, groups, filename }: { id: string; title: string; groups: ChecklistGroup[]; filename: string }) {
  const { state, update } = useCourse();
  const all = groups.flatMap((g) => g.items.map((i) => i.id));
  const list = state.checks[key] ?? [];
  const toggle = (id: string, on: boolean) => update((s) => ({ ...s, checks: { ...s.checks, [key]: on ? [...new Set([...(s.checks[key] ?? []), id])] : (s.checks[key] ?? []).filter((x) => x !== id) } }));
  const count = all.filter((id) => list.includes(id)).length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold">{title}</h4>
          <p className="text-xs text-slate-600" aria-live="polite">
            {count} av {all.length} avkrysset · lagres på din enhet
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={() => printHtml(title, checklistHtml(title, groups, list))}>
            Skriv ut
          </Button>
          <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={() => downloadText(filename, checklistText(title, groups, list))}>
            Last ned
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => update((s) => ({ ...s, checks: { ...s.checks, [key]: [] } }))}>
            Nullstill
          </Button>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-slate-100" role="img" aria-label={`${count} av ${all.length} avkrysset`}>
        <div className="h-1.5 rounded-full bg-[var(--color-series-1)]" style={{ width: `${(count / all.length) * 100}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <fieldset key={g.title} className={groups.length === 1 ? 'md:col-span-3 md:columns-2' : undefined}>
            <legend className="mb-2 text-sm font-semibold">{g.title}</legend>
            <div className="space-y-2">
              {g.items.map((i) => (
                <Checkbox key={i.id} label={i.label} checked={list.includes(i.id)} onChange={(v) => toggle(i.id, v)} />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

export const BeforeBidChecklist = () => <ChecklistWidget id="beforeBid" title="Før-bud-sjekkliste" groups={BEFORE_BID} filename="flippsjekk-for-bud-sjekkliste.txt" />;

/** Verktøyknapp som åpner før-bud-sjekklisten fra relevante sider. */
export function BeforeBidButton() {
  const { setChecklistOpen, state } = useCourse();
  const total = BEFORE_BID.reduce((n, g) => n + g.items.length, 0);
  const count = BEFORE_BID.flatMap((g) => g.items).filter((i) => (state.checks.beforeBid ?? []).includes(i.id)).length;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-pine-300 bg-pine-50 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Før-bud-sjekklisten</p>
        <p className="text-sm text-slate-700">{count} av {total} avkrysset. Åpne listen, kryss av og skriv den ut når du vil.</p>
      </div>
      <Button variant="primary" onClick={() => setChecklistOpen(true)}>
        Åpne sjekklisten
      </Button>
    </div>
  );
}
export const DocChecklist = () => <ChecklistWidget id="docs" title="Dokumentasjon per tiltak" groups={DOC_CHECKLIST} filename="flippsjekk-dokumentasjon-per-tiltak.txt" />;
