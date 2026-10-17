import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, Gavel, Layers, List, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery, useMediaQuery, useNow } from '../app/hooks';
import { usePref } from '../app/preferences';
import { useServices } from '../app/services';
import { useSession } from '../app/session';
import { useToast } from '../app/toast';
import { EventKindTag } from '../components/property/badges';
import { buildRow, type PropertyRow } from '../components/property/rowModel';
import { Checkbox, Segmented } from '../components/ui/forms';
import { Dialog } from '../components/ui/overlay';
import { Alert, Button, Card, EmptyState, PageLoading } from '../components/ui/primitives';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { PRICE_BASIS_SHORT } from '../domain/enums';
import { capFirst, formatDateKey, formatDateKeyLong, formatDateTime, formatMonthYear, formatNOK, formatRelative, formatTime, NO_BASIS, roundBidDown } from '../lib/format';
import { localDateKey, pad2, parseDateKey } from '../lib/time';
import { cursorOfKey, isoWeekOfKey, monthWeeks, shiftMonth, type MonthCursor } from '../lib/calendarGrid';
import { eventEnd, findOverlaps } from '../lib/calendarOverlap';
import type { CalendarEvent } from '../services/types';

const KIND_STYLE: Record<CalendarEvent['kind'], { chip: string; icon: typeof Eye; label: string }> = {
  visning: { chip: 'border-sky-300 bg-sky-50 text-sky-950', icon: Eye, label: 'Visning' },
  buddag: { chip: 'border-amber-300 bg-amber-50 text-amber-950 border-dashed', icon: Gavel, label: 'Buddag (prognose)' },
  privat_visning: { chip: 'border-slate-300 bg-white text-slate-800', icon: UserRound, label: 'Privat visning' },
  importert_visning: { chip: 'border-slate-300 bg-white text-slate-800', icon: UserRound, label: 'Importert visning' },
};

const durationEnd = eventEnd;

