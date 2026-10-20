import clsx from 'clsx';
import { Archive, ArrowDown, ArrowUp, CalendarClock, ChevronsUpDown, Download, FileJson, Inbox, Search, SearchX, SlidersHorizontal, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery, useMediaQuery, useNow } from '../../app/hooks';
import { usePref } from '../../app/preferences';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { RecommendationBadge, SaleStatusBadge } from '../../components/property/badges';
import { AnalyzeBox } from '../../components/property/AnalyzeBox';
import { activeFilterCount, applyFilters, EMPTY_FILTERS, SORT_LABEL, sortRows, type ListFilters, type SortKey } from '../../components/property/listLogic';
import { FilterPanel } from '../../components/property/ListViews';
import { buildRow, isArchiveRow, type PropertyRow } from '../../components/property/rowModel';
import { Segmented, Select, TextInput } from '../../components/ui/forms';
import { Alert, Button, buttonClass, EmptyState, PageLoading } from '../../components/ui/primitives';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { RISK_BAND_LABEL } from '../../domain/assessment';
import { PROPERTY_TYPE_LABEL, WORK_STATUS_LABEL } from '../../domain/enums';
import { formatArea, formatDateTimeCompact, formatNOK, formatPct, NO_BASIS } from '../../lib/format';
import type { SortDirection } from '../../lib/sort';
import { floorToThousand, profitTone } from '../shared/present';
import { Fig, Panel, Tag, TONE_TEXT, TONE_TEXT_DARK } from './ui';

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Beløp i tabellen uten «kr» (kolonnetittelen sier kr). Ukjent er tekst, aldri 0. */
function Money({ value, row, strong, signed, unit = true }: { value: number | null; row: PropertyRow; strong?: boolean; signed?: boolean; unit?: boolean }) {
  if (value === null) {
    return (
      <span className="text-xs font-normal text-slate-500" title={row.missing.length ? `Mangler: ${row.missing.join(', ')}` : undefined}>
        {row.calcStatus === 'pending' ? 'Analyse pågår' : NO_BASIS}
      </span>
    );
  }
  const text = formatNOK(value);
  return <Fig className={clsx(strong && 'font-semibold', signed && TONE_TEXT[profitTone(value)])}>{unit ? text : text.replace(/\s?kr$/, '')}</Fig>;
}

function RiskText({ r }: { r: PropertyRow }) {
  const label = r.riskScore === null ? 'Uavklart' : `${RISK_BAND_LABEL[r.riskBand]} ${r.riskScore}/10`;
  return (
    <span className={clsx('text-[13px]', r.riskBand === 'hoy' && 'font-semibold text-[var(--inv-neg)]')} title={r.riskUnknown ? `${r.riskUnknown} risiko(er) med ukjent alvorlighet` : undefined}>
      {label}
      {r.riskUnknown ? <span className="text-slate-500"> +{r.riskUnknown}</span> : null}
    </span>
  );
}

/** Liten stolpe som viser verdien relativt til største i listen. Tallet står alltid ved siden av. */
function Bar({ value, max, tone = 'pos' }: { value: number | null; max: number; tone?: 'pos' | 'info' }) {
  if (value === null || max <= 0) return <span className="block h-1" aria-hidden />;
  const w = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
  return (
    <span className="mt-1 block h-1 w-full rounded-full bg-slate-200/80" aria-hidden>
      <span className="inv-bar block h-full rounded-full" style={{ width: `${w}%`, background: value < 0 ? 'var(--viz-down)' : tone === 'pos' ? 'var(--viz-up)' : 'var(--viz-1)' }} />
    </span>
  );
}

function hourlyText(r: PropertyRow): { text: string; unknown: boolean; low: boolean } {
  if (r.profitPerOwnHour === null) return { text: r.ownHours === 0 ? 'Ingen timer' : '–', unknown: true, low: false };
  return { text: `${formatNOK(r.profitPerOwnHour).replace(/\s?kr$/, '')}`, unknown: false, low: r.meetsHourlyRequirement === false };
}

