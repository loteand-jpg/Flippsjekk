import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PRIORITY_LABEL, WORK_MODE_LABEL, LABOR_CATEGORY_LABEL, type Priority } from '../../../domain/enums';
import { formatHours, formatMonths, formatNOK } from '../../../lib/format';
import { groupByRoom, groupByWork, sequence, totalOf, type Group, type ItemView, type LaborContext } from '../model/rooms';
import type { VersionView } from '../model/versions';
import { Fig, Section, Tag } from '../ui';
import type { Tone } from '../../shared/present';

type Mode = 'rom' | 'arbeid' | 'rekkefolge';
const MODES: { id: Mode; label: string; short: string; hint: string }[] = [
  { id: 'rom', label: 'Etter rom', short: 'Rom', hint: 'Hvor i boligen arbeidet skjer.' },
  { id: 'arbeid', label: 'Etter arbeidstype', short: 'Arbeidstype', hint: 'Hvilke fag og typer arbeid det gjelder.' },
  { id: 'rekkefolge', label: 'Mulig rekkefølge', short: 'Rekkefølge', hint: 'Arbeidstypene i veiledende rekkefølge.' },
];

const PRIORITY_TONE: Record<Priority, Tone> = { pakrevd: 'neg', anbefalt: 'warn', verdiokende: 'pos', valgfri: 'neutral' };