export function CalendarPage() {
  const services = useServices();
  const { session, profile } = useSession();
  const toast = useToast();
  const now = useNow();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const uid = session?.user.id ?? 'anon';
  const events = useLiveQuery(() => services.calendar.listEvents(), []);
  const items = useLiveQuery(() => services.properties.listMine(), []);
  // Standard er vanlig månedskalender; listen er et valg som huskes per bruker.
  const [view, setView] = usePref<'month' | 'list'>(`${uid}.calendarView.v2`, 'month');
  const [kinds, setKinds] = usePref<{ visning: boolean; buddag: boolean; privat: boolean; avlyst: boolean; passert: boolean }>(`${uid}.calendarKinds`, {
    visning: true,
    buddag: true,
    privat: true,
    avlyst: false,
    passert: false,
  });
  const todayKey = localDateKey(now);
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorOfKey(todayKey));
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [open, setOpen] = useState<CalendarEvent | null>(null);

  const rows = useMemo(() => {
    const m = new Map<string, PropertyRow>();
    for (const i of items.data ?? []) m.set(i.property.id, buildRow(i, profile?.defaults ?? NEW_ACCOUNT_DEFAULTS, now));
    return m;
  }, [items.data, profile, now]);

  const filtered = useMemo(
    () =>
      (events.data ?? []).filter((e) => {
        if (e.status === 'avlyst' && !kinds.avlyst) return false;
        if (e.kind === 'visning' && !kinds.visning) return false;
        if (e.kind === 'buddag' && !kinds.buddag) return false;
        if ((e.kind === 'privat_visning' || e.kind === 'importert_visning') && !kinds.privat) return false;
        return true;
      }),
    [events.data, kinds],
  );
  const overlaps = useMemo(() => findOverlaps(events.data ?? []), [events.data]);

  const goToMonth = (c: MonthCursor) => {
    setCursor(c);
    const t = cursorOfKey(todayKey);
    setSelectedDay(t.year === c.year && t.month === c.month ? todayKey : `${c.year}-${pad2(c.month)}-01`);
  };
  const selectDay = (key: string) => {
    setSelectedDay(key);
    const c = cursorOfKey(key);
    if (c.year !== cursor.year || c.month !== cursor.month) setCursor(c);
  };

  const exportIcs = async () => {
    const f = await services.calendar.exportIcs();
    const url = URL.createObjectURL(new Blob([f.content], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = f.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ tone: 'success', title: 'Kalenderfil lastet ned', body: 'Importer .ics-filen i kalenderen din. Hendelsene har faste ID-er, så ny import oppdaterer i stedet for å duplisere.' });
  };

  if (events.loading && !events.data) return <PageLoading label="Henter kalenderen …" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kalender</h1>
          <p className="text-sm text-slate-600">Visninger og forventede buddager for objektene i listen din. Tider i norsk tid (Europe/Oslo).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Kalendervisning"
            value={view}
            onChange={setView}
            options={[
              {
                value: 'month',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-4" aria-hidden /> Kalender
                  </span>
                ),
              },
              {
                value: 'list',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <List className="size-4" aria-hidden /> Liste
                  </span>
                ),
              },
            ]}
          />
          <Button icon={<Download className="size-4" aria-hidden />} onClick={exportIcs}>
            Eksporter .ics
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3">
        <Checkbox label={<span className="inline-flex items-center gap-1"><Eye className="size-3.5 text-sky-700" aria-hidden /> Visninger</span>} checked={kinds.visning} onChange={(v) => setKinds({ ...kinds, visning: v })} />
        <Checkbox label={<span className="inline-flex items-center gap-1"><Gavel className="size-3.5 text-amber-700" aria-hidden /> Forventet buddag</span>} checked={kinds.buddag} onChange={(v) => setKinds({ ...kinds, buddag: v })} />
        <Checkbox label={<span className="inline-flex items-center gap-1"><UserRound className="size-3.5" aria-hidden /> Private</span>} checked={kinds.privat} onChange={(v) => setKinds({ ...kinds, privat: v })} />
        <Checkbox label="Avlyste" checked={kinds.avlyst} onChange={(v) => setKinds({ ...kinds, avlyst: v })} />
        {view === 'list' && <Checkbox label="Passerte" checked={kinds.passert} onChange={(v) => setKinds({ ...kinds, passert: v })} />}
      </Card>

      <Alert tone="info">
        «Forventet buddag» er Flippsjekks prognose: kl. 12:00 dagen etter siste annonserte visning. Den er ikke en bekreftet budstart eller akseptfrist – kontroller alltid med megler.
      </Alert>

      {(events.data ?? []).length === 0 ? (
        <EmptyState title="Ingen hendelser" icon={<Eye className="size-10" aria-hidden />}>
          Objektene i listen din har ingen kjente visninger ennå. Analyser en bolig, eller legg inn en privat visning på objektsiden.
        </EmptyState>
      ) : view === 'month' ? (
        <MonthView
          cursor={cursor}
          onMonth={goToMonth}
          events={filtered}
          todayKey={todayKey}
          selectedDay={selectedDay}
          onSelectDay={selectDay}
          overlaps={overlaps}
          onOpen={setOpen}
          compact={!isDesktop}
        />
      ) : (
        <ListView events={filtered.filter((e) => kinds.passert || durationEnd(e) >= now.getTime() - 3_600_000)} overlaps={overlaps} onOpen={setOpen} todayKey={todayKey} />
      )}

      <EventDialog event={open} row={open ? rows.get(open.propertyId) ?? null : null} overlaps={open ? overlaps.get(open.uid) ?? [] : []} onClose={() => setOpen(null)} now={now} />
    </div>
  );
}

function Chip({ e, overlap, onOpen }: { e: CalendarEvent; overlap: boolean; onOpen: (e: CalendarEvent) => void }) {
  const s = KIND_STYLE[e.kind];
  const Icon = s.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className={clsx('flex w-full items-center gap-1 rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight', s.chip, e.status === 'avlyst' && 'line-through opacity-60')}
      title={`${s.label}: ${e.address} ${formatTime(e.start)}`}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="num shrink-0 font-medium">{formatTime(e.start)}</span>
      <span className="truncate">{e.address}</span>
      {overlap && <Layers className="size-3 shrink-0 text-red-700" aria-label="Overlapper med annen visning" />}
      <span className="sr-only">
        {s.label}
        {e.override ? ', privat overstyring' : ''}
        {e.status === 'avlyst' ? ', avlyst' : ''}
      </span>
    </button>
  );
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    const k = localDateKey(e.start);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  return byDay;
}