/** Pipeline-oppsummering: bare tall som kan utledes av objektene og beregningene som finnes. */
export function pipelineSummary(rows: PropertyRow[], now: Date) {
  const active = rows.filter((r) => !isArchiveRow(r));
  const complete = active.filter((r) => r.calcStatus === 'complete' && r.profit !== null);
  const equity = complete.filter((r) => r.equityNeed !== null);
  const returns = complete.filter((r) => r.projectReturn !== null);
  const best = complete.reduce<PropertyRow | null>((a, b) => (a === null || (b.profit ?? -Infinity) > (a.profit ?? -Infinity) ? b : a), null);
  const upcoming = active.filter((r) => r.nextViewing).sort((a, b) => (a.nextViewing ?? '').localeCompare(b.nextViewing ?? ''));
  return {
    active: active.length,
    interesting: active.filter((r) => r.recommendation === 'interessant').length,
    completeCount: complete.length,
    incomplete: active.length - complete.length,
    equityTotal: equity.length ? equity.reduce((s, r) => s + (r.equityNeed as number), 0) : null,
    equityCount: equity.length,
    avgReturn: returns.length ? returns.reduce((s, r) => s + (r.projectReturn as number), 0) / returns.length : null,
    returnCount: returns.length,
    best,
    upcoming: upcoming.slice(0, 3),
    weekCount: upcoming.filter((r) => Date.parse(r.nextViewing!) - now.getTime() < 7 * 86_400_000).length,
  };
}

