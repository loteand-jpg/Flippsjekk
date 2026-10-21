import clsx from 'clsx';
import { Archive, ArrowDown, ArrowUp, CalendarClock, ChevronsUpDown, Download, FileJson, Home, Inbox, Search, SearchX, SlidersHorizontal, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery, useMediaQuery, useNow } from '../../app/hooks';
import { usePref } from '../../app/preferences';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { AnalyzeBox } from '../../components/property/AnalyzeBox';
import { RecommendationBadge, SaleStatusBadge } from '../../components/property/badges';
import { activeFilterCount, applyFilters, EMPTY_FILTERS, SORT_LABEL, sortRows, type ListFilters, type SortKey } from '../../components/property/listLogic';
import { FilterPanel } from '../../components/property/ListViews';
import { buildRow, isArchiveRow, type PropertyRow } from '../../components/property/rowModel';
import { Segmented, Select, TextInput } from '../../components/ui/forms';
import { Alert, Button, buttonClass, EmptyState, PageLoading } from '../../components/ui/primitives';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { RISK_BAND_LABEL } from '../../domain/assessment';
import { PROPERTY_TYPE_LABEL, WORK_STATUS_LABEL } from '../../domain/enums';
import { formatArea, formatDateTimeCompact, formatNOK, NO_BASIS } from '../../lib/format';
import type { SortDirection } from '../../lib/sort';
import { floorToThousand, profitTone } from '../shared/present';
import { rowEndProduct } from './model/listRow';
import { Card, Fig, Tag, TONE_TEXT } from './ui';

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Beløp i listen. Ukjent er tekst, aldri 0. */
function Money({ value, row, strong, signed, unit = true }: { value: number | null; row: PropertyRow; strong?: boolean; signed?: boolean; unit?: boolean }) {
  if (value === null) {
    return (
      <span className="text-xs font-normal text-slate-600" title={row.missing.length ? `Mangler: ${row.missing.join(', ')}` : undefined}>
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
    <span className={clsx('text-[13px]', r.riskBand === 'hoy' && 'font-semibold text-[var(--prop-neg)]')} title={r.riskUnknown ? `${r.riskUnknown} risiko(er) med ukjent alvorlighet` : undefined}>
      {label}
      {r.riskUnknown ? <span className="text-slate-600"> +{r.riskUnknown}</span> : null}
    </span>
  );
}

/**
 * Plass for annonsebildet i listen. Demoen har ingen bilder, så det er en liten, tydelig plassholder (ikke et bilde). En liten lukket
 * tekst forklarer det for skjermlesere; den fulle forklaringen står én gang over listen i stedet for på hver rad.
 */
function Thumb({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="Bilde mangler: annonsebildet kommer fra datakilden" className={clsx('prop-plate flex shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--prop-line-strong)] text-slate-500', className)}>
      <Home className="size-5" strokeWidth={1.25} aria-hidden />
    </span>
  );
}

function subline(r: PropertyRow) {
  return [r.district, PROPERTY_TYPE_LABEL[r.propertyType], formatArea(r.areaBRAi, '')].filter(Boolean).join(' · ');
}

function EndProductLine({ r }: { r: PropertyRow }) {
  const e = rowEndProduct(r);
  if (!e) return <span className="text-xs text-slate-600">Sluttprodukt ikke avklart</span>;
  return (
    <span className="block min-w-0 text-xs text-slate-700">
      <span className="font-semibold">{e.notAssessed ? 'Sluttprodukt ikke vurdert' : e.bedrooms}</span>
      {!e.notAssessed && e.standard ? ` · ${e.standard.toLowerCase()}` : ''}
      <span className="block truncate text-slate-600">{e.title}</span>
    </span>
  );
}

const COLS: { key: SortKey | null; label: string; align: 'left' | 'right'; w: string }[] = [
  { key: 'address', label: 'Bolig og sluttprodukt', align: 'left', w: 'w-[30%]' },
  { key: 'sale', label: 'Salgsverdi', align: 'right', w: 'w-[11%]' },
  { key: 'profit', label: 'Fortjeneste', align: 'right', w: 'w-[11%]' },
  { key: 'maxBid', label: 'Maksbud', align: 'right', w: 'w-[11%]' },
  { key: 'risk', label: 'Risiko', align: 'left', w: 'w-[10%]' },
  { key: 'viewing', label: 'Visning', align: 'left', w: 'w-[11%]' },
  { key: null, label: 'Status', align: 'left', w: 'w-[16%]' },
];

function Th({ col, sort, onSort }: { col: (typeof COLS)[number]; sort: { key: SortKey; dir: SortDirection }; onSort: (k: SortKey) => void }) {
  const active = col.key !== null && sort.key === col.key;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={col.key === null ? undefined : active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={clsx('px-3 py-3', col.w, col.align === 'right' ? 'text-right' : 'text-left')}>
      {col.key === null ? (
        <span className="prop-label">{col.label}</span>
      ) : (
        <button type="button" onClick={() => onSort(col.key as SortKey)} className={clsx('prop-label inline-flex min-h-8 items-center gap-1 rounded hover:text-ink', active && '!text-ink', col.align === 'right' && 'flex-row-reverse')}>
          {col.label}
          <Icon className={clsx('size-3', !active && 'opacity-50')} aria-hidden />
        </button>
      )}
    </th>
  );
}

function PipelineTable({ rows, sort, onSort }: { rows: PropertyRow[]; sort: { key: SortKey; dir: SortDirection }; onSort: (k: SortKey) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)]">
      <table className="w-full table-fixed text-[13px]" data-testid="prop-table">
        <caption className="sr-only">Mine boliger: sluttprodukt, salgsverdi, fortjeneste, maksbud, risiko og visning. Beløp i kroner.</caption>
        <thead className="border-b border-[var(--prop-line)] bg-[var(--prop-sand-2)]">
          <tr>
            {COLS.map((c) => (
              <Th key={c.label} col={c} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--prop-line)]">
          {rows.map((r) => (
            <tr key={r.id} className="align-middle hover:bg-[var(--prop-sand-2)]/70" data-testid="prop-row">
              <th scope="row" className="px-3 py-3 text-left font-normal">
                <div className="flex min-w-0 items-center gap-3">
                  <Thumb className="size-16" />
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5">
                      {r.favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Favoritt" />}
                      <Link to={`/objekter/${r.id}`} className="prop-serif block truncate text-[1.0625rem] leading-tight hover:underline" title={r.address}>
                        {r.address}
                      </Link>
                    </p>
                    <p className="truncate text-[11px] text-slate-600">{subline(r)}</p>
                    <EndProductLine r={r} />
                  </div>
                </div>
              </th>
              <td className="px-3 py-3 text-right"><Money value={r.saleBase} row={r} unit={false} /></td>
              <td className="px-3 py-3 text-right"><Money value={r.profit} row={r} signed strong unit={false} /></td>
              <td className="px-3 py-3 text-right">{r.maxBidStatus === 'none' ? <span className="text-xs text-[var(--prop-neg)]">Ingen pris</span> : <Money value={r.maxBid === null ? null : floorToThousand(r.maxBid)} row={r} strong unit={false} />}</td>
              <td className="px-3 py-3"><RiskText r={r} /></td>
              <td className="px-3 py-3 text-xs text-slate-700">{r.nextViewing ? <Fig>{formatDateTimeCompact(r.nextViewing)}</Fig> : <span className="text-slate-600">Ingen kjent</span>}</td>
              <td className="px-3 py-3">
                <div className="flex flex-col items-start gap-1">
                  <RecommendationBadge value={r.recommendation} />
                  <span className="text-[11px] text-slate-600">{WORK_STATUS_LABEL[r.workStatus]}</span>
                  {r.hasNewVersion && <Tag tone="info">Ny versjon</Tag>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelineCards({ rows }: { rows: PropertyRow[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2" data-testid="prop-cards">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/objekter/${r.id}`} aria-label={`Åpne ${r.address}`} className="block overflow-hidden rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] active:bg-[var(--prop-sand-2)]">
            <div className="flex gap-3.5 p-4 pb-3">
              <Thumb className="size-20" />
              <div className="min-w-0 flex-1">
                <p className="prop-serif flex items-start gap-1.5 text-[1.1875rem] leading-snug">
                  {r.favorite && <Star className="mt-1 size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Favoritt" />}
                  <span className="min-w-0 break-words">{r.address}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{subline(r)}</p>
                <div className="mt-1.5"><EndProductLine r={r} /></div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-[var(--prop-line)] bg-[var(--prop-sand-2)]/60 px-4 py-3">
              <div className="min-w-0">
                <dt className="prop-label">Maksbud</dt>
                <dd className="mt-0.5 text-[1.375rem] leading-tight font-semibold">{r.maxBidStatus === 'none' ? <span className="text-sm text-[var(--prop-neg)]">Ingen pris</span> : <Money value={r.maxBid === null ? null : floorToThousand(r.maxBid)} row={r} />}</dd>
              </div>
              <div className="min-w-0">
                <dt className="prop-label">Fortjeneste</dt>
                <dd className="mt-0.5 text-[1.375rem] leading-tight font-semibold"><Money value={r.profit} row={r} signed /></dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-xs text-slate-700">
              <span>Salgsverdi <Money value={r.saleBase} row={r} /></span>
              <span>Risiko <RiskText r={r} /></span>
              <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden />{r.nextViewing ? <Fig>{formatDateTimeCompact(r.nextViewing)}</Fig> : 'Ingen kjent visning'}</span>
              <span className="flex flex-wrap items-center gap-1.5"><RecommendationBadge value={r.recommendation} /><SaleStatusBadge value={r.saleStatus} />{r.hasNewVersion && <Tag tone="info">Ny versjon</Tag>}</span>
              <span className="text-slate-600">{WORK_STATUS_LABEL[r.workStatus]}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Summary({ rows, now }: { rows: PropertyRow[]; now: Date }) {
  const active = rows.filter((r) => !isArchiveRow(r));
  const complete = active.filter((r) => r.calcStatus === 'complete' && r.profit !== null);
  const upcoming = active.filter((r) => r.nextViewing).sort((a, b) => (a.nextViewing ?? '').localeCompare(b.nextViewing ?? ''));
  const next = upcoming[0] ?? null;
  const week = upcoming.filter((r) => Date.parse(r.nextViewing!) - now.getTime() < 7 * 86_400_000).length;
  return (
    <p className="text-sm text-slate-700" data-testid="prop-summary">
      <strong className="text-ink">{active.length}</strong> aktive boliger · <strong className="text-ink">{complete.length}</strong> med komplett kalkyle
      {active.length - complete.length > 0 ? ` (${active.length - complete.length} mangler grunnlag)` : ''} · {week > 0 ? <><strong className="text-ink">{week}</strong> visning{week === 1 ? '' : 'er'} neste uke</> : 'ingen visninger neste uke'}
      {next ? <> · neste: <span className="font-medium text-ink">{next.address}</span> <Fig>{formatDateTimeCompact(next.nextViewing)}</Fig></> : null}
    </p>
  );
}

export function PropertyDashboard() {
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

  if (items.loading && !items.data) return <PageLoading label="Henter boligene …" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="prop-label">Mine boliger</p>
          <h1 className="prop-serif mt-0.5 text-[2rem] leading-tight sm:text-[2.6rem]">Hva kan de bli?</h1>
          {rows.length > 0 && <div className="mt-1.5"><Summary rows={rows} now={now} /></div>}
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

      <Card className="p-3 sm:p-4">
        {entitlements?.access === 'full' ? (
          <AnalyzeBox />
        ) : (
          <Alert tone="warning" title="Analyse krever aktivt abonnement" action={<Link to="/konto" className="font-medium underline">Se abonnement</Link>}>
            Du kan fortsatt se, sortere og eksportere boligene du har lagret.
          </Alert>
        )}
        {entitlements?.access === 'full' && entitlements.plan && (
          <p className="mt-2 text-xs text-slate-600">
            Nye analyser denne perioden: {entitlements.used.newAnalyses} av {entitlements.limits.newAnalyses}
            {entitlements.used.pendingNewAnalyses ? ` (+${entitlements.used.pendingNewAnalyses} pågår)` : ''}
          </p>
        )}
      </Card>

      {items.error ? (
        <Alert tone="danger" title="Kunne ikke hente boligene" action={<Button size="sm" onClick={items.reload}>Prøv igjen</Button>}>
          {(items.error as Error).message}
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={<Inbox className="size-10" aria-hidden />} title="Ingen boliger ennå">
          Lim inn en FINN-lenke over for å analysere din første bolig. Boligen legges automatisk i listen og kalenderen.
        </EmptyState>
      ) : (
        <section aria-label="Boligene mine" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Liste"
              value={view}
              onChange={setView}
              options={[
                { value: 'active', label: 'Aktive' },
                { value: 'archive', label: <span className="inline-flex items-center gap-1"><Archive className="size-3.5" aria-hidden /> Arkiv ({archiveCount})</span> },
              ]}
            />
            <div className="flex min-w-full flex-1 flex-wrap items-center justify-end gap-2 sm:min-w-0">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <TextInput aria-label="Søk i mine boliger" placeholder="Søk adresse, område, FINN-kode" className="pl-9" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
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
                    <option key={`${k}:desc`} value={`${k}:desc`}>{SORT_LABEL[k]} – synkende</option>,
                    <option key={`${k}:asc`} value={`${k}:asc`}>{SORT_LABEL[k]} – stigende</option>,
                  ])}
                </Select>
              )}
            </div>
          </div>
          {showFilters && <FilterPanel filters={filters} onChange={setFilters} view={view} />}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600" aria-live="polite">
            <span>
              Viser <strong className="text-ink">{visible.length}</strong> av {totalInView} {view === 'archive' ? 'i arkivet' : 'aktive boliger'} · sortert etter {SORT_LABEL[sort.key].toLowerCase()} ({sort.dir === 'asc' ? 'stigende' : 'synkende'}), ukjente verdier sist
            </span>
            {(nFilters > 0 || filters.query) && (
              <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                Fjern filtre
              </Button>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyState icon={<SearchX className="size-10" aria-hidden />} title={view === 'archive' ? 'Ingen boliger i arkivet med disse filtrene' : 'Ingen treff med disse filtrene'} action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>Fjern filtre</Button>}>
              {view === 'active' && archiveCount > 0 ? 'Solgte, trukne og arkiverte boliger ligger i arkivet.' : 'Prøv å fjerne ett eller flere filtre.'}
            </EmptyState>
          ) : isWide ? (
            <PipelineTable rows={visible} sort={sort} onSort={onSort} />
          ) : (
            <PipelineCards rows={visible} />
          )}
          <p className="text-xs text-slate-600">
            Sluttproduktet er det scenarioet kalkylen i listen bygger på. Bilder vises når datakilden leverer dem – i demoen er plassen merket med en plassholder. Maksbud er avrundet ned til hele tusen. «Mangler grunnlag» betyr ukjent – ikke null. Beløp i tabellen er i kroner.
          </p>
        </section>
      )}
    </div>
  );
}