function describeDay(key: string, list: CalendarEvent[], overlap: boolean): string {
  const count = (pred: (e: CalendarEvent) => boolean) => list.filter(pred).length;
  const parts: string[] = [];
  const v = count((e) => e.kind === 'visning');
  const b = count((e) => e.kind === 'buddag');
  const p = count((e) => e.kind === 'privat_visning' || e.kind === 'importert_visning');
  if (v) parts.push(`${v} ${v === 1 ? 'visning' : 'visninger'}`);
  if (b) parts.push(`${b} forventet buddag`);
  if (p) parts.push(`${p} privat${p === 1 ? '' : 'e'}`);
  if (overlap) parts.push('overlappende visninger');
  return `${capFirst(formatDateKeyLong(key))}: ${parts.length ? parts.join(', ') : 'ingen hendelser'}`;
}

const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const WEEKDAYS_LONG = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];

/** Vanlig månedskalender: uker nedover, mandag–søndag bortover. */
function MonthView({
  cursor,
  onMonth,
  events,
  todayKey,
  selectedDay,
  onSelectDay,
  overlaps,
  onOpen,
  compact,
}: {
  cursor: MonthCursor;
  onMonth: (c: MonthCursor) => void;
  events: CalendarEvent[];
  todayKey: string;
  selectedDay: string;
  onSelectDay: (key: string) => void;
  overlaps: Map<string, CalendarEvent[]>;
  onOpen: (e: CalendarEvent) => void;
  compact: boolean;
}) {
  const weeks = monthWeeks(cursor.year, cursor.month);
  const byDay = groupByDay(events);
  const today = cursorOfKey(todayKey);
  const isCurrentMonth = today.year === cursor.year && today.month === cursor.month;
  const selectedList = byDay.get(selectedDay) ?? [];
  const monthCount = events.filter((e) => {
    const c = cursorOfKey(localDateKey(e.start));
    return c.year === cursor.year && c.month === cursor.month;
  }).length;
  const maxChips = 4;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-2 sm:px-4">
          <Button size="sm" variant="ghost" icon={<ChevronLeft className="size-4" aria-hidden />} onClick={() => onMonth(shiftMonth(cursor, -1))} aria-label="Forrige måned" />
          <div className="flex flex-col items-center sm:flex-row sm:gap-3">
            <h2 className="text-base font-semibold" aria-live="polite">
              {formatMonthYear(cursor.year, cursor.month)}
            </h2>
            <span className="text-xs text-slate-600">
              {monthCount} {monthCount === 1 ? 'hendelse' : 'hendelser'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!isCurrentMonth && (
              <Button size="sm" variant="subtle" onClick={() => onMonth(today)}>
                I dag
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<ChevronRight className="size-4" aria-hidden />} onClick={() => onMonth(shiftMonth(cursor, 1))} aria-label="Neste måned" />
          </div>
        </div>
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            Månedskalender for {formatMonthYear(cursor.year, cursor.month)}. Uker nedover, mandag til søndag bortover. Velg en dag for å se hendelsene.
          </caption>
          <thead className="bg-slate-50 text-xs font-medium text-slate-600">
            <tr className="border-b border-slate-200">
              <th scope="col" className="hidden w-10 py-1.5 text-center font-medium sm:table-cell">
                Uke
              </th>
              {WEEKDAYS.map((d, i) => (
                <th key={d} scope="col" className={clsx('py-1.5 text-center font-medium', i >= 5 && 'text-slate-500')}>
                  <abbr title={WEEKDAYS_LONG[i]} className="no-underline">
                    {d}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]} className="border-b border-slate-100 last:border-b-0">
                <th scope="row" className="hidden border-r border-slate-100 bg-slate-50/60 align-top text-[11px] font-medium text-slate-500 sm:table-cell">
                  <span className="sr-only">Uke </span>
                  <span className="mt-1.5 block text-center">{isoWeekOfKey(week[0])}</span>
                </th>
                {week.map((k, i) => {
                  const inMonth = cursorOfKey(k).month === cursor.month;
                  const list = byDay.get(k) ?? [];
                  const dayOverlap = list.some((e) => overlaps.has(e.uid));
                  const isToday = k === todayKey;
                  const isSelected = k === selectedDay;
                  const dayNumber = (
                    <span
                      className={clsx(
                        'inline-flex size-6 items-center justify-center rounded-full text-xs',
                        isToday ? 'bg-pine-800 font-bold text-white' : inMonth ? (i >= 5 ? 'text-slate-500' : 'text-slate-800') : 'text-slate-400',
                      )}
                    >
                      {parseDateKey(k).day}
                    </span>
                  );
                  return (
                    <td
                      key={k}
                      className={clsx(
                        'border-r border-slate-100 align-top last:border-r-0',
                        !inMonth && 'bg-slate-50/70',
                        isSelected && 'bg-pine-50/70',
                        compact ? 'h-16 p-0' : 'h-28 p-1',
                      )}
                    >
                      {compact ? (
                        <button
                          type="button"
                          onClick={() => onSelectDay(k)}
                          aria-pressed={isSelected}
                          aria-label={`${isToday ? 'I dag, ' : ''}${describeDay(k, list, dayOverlap)}`}
                          className={clsx('flex h-full w-full flex-col items-center gap-1 px-0.5 pt-1', isSelected && 'ring-2 ring-inset ring-pine-700')}
                        >
                          {dayNumber}
                          <span className="flex flex-wrap items-center justify-center gap-0.5" aria-hidden>
                            {list.slice(0, 3).map((e) => {
                              const Icon = KIND_STYLE[e.kind].icon;
                              return (
                                <Icon
                                  key={e.uid}
                                  className={clsx(
                                    'size-3',
                                    e.kind === 'visning' ? 'text-sky-700' : e.kind === 'buddag' ? 'text-amber-700' : 'text-slate-600',
                                    e.status === 'avlyst' && 'opacity-40',
                                  )}
                                />
                              );
                            })}
                            {list.length > 3 && <span className="text-[10px] leading-none text-slate-600">+{list.length - 3}</span>}
                            {dayOverlap && <Layers className="size-3 text-red-700" />}
                          </span>
                        </button>
                      ) : (
                        <div className="flex h-full flex-col">
                          <div className="mb-1 flex items-center justify-between">
                            {dayOverlap ? <Layers className="size-3 text-red-700" aria-label="Overlappende visninger denne dagen" /> : <span />}
                            <button
                              type="button"
                              onClick={() => onSelectDay(k)}
                              aria-pressed={isSelected}
                              aria-label={`${isToday ? 'I dag, ' : ''}${describeDay(k, list, dayOverlap)}`}
                              className="rounded-full hover:ring-2 hover:ring-pine-200"
                            >
                              {dayNumber}
                            </button>
                          </div>
                          <div className="space-y-0.5">
                            {list.slice(0, maxChips).map((e) => (
                              <Chip key={e.uid} e={e} overlap={overlaps.has(e.uid)} onOpen={onOpen} />
                            ))}
                            {list.length > maxChips && (
                              <button type="button" onClick={() => onSelectDay(k)} className="text-[11px] font-medium text-pine-800 hover:underline">
                                +{list.length - maxChips} til
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section aria-labelledby="valgt-dag" aria-live="polite">
        <h2 id="valgt-dag" className="mb-1.5 text-sm font-semibold">
          {capFirst(formatDateKeyLong(selectedDay))}
          {selectedDay === todayKey && <span className="ml-2 rounded bg-pine-800 px-1.5 py-0.5 text-[11px] font-medium text-white">I dag</span>}
        </h2>
        {selectedList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">Ingen hendelser denne dagen. Velg en annen dag i kalenderen.</p>
        ) : (
          <ul className="space-y-2">
            {selectedList.map((e) => (
              <li key={e.uid}>
                <EventRow e={e} overlap={overlaps.get(e.uid)} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EventRow({ e, overlap, onOpen }: { e: CalendarEvent; overlap: CalendarEvent[] | undefined; onOpen: (e: CalendarEvent) => void }) {
  return (
    <button type="button" onClick={() => onOpen(e)} className="w-full text-left">
      <Card className={clsx('flex flex-wrap items-center gap-3 p-3 hover:shadow-md', e.status === 'avlyst' && 'opacity-60')}>
        <span className="num w-24 shrink-0 text-sm font-semibold">
          {formatTime(e.start)}
          {e.end && <span className="font-normal text-slate-500">–{formatTime(e.end)}</span>}
        </span>
        <EventKindTag kind={e.kind} />
        <span className={clsx('min-w-0 flex-1 font-medium', e.status === 'avlyst' && 'line-through')}>{e.address}</span>
        {e.status === 'avlyst' && <span className="text-xs font-medium text-slate-600">Avlyst</span>}
        {e.override && <span className="text-xs font-medium text-violet-800">Privat overstyring</span>}
        {e.prognosis?.nonBusinessDay && !e.override && <span className="text-xs font-medium text-amber-800">{e.prognosis.nonBusinessDay} – sjekk med megler</span>}
        {overlap && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-800">
            <Layers className="size-3.5" aria-hidden /> Overlapper med {overlap.map((x) => x.address).join(', ')}
          </span>
        )}
      </Card>
    </button>
  );
}

function ListView({ events, overlaps, onOpen, todayKey }: { events: CalendarEvent[]; overlaps: Map<string, CalendarEvent[]>; onOpen: (e: CalendarEvent) => void; todayKey: string }) {
  const groups = groupByDay(events);
  if (groups.size === 0) return <EmptyState title="Ingen kommende hendelser med disse valgene" />;
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([k, list]) => (
        <section key={k} aria-labelledby={`day-${k}`}>
          <h2 id={`day-${k}`} className="mb-1.5 text-sm font-semibold">
            {capFirst(formatDateKeyLong(k))}
            {k === todayKey && <span className="ml-2 rounded bg-pine-800 px-1.5 py-0.5 text-[11px] font-medium text-white">I dag</span>}
          </h2>
          <ul className="space-y-2">
            {list.map((e) => (
              <li key={e.uid}>
                <EventRow e={e} overlap={overlaps.get(e.uid)} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EventDialog({ event: e, row, overlaps, onClose, now }: { event: CalendarEvent | null; row: PropertyRow | null; overlaps: CalendarEvent[]; onClose: () => void; now: Date }) {
  if (!e) return <Dialog open={false} onClose={onClose} title="" />;
  const s = KIND_STYLE[e.kind];
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${s.label}: ${e.address}`}
      footer={
        <>
          <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 text-sm text-pine-800 underline">
            Åpne annonsen <ExternalLink className="size-3" aria-hidden />
          </a>
          <Link to={`/objekter/${e.propertyId}?fane=visninger`} className="inline-flex h-10 items-center rounded-lg bg-pine-800 px-4 text-sm font-medium text-white hover:bg-pine-900">
            Til objektet
          </Link>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <EventKindTag kind={e.kind} />
          {e.status === 'avlyst' && <span className="font-medium text-slate-600">Avlyst</span>}
          {e.isDemo && <span className="text-xs text-violet-800">Demodata</span>}
        </div>
        <p className="text-base font-semibold">
          {formatDateTime(e.start)}
          {e.end && `–${formatTime(e.end)}`}
        </p>
        {e.kind === 'buddag' && (
          <Alert tone="warning" title="Prognose – ikke bekreftet budstart">
            {e.prognosis ? (
              <p>
                Beregnet som kl. 12:00 dagen etter siste annonserte visning ({formatDateTime(e.prognosis.basedOnViewingStart)}).
                {e.prognosis.nonBusinessDay && ` Dagen er ${e.prognosis.nonBusinessDay}; første virkedag etter visningen er ${formatDateKey(e.prognosis.firstBusinessDayAfterViewing)}. Kontroller med megler.`}
              </p>
            ) : (
              <p>Ingen kjent offisiell visning – bare din private overstyring.</p>
            )}
            {e.override && (
              <p>
                Privat overstyring: {e.override.note || 'uten notat'} (kildeprognose: {e.prognosis ? formatDateTime(e.prognosis.start) : 'ingen'}).
              </p>
            )}
          </Alert>
        )}
        {overlaps.length > 0 && (
          <Alert tone="warning" title="Overlapper med">
            {overlaps.map((o) => `${o.address} ${formatTime(o.start)}`).join(', ')}
          </Alert>
        )}
        <p className="text-xs text-slate-600">
          {e.sourceLabel}
          {e.verifiedAt && ` · sist kontrollert ${formatRelative(e.verifiedAt, now)}`}
          {e.note && ` · ${e.note}`}
        </p>
        {row && (
          <dl className="num grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
            <div>
              <dt className="text-xs text-slate-600">Min kjøpspris</dt>
              <dd className="font-medium">{formatNOK(row.purchase)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Modellert maksbud</dt>
              <dd className="font-medium">{row.maxBidStatus === 'none' ? 'Ingen gjennomførbar pris' : formatNOK(roundBidDown(row.maxBid), NO_BASIS)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Forventet salgspris {row.saleBasis ? `(${PRICE_BASIS_SHORT[row.saleBasis]})` : ''}</dt>
              <dd className="font-medium">{formatNOK(row.saleBase, NO_BASIS)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Fortjeneste før skatt</dt>
              <dd className="font-semibold">{formatNOK(row.profit, NO_BASIS)}</dd>
            </div>
            <p className="col-span-2 text-[11px] text-slate-500">Fra scenarioet «{row.scenarioName ?? 'grunnanalyse'}».</p>
          </dl>
        )}
      </div>
    </Dialog>
  );
}