function Summary({ rows, now }: { rows: PropertyRow[]; now: Date }) {
  const s = pipelineSummary(rows, now);
  return (
    <section aria-label="Oppsummering av pipeline" className="inv-dark rounded-xl p-4 sm:p-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-5">
        <div className="min-w-0">
          <dt className="inv-label">Aktive case</dt>
          <dd className="mt-1">
            <span className="inv-fig text-[1.75rem] leading-none font-bold">{s.active}</span>
            <span className="inv-muted-d mt-1 block text-xs">{s.interesting} vurdert som interessante</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="inv-label">Samlet egenkapitalbehov</dt>
          <dd className="mt-1">
            <span className="inv-fig block text-[1.375rem] leading-tight font-bold">{s.equityTotal === null ? <span className="text-base font-medium text-slate-300">Ikke beregnet</span> : formatNOK(s.equityTotal)}</span>
            <span className="inv-muted-d mt-1 block text-xs">Hvis alle {s.equityCount} case med komplett kalkyle gjennomføres</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="inv-label">Snitt prosjektavkastning</dt>
          <dd className="mt-1">
            <span className="inv-fig block text-[1.375rem] leading-tight font-bold">{s.avgReturn === null ? <span className="text-base font-medium text-slate-300">Ikke beregnet</span> : formatPct(s.avgReturn)}</span>
            <span className="inv-muted-d mt-1 block text-xs">Enkelt snitt av {s.returnCount} case · ikke porteføljeavkastning</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="inv-label">Høyest potensiell fortjeneste</dt>
          <dd className="mt-1">
            <span className={clsx('inv-fig block text-[1.375rem] leading-tight font-bold', s.best && TONE_TEXT_DARK[profitTone(s.best.profit)])}>{s.best ? formatNOK(s.best.profit) : <span className="text-base font-medium text-slate-300">Ingen komplette kalkyler</span>}</span>
            <span className="inv-muted-d mt-1 block truncate text-xs">{s.best ? s.best.address : `${s.incomplete} mangler grunnlag`}</span>
          </dd>
        </div>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <dt className="inv-label">Neste visninger</dt>
          <dd className="mt-1">
            {s.upcoming.length === 0 ? (
              <span className="inv-muted-d text-sm">Ingen kjente visninger</span>
            ) : (
              <ul className="space-y-1">
                {s.upcoming.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{r.address}</span>
                    <Fig className="inv-muted-d shrink-0">{formatDateTimeCompact(r.nextViewing)}</Fig>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      {s.incomplete > 0 && (
        <p className="inv-muted-d mt-4 border-t border-white/10 pt-3 text-xs">
          {s.incomplete} aktive case mangler grunnlag for kalkylen og teller ikke med i summene. Ukjent er ikke 0 kr.
        </p>
      )}
    </section>
  );
}

const COLS: { key: SortKey | null; label: string; align: 'left' | 'right'; w: string }[] = [
  { key: 'address', label: 'Objekt', align: 'left', w: 'w-[17%]' },
  { key: 'purchase', label: 'Kjøp', align: 'right', w: 'w-[8%]' },
  { key: 'sale', label: 'Salg', align: 'right', w: 'w-[8%]' },
  { key: 'profit', label: 'Fortjeneste', align: 'right', w: 'w-[9.5%]' },
  { key: 'return', label: 'Avk.', align: 'right', w: 'w-[6.5%]' },
  { key: null, label: 'Kr/time', align: 'right', w: 'w-[6%]' },
  { key: null, label: 'EK-behov', align: 'right', w: 'w-[8%]' },
  { key: 'maxBid', label: 'Maksbud', align: 'right', w: 'w-[8.5%]' },
  { key: 'risk', label: 'Risiko', align: 'left', w: 'w-[8.5%]' },
  { key: 'viewing', label: 'Visning', align: 'left', w: 'w-[8%]' },
  { key: null, label: 'Status', align: 'left', w: 'w-[12%]' },
];

function Th({ col, sort, onSort }: { col: (typeof COLS)[number]; sort: { key: SortKey; dir: SortDirection }; onSort: (k: SortKey) => void }) {
  const active = col.key !== null && sort.key === col.key;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={col.key === null ? undefined : active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={clsx('px-2 py-2.5', col.w, col.align === 'right' ? 'text-right' : 'text-left')}>
      {col.key === null ? (
        <span className="px-1 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">{col.label}</span>
      ) : (
        <button
          type="button"
          onClick={() => onSort(col.key as SortKey)}
          className={clsx('inline-flex min-h-8 items-center gap-1 rounded px-1 text-[11px] font-semibold tracking-wide uppercase hover:text-ink', active ? 'text-ink' : 'text-slate-600', col.align === 'right' && 'flex-row-reverse')}
        >
          {col.label}
          <Icon className={clsx('size-3', !active && 'opacity-50')} aria-hidden />
        </button>
      )}
    </th>
  );
}

function PipelineTable({ rows, sort, onSort }: { rows: PropertyRow[]; sort: { key: SortKey; dir: SortDirection }; onSort: (k: SortKey) => void }) {
  const maxProfit = Math.max(0, ...rows.map((r) => Math.abs(r.profit ?? 0)));
  const maxReturn = Math.max(0, ...rows.map((r) => Math.abs(r.projectReturn ?? 0)));
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--inv-line)] bg-white">
      <table className="w-full table-fixed text-[13px]" data-testid="inv-table">
        <caption className="sr-only">Pipeline: mine objekter som investeringscase. Beløp i kroner.</caption>
        <thead className="border-b border-[var(--inv-line)] bg-slate-50">
          <tr>
            {COLS.map((c) => (
              <Th key={c.label} col={c} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--inv-line)]">
          {rows.map((r) => {
            const h = hourlyText(r);
            return (
              <tr key={r.id} className="group align-top hover:bg-pine-50/60" data-testid="inv-row">
                <th scope="row" className="px-2 py-3 text-left font-normal">
                  <div className="flex min-w-0 items-start gap-1.5">
                    {r.favorite && <Star className="mt-0.5 size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Favoritt" />}
                    <div className="min-w-0">
                      <Link to={`/objekter/${r.id}`} className="block truncate font-semibold text-ink hover:underline" title={r.address}>
                        {r.address}
                      </Link>
                      <p className="truncate text-[11px] text-slate-600">{[r.district, PROPERTY_TYPE_LABEL[r.propertyType], formatArea(r.areaBRAi, '')].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                </th>
                <td className="px-2 py-3 text-right"><Money value={r.purchase} row={r} unit={false} /></td>
                <td className="px-2 py-3 text-right"><Money value={r.saleBase} row={r} unit={false} /></td>
                <td className="px-2 py-3 text-right">
                  <Money value={r.profit} row={r} signed strong unit={false} />
                  <Bar value={r.profit} max={maxProfit} />
                </td>
                <td className="px-2 py-3 text-right">
                  <Fig className="font-medium">{r.projectReturn === null ? <span className="text-xs text-slate-500">–</span> : formatPct(r.projectReturn)}</Fig>
                  <Bar value={r.projectReturn} max={maxReturn} tone="info" />
                </td>
                <td className="px-2 py-3 text-right">
                  <Fig className={clsx(h.unknown ? 'text-xs text-slate-500' : 'font-medium', h.low && 'text-[var(--inv-warn)]')}>{h.text}</Fig>
                  {h.low && <span className="block text-[10px] text-[var(--inv-warn)]">under krav</span>}
                </td>
                <td className="px-2 py-3 text-right">
                  <Money value={r.equityNeed} row={r} unit={false} />
                  {r.equityGap !== null && r.equityGap > 0 && <span className="block text-[10px] text-[var(--inv-neg)]">gap {formatNOK(r.equityGap).replace(/\s?kr$/, '')}</span>}
                </td>
                <td className="px-2 py-3 text-right">
                  {r.maxBidStatus === 'none' ? <span className="text-xs text-[var(--inv-neg)]">Ingen pris</span> : <Money value={r.maxBid === null ? null : floorToThousand(r.maxBid)} row={r} strong unit={false} />}
                </td>
                <td className="px-2 py-3"><RiskText r={r} /></td>
                <td className="px-2 py-3 text-xs text-slate-700">{r.nextViewing ? <Fig>{formatDateTimeCompact(r.nextViewing)}</Fig> : <span className="text-slate-500">Ingen kjent</span>}</td>
                <td className="px-2 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <RecommendationBadge value={r.recommendation} />
                    <span className="text-[11px] text-slate-600">{WORK_STATUS_LABEL[r.workStatus]}</span>
                    {r.hasNewVersion && <Tag tone="info">Ny versjon</Tag>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PipelineCards({ rows }: { rows: PropertyRow[] }) {
  const maxProfit = Math.max(0, ...rows.map((r) => Math.abs(r.profit ?? 0)));
  return (
    <ul className="grid gap-3 md:grid-cols-2" data-testid="inv-cards">
      {rows.map((r) => {
        const h = hourlyText(r);
        return (
          <li key={r.id}>
            <Link to={`/objekter/${r.id}`} className="block rounded-xl border border-[var(--inv-line)] bg-white p-4 active:bg-slate-50" aria-label={`Åpne ${r.address}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-start gap-1.5 font-semibold">
                    {r.favorite && <Star className="mt-1 size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Favoritt" />}
                    <span className="min-w-0 break-words">{r.address}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{[r.district, PROPERTY_TYPE_LABEL[r.propertyType], formatArea(r.areaBRAi, '')].filter(Boolean).join(' · ')}</p>
                </div>
                <RecommendationBadge value={r.recommendation} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--inv-line)] pt-3">
                <div className="min-w-0">
                  <p className="inv-label">Maksbud</p>
                  <p className="mt-0.5 text-[1.375rem] leading-tight font-bold">
                    {r.maxBidStatus === 'none' ? <span className="text-sm text-[var(--inv-neg)]">Ingen pris</span> : <Money value={r.maxBid === null ? null : floorToThousand(r.maxBid)} row={r} />}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">Kjøpspris <Money value={r.purchase} row={r} /></p>
                </div>
                <div className="min-w-0">
                  <p className="inv-label">Fortjeneste</p>
                  <p className="mt-0.5 text-[1.375rem] leading-tight font-bold"><Money value={r.profit} row={r} signed /></p>
                  <Bar value={r.profit} max={maxProfit} />
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-x-3 text-sm">
                <div className="min-w-0">
                  <dt className="inv-label">Avkastning</dt>
                  <dd className="mt-0.5 font-semibold"><Fig>{r.projectReturn === null ? '–' : formatPct(r.projectReturn)}</Fig></dd>
                </div>
                <div className="min-w-0">
                  <dt className="inv-label">Kr/time</dt>
                  <dd className={clsx('mt-0.5 font-semibold', h.low && 'text-[var(--inv-warn)]')}><Fig>{h.text}</Fig></dd>
                </div>
                <div className="min-w-0">
                  <dt className="inv-label">Risiko</dt>
                  <dd className="mt-0.5"><RiskText r={r} /></dd>
                </div>
              </dl>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>EK-behov <Money value={r.equityNeed} row={r} /></span>
                <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden />{r.nextViewing ? <Fig>{formatDateTimeCompact(r.nextViewing)}</Fig> : 'Ingen kjent visning'}</span>
                <span>{WORK_STATUS_LABEL[r.workStatus]}</span>
                <SaleStatusBadge value={r.saleStatus} />
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function InvestmentDashboard() {
  const services = useServices();
  const { session, profile, entitlements } = useSession();
  const now = useNow();
  const uid = session?.user.id ?? 'anon';
  const isWide = useMediaQuery('(min-width: 1280px)');
  const items = useLiveQuery(() => services.properties.listMine({ includeArchived: true }), []);
  const [view, setView] = usePref<'active' | 'archive'>(`${uid}.view`, 'active');
  const [filters, setFilters] = usePref<ListFilters>(`${uid}.filters`, EMPTY_FILTERS);
  const [sort, setSort] = usePref<{ key: SortKey; dir: SortDirection }>(`${uid}.sort`, { key: 'profit', dir: 'desc' });
  const [showFilters, setShowFilters] = useState(false);

  const defaults = profile?.defaults ?? NEW_ACCOUNT_DEFAULTS;
  const rows = useMemo(() => (items.data ?? []).map((i) => buildRow(i, defaults, now)), [items.data, defaults, now]);
  const visible = useMemo(() => sortRows(applyFilters(rows, filters, view), sort.key, sort.dir), [rows, filters, view, sort]);
  const totalInView = rows.filter((r) => (view === 'archive' ? isArchiveRow(r) : !isArchiveRow(r) || (filters.showClosed && !r.archived))).length;
  const archiveCount = rows.filter(isArchiveRow).length;
  const nFilters = activeFilterCount({ ...filters, query: '' });
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'address' ? 'asc' : 'desc' }));
  const exportScenarios = async () => {
    const f = await services.imports.exportScenarios();
    downloadText(f.filename, f.content, 'application/json');
  };

  if (items.loading && !items.data) return <PageLoading label="Henter pipeline …" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">Pipeline</h1>
          <p className="mt-0.5 text-sm text-slate-600">Hvert objekt som et investeringscase. Økonomien følger scenarioet du har valgt som primært.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/import" className={buttonClass('secondary', 'sm')}>
            <FileJson className="size-4" aria-hidden /> Importer
          </Link>
          <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={exportScenarios}>
            Eksporter scenarioer
          </Button>
        </div>
      </div>

      {rows.length > 0 && <Summary rows={rows} now={now} />}

      <Panel className="!shadow-none" bodyClassName="!p-3 sm:!p-4">
        {entitlements?.access === 'full' ? (
          <AnalyzeBox />
        ) : (
          <Alert tone="warning" title="Analyse krever aktivt abonnement" action={<Link to="/konto" className="font-medium underline">Se abonnement</Link>}>
            Du kan fortsatt se, sortere og eksportere objektene du har lagret.
          </Alert>
        )}
        {entitlements?.access === 'full' && entitlements.plan && (
          <p className="mt-2 text-xs text-slate-600">
            Nye analyser denne perioden: {entitlements.used.newAnalyses} av {entitlements.limits.newAnalyses}
            {entitlements.used.pendingNewAnalyses ? ` (+${entitlements.used.pendingNewAnalyses} pågår)` : ''}
          </p>
        )}
      </Panel>

      {items.error ? (
        <Alert tone="danger" title="Kunne ikke hente objektene" action={<Button size="sm" onClick={items.reload}>Prøv igjen</Button>}>
          {(items.error as Error).message}
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={<Inbox className="size-10" aria-hidden />} title="Ingen case ennå">
          Lim inn en FINN-lenke over for å analysere din første bolig. Objektet legges automatisk i pipeline og kalenderen.
        </EmptyState>
      ) : (
        <section aria-label="Pipeline" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Liste"
              value={view}
              onChange={setView}
              options={[
                { value: 'active', label: 'Aktive' },
                {
                  value: 'archive',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <Archive className="size-3.5" aria-hidden /> Arkiv ({archiveCount})
                    </span>
                  ),
                },
              ]}
            />
            <div className="flex min-w-full flex-1 flex-wrap items-center justify-end gap-2 sm:min-w-0">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <TextInput aria-label="Søk i mine objekter" placeholder="Søk adresse, område, FINN-kode" className="pl-9" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
              </div>
              <Button size="sm" icon={<SlidersHorizontal className="size-4" aria-hidden />} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
                Filtre{nFilters ? ` (${nFilters})` : ''}
              </Button>
              {!isWide && (
                <Select
                  aria-label="Sorter etter"
                  className="h-10 w-auto text-sm"
                  value={`${sort.key}:${sort.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':') as [SortKey, SortDirection];
                    setSort({ key, dir });
                  }}
                >
                  {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
                    <option key={`${k}:desc`} value={`${k}:desc`}>
                      {SORT_LABEL[k]} – synkende
                    </option>,
                    <option key={`${k}:asc`} value={`${k}:asc`}>
                      {SORT_LABEL[k]} – stigende
                    </option>,
                  ])}
                </Select>
              )}
            </div>
          </div>
          {showFilters && <FilterPanel filters={filters} onChange={setFilters} view={view} />}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600" aria-live="polite">
            <span>
              Viser <strong className="text-ink">{visible.length}</strong> av {totalInView} {view === 'archive' ? 'i arkivet' : 'aktive case'} · sortert etter {SORT_LABEL[sort.key].toLowerCase()} ({sort.dir === 'asc' ? 'stigende' : 'synkende'}), ukjente verdier sist
            </span>
            {(nFilters > 0 || filters.query) && (
              <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                Fjern filtre
              </Button>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-10" aria-hidden />}
              title={view === 'archive' ? 'Ingen case i arkivet med disse filtrene' : 'Ingen treff med disse filtrene'}
              action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>Fjern filtre</Button>}
            >
              {view === 'active' && archiveCount > 0 ? 'Solgte, trukne og arkiverte objekter ligger i arkivet.' : 'Prøv å fjerne ett eller flere filtre.'}
            </EmptyState>
          ) : isWide ? (
            <PipelineTable rows={visible} sort={sort} onSort={onSort} />
          ) : (
            <PipelineCards rows={visible} />
          )}
          <p className="text-xs text-slate-600">Maksbud er avrundet ned til hele tusen. «Mangler grunnlag» betyr ukjent – ikke null. Beløp i tabellen er i kroner. Kr/time og EK-behov kan ikke sorteres ennå.</p>
        </section>
      )}
    </div>
  );
}