function ItemRow({ v }: { v: ItemView }) {
  const { item, econ } = v;
  const out = !item.included;
  return (
    <li className={clsx('grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5', out && 'opacity-70')} data-testid="prop-item">
      <div className="min-w-0">
        <p className={clsx('text-sm font-medium break-words', out && 'line-through')}>{item.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
          <Tag tone={PRIORITY_TONE[item.priority]} className="!py-0">{PRIORITY_LABEL[item.priority]}</Tag>
          {item.laborCategory && <span>{LABOR_CATEGORY_LABEL[item.laborCategory]}</span>}
          {econ.mode && <span>· {WORK_MODE_LABEL[econ.mode].toLowerCase()}{econ.downgraded ? ' (regnes som innleid: kompetanse ikke bekreftet)' : ''}</span>}
          {out && <span className="font-semibold">· ikke med i kalkylen</span>}
        </p>
        {item.note && <p className="mt-0.5 text-xs text-slate-600">{item.note}</p>}
      </div>
      <div className="text-right">
        <Fig className="text-sm font-semibold">{econ.cost === null ? <span className="text-xs font-medium text-slate-600">Kostnad ikke avklart</span> : formatNOK(econ.cost)}</Fig>
        <span className="block text-xs text-slate-600">{econ.ownHours === null ? 'timer ikke avklart' : econ.ownHours === 0 ? 'ingen egne timer' : `${formatHours(econ.ownHours)} egne`}</span>
      </div>
    </li>
  );
}

function GroupCard({ g, open, onToggle, step }: { g: Group; open: boolean; onToggle: () => void; step?: number }) {
  return (
    <li className="min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)]" data-testid="prop-group">
      <h3 className="m-0">
        <button type="button" aria-expanded={open} aria-controls={`${g.id}-items`} onClick={onToggle} className="flex w-full min-w-0 items-start gap-3 rounded-2xl p-4 text-left hover:bg-[var(--prop-sand-2)]/60">
          {step !== undefined && <span className="prop-serif flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--prop-sand)] text-base" aria-hidden>{step}</span>}
          <span className="min-w-0 flex-1">
            <span className="prop-serif block text-[1.1875rem] leading-snug break-words">{step !== undefined && <span className="sr-only">Steg {step}: </span>}{g.label}</span>
            <span className="mt-0.5 block text-xs text-slate-700">
              {g.includedCount} tiltak{g.excludedCount > 0 ? ` (+${g.excludedCount} ikke med)` : ''}
              {g.byPriority.pakrevd > 0 ? ` · ${g.byPriority.pakrevd} påkrevd${g.byPriority.pakrevd === 1 ? '' : 'e'}` : ''}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <Fig className="block text-base font-semibold">{g.cost === null ? <span className="text-xs font-medium text-slate-600">Kostnad ikke avklart</span> : formatNOK(g.cost)}</Fig>
            <span className="block text-xs text-slate-600">{g.ownHours === null ? 'timer ikke avklart' : `${formatHours(g.ownHours)} egne`}</span>
          </span>
          <ChevronDown className={clsx('mt-1 size-4 shrink-0 text-slate-600 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </h3>
      {open && (
        <ul id={`${g.id}-items`} className="divide-y divide-[var(--prop-line)] border-t border-[var(--prop-line)] px-4">
          {g.items.map((v) => (
            <ItemRow key={v.item.id} v={v} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * «Hva må gjøres?»: oppussingen for versjonen som vises, gruppert etter rom, arbeidstype eller i veiledende rekkefølge. Alt er
 * tiltakene i datamodellen og motorens tiltaksøkonomi – summene stemmer med kalkylen. Rekkefølgen er ikke en tidsplan.
 */
export function RenovationSection({ view, labor }: { view: VersionView; labor: Partial<LaborContext> }) {
  const [mode, setMode] = useState<Mode>('rom');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const v = view.row.values;
  const b = view.b;
  const lump = v.renovationMode === 'rundsum';
  const groups = useMemo(() => (mode === 'arbeid' ? groupByWork(v.renovationItems, labor) : groupByRoom(v.renovationItems, labor)), [mode, v.renovationItems, labor]);
  const seq = useMemo(() => sequence(v.renovationItems, labor), [v.renovationItems, labor]);
  const shown: Group[] = mode === 'rekkefolge' ? seq.steps : groups;
  const total = useMemo(() => totalOf(mode === 'rekkefolge' ? [...seq.steps, ...(seq.unplaced ? [seq.unplaced] : [])] : groups), [mode, groups, seq]);
  const toggle = (id: string) => setOpenIds((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));
  const allIds = [...shown, ...(mode === 'rekkefolge' && seq.unplaced ? [seq.unplaced] : [])].map((g) => g.id);
  const allOpen = allIds.length > 0 && allIds.every((id) => openIds.has(id));

  return (
    <Section id="oppussing" eyebrow="3 · Hva må gjøres?" title="Oppussingen, rom for rom" intro={`Tiltakene i ${view.short === 'Basis' ? 'Basis' : view.short}, ordnet slik du vil ha dem. Kostnader er grove anslag fra analysen – ikke pristilbud.`}>
      {lump ? (
        <p className="rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-5 text-sm text-slate-800" data-testid="prop-renovation-lump">
          Oppussingen er oppgitt som en rundsum på <Fig className="font-semibold">{formatNOK(v.renovationLumpSum)}</Fig> uten enkelttiltak, så den kan ikke fordeles på rom eller arbeidstype.
        </p>
      ) : v.renovationItems.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--prop-line-strong)] p-5 text-sm text-slate-800" data-testid="prop-renovation-empty">
          Ingen tiltak er registrert for denne versjonen. Det betyr ikke at boligen ikke trenger oppussing – bare at ingen er vurdert.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Grupper oppussingen" className="grid w-full grid-cols-3 gap-1 rounded-xl bg-[var(--prop-sand)] p-1 sm:inline-flex sm:w-auto">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => setMode(m.id)}
                  data-testid={`prop-reno-mode-${m.id}`}
                  className={clsx('min-h-11 rounded-lg px-2 text-sm font-medium sm:px-3', mode === m.id ? 'bg-[var(--prop-paper)] text-ink shadow-sm' : 'text-slate-700 hover:bg-[var(--prop-sand-2)]')}
                >
                  <span className="sm:hidden">{m.short}</span>
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setOpenIds(allOpen ? new Set() : new Set(allIds))} className="inline-flex min-h-11 items-center text-sm font-medium text-pine-700 underline">
              {allOpen ? 'Skjul alle tiltak' : 'Vis alle tiltak'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">{MODES.find((m) => m.id === mode)?.hint}</p>
          {mode === 'rekkefolge' && (
            <p className="mt-2 rounded-xl bg-[var(--prop-sand-2)] px-3 py-2 text-xs text-slate-800" data-testid="prop-sequence-note">
              Veiledende rekkefølge etter arbeidstype (typisk: riving, rør og elektro, våtrom, snekker, kjøkken, maling, gulv). Dette er ikke en tidsplan: analysen anslår ingen varighet per steg. Samlet prosjekttid i kalkylen er{' '}
              <strong>{formatMonths(b?.months ?? null, 'ikke avklart')}</strong>.
            </p>
          )}
          <ol className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2" data-testid="prop-groups">
            {shown.map((g) => (
              <GroupCard key={g.id} g={g} open={openIds.has(g.id)} onToggle={() => toggle(g.id)} step={mode === 'rekkefolge' ? (g as Group & { step: number }).step : undefined} />
            ))}
          </ol>
          {mode === 'rekkefolge' && seq.unplaced && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-slate-700">Tiltak uten arbeidstype kan ikke plasseres i rekkefølgen:</p>
              <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
                <GroupCard g={seq.unplaced} open={openIds.has(seq.unplaced.id)} onToggle={() => toggle(seq.unplaced!.id)} />
              </ol>
            </div>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-[var(--prop-sand-2)] p-4 text-sm sm:grid-cols-4" data-testid="prop-reno-total">
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">Oppussing før reserve</dt>
              <dd className="prop-fig mt-0.5 font-semibold" data-testid="prop-reno-sum">{total.cost === null ? 'Ikke avklart' : formatNOK(total.cost)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">{v.reservePct === null ? 'Reserve' : `Reserve (${v.reservePct.toLocaleString('nb-NO')} %)`}</dt>
              <dd className="prop-fig mt-0.5 font-semibold">{b ? formatNOK(b.reserve) : 'Ikke beregnet'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">Oppussing inkl. reserve</dt>
              <dd className="prop-fig mt-0.5 font-semibold">{b ? formatNOK(b.RB) : 'Ikke beregnet'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">Egne timer</dt>
              <dd className="prop-fig mt-0.5 font-semibold">{total.ownHours === null ? 'Ikke avklart' : formatHours(total.ownHours)}</dd>
            </div>
          </dl>
        </>
      )}
    </Section>
  );
}
